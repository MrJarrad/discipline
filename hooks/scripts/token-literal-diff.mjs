#!/usr/bin/env node
/* token-literal-diff — diff-scoped literal check (row 130, item 5, 2026-09-24;
   round 2 fix 2026-09-24: precision — declaration-value scoping, unitless
   0/1 exclusion, host-anchored word boundaries; merge-base + working-tree
   default diff).

   A new literal added to `src/styles/**` or any `*.css` file that equals a
   value already exported by the consumed design system's
   `tokens.generated.css` is a defect: the diff should have reached for the
   token instead of restating its value. Scope is the DIFF only — pre-existing
   literals elsewhere in the file are untouched findings that stay parked;
   this gate never widens to a whole-file or whole-repo sweep.

   Literal extraction is scoped to a CSS DECLARATION VALUE only — the text
   between `:` and its terminator (`;`, `}`, or end-of-line) on the line —
   so a selector or class name that merely looks like a value
   (`.gap-8 { ... }`, `#brand-header { ... }`) is never read as a literal. A bare (unitless) number is skipped UNLESS a token in
   the map carries that exact unitless value AND the value is not `0` or `1`
   — those two are near-universal non-token CSS values (`flex: 1`,
   `opacity: 0`, `z-index: 1`, `line-height: 1`) and would otherwise false-
   positive against almost any unitless token.

   Pure logic exported for testing:
     parseGeneratedTokens(css)        -> Map<value, [varName, ...]>
     parseAddedLines(diffText)        -> [{ file, line, text }] (unified diff, + lines only)
     declarationValuesInLine(line)    -> [valueText, ...]   (text between : and ; only)
     literalsInLine(line)             -> [literal, ...]     (numeric/hex tokens found, value-scoped)
     findDiffLiterals(diffText, tokenValues) -> [{ file, line, literal, tokens }]

   Usage:
     node token-literal-diff.mjs --tokens <path to tokens.generated.css> [--diff-cmd "..."] [--repo <path>] [--base <ref>]
     Default diff (no --diff-cmd): `git diff <merge-base(HEAD, --base or origin/main or main)>...HEAD`
     PLUS the working tree's own uncommitted diff, both scoped to `src/styles`/`*.css`,
     concatenated — so a lane's already-committed work is checked alongside anything
     still unstaged.
   Exit 0 no match · 1 any added line's literal matches a generated token's value, naming file:line. */
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

export function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--tokens") out.tokens = argv[++i];
    else if (a === "--diff-cmd") out.diffCmd = argv[++i];
    else if (a === "--repo") out.repo = argv[++i];
    else if (a === "--base") out.base = argv[++i];
  }
  return out;
}

/* Reads a `tokens.generated.css`-shaped file (`--var-name: value;` lines,
   `:root`/`@theme`/any selector) and returns a Map from a normalized value
   to the list of custom-property names that carry it. Only values that look
   like a design value (hex color, px/rem/em/% number, or bare number) are
   indexed — free-text values (font stacks, url()) are never matched, since a
   literal diff on those would be noise, not signal. */
export function parseGeneratedTokens(css) {
  const map = new Map();
  const re = /(--[a-zA-Z0-9-]+)\s*:\s*([^;]+);/g;
  let m;
  while ((m = re.exec(css))) {
    const [, name, rawValue] = m;
    const value = normalizeValue(rawValue.trim());
    if (value === null) continue;
    if (!map.has(value)) map.set(value, []);
    map.get(value).push(name);
  }
  return map;
}

function normalizeValue(raw) {
  const v = raw.trim();
  if (/^#[0-9a-fA-F]{3,8}$/.test(v)) return v.toLowerCase();
  const numMatch = v.match(/^(-?\d*\.?\d+)(px|rem|em|%)?$/);
  if (numMatch) return `${numMatch[1]}${numMatch[2] || ""}`;
  return null;
}

/* Parses a unified diff (`git diff` output, one or more concatenated diffs)
   into one entry per ADDED line (`+` prefix, never `+++` file headers),
   tracking the target file and its line number in the new file from each
   `@@ -a,b +c,d @@` hunk header. */
export function parseAddedLines(diffText) {
  const out = [];
  let currentFile = null;
  let newLine = null;
  for (const raw of diffText.split("\n")) {
    if (raw.startsWith("+++ ")) {
      const path = raw.slice(4).trim();
      currentFile = path === "/dev/null" ? null : path.replace(/^b\//, "");
      continue;
    }
    if (raw.startsWith("@@")) {
      const m = raw.match(/\+(\d+)/);
      newLine = m ? Number(m[1]) : null;
      continue;
    }
    if (!currentFile || newLine === null) continue;
    if (raw.startsWith("+++") || raw.startsWith("---")) continue;
    if (raw.startsWith("+")) {
      out.push({ file: currentFile, line: newLine, text: raw.slice(1) });
      newLine += 1;
    } else if (!raw.startsWith("-")) {
      newLine += 1;
    }
  }
  return out;
}

/* Every CSS declaration VALUE on one line — the text strictly between a `:`
   and its terminator, which is `;`, `}` (an inline rule closing with no
   trailing semicolon, `.a{padding:12px}`), or end-of-line (an added line
   with no terminator yet, `--x: 12px`, still under construction in the
   diff). A selector (`.gap-8 {`), a class name, or a property name never
   appears here; only what a property was actually set to. A capture
   requires at least one character after the colon, so a bare property with
   nothing following it (`gap:`) yields no value at all. */
export function declarationValuesInLine(line) {
  const out = [];
  const re = /:\s*([^:{};]+)[;}]?/g;
  let m;
  while ((m = re.exec(line))) {
    out.push(m[1]);
  }
  return out;
}

/* Literals worth checking inside ONE declaration value — hex colors, and
   numbers with a unit (px/rem/em/%) always; a BARE (unitless) number only
   when it is not `0` or `1` (near-universal non-token values: flex, opacity,
   z-index, line-height). Numbers already inside a `var(...)` call are never
   literals (that line already consumes the token). Word-boundaried so
   "18px" is never misread as "8px", and a hex run's digits are blanked out
   before the number scan so "#ff00aa" never also yields a bare "00". */
export function literalsInLine(valueText) {
  const withoutVarCalls = valueText.replace(/var\([^)]*\)/g, "");
  const out = [];
  const hexRe = /(?<![\w#])#[0-9a-fA-F]{3,8}\b/g;
  let m;
  while ((m = hexRe.exec(withoutVarCalls))) out.push(m[0].toLowerCase());
  const withoutHex = withoutVarCalls.replace(/#[0-9a-fA-F]{3,8}\b/g, (h) => " ".repeat(h.length));
  const numRe = /(?<![\w.-])(-?\d*\.?\d+)(px|rem|em|%)?(?![\w-])/g;
  while ((m = numRe.exec(withoutHex))) {
    const [, digits, unit] = m;
    if (!unit && (digits === "0" || digits === "1")) continue; // bare 0/1 excluded, see header
    out.push(`${digits}${unit || ""}`);
  }
  return out;
}

/* The gate: every ADDED line in the diff, scoped to its declaration values
   only, whose literal equals a value the design system already generates a
   token for. A bare (unitless) literal only counts when a token carries that
   exact unitless value (checked via tokenValues.has, since 0/1 are already
   excluded upstream by literalsInLine). Returns one row per match — `file`,
   `line`, `literal`, `tokens` (the var names carrying that value). */
export function findDiffLiterals(diffText, tokenValues) {
  const defects = [];
  for (const { file, line, text } of parseAddedLines(diffText)) {
    if (!/\.css$/.test(file) && !file.includes("src/styles/")) continue;
    for (const valueText of declarationValuesInLine(text)) {
      for (const literal of literalsInLine(valueText)) {
        if (tokenValues.has(literal)) {
          defects.push({ file, line, literal, tokens: tokenValues.get(literal) });
        }
      }
    }
  }
  return defects;
}

function run(cmd, cwd) {
  try {
    return execSync(cmd, { encoding: "utf8", cwd, maxBuffer: 1024 * 1024 * 32 });
  } catch {
    return "";
  }
}

/* The default diff sources: the lane's already-committed work against the
   merge-base with the target branch (`--base`, defaulting to `origin/main`
   then `main`), PLUS whatever is still uncommitted in the working tree —
   concatenated, so a literal introduced in an earlier commit on the branch
   is caught alongside one still unstaged. Falls back to the working-tree
   diff alone when no merge-base can be resolved (e.g. a scratch repo with
   no target branch). */
export function defaultDiffText(cwd, base) {
  let mergeBase = null;
  for (const ref of [base, "origin/main", "main"].filter(Boolean)) {
    try {
      mergeBase = execSync(`git merge-base HEAD ${ref}`, { encoding: "utf8", cwd }).trim();
      if (mergeBase) break;
    } catch {
      // ref doesn't exist or no common ancestor — try the next one
    }
  }
  const parts = [];
  if (mergeBase) {
    parts.push(run(`git diff ${mergeBase}...HEAD -- src/styles '*.css'`, cwd));
  }
  parts.push(run(`git diff -- src/styles '*.css'`, cwd));
  return parts.join("\n");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.tokens || !existsSync(args.tokens)) {
    console.error("Usage: node token-literal-diff.mjs --tokens <tokens.generated.css> [--diff-cmd \"...\"] [--repo <path>] [--base <ref>]");
    process.exit(1);
  }
  const tokenValues = parseGeneratedTokens(readFileSync(args.tokens, "utf8"));
  const cwd = args.repo || process.cwd();
  let diffText;
  if (args.diffCmd) {
    try {
      diffText = execSync(args.diffCmd, { encoding: "utf8", cwd, maxBuffer: 1024 * 1024 * 32 });
    } catch (err) {
      console.error(`token-literal-diff: did not run the diff command — ${err.message}`);
      process.exit(1);
    }
  } else {
    diffText = defaultDiffText(cwd, args.base);
  }
  const defects = findDiffLiterals(diffText, tokenValues);
  if (defects.length === 0) {
    console.log("token-literal-diff: 0 new literals matching a generated token");
    process.exit(0);
  }
  console.error(`token-literal-diff: ${defects.length} new literal(s) matching a generated token`);
  for (const d of defects) {
    console.error(`  ${d.file}:${d.line} — literal "${d.literal}" matches token(s) ${d.tokens.join(", ")}`);
  }
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
