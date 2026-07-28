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
       "entries": { "<figma variable path>": { codeLocation, tokenName, extraction } } }
   codeLocation is relative to the mapping file's GRANDPARENT directory (the
   convention: a mapping lives at <repo>/design/figma-map.json, so
   codeLocation paths are repo-relative, e.g. "src/app/globals.css").

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
     "css-scale" — tokenName is a template string containing the literal
       "{mode}" placeholder (e.g. "--button-height-{mode}"), substituted with
       each Figma mode name to locate that mode's own CSS custom property
       (the code-side convention for a component's numbered size ramp:
       100/200/300/400 are four separate declarations, not one token
       overridden per mode). Same var()/unit resolution as "css-scalar".
*/
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

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
// arbitrary nesting (so `@media (...) { :root { --x: 1; } }` still attributes
// `--x` to `:root`) and records the LAST declaration seen for each selector,
// since source order determines override. Only declarations directly inside
// a `:root` or `.dark` block are collected — this file's other selectors
// (`@theme inline`, component utilities, etc.) are walked over but ignored.
function parseCssCustomProps(css) {
  const root = {};
  const dark = {};
  const stack = [];
  let i = 0;
  const len = css.length;
  while (i < len) {
    if (css[i] === "/" && css[i + 1] === "*") {
      const end = css.indexOf("*/", i + 2);
      i = end === -1 ? len : end + 2;
      continue;
    }
    if (css[i] === "}") {
      stack.pop();
      i++;
      continue;
    }
    const declMatch = css.slice(i).match(/^--([a-zA-Z0-9-]+)\s*:\s*([^;]+);/);
    const top = stack[stack.length - 1];
    if (declMatch && (top === ":root" || top === ".dark")) {
      const target = top === ":root" ? root : dark;
      target[declMatch[1]] = declMatch[2].trim();
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

const EXTRACTORS = {
  "css-root-dark": extractCssRootDark,
  "css-scalar": extractCssScalar,
  "css-scale": extractCssScale,
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
function normalizeFigmaValue(value) {
  if (value && typeof value === "object" && value.bezierValues) {
    const { p1x, p1y, p2x, p2y } = value.bezierValues;
    const round = (n) => Number(n.toFixed(4));
    return `cubic-bezier(${round(p1x)}, ${round(p1y)}, ${round(p2x)}, ${round(p2y)})`;
  }
  return value;
}

// Figma's exported floats carry binary-conversion noise (0.1 ->
// 0.10000000149011612); compare numerically within a tight tolerance when
// both sides parse as numbers, and fall back to exact string equality
// otherwise (hex colors, bezier strings, keywords).
function valuesMatch(a, b) {
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

    const codeValues = extractor(readFileSync(codeFilePath, "utf8"), tokenName);
    const figmaModes = Object.keys(variable.valuesByMode);

    const codeValueKeys = Object.keys(codeValues);

    for (const mode of figmaModes) {
      // Some extractions (css-scalar) return one value regardless of the
      // Figma mode's own name (e.g. "Mode 1", "default") — when the mode
      // isn't a key but exactly one value was extracted, that's the value,
      // mirroring resolveValue's own single-mode alias fallback below.
      const codeValue = mode in codeValues ? codeValues[mode] : codeValueKeys.length === 1 ? codeValues[codeValueKeys[0]] : undefined;
      if (codeValue === undefined) continue; // extraction has nothing for this mode — no code counterpart to compare

      const resolved = resolveValue(figmaPath, mode, index);
      if (resolved.error) {
        defects.push({ path: figmaPath, mode, codeLocation, tokenName, type: "unresolved-value", detail: resolved.error });
        continue;
      }

      const figmaValue = normalizeFigmaValue(resolved.value);
      if (!valuesMatch(figmaValue, codeValue)) {
        defects.push({ path: figmaPath, mode, old: figmaValue, new: codeValue, codeLocation, tokenName, type: "value_mismatch" });
      }
    }
  }

  const ok = defects.length === 0;
  const summaryLines = [`Conformance check: ${checkedCount} entries checked, ${defects.length} defects.`];
  for (const d of defects) {
    if (d.type === "value_mismatch") {
      summaryLines.push(`  [value_mismatch] ${d.path} (${d.mode}): figma=${d.old} code=${d.new} (${d.codeLocation}:${d.tokenName})`);
    } else {
      summaryLines.push(`  [${d.type}] ${d.path} (${d.codeLocation}:${d.tokenName})`);
    }
  }
  return { ok, defects, summary: summaryLines.join("\n") };
}

// ---- CLI --------------------------------------------------------------

function isMainModule() {
  return import.meta.url === `file://${process.argv[1]}`;
}

if (isMainModule()) {
  const args = process.argv.slice(2);
  const getArg = (flag, fallback) => {
    const idx = args.indexOf(flag);
    return idx === -1 ? fallback : args[idx + 1];
  };
  const capturePath = getArg(
    "--capture",
    join(process.env.HOME, "JHD", "captures", "live", "jhd-spec-designsystem-variables-styles.json")
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
