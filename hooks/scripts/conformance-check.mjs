#!/usr/bin/env node
/* conformance-check — reads a Figma variable capture (from capture-listener's
   POST /capture artifact) + a figma-map.json mapping file, and reports where
   the mapped code token's actual value disagrees with the Figma-resolved
   value for that variable, per mode.

   Interface (deep module — small surface, the value-resolution/extraction
   logic is all implementation):

     runConformanceCheck({ capturePath, mappingPath })
       -> { ok, defects, summary }

   ConformanceDefect reuses the capture-listener's change-record shape
   ({ path, mode, old, new, type }) plus codeLocation/tokenName tying it back
   to the mapping entry, so a defect can flow through the same taxonomy/
   tooling that already reads changes.jsonl.

   Mapping schema (figma-map.json):
     { "$schema": "conformance-map/v1",
       "anchorWidths": { "figmaPath": "layout/device/width",
                         "modes": { "sm": 375, "md": 768, ... } },
       "entries": { "<figma variable path>": { codeLocation, tokenName,
                                               extraction, tolerancePx? } } }
   codeLocation is relative to the mapping file's GRANDPARENT directory (the
   convention: a mapping lives at <repo>/design/figma-map.json, so
   codeLocation paths are repo-relative, e.g. "src/app/globals.css").

   anchorWidths (optional, read only by the "css-fluid" extraction) says which
   viewport width each Figma mode was designed at. Both keys are optional:
     figmaPath — the capture variable carrying the per-mode width. Defaults to
       "layout/device/width", which the live JHD-Spec file exports as
       sm 375 / md 768 / lg 1280 / xl 1920, with the -flush and -sidebar-main
       variants mirroring their base mode. Reading the widths from the capture
       keeps them the design's numbers, not an engineer's guess.
     modes — a declared table, used for any mode the capture can't supply
       (a Figma file with no device-width variable). The capture wins where
       both are present.
   tolerancePx (optional, per entry, css-fluid only) overrides the allowance
   used where a mode's anchor falls strictly inside a fluid segment; see the
   css-fluid notes below for why the two tolerances differ.

   extraction enum (extend as new code shapes need support):
     "css-root-dark" — tokenName is a CSS custom property declared inside a
       `:root { }` block (light-mode value) and optionally overridden inside
       a `.dark { }` block (dark-mode value, falls back to the :root value
       when not overridden). Only Figma modes named "light"/"dark" are
       checked against this extraction — other mode names are skipped (no
       defect), since there's no code-side counterpart to compare against.
     "css-scalar" — tokenName is a single CSS custom property, declared
       anywhere in the file (last declaration wins, regardless of selector —
       used for non-theme-mode tokens like motion durations/easings or a
       radius ramp, which live in `@theme inline` rather than `:root`/
       `.dark`). The raw value is resolved through one level of `var(--x)`
       indirection and unit-normalized (rem -> px, trailing "s" stripped) so
       it compares against Figma's raw numeric export value; non-numeric
       values (bezier strings, keywords) pass through as-is. Figma variables
       using this extraction typically carry a single mode under any name
       ("default", "Mode 1", ...) — the main loop falls back to a extractor
       result's sole value when the exact mode name isn't present.
     "css-fluid" — tokenName is a single CSS custom property whose value is a
       FLUID EXPRESSION (clamp()/calc()/min()/max()), typically declared two or
       three times across `:root` and `@media (min-width: ...)` blocks. Instead
       of string-comparing the last declaration (which is what css-scalar does,
       and why a clamp() reads as a mismatch against Figma's scalar), the
       cascade is replayed at EACH MODE'S ANCHOR VIEWPORT WIDTH — base
       declaration plus every @media width range admitting that width, source
       order deciding — and the winning expression is evaluated there. The
       resolved px is compared against that mode's resolved Figma value.
       Anchor widths come from `anchorWidths` (see the mapping schema above).
       Comparison is exact (0.01px, float noise) where the clamp saturates at
       one of its own bounds, and allows 0.5px (override per entry with
       tolerancePx) where the anchor lands strictly inside the fluid segment
       and the value is an interpolation rather than a designed endpoint.
       EVERY mode is evaluated, interior ones included: `md` between the `sm`
       and `xl` anchors is exactly where title-300's md-distinct value lives,
       so checking only a ramp's endpoints (or a clamp's min/max) would call a
       ramp conformant while its middle drifted.
       Known characteristic, not a bug: two modes sharing one anchor width but
       carrying different Figma values (on the live file, `xl` and `xl-flush`
       differ for title-100/200) cannot both be satisfied by width-keyed CSS,
       so one of them will always flag — a real contract conflict for a human
       to resolve, surfaced rather than hidden.
     "css-scale" — tokenName is a template string containing the literal
       "{mode}" placeholder (e.g. "--button-height-{mode}"), substituted with
       each Figma mode name to locate that mode's own CSS custom property
       (the code-side convention for a component's numbered size ramp:
       100/200/300/400 are four separate declarations, not one token
       overridden per mode). Same var()/unit resolution as "css-scalar".

   THIRD LANE: this is the VALUE lane. There are two siblings — binding-
   check.mjs (does a component layer bind to the named token/variant Figma's
   own bindings declare?) and template-check.mjs (does the rendered page's
   block geometry/grid/computed-style match the DS Example templates?).
   Reviewers run all three before merging a visual/layout change — see
   template-check.mjs's header for the full integration note.
*/
import { readFileSync, existsSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// ---- Figma variable index + alias resolution ----------------------------

function buildVariableIndex(collections) {
  const index = new Map(); // "collection/name" -> { valuesByMode }
  for (const col of collections || []) {
    for (const v of col.variables || []) {
      index.set(`${col.name}/${v.name}`, { valuesByMode: v.valuesByMode || {} });
    }
  }
  return index;
}

function isAliasValue(v) {
  return typeof v === "string" && v.startsWith("→ ");
}

// Resolves a Figma variable's value at `mode` down to a raw (non-alias)
// value, following alias chains. When an alias target doesn't carry the
// requested mode but has exactly one mode of its own (the common case for
// primitive collections), that single mode is used instead.
function resolveValue(path, mode, index) {
  let currentPath = path;
  let currentMode = mode;
  for (let depth = 0; depth < 10; depth++) {
    const entry = index.get(currentPath);
    if (!entry) return { error: "unresolved-path", path: currentPath };
    let value = entry.valuesByMode[currentMode];
    if (value === undefined) {
      const modes = Object.keys(entry.valuesByMode);
      if (modes.length === 1) value = entry.valuesByMode[modes[0]];
      else return { error: "unresolved-mode", path: currentPath, mode: currentMode };
    }
    if (isAliasValue(value)) {
      currentPath = value.slice(2);
      continue;
    }
    return { value };
  }
  return { error: "alias-cycle", path: currentPath };
}

// ---- CSS extraction -------------------------------------------------------

// Minimal CSS custom-property scanner: tracks a selector stack through
// arbitrary nesting and records the LAST declaration seen for each selector,
// since source order determines override. Only declarations directly inside
// a `:root` or `.dark` block are collected — this file's other selectors
// (`@theme inline`, component utilities, etc.) are walked over but ignored.
//
// @MEDIA SCOPING: a `:root`/`.dark` block nested anywhere inside an `@media`
// block is a CONDITIONAL value, not the base one, and never contributes here.
// This used to be the opposite — `@media (...) { :root { --x: 1 } }` was
// attributed to `:root` — and under last-write-wins that made the print
// stylesheet's paper overrides (`@media print { .dark { --background: #fff } }`
// in portfolio's globals.css) read as THE dark-mode values, reporting six
// dark-mode defects that were not defects on the 2026-08-13 sync. Breakpoint
// re-declarations (`@media (min-width: 768px) { :root { ... } }`, the fluid
// type ramp) are the same shape and the same mistake: Figma exports the base
// value, so the base declaration is the one to compare against.
// Only `@media` is excluded, deliberately — `@layer base { :root { ... } }`
// and friends are unconditional and still count.
function isMediaAtRule(selector) {
  return /^@media\b/.test(selector);
}

// Wider than isMediaAtRule: any CONDITIONAL group at-rule whose declarations
// only apply under a runtime condition, not just @media's viewport/print
// condition. Used by buildDsSurface's @theme fold (see there) — a token
// declared only inside `@supports (…) { @theme inline { … } }` or
// `@container (…) { @theme inline { … } }` is exactly as conditional as one
// inside `@media`, and folding it into the unconditional root bucket would
// report it MATCH/present when the DS package has, in fact, no unconditional
// declaration of it. `@layer` is deliberately excluded — a cascade layer is
// unconditional, it only affects override order, so `@layer base { @theme
// inline { … } }` still counts as the default-mode declaration. `@scope` and
// `@starting-style` are left out for now (not seen in this codebase's CSS;
// add them here if that changes — @scope narrows by DOM subtree, not by any
// runtime condition this pass evaluates, so it would need its own judgment
// call rather than folding into this list by default).
function isConditionalGroupAtRule(selector) {
  return /^@(media|supports|container)\b/.test(selector);
}

// Comments are stripped WHOLESALE before the scan rather than skipped
// inline, because a comment sitting in a selector prelude is swallowed by the
// selector match (`[^{};]+` happily eats a brace-free comment) and the
// resulting token no longer starts with "@media". portfolio's globals.css
// puts a 19-line banner comment immediately above `@media print`, which is
// exactly how the print block escaped the check below on the first pass.
// Replaced with a space, not "", so a comment between two tokens can't fuse
// them into one.
function stripCssComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, " ");
}

// Single pass over the stylesheet, calling `visit` for every custom-property
// declaration with the selector/at-rule stack enclosing it. Consumers decide
// which contexts count — parseCssCustomProps wants unconditional :root/.dark,
// collectFluidDeclarations wants :root under @media width ranges — so the
// walking (which is the fiddly part) lives here once.
function walkCssDeclarations(rawCss, visit) {
  const css = stripCssComments(rawCss);
  const stack = [];
  let i = 0;
  const len = css.length;
  while (i < len) {
    if (css[i] === "}") {
      stack.pop();
      i++;
      continue;
    }
    const declMatch = css.slice(i).match(/^--([a-zA-Z0-9-]+)\s*:\s*([^;]+);/);
    if (declMatch) {
      visit({ prop: declMatch[1], value: declMatch[2].trim(), stack });
      i += declMatch[0].length;
      continue;
    }
    const selMatch = css.slice(i).match(/^([^{};]+)\{/);
    if (selMatch) {
      stack.push(selMatch[1].trim());
      i += selMatch[0].length;
      continue;
    }
    i++;
  }
}

function parseCssCustomProps(rawCss) {
  const root = {};
  const dark = {};
  walkCssDeclarations(rawCss, ({ prop, value, stack }) => {
    if (stack.some(isMediaAtRule)) return;
    const top = stack[stack.length - 1];
    if (top === ":root") root[prop] = value;
    else if (top === ".dark") dark[prop] = value;
  });
  return { root, dark };
}

function extractCssRootDark(cssText, tokenName) {
  const name = tokenName.replace(/^--/, "");
  const { root, dark } = parseCssCustomProps(cssText);
  const result = {};
  if (root[name] !== undefined) result.light = root[name];
  if (dark[name] !== undefined) result.dark = dark[name];
  else if (root[name] !== undefined) result.dark = root[name];
  return result;
}

// Finds the last declared value for a CSS custom property anywhere in the
// file (source order = override, same rule as parseCssCustomProps, but not
// restricted to :root/.dark — @theme inline and other blocks are fair game).
function findCssPropertyValue(cssText, propName) {
  const name = propName.replace(/^--/, "");
  const re = new RegExp(`--${name}\\s*:\\s*([^;]+);`, "g");
  let match;
  let last;
  while ((match = re.exec(cssText)) !== null) last = match[1].trim();
  return last;
}

// Resolves a raw CSS value down to a comparable primitive: follows one
// `var(--x)` hop at a time (bounded depth guards a reference cycle), then
// converts rem -> px and strips a trailing "s" (seconds) so the result lines
// up with Figma's unitless raw numbers. Anything else (bezier strings,
// keywords) passes through as the trimmed raw string.
function parseCssScalar(cssText, rawValue, depth = 0) {
  if (rawValue === undefined) return undefined;
  const varRef = rawValue.match(/^var\((--[a-zA-Z0-9-]+)\)$/);
  if (varRef && depth < 5) {
    return parseCssScalar(cssText, findCssPropertyValue(cssText, varRef[1]), depth + 1);
  }
  const remMatch = rawValue.match(/^(-?[\d.]+)rem$/);
  if (remMatch) return parseFloat(remMatch[1]) * 16;
  const pxMatch = rawValue.match(/^(-?[\d.]+)px$/);
  if (pxMatch) return parseFloat(pxMatch[1]);
  const secondsMatch = rawValue.match(/^(-?[\d.]+)s$/);
  if (secondsMatch) return parseFloat(secondsMatch[1]);
  const num = Number(rawValue);
  if (rawValue !== "" && !Number.isNaN(num)) return num;
  return rawValue;
}

function extractCssScalar(cssText, tokenName) {
  return { value: parseCssScalar(cssText, findCssPropertyValue(cssText, tokenName)) };
}

// The code-side numbered-ramp convention: modes 100/200/300/400 are four
// separate CSS custom properties (e.g. --button-height-100..400), not one
// token overridden per mode. tokenTemplate carries the literal "{mode}"
// placeholder to substitute.
const SCALE_MODES = ["100", "200", "300", "400"];

function extractCssScale(cssText, tokenTemplate) {
  const result = {};
  for (const mode of SCALE_MODES) {
    const propName = tokenTemplate.replace("{mode}", mode);
    result[mode] = parseCssScalar(cssText, findCssPropertyValue(cssText, propName));
  }
  return result;
}

// ---- css-fluid: clamp-aware, evaluated at each mode's anchor viewport --------
//
// WHY THIS EXISTS: a fluid type ramp declares ONE custom property three times
// across `:root` + two `@media (min-width: ...)` blocks, the last of which is a
// `clamp(...)` expression. css-scalar's last-declaration-wins scan hands that
// expression to the comparator as a STRING, so mapping
// layout/text/title/font-size-400 -> --title-style1-400-size against
// already-correct CSS flagged 10/10 modes value_mismatch (text-ramp verdict,
// 2026-08-13). Filing the 8 font-size variables entriesUnmappable kept the lane
// quiet but left it blind to real size drift.
//
// css-fluid closes that: for each Figma mode it takes that mode's ANCHOR
// VIEWPORT WIDTH, replays the CSS cascade at that width (base declaration plus
// every @media width range that admits it, source order deciding), evaluates the
// winning clamp()/calc()/min()/max() expression at that width, and compares the
// resolved px against the mode's own resolved Figma value.
//
// EVERY mode is evaluated, including interior ones. `md` sits between the `sm`
// and `xl` anchors, and title-300's md-distinct 32px exists only because of the
// ten-modes-are-the-contract ruling — comparing a clamp's min/max against the
// ramp's endpoints would call that ramp conformant while its interior drifted.
//
// Assumptions, stated rather than hidden: 1rem = 16px (same as parseCssScalar);
// 1vw = anchorWidth/100. Units that need a context this lane doesn't have (em,
// %, vh, ch) are reported as unevaluable-expression, never guessed at.

const ROOT_FONT_SIZE_PX = 16;

// At an anchor the comparison is exact — 0.01px absorbs float noise only.
const ANCHOR_TOLERANCE_PX = 0.01;
// When the anchor width falls strictly INSIDE a fluid segment, the value is an
// interpolation of the design's two endpoints and lands wherever the curve puts
// it, so a sub-px allowance applies. Override per entry with `tolerancePx`.
const INTERPOLATION_TOLERANCE_PX = 0.5;

// Thrown by an extractor when the whole ENTRY can't be extracted (as opposed to
// one mode failing); the main loop turns it into a single typed defect rather
// than one defect per mode.
class ExtractionError extends Error {
  constructor(type, detail) {
    super(detail ? `${type}: ${detail}` : type);
    this.type = type;
    this.detail = detail;
  }
}

// A per-mode extraction result that carries its own comparison terms: the
// resolved px, the width it was resolved at, and the tolerance that applies.
// Distinguished from a plain scalar so the comparator knows to diff numerically
// within tolerance instead of string-matching.
function measured(px, atWidth, tolerancePx) {
  return { __measured: true, px, atWidth, tolerancePx };
}

function isMeasured(v) {
  return Boolean(v) && typeof v === "object" && v.__measured === true;
}

// A per-mode failure. Kept as a value (not a throw) so one bad mode doesn't
// hide the other nine, and reported as a defect so a mode is never silently
// dropped — "0 defects" must never mean "nobody evaluated it".
function modeDefect(type, detail) {
  return { __defect: { type, detail } };
}

function isModeDefect(v) {
  return Boolean(v) && typeof v === "object" && v.__defect !== undefined;
}

// Parses an @media prelude into the viewport-width range it admits. Returns
// null when the prelude carries ANY condition that isn't a width range
// (`print`, `prefers-color-scheme`, `orientation`, ...) — such a block's
// declarations are conditional on something this lane can't evaluate, so they
// are excluded from the width cascade rather than misread as base values (the
// same mistake the @media-scoping fix above corrects for :root/.dark).
function parseWidthMedia(prelude) {
  const conditions = prelude.replace(/^@media\s*/, "").split(/\band\b/);
  let minWidth = 0;
  let maxWidth = Infinity;
  for (const raw of conditions) {
    const cond = raw.trim();
    if (cond === "" || cond === "screen" || cond === "all") continue;
    const match = cond.match(/^\(\s*(min|max)-width\s*:\s*(-?[\d.]+)(px|rem)\s*\)$/);
    if (!match) return null;
    const px = match[3] === "rem" ? parseFloat(match[2]) * ROOT_FONT_SIZE_PX : parseFloat(match[2]);
    if (match[1] === "min") minWidth = Math.max(minWidth, px);
    else maxWidth = Math.min(maxWidth, px);
  }
  return { minWidth, maxWidth };
}

// Every `:root` declaration of `propName`, in source order, each tagged with
// the viewport-width range it applies to. Declarations under a non-width media
// query are skipped (see parseWidthMedia); declarations outside `:root` are
// skipped because the fluid-ramp convention declares these on `:root` only.
function collectFluidDeclarations(cssText, propName) {
  const name = propName.replace(/^--/, "");
  const declarations = [];
  walkCssDeclarations(cssText, ({ prop, value, stack }) => {
    if (prop !== name) return;
    const top = stack[stack.length - 1];
    if (top !== ":root") return;
    let minWidth = 0;
    let maxWidth = Infinity;
    for (const selector of stack) {
      if (!isMediaAtRule(selector)) continue;
      const range = parseWidthMedia(selector);
      if (!range) return; // not a width-conditional declaration
      minWidth = Math.max(minWidth, range.minWidth);
      maxWidth = Math.min(maxWidth, range.maxWidth);
    }
    declarations.push({ value, minWidth, maxWidth });
  });
  return declarations;
}

// The cascade at a given viewport width: last matching declaration wins, same
// rule the rest of this file uses (equal specificity -> source order).
function declarationAtWidth(declarations, width) {
  let winner;
  for (const decl of declarations) {
    if (width >= decl.minWidth && width <= decl.maxWidth) winner = decl;
  }
  return winner;
}

// ---- CSS math evaluation ----------------------------------------------------
//
// A recursive-descent evaluator over the subset of CSS values a fluid ramp is
// written in: clamp()/min()/max()/calc(), + - * /, parentheses, px/rem/vw
// lengths, and var(--x) hops back into the same width-aware cascade. Anything
// outside that subset throws EvalError, which surfaces as a defect — the lane
// says "I could not evaluate this", never "it matches".
//
// `interpolated` rides along with the number: it is true when a clamp() landed
// strictly between its own bounds at this width, which is exactly the case
// where the fluid curve (not a designed endpoint) picked the value, and so the
// case that earns the wider tolerance.

class EvalError extends Error {}

function tokenizeCssMath(input) {
  const tokens = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if ("(),".includes(ch)) {
      tokens.push({ type: ch });
      i++;
      continue;
    }
    if ("+-*/".includes(ch)) {
      // A sign directly attached to a number after '(' or an operator or a
      // comma is part of the number, not a binary operator.
      const prev = tokens[tokens.length - 1];
      const isUnary = (ch === "+" || ch === "-") && (!prev || prev.type === "(" || prev.type === "," || prev.type === "op");
      if (!isUnary || !/[\d.]/.test(input[i + 1] || "")) {
        tokens.push({ type: "op", op: ch });
        i++;
        continue;
      }
    }
    const numMatch = input.slice(i).match(/^[+-]?(?:\d+\.?\d*|\.\d+)([a-z%]*)/i);
    if (numMatch) {
      tokens.push({ type: "num", value: parseFloat(numMatch[0]), unit: numMatch[1].toLowerCase() });
      i += numMatch[0].length;
      continue;
    }
    const identMatch = input.slice(i).match(/^[a-zA-Z-][a-zA-Z0-9-]*/);
    if (identMatch) {
      tokens.push({ type: "ident", name: identMatch[0] });
      i += identMatch[0].length;
      continue;
    }
    throw new EvalError(`unexpected character '${ch}' in "${input}"`);
  }
  return tokens;
}

function lengthToPx(token, width) {
  switch (token.unit) {
    case "":
      return token.value;
    case "px":
      return token.value;
    case "rem":
      return token.value * ROOT_FONT_SIZE_PX;
    case "vw":
      return (token.value * width) / 100;
    default:
      throw new EvalError(`unsupported unit '${token.unit}' (needs a context this lane does not have)`);
  }
}

function createCssMathParser(tokens, ctx) {
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];
  const expect = (type) => {
    const token = next();
    if (!token || token.type !== type) throw new EvalError(`expected '${type}'`);
    return token;
  };

  // Each parse step returns { px, interpolated }.
  function parseArguments() {
    expect("(");
    const args = [];
    if (peek() && peek().type === ")") {
      next();
      return args;
    }
    for (;;) {
      args.push(parseExpression());
      const token = next();
      if (!token) throw new EvalError("unterminated argument list");
      if (token.type === ")") return args;
      if (token.type !== ",") throw new EvalError("expected ',' or ')'");
    }
  }

  function parseFunction(name) {
    const args = parseArguments();
    const px = args.map((a) => a.px);
    const interpolated = args.some((a) => a.interpolated);
    switch (name.toLowerCase()) {
      case "calc":
        if (args.length !== 1) throw new EvalError("calc() takes one expression");
        return args[0];
      case "min":
        if (args.length === 0) throw new EvalError("min() needs arguments");
        return { px: Math.min(...px), interpolated };
      case "max":
        if (args.length === 0) throw new EvalError("max() needs arguments");
        return { px: Math.max(...px), interpolated };
      case "clamp": {
        if (args.length !== 3) throw new EvalError("clamp() takes three arguments");
        const [lower, preferred, upper] = px;
        const value = Math.min(Math.max(lower, preferred), upper);
        // Strictly inside its own bounds -> the fluid curve chose this value.
        const inside = value > lower + ANCHOR_TOLERANCE_PX && value < upper - ANCHOR_TOLERANCE_PX;
        return { px: value, interpolated: interpolated || inside };
      }
      case "var": {
        throw new EvalError("var() must be the whole value, not part of an expression");
      }
      default:
        throw new EvalError(`unsupported function '${name}()'`);
    }
  }

  function parseFactor() {
    const token = next();
    if (!token) throw new EvalError("unexpected end of expression");
    if (token.type === "num") return { px: lengthToPx(token, ctx.width), interpolated: false };
    if (token.type === "(") {
      const value = parseExpression();
      expect(")");
      return value;
    }
    if (token.type === "ident") {
      if (peek() && peek().type === "(") return parseFunction(token.name);
      throw new EvalError(`bare keyword '${token.name}'`);
    }
    if (token.type === "op" && (token.op === "-" || token.op === "+")) {
      const operand = parseFactor();
      return { px: token.op === "-" ? -operand.px : operand.px, interpolated: operand.interpolated };
    }
    throw new EvalError("unexpected token");
  }

  function parseTerm() {
    let left = parseFactor();
    while (peek() && peek().type === "op" && (peek().op === "*" || peek().op === "/")) {
      const { op } = next();
      const right = parseFactor();
      if (op === "/" && right.px === 0) throw new EvalError("division by zero");
      left = { px: op === "*" ? left.px * right.px : left.px / right.px, interpolated: left.interpolated || right.interpolated };
    }
    return left;
  }

  function parseExpression() {
    let left = parseTerm();
    while (peek() && peek().type === "op" && (peek().op === "+" || peek().op === "-")) {
      const { op } = next();
      const right = parseTerm();
      left = { px: op === "+" ? left.px + right.px : left.px - right.px, interpolated: left.interpolated || right.interpolated };
    }
    return left;
  }

  return () => {
    const value = parseExpression();
    if (pos !== tokens.length) throw new EvalError("trailing tokens");
    return value;
  };
}

// Resolves a raw CSS value to px at `width`, following var(--x) hops through
// the same width-aware cascade (so an indirected fluid token is evaluated, not
// abandoned). Throws EvalError when the value leaves the supported subset.
function evaluateFluidValue(rawValue, ctx) {
  const varRef = rawValue.trim().match(/^var\(\s*(--[a-zA-Z0-9-]+)\s*\)$/);
  if (varRef) {
    if (ctx.depth >= 5) throw new EvalError("var() indirection too deep (cycle?)");
    const declarations = collectFluidDeclarations(ctx.cssText, varRef[1]);
    const decl = declarationAtWidth(declarations, ctx.width);
    if (!decl) throw new EvalError(`var(${varRef[1]}) has no :root declaration applying at ${ctx.width}px`);
    return evaluateFluidValue(decl.value, { ...ctx, depth: ctx.depth + 1 });
  }
  return createCssMathParser(tokenizeCssMath(rawValue), ctx)();
}

// tokenName is a single CSS custom property whose cascade is replayed per mode.
// ctx: { modes, anchorWidths, tolerancePx }.
function extractCssFluid(cssText, tokenName, ctx = {}) {
  const { modes = [], anchorWidths = {}, tolerancePx } = ctx;
  const declarations = collectFluidDeclarations(cssText, tokenName);
  if (declarations.length === 0) {
    throw new ExtractionError("missing-token-declaration", `no :root declaration of ${tokenName} found`);
  }

  const result = {};
  for (const mode of modes) {
    const width = anchorWidths[mode];
    if (typeof width !== "number") {
      result[mode] = modeDefect(
        "missing-anchor-width",
        `no anchor viewport width for mode '${mode}' — add it to the capture's ${ANCHOR_WIDTH_FIGMA_PATH} or to the map's anchorWidths.modes`
      );
      continue;
    }
    const decl = declarationAtWidth(declarations, width);
    if (!decl) {
      result[mode] = modeDefect("no-declaration-at-width", `no declaration of ${tokenName} applies at ${width}px`);
      continue;
    }
    try {
      const { px, interpolated } = evaluateFluidValue(decl.value, { cssText, width, depth: 0 });
      const tolerance = interpolated ? (tolerancePx ?? INTERPOLATION_TOLERANCE_PX) : ANCHOR_TOLERANCE_PX;
      result[mode] = measured(px, width, tolerance);
    } catch (err) {
      if (!(err instanceof EvalError)) throw err;
      result[mode] = modeDefect("unevaluable-expression", `${decl.value} at ${width}px — ${err.message}`);
    }
  }
  return result;
}

// ---- Anchor viewport widths -------------------------------------------------
//
// A mode's anchor width is the viewport the design was drawn at. It comes from
// the capture itself — the `layout` collection's own device/width variable
// (sm 375 / md 768 / lg 1280 / xl 1920 on the live file, with the -flush and
// -sidebar-main variants mirroring their base mode) — so the widths are the
// design's, not a number an engineer typed. A map may point at a different
// variable (anchorWidths.figmaPath) or declare a table (anchorWidths.modes) for
// modes the capture doesn't carry; the capture wins where both exist.
const ANCHOR_WIDTH_FIGMA_PATH = "layout/device/width";

function resolveAnchorWidths(mapping, index, modes) {
  const config = mapping.anchorWidths || {};
  const figmaPath = config.figmaPath || ANCHOR_WIDTH_FIGMA_PATH;
  const declared = config.modes || {};
  const byMode = {};
  for (const mode of modes) {
    if (index.has(figmaPath)) {
      const resolved = resolveValue(figmaPath, mode, index);
      if (!resolved.error && typeof resolved.value === "number") {
        byMode[mode] = resolved.value;
        continue;
      }
    }
    if (typeof declared[mode] === "number") byMode[mode] = declared[mode];
  }
  return byMode;
}

const EXTRACTORS = {
  "css-root-dark": extractCssRootDark,
  "css-scalar": extractCssScalar,
  "css-scale": extractCssScale,
  "css-fluid": extractCssFluid,
};

// ---- Core check ------------------------------------------------------------

function resolveCodeLocation(mappingPath, codeLocation) {
  const repoRoot = dirname(dirname(resolve(mappingPath)));
  return join(repoRoot, codeLocation);
}

function normalize(v) {
  return String(v).trim().toLowerCase();
}

// A Figma EASING variable resolves to a bezierValues object ({p1x,p1y,p2x,
// p2y}), not a plain scalar — convert it to the same cubic-bezier(...)
// string CSS authors it as, rounding away the export's float noise (e.g.
// 0.8500000238418579 -> 0.85) before formatting.
// A Figma COLOR variable resolves to an unbound RGB(A) object ({r,g,b,a},
// each channel a 0..1 float), while every color token on the code side is
// authored as a hex string — same color, two representations. Detected by
// shape (r/g/b all numbers), not by extraction type, since css-root-dark is
// used for both color and non-color tokens.
function isRgbColor(value) {
  return (
    value &&
    typeof value === "object" &&
    typeof value.r === "number" &&
    typeof value.g === "number" &&
    typeof value.b === "number"
  );
}

// Converts a Figma RGB(A) object to hex for comparison against code. Channel
// rounding (Math.round(c*255)) mirrors serializeColor's semantics (figma-
// plugin/capture-figma/schema-v2-transform.mjs:585-598 — the plugin export's
// canonical color-serialization rule) so both sides of the pipeline agree on
// what "the same color" rounds to. Format differs from serializeColor
// deliberately: serializeColor emits "rgba(r, g, b, a)" for alpha < 1 (its
// consumer is the plugin's human-readable export/diff); here the code side
// is always a hex string, so alpha < 1 is folded into an 8-digit
// "#rrggbbaa" hex suffix instead — decided so a code token authored as
// 8-digit hex (rare but valid CSS) can still compare equal. Alpha === 1
// (the common case in the live capture) yields plain 6-digit hex, matching
// how every color token found in figma-map.json today is authored.
function figmaColorToHex(color) {
  const channel = (c) => Math.round(c * 255).toString(16).padStart(2, "0");
  const hex = "#" + channel(color.r) + channel(color.g) + channel(color.b);
  if (typeof color.a === "number" && color.a !== 1) {
    return hex + channel(color.a);
  }
  return hex;
}

// Extracts {x1,y1,x2,y2} control points from either shape a Figma EASING
// variable's resolved value carries: the older/test-fixture "bezierValues"
// shape ({p1x,p1y,p2x,p2y}), or the live capture's actual export shape
// ({type: "CUSTOM_CUBIC_BEZIER", easingFunctionCubicBezier: {x1,y1,x2,y2}}).
// Returns null when neither shape matches (not an easing value).
function extractBezierPoints(value) {
  if (!value || typeof value !== "object") return null;
  if (value.bezierValues) {
    const { p1x, p1y, p2x, p2y } = value.bezierValues;
    return { x1: p1x, y1: p1y, x2: p2x, y2: p2y };
  }
  if (value.easingFunctionCubicBezier) {
    const { x1, y1, x2, y2 } = value.easingFunctionCubicBezier;
    return { x1, y1, x2, y2 };
  }
  return null;
}

function normalizeFigmaValue(value) {
  const bezier = extractBezierPoints(value);
  if (bezier) {
    const round = (n) => Number(n.toFixed(4));
    return `cubic-bezier(${round(bezier.x1)}, ${round(bezier.y1)}, ${round(bezier.x2)}, ${round(bezier.y2)})`;
  }
  if (isRgbColor(value)) return figmaColorToHex(value);
  return value;
}

// ---- Color comparison (alpha quantization) --------------------------------

// Parses a color string down to {r,g,b,alphaPercent} (alphaPercent 0..100,
// rounded to the nearest integer) so a Figma hex8 export and a code-side
// rgb()-with-percent-alpha string can be compared on the SAME terms, per the
// banked ruling (vault fleet/rulings/token-rulings.md "Alpha quantization"):
// the stated percentage governs, the hex byte is quantization noise (0d =
// 5.098% rounds to 5%). Returns null when the string isn't a recognized
// color shape.
function parseColor(str) {
  if (typeof str !== "string") return null;
  const hexMatch = str.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i);
  if (hexMatch) {
    const [, rgbHex, alphaHex] = hexMatch;
    const r = parseInt(rgbHex.slice(0, 2), 16);
    const g = parseInt(rgbHex.slice(2, 4), 16);
    const b = parseInt(rgbHex.slice(4, 6), 16);
    const alphaPercent = alphaHex === undefined ? 100 : Math.round((parseInt(alphaHex, 16) / 255) * 100);
    return { r, g, b, alphaPercent };
  }
  // Modern space-separated rgb()/rgba() syntax with an optional "/ N%" alpha
  // (the code-side convention seen in globals.css, e.g. "rgb(10 10 10 / 5%)").
  const rgbMatch = str.match(/^rgba?\(\s*(\d+)\s+(\d+)\s+(\d+)\s*(?:\/\s*([\d.]+)%\s*)?\)$/i);
  if (rgbMatch) {
    const [, r, g, b, alpha] = rgbMatch;
    const alphaPercent = alpha === undefined ? 100 : Math.round(Number(alpha));
    return { r: Number(r), g: Number(g), b: Number(b), alphaPercent };
  }
  return null;
}

// Figma's exported floats carry binary-conversion noise (0.1 ->
// 0.10000000149011612); compare numerically within a tight tolerance when
// both sides parse as numbers. Colors get their own comparison (RGB exact,
// alpha within quantization tolerance) since a hex8 byte and a stated
// percentage are two representations of the same rounded value, not two
// numbers to diff directly. Everything else falls back to exact string
// equality (bezier strings, keywords).
function valuesMatch(a, b) {
  const colorA = parseColor(a);
  const colorB = parseColor(b);
  if (colorA && colorB) {
    return colorA.r === colorB.r && colorA.g === colorB.g && colorA.b === colorB.b && colorA.alphaPercent === colorB.alphaPercent;
  }
  const na = Number(a);
  const nb = Number(b);
  if (a !== "" && b !== "" && !Number.isNaN(na) && !Number.isNaN(nb)) {
    return Math.abs(na - nb) < 0.01;
  }
  return normalize(a) === normalize(b);
}

export function runConformanceCheck({ capturePath, mappingPath }) {
  if (!existsSync(capturePath)) throw new Error(`capture file not found: ${capturePath}`);
  if (!existsSync(mappingPath)) throw new Error(`mapping file not found: ${mappingPath}`);

  const capture = JSON.parse(readFileSync(capturePath, "utf8"));
  const mapping = JSON.parse(readFileSync(mappingPath, "utf8"));
  const index = buildVariableIndex(capture.collections);

  const defects = [];
  let checkedCount = 0;
  // Comparisons actually performed (entry x mode), so a run can distinguish
  // "clean" from "examined nothing" — same reason coverage exists below.
  let modesEvaluated = 0;

  for (const [figmaPath, entry] of Object.entries(mapping.entries || {})) {
    const { codeLocation, tokenName, extraction } = entry;
    checkedCount++;

    const variable = index.get(figmaPath);
    if (!variable) {
      defects.push({ path: figmaPath, codeLocation, tokenName, type: "missing-figma-path" });
      continue;
    }

    const codeFilePath = resolveCodeLocation(mappingPath, codeLocation);
    if (!existsSync(codeFilePath)) {
      defects.push({ path: figmaPath, codeLocation, tokenName, type: "missing-code-location" });
      continue;
    }

    const extractor = EXTRACTORS[extraction];
    if (!extractor) {
      defects.push({ path: figmaPath, codeLocation, tokenName, type: "unsupported-extraction", extraction });
      continue;
    }

    const figmaModes = Object.keys(variable.valuesByMode);

    let codeValues;
    try {
      codeValues = extractor(readFileSync(codeFilePath, "utf8"), tokenName, {
        modes: figmaModes,
        anchorWidths: extraction === "css-fluid" ? resolveAnchorWidths(mapping, index, figmaModes) : undefined,
        tolerancePx: entry.tolerancePx,
      });
    } catch (err) {
      if (!(err instanceof ExtractionError)) throw err;
      defects.push({ path: figmaPath, codeLocation, tokenName, type: err.type, detail: err.detail });
      continue;
    }

    const codeValueKeys = Object.keys(codeValues);

    for (const mode of figmaModes) {
      // Some extractions (css-scalar) return one value regardless of the
      // Figma mode's own name (e.g. "Mode 1", "default") — when the mode
      // isn't a key but exactly one value was extracted, that's the value,
      // mirroring resolveValue's own single-mode alias fallback below.
      const codeValue = mode in codeValues ? codeValues[mode] : codeValueKeys.length === 1 ? codeValues[codeValueKeys[0]] : undefined;
      if (codeValue === undefined) continue; // extraction has nothing for this mode — no code counterpart to compare

      // A mode the extractor could not evaluate is reported, never dropped:
      // an unexaminable mode and a conformant one must not look the same.
      if (isModeDefect(codeValue)) {
        defects.push({ path: figmaPath, mode, codeLocation, tokenName, type: codeValue.__defect.type, detail: codeValue.__defect.detail });
        continue;
      }

      const resolved = resolveValue(figmaPath, mode, index);
      if (resolved.error) {
        defects.push({ path: figmaPath, mode, codeLocation, tokenName, type: "unresolved-value", detail: resolved.error });
        continue;
      }

      const figmaValue = normalizeFigmaValue(resolved.value);
      modesEvaluated++;

      if (isMeasured(codeValue)) {
        const figmaNumber = Number(figmaValue);
        if (figmaValue === "" || Number.isNaN(figmaNumber)) {
          defects.push({ path: figmaPath, mode, codeLocation, tokenName, type: "non-numeric-figma-value", detail: String(figmaValue) });
          continue;
        }
        if (Math.abs(figmaNumber - codeValue.px) > codeValue.tolerancePx) {
          defects.push({
            path: figmaPath,
            mode,
            old: figmaNumber,
            new: codeValue.px,
            atWidth: codeValue.atWidth,
            codeLocation,
            tokenName,
            type: "value_mismatch",
          });
        }
        continue;
      }

      if (!valuesMatch(figmaValue, codeValue)) {
        defects.push({ path: figmaPath, mode, old: figmaValue, new: codeValue, codeLocation, tokenName, type: "value_mismatch" });
      }
    }
  }

  const ok = defects.length === 0;
  const summaryLines = [`Conformance check: ${checkedCount} entries checked, ${modesEvaluated} modes evaluated, ${defects.length} defects.`];
  for (const d of defects) {
    if (d.type === "value_mismatch") {
      const at = d.atWidth === undefined ? "" : ` @${d.atWidth}px`;
      summaryLines.push(`  [value_mismatch] ${d.path} (${d.mode}${at}): figma=${d.old} code=${d.new} (${d.codeLocation}:${d.tokenName})`);
    } else {
      const where = d.mode === undefined ? "" : ` (${d.mode})`;
      summaryLines.push(`  [${d.type}] ${d.path}${where} (${d.codeLocation}:${d.tokenName})${d.detail ? ` — ${d.detail}` : ""}`);
    }
  }
  return { ok, defects, modesEvaluated, summary: summaryLines.join("\n") };
}

// ---- Coverage --------------------------------------------------------------

// "0 defects" and "nobody looked at it" are the same output unless coverage is
// reported alongside. On the live pipeline the map covers 55 of 580 captured
// variables, so a clean conformance run was saying nothing at all about 90% of
// the captured surface — and reading as reassurance.
//
// Two directions, because they're different problems:
//   unmappedPaths                captured but unexamined — the map needs to grow.
//   mappedPathsMissingFromCapture the map points at a variable the capture no
//                                 longer carries — a stale map entry (the value
//                                 lane already reports this as a
//                                 missing-figma-path defect; it's surfaced here
//                                 too so one read answers "what is this map
//                                 actually covering?").
// Names are reported in full, never truncated: a capped list would put the
// silence straight back.
//
// Split from the path-based wrapper deliberately: capture-listener already
// holds the POSTed export in memory and runs this on every sync, so making it
// re-read (and re-parse) the ~1.7MB artifact just to count names would put a
// real cost on the no-op sync path.
export function computeCoverage(capture, mapping) {
  const mappedPaths = new Set(Object.keys(mapping.entries || {}));

  const capturedPaths = [];
  for (const col of capture.collections || []) {
    for (const v of col.variables || []) capturedPaths.push(`${col.name}/${v.name}`);
  }

  const unmappedPaths = capturedPaths.filter((p) => !mappedPaths.has(p));
  const unmappedByCollection = {};
  for (const p of unmappedPaths) {
    const collection = p.slice(0, p.indexOf("/"));
    unmappedByCollection[collection] = (unmappedByCollection[collection] || 0) + 1;
  }
  const capturedSet = new Set(capturedPaths);
  const mappedPathsMissingFromCapture = [...mappedPaths].filter((p) => !capturedSet.has(p));

  const total = capturedPaths.length;
  const unmapped = unmappedPaths.length;
  const mapped = total - unmapped;
  return {
    total,
    mapped,
    unmapped,
    // Integer percent, floored — 89.6% covered should never round up to "90%
    // covered" in a report whose whole job is to not overstate what was checked.
    mappedPercent: total === 0 ? 0 : Math.floor((mapped / total) * 100),
    unmappedPaths,
    unmappedByCollection,
    mappedPathsMissingFromCapture,
  };
}

export function runCoverageReport({ capturePath, mappingPath }) {
  if (!existsSync(capturePath)) throw new Error(`capture file not found: ${capturePath}`);
  if (!existsSync(mappingPath)) throw new Error(`mapping file not found: ${mappingPath}`);
  return computeCoverage(JSON.parse(readFileSync(capturePath, "utf8")), JSON.parse(readFileSync(mappingPath, "utf8")));
}

// ---- Handoff enumeration pass -----------------------------------------------
//
// WHY THIS EXISTS: the VALUE lane above (runConformanceCheck) only ever looks
// at what figma-map.json happens to mention — 55 of 580+ captured variables on
// the live pipeline (see computeCoverage's own note). A variable that was never
// added to the map is invisible in BOTH directions: not missing, not matching,
// not anything — the dimension-1000 defect (audit
// projects/portfolio/audits/2026-09-04-dimension-token-parity.md) slipped
// through exactly this gap for weeks. This pass instead walks EVERY variable in
// a Design System handoff export (schema `design-system-handoff`, distinct from
// the capture-listener's `variables-styles` capture the VALUE lane reads) and
// classifies it against the DS package's own generated + hand-authored CSS,
// with no map file in between.
//
// Handoff export shape (per collection): `variables[].modes[]` carries one
// entry per Figma mode with a `raw` value (or, for an alias,
// `{ type: "VARIABLE_ALIAS", id }` plus a sibling `alias.terminalValue` that
// the export has ALREADY fully resolved through the whole chain — used
// directly rather than re-walking mode.raw one hop at a time, since the
// export did the harder version of that work already and a partial re-walk
// here could only make it MORE stale, never fresher). `codeSyntax.WEB.value`
// is the CSS custom-property name this pass resolves against — no name
// mapping is needed the way figma-map.json entries require one.
//
// DEFAULT MODE, PER COLLECTION: a collection's `defaultModeId` names which of
// its modes is "the" value — the one the DS package declares in an
// unconditional `:root` block (see ds-from-handoff.mjs's own P2 policy and the
// generated tokens.generated.css, where every collection's default mode is the
// bare `:root` declaration and every OTHER mode lives behind a selector this
// pass deliberately does not chase: `.dark` for color, `[data-jhd-*-mode="N"]`
// for action/icon, and per-breakpoint blocks for layout). Reusing
// parseCssCustomProps (the same root/dark scanner the VALUE lane's
// "css-root-dark" extraction uses) is what makes that selection automatic:
// data-attribute and @media-scoped declarations are invisible to it by
// construction, so `rootMap`/`darkMap` already hold exactly the default-mode
// value for every collection, mode-scoped or not — never the last declaration
// in the file (which, for icon/action, would silently pick mode 300 or 400
// instead of the export's own default).
//
// COLOR is the one collection with a real two-axis contract (light -> :root,
// dark -> .dark): every other collection's non-default modes are look-ins a
// human never asked this pass to grade (action/icon per-mode ramps, layout's
// per-breakpoint values) — those stay the VALUE lane's job for any entry that
// IS mapped, and are out of scope for MISSING/DRIFT classification here
// (existence via the default mode is still checked and still catches an
// unmirrored token, which is the actual gap this pass closes).
//
// CLASSIFICATION (per variable with a WEB codeSyntax):
//   MATCH           default-mode (and, for color, dark-mode) values agree
//                   after unit/alias/case normalization.
//   VALUE-DRIFT     both sides exist but disagree past tolerance.
//   MISSING-IN-DS   the WEB name has no :root (or .dark) declaration anywhere
//                   in the CSS sources given.
//   EXTRA-IN-DS     (reported separately, not per-variable) any custom
//                   property declared in :root/.dark whose name matches no
//                   export WEB name, minus `allowlist` (house-only tokens with
//                   no Figma counterpart, e.g. component-composition helpers).
//
// NORMALIZATION reuses existing primitives rather than re-inventing them
// (code-minimalism rung 2): `parseCssScalar` already does rem->px at the same
// 16px root the rest of this file assumes, plus one var() hop; `valuesMatch`
// already does case-insensitive hex/rgb color comparison and numeric
// tolerance. Alias resolution on the FIGMA side goes through the export's own
// `terminalValue` (full resolution, not "one hop" — see above), which the
// code-side var() one-hop in parseCssScalar is symmetrical enough with in
// practice: the DS package's own alias chains are shallow (token ->
// semantic -> palette, 1-2 hops), so a value that resolved on the Figma side
// resolves here too.
// Suffix per `buildUnit` — the same table ds-from-handoff.mjs's `BUILD_UNIT_SUFFIX`
// attaches CSS syntax with, kept in lockstep so a converted Figma value and the
// DS's generated declaration are formatted identically before comparison.
const BUILD_UNIT_SUFFIX = {
  rem: "rem",
  px: "px",
  em: "em",
  "%": "%",
  unitless: "",
};

// Schema 5's `unitHint.convertedValue` is a bare number in `buildUnit`'s scale
// (e.g. `0.5` for a `divide-by-100` opacity). The DS package's generated CSS
// carries the unit suffix (`0.5`, `1px`, `5rem`). Formatting the converted
// value with the same suffix and running it back through `parseCssScalar`
// (empty cssText — no var() hop needed for a literal) reuses the exact
// px/rem/bare-number normalization the DS side already goes through, so a
// `divide-by-root-font-size` rem value and a `divide-by-100` fraction both
// land on the same comparable number `parseCssScalar` would produce for the
// DS declaration.
function formatConvertedForCompare(u) {
  const suffix = BUILD_UNIT_SUFFIX[u.buildUnit];
  if (suffix === undefined) return u.convertedValue;
  return parseCssScalar("", `${u.convertedValue}${suffix}`);
}

function isUnconverted(v) {
  return Boolean(v) && typeof v === "object" && v.__unconverted === true;
}

// Resolves what a mode ACTUALLY publishes to CSS, mirroring
// ds-from-handoff.mjs's own `resolveValue` branch order exactly (P4 in that
// file's header): an alias short-circuits before unitHint is even consulted
// (the semantic variable's own unitHint describes intended usage, not what
// gets emitted — the primitive it points at is what's built), and only a
// non-alias FLOAT with a `conversionStrategy` goes through unit conversion.
// Comparing `mode.raw` directly (the pre-fix behaviour) compares Figma's
// STORED number — e.g. opacity's 0-100 raw — against the DS package's
// CONVERTED CSS value (a 0-1 fraction), which is not the same quantity and
// produces a false VALUE-DRIFT on every `divide-by-100`/`divide-by-root-
// font-size` token.
function handoffModeValue(mode, variableType) {
  if (!mode) return undefined;
  if (mode.alias) {
    if (mode.alias.terminalValue !== undefined) return mode.alias.terminalValue;
    return { __unresolvedAlias: true, targetId: mode.raw?.id };
  }
  if (mode.raw && typeof mode.raw === "object" && mode.raw.type === "VARIABLE_ALIAS") {
    // Alias marker with no resolved `alias` block at all (shouldn't happen in
    // a well-formed export, but fail closed rather than compare against the
    // marker object).
    return { __unresolvedAlias: true, targetId: mode.raw.id };
  }

  // Schema 6: the export finishes the build cell itself — `mode.build.css` IS
  // the final CSS string the DS package emits, so it is used verbatim rather
  // than re-derived from `unitHint.convertedValue` (schema 5's shape, still
  // read below when `build` is absent — a schema-5 mode never carries it).
  // `resolved` -> parseCssScalar-normalized `build.css` (same normalization
  // schema 5's converted-value path already applies, so both schemas land on
  // the same comparable number). `unresolved` -> the same UNCONVERTED shape
  // schema 5 emits for a strategy the export could not carry out, so a
  // schema-6 unresolved build reads identically to a schema-5 one downstream
  // (never invents a value for either).
  // Scoped to FLOAT (mirroring the `variableType === "FLOAT"` guard schema 5
  // already used below): `build` only carries a real unit-conversion verdict
  // for numeric variables. STRING/COLOR variables report `build.status:
  // "unresolved"` UNCONDITIONALLY (build doesn't apply to them at all) while
  // their `raw` is the real, already-correct value (a font name, a hex
  // string) — reading `mode.build` for those would misclassify all 213
  // color-primitives and every STRING variable as UNCONVERTED.
  if (variableType === "FLOAT" && mode.build) {
    if (mode.build.status === "resolved") return parseCssScalar("", mode.build.css);
    return {
      __unconverted: true,
      strategy: mode.unitHint?.conversionStrategy ?? mode.build.conversionStrategy ?? null,
      buildUnit: mode.unitHint?.buildUnit ?? mode.build.unit ?? null,
      confidence: mode.build.confidence ?? mode.unitHint?.confidence ?? "none",
      sourceUnit: mode.unitHint?.sourceUnit ?? null,
    };
  }

  if (variableType === "FLOAT") {
    const u = mode.unitHint;
    if (u && u.conversionStrategy) {
      if (typeof u.convertedValue === "number") return formatConvertedForCompare(u);
      // Strategy named but the export could not carry it out (in practice
      // `divide-by-associated-font-size`) — the DS package emits the raw
      // source value with an UNCONVERTED comment (P4) rather than inventing
      // a divisor. Classify the same way here instead of comparing a raw
      // Figma number against a DS value that was never actually converted.
      return {
        __unconverted: true,
        strategy: u.conversionStrategy,
        buildUnit: u.buildUnit ?? null,
        confidence: u.confidence ?? "none",
        sourceUnit: u.sourceUnit ?? null,
      };
    }
  }
  return mode.raw;
}

function isUnresolvedAlias(v) {
  return Boolean(v) && typeof v === "object" && v.__unresolvedAlias === true;
}

// Schema 6 `breakpoints.entries[]`: one row per layout mode (`modeId`,
// `family`, `widthPx`, `layoutVariant`, ...). Mirrors ds-from-handoff.mjs's
// own P6 ruling exactly — the collection's `defaultModeId` is Figma's "first
// mode" convention (`lg`, unrelated to responsive intent), but the DS package
// now seeds its unconditional `:root` base from the mode with the SMALLEST
// `widthPx` among `layoutVariant === "default"` entries (`sm`). Comparing
// this pass's figmaDefault against `collection.defaultModeId` for a layout
// variable would compare `lg`'s Figma value against the DS's `sm`-based
// unconditional declaration — same collection, same variable, wrong mode on
// each side. Returns a Map of collectionId -> base modeId; absent on schema
// 3/5 (no `breakpoints` block), where `collection.defaultModeId` stays the
// only source, unchanged from before this slice.
function computeLayoutBaseModeIds(breakpoints) {
  const byCollection = new Map();
  for (const entry of breakpoints?.entries || []) {
    if (entry.layoutVariant !== "default" || typeof entry.widthPx !== "number") continue;
    const current = byCollection.get(entry.collectionId);
    if (!current || entry.widthPx < current.widthPx) {
      byCollection.set(entry.collectionId, { modeId: entry.modeId, widthPx: entry.widthPx });
    }
  }
  const result = new Map();
  for (const [collectionId, { modeId }] of byCollection) result.set(collectionId, modeId);
  return result;
}

// Resolves one collection's default-mode (and, for `color`, dark-mode) value
// for a single variable. Returns null for a variable with no WEB codeSyntax —
// nothing this pass can bind against. `baseModeId` overrides
// `collection.defaultModeId` when the export's own breakpoints table names a
// different base mode for this collection (see computeLayoutBaseModeIds).
function resolveHandoffVariable(variable, collection, baseModeId) {
  const webName = variable.codeSyntax && variable.codeSyntax.WEB && variable.codeSyntax.WEB.value;
  if (!webName) return null;

  const modes = variable.modes || [];
  const defaultMode = modes.find((m) => m.modeId === (baseModeId ?? collection.defaultModeId)) || modes[0];
  const defaultRaw = handoffModeValue(defaultMode, variable.type);
  const figmaDefault = isUnconverted(defaultRaw) ? defaultRaw : normalizeFigmaValue(defaultRaw);

  const darkModeMeta = (collection.modes || []).find((m) => typeof m.name === "string" && m.name.toLowerCase() === "dark");
  const hasDarkAxis = Boolean(darkModeMeta) && defaultMode && defaultMode.modeName !== "dark";
  const darkVariableMode = hasDarkAxis ? modes.find((m) => m.modeId === darkModeMeta.id) : undefined;
  const darkRaw = hasDarkAxis ? handoffModeValue(darkVariableMode, variable.type) : undefined;
  const figmaDark = hasDarkAxis ? (isUnconverted(darkRaw) ? darkRaw : normalizeFigmaValue(darkRaw)) : undefined;

  return {
    webName,
    path: `${collection.name}/${variable.name}`,
    figmaDefault,
    hasDarkAxis,
    figmaDark,
  };
}

// Builds the DS package's declared-custom-property surface from one or more
// CSS sources, concatenated in the order given — later sources win on a
// shared property (the same "hand-authored always wins over generated"
// convention tokens.generated.css's own header documents).
//
// Deliberately NOT parseCssCustomProps: this codebase is Tailwind v4
// CSS-first, and its Figma-named scalar tokens (dimension/radius/border/
// motion ramps, plus every `--color-*` alias) are declared inside
// `@theme inline { }`, not `:root` — parseCssCustomProps' own sibling
// extractor (css-scalar) documents exactly this ("used for non-theme-mode
// tokens ... which live in @theme inline rather than :root/.dark"). A root/
// dark-only scan reads every one of those as MISSING-IN-DS, which is what
// the first (unscoped) version of this pass did against the live DS repo —
// `@theme inline`/`@theme` is folded into the same "root" bucket here so it
// counts as the default-mode declaration it functions as.
function buildDsSurface(cssTexts) {
  const combined = cssTexts.join("\n");
  const root = {};
  const dark = {};
  walkCssDeclarations(combined, ({ prop, value, stack }) => {
    if (stack.some(isConditionalGroupAtRule)) return;
    const top = stack[stack.length - 1];
    if (top === ":root" || /^@theme\b/.test(top)) root[prop] = value;
    else if (top === ".dark") dark[prop] = value;
  });
  return { combined, root, dark };
}

// Plain (unscoped) one-hop var() resolution — used for every collection
// EXCEPT color, where a var() reference can point at a name whose OWN value
// differs by scope (see resolveDsScoped below).
function resolveDsValue(combinedCss, rawValue) {
  if (rawValue === undefined) return undefined;
  return parseCssScalar(combinedCss, rawValue);
}

// Scope-aware one-hop var() resolution for color. The house architecture
// aliases every Figma-named `--color-*` token (declared once, in
// `@theme inline`, unconditionally) to an UNPREFIXED semantic name that
// carries the real light/dark split (`:root`/`.dark`) — e.g.
// `--color-background-default-primary: var(--background-default-primary)`,
// where `--background-default-primary` itself has a `:root` value AND a
// `.dark` override. A plain "last declaration anywhere" hop (what
// resolveDsValue/parseCssScalar does) always lands on whichever of the two
// was declared LAST in the file — the .dark block, on this codebase's
// section order — so both the light AND dark comparisons would silently
// compare against the dark value. This resolves the referenced name against
// the SCOPE being checked instead: `dark` falls back to `root` (mirroring
// extractCssRootDark's existing dark-inherits-from-light rule) and `light`
// never reads `.dark`. Falls through to the plain one-hop resolver for
// anything that isn't a single var() reference (a literal hex, or a chain
// this pass doesn't otherwise expect).
function resolveDsScoped(combinedCss, root, dark, rawValue, scope) {
  if (rawValue === undefined) return undefined;
  const varRef = rawValue.match(/^var\((--[a-zA-Z0-9-]+)\)$/);
  if (!varRef) return parseCssScalar(combinedCss, rawValue);
  const refName = varRef[1].replace(/^--/, "");
  const scoped = scope === "dark" ? (dark[refName] !== undefined ? dark[refName] : root[refName]) : root[refName];
  if (scoped === undefined) return undefined;
  return parseCssScalar(combinedCss, scoped);
}

const EASING_KEYWORD_BEZIER = {
  linear: "cubic-bezier(0, 0, 1, 1)",
};

// Same-curve keyword/bezier-string equivalence (e.g. Figma's "linear" keyword
// vs the DS package's authored `cubic-bezier(0, 0, 1, 1)`) — a narrow,
// explicit table rather than a general CSS easing-keyword parser, since this
// is the one keyword the live export and package are known to disagree on in
// representation (not value). Extend the table if another keyword surfaces;
// this pass otherwise falls through to valuesMatch's plain string equality.
function easingEquivalent(a, b) {
  const norm = (v) => (typeof v === "string" ? v.trim().toLowerCase() : v);
  const na = norm(a);
  const nb = norm(b);
  return (EASING_KEYWORD_BEZIER[na] && EASING_KEYWORD_BEZIER[na] === nb) || (EASING_KEYWORD_BEZIER[nb] && EASING_KEYWORD_BEZIER[nb] === na);
}

// Strips one layer of matching wrapping quotes — a font-family name is a bare
// string in the Figma export ("Suisse Intl") but CSS-quoted in authored code
// ('"Suisse Intl"'), same value, different representation. Only strips when
// both ends match, so a value that merely contains a quote character is left
// alone.
function stripWrappingQuotes(v) {
  if (typeof v !== "string" || v.length < 2) return v;
  const first = v[0];
  const last = v[v.length - 1];
  if ((first === '"' || first === "'") && first === last) return v.slice(1, -1);
  return v;
}

function valuesMatchHandoff(figmaValue, dsValue) {
  if (valuesMatch(figmaValue, dsValue)) return true;
  if (easingEquivalent(figmaValue, dsValue)) return true;
  if (typeof figmaValue === "string" && typeof dsValue === "string") {
    return stripWrappingQuotes(figmaValue) === stripWrappingQuotes(dsValue);
  }
  return false;
}

// runHandoffCheck({ handoffPath, cssPaths, allowlist? })
//   handoffPath — the Design System handoff export
//     (schema "design-system-handoff"; see file header for shape).
//   cssPaths — CSS sources to resolve DS values against, in generated-then-
//     hand-authored order (hand-authored wins, see buildDsSurface above).
//   allowlist — optional array of DS-only `--custom-property` names excluded
//     from EXTRA-IN-DS (house tokens with no Figma counterpart). Defaults to
//     empty: an unrecognized DS property is a real, reportable finding, not
//     assumed benign.
// Returns { ok, designSystemStateHash, counts, defects, matches, extraInDs,
// summary }. `defects` holds the two ACTIONABLE classes (MISSING-IN-DS,
// VALUE-DRIFT) in the same defect shape (`type`, `path`/`tokenName`) the VALUE
// lane already emits, so a consumer that only reads `.defects` (e.g.
// summarizeConformance's `lane()` helper in capture-listener.mjs) needs no
// special-casing to add a `handoff` lane alongside `value`/`binding`/
// `pageTemplate`.
export function runHandoffCheck({ handoffPath, cssPaths, allowlist = [] }) {
  if (!existsSync(handoffPath)) throw new Error(`handoff export not found: ${handoffPath}`);
  const cssTexts = cssPaths.map((p) => {
    if (!existsSync(p)) throw new Error(`css source not found: ${p}`);
    return readFileSync(p, "utf8");
  });

  const handoff = JSON.parse(readFileSync(handoffPath, "utf8"));
  const designSystemStateHash =
    (handoff.fingerprint && handoff.fingerprint.designSystemStateHash) || handoff.designSystemStateHash || null;

  // Schema gate. Version 6 is the format this pass compares the export's own
  // FINAL CSS against (per-mode `build.css`/`build.status`, the export doing
  // the unit-formatting work `formatConvertedForCompare` used to redo — see
  // `handoffModeValue`). Version 5 compares CONVERTED values via per-mode
  // `unitHint.conversionStrategy`/`convertedValue` (P4 in ds-from-handoff.mjs)
  // for any mode that carries no `build` block. Version 3 exports carry
  // neither `unitHint` nor `build`, so every FLOAT falls through
  // `handoffModeValue`'s bare-`mode.raw` branch — the same comparison this
  // pass always made — and is accepted as-is (cheap: no behaviour to gate).
  // Anything else is refused rather than silently comparing raw numbers
  // against converted CSS values with no unitHint/build to reconcile them.
  const schemaVersion = String(handoff.schemaVersion ?? "");
  if (handoff.schema !== "design-system-handoff" || !["3", "5", "6"].includes(schemaVersion)) {
    throw new Error(
      `handoff export schema not supported: ${handoff.schema ?? "(missing)"} v${handoff.schemaVersion ?? "(missing)"} — ` +
        `runHandoffCheck compares converted values via schemaVersion 6's per-mode build.css (or schemaVersion 5's ` +
        `unitHint, or accepts schemaVersion 3, which has neither to compare). Regenerate the export at v6, or open an ` +
        `issue if a new schema version needs support.`,
    );
  }

  const { combined, root, dark } = buildDsSurface(cssTexts);
  const allowlistSet = new Set(allowlist);
  const layoutBaseModeIds = computeLayoutBaseModeIds(handoff.breakpoints);

  const defects = [];
  const matches = [];
  const unconverted = [];
  const figmaNames = new Set();

  for (const collection of handoff.collections || []) {
    for (const variable of collection.variables || []) {
      const resolved = resolveHandoffVariable(variable, collection, layoutBaseModeIds.get(collection.id));
      if (!resolved) continue; // no WEB codeSyntax — nothing to bind against
      const { webName, path, figmaDefault, hasDarkAxis, figmaDark } = resolved;
      figmaNames.add(webName);
      const propName = webName.replace(/^--/, "");

      if (isUnresolvedAlias(figmaDefault)) {
        defects.push({ path, tokenName: webName, type: "unresolved-alias", detail: `alias target ${figmaDefault.targetId} not present in export` });
        continue;
      }

      // A strategy the export named but could not execute (in practice
      // `divide-by-associated-font-size`) — no converted value exists to
      // compare, so this is neither a match nor a drift. Report it as its
      // own class rather than either forcing a comparison against an
      // unconverted number or silently dropping it (P4: never invent the
      // missing divisor).
      if (isUnconverted(figmaDefault)) {
        unconverted.push({ path, tokenName: webName, type: "UNCONVERTED", ...figmaDefault });
        continue;
      }

      const dsRootRaw = root[propName];
      if (dsRootRaw === undefined && dark[propName] === undefined) {
        defects.push({ path, tokenName: webName, type: "MISSING-IN-DS" });
        continue;
      }

      // Color goes through the scope-aware resolver (a `--color-*` alias can
      // point at a name whose own value differs by scope); every other
      // collection has no light/dark axis to disambiguate, so the plain
      // one-hop resolver is enough.
      const dsDefault = hasDarkAxis || collection.name === "color" ? resolveDsScoped(combined, root, dark, dsRootRaw, "light") : resolveDsValue(combined, dsRootRaw);
      const rootMatches = dsRootRaw === undefined ? false : valuesMatchHandoff(figmaDefault, dsDefault);

      let darkOk = true;
      let dsDark;
      if (hasDarkAxis) {
        const dsDarkRaw = dark[propName] !== undefined ? dark[propName] : dsRootRaw;
        dsDark = resolveDsScoped(combined, root, dark, dsDarkRaw, "dark");
        darkOk = dsDarkRaw === undefined ? false : valuesMatchHandoff(figmaDark, dsDark);
      }

      if (dsRootRaw !== undefined && rootMatches && darkOk) {
        matches.push({ path, tokenName: webName, type: "MATCH", value: dsDefault });
      } else if (dsRootRaw === undefined) {
        defects.push({ path, tokenName: webName, type: "MISSING-IN-DS", detail: "declared under .dark only" });
      } else {
        // Report the first mode that failed — light before dark, matching
        // the order those axes are checked above.
        const failedDark = hasDarkAxis && !darkOk;
        defects.push({
          path,
          tokenName: webName,
          type: "VALUE-DRIFT",
          old: failedDark ? figmaDark : figmaDefault,
          new: failedDark ? dsDark : dsDefault,
          ...(hasDarkAxis ? { mode: failedDark ? "dark" : "light" } : {}),
        });
      }
    }
  }

  const dsNames = new Set([...Object.keys(root), ...Object.keys(dark)].map((n) => `--${n}`));
  const extraInDs = [...dsNames].filter((n) => !figmaNames.has(n) && !allowlistSet.has(n)).sort();

  const valueDriftCount = defects.filter((d) => d.type === "VALUE-DRIFT").length;
  const missingCount = defects.filter((d) => d.type === "MISSING-IN-DS").length;
  const unresolvedCount = defects.filter((d) => d.type === "unresolved-alias").length;

  // Schema 6 publishes `changes.variables.codeNameChanged` — a WEB code-name
  // change vs the export's own diff baseline, distinct from a value/alias
  // change. Passed through as its own count (never folded into MISSING-IN-DS/
  // EXTRA-IN-DS, which this pass still reports independently for the old and
  // new names) so a reader sees "N names changed" as its own line instead of
  // reading a naming-policy rename as an unrelated MISSING+EXTRA pair.
  // Absent on schema 3/5 (no `changes` block at all) — defaults to 0, not a
  // gate condition.
  const codeNameChangedCount = Array.isArray(handoff.changes?.variables?.codeNameChanged)
    ? handoff.changes.variables.codeNameChanged.length
    : 0;

  const counts = {
    total: matches.length + defects.length + unconverted.length,
    match: matches.length,
    valueDrift: valueDriftCount,
    missingInDs: missingCount,
    unresolvedAlias: unresolvedCount,
    unconverted: unconverted.length,
    extraInDs: extraInDs.length,
    codeNameChanged: codeNameChangedCount,
  };

  // UNCONVERTED is neither a match nor an actionable defect — it names a gap
  // in what the export itself could carry out (no font size to divide by),
  // not a disagreement between Figma and the DS package. It never fails the
  // gate; it is reported so the residue is visible, per §6 of
  // ds-from-handoff-report.md.
  const ok = missingCount === 0 && valueDriftCount === 0 && unresolvedCount === 0;
  const summaryLines = [
    `Handoff check: ${counts.total} variables enumerated, ${counts.match} match, ${counts.valueDrift} value-drift, ${counts.missingInDs} missing-in-ds, ${counts.extraInDs} extra-in-ds, ${counts.unresolvedAlias} unresolved-alias, ${counts.unconverted} unconverted, ${counts.codeNameChanged} code-name-changed.`,
  ];
  for (const d of defects) summaryLines.push(`  [${d.type}] ${d.path} (${d.tokenName})${d.detail ? ` — ${d.detail}` : ""}`);
  for (const n of extraInDs) summaryLines.push(`  [EXTRA-IN-DS] ${n}`);
  for (const u of unconverted) summaryLines.push(`  [UNCONVERTED] ${u.path} (${u.tokenName}) — ${u.strategy} -> ${u.buildUnit ?? "?"} (${u.confidence})`);

  return { ok, designSystemStateHash, counts, defects, matches, unconverted, extraInDs, summary: summaryLines.join("\n") };
}

// ---- CLI --------------------------------------------------------------

// realpath-normalizes both sides before comparing: import.meta.url resolves
// symlinks (e.g. macOS's /tmp -> /private/tmp) while process.argv[1] does
// not, so a script invoked through a symlinked path used to fail this check
// and silently no-op its CLI block. Falls back to the raw path if realpath
// itself fails (e.g. a path that no longer exists).
function isMainModule() {
  const realpath = (p) => {
    try {
      return realpathSync(p);
    } catch {
      return p;
    }
  };
  const invoked = process.argv[1];
  return Boolean(invoked) && realpath(fileURLToPath(import.meta.url)) === realpath(invoked);
}

if (isMainModule()) {
  const args = process.argv.slice(2);
  const getArg = (flag, fallback) => {
    const idx = args.indexOf(flag);
    return idx === -1 ? fallback : args[idx + 1];
  };
  const getArgAll = (flag) => args.reduce((acc, a, i) => (a === flag ? [...acc, args[i + 1]] : acc), []);

  if (args.includes("--handoff")) {
    // Enumerates every variable in a Design System handoff export against
    // the DS package's CSS — see runHandoffCheck's header. Independent CLI
    // mode from the map-driven VALUE lane above (different input shape, no
    // figma-map.json involved).
    const handoffPath = getArg(
      "--handoff-path",
      join(process.env.HOME, "JHD", "jhd-design-system", "main", "design", "handoff", "v3b-2026-09-05", "jhd-spec-designsystem-design-system-handoff.json")
    );
    const cssPaths = getArgAll("--css");
    const driftThresholdRaw = getArg("--drift-threshold", "0");
    const driftThreshold = Number(driftThresholdRaw);
    const ci = args.includes("--ci");

    // A typo'd or missing --drift-threshold value must never fail OPEN: an
    // invalid threshold makes `valueDrift > threshold` false-by-NaN below, so
    // `--ci --drift-threshold abc` would silently exit 0 with real drift
    // present. Reject anything that isn't a finite, non-negative number
    // before the gate runs at all.
    if (ci && (driftThresholdRaw === undefined || !Number.isFinite(driftThreshold) || driftThreshold < 0)) {
      console.error(
        `[conformance-check --handoff] --drift-threshold must be a finite, non-negative number, got: ${driftThresholdRaw === undefined ? "(missing value)" : JSON.stringify(driftThresholdRaw)}`
      );
      process.exit(2);
    }

    try {
      const result = runHandoffCheck({
        handoffPath,
        cssPaths: cssPaths.length > 0 ? cssPaths : [
          join(process.env.HOME, "JHD", "jhd-design-system", "main", "src", "tokens.generated.css"),
          join(process.env.HOME, "JHD", "jhd-design-system", "main", "src", "styles.css"),
        ],
      });
      console.log(JSON.stringify(result, null, 2));
      if (!ci) process.exit(result.ok ? 0 : 1);
      // CI mode: MISSING-IN-DS is never allowed through; VALUE-DRIFT tolerates
      // an explicit threshold (a known, ratified drift count is not the same
      // failure as a newly-introduced one — see --drift-threshold).
      const fails = result.counts.missingInDs > 0 || result.counts.unresolvedAlias > 0 || result.counts.valueDrift > driftThreshold;
      process.exit(fails ? 1 : 0);
    } catch (err) {
      console.error(`[conformance-check --handoff] ${err.message}`);
      process.exit(2);
    }
  } else {
    const capturePath = getArg(
      "--capture",
      join(process.env.HOME, "JHD", "figma-plugins", "main", "capture-figma", "captures", "live", "jhd-spec-designsystem-variables-styles.json")
    );
    const mappingPath = getArg("--map", join(process.env.HOME, "JHD", "portfolio", "design", "figma-map.json"));

    try {
      const result = runConformanceCheck({ capturePath, mappingPath });
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.ok ? 0 : 1);
    } catch (err) {
      console.error(`[conformance-check] ${err.message}`);
      process.exit(2);
    }
  }
}
