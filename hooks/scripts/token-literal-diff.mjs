#!/usr/bin/env node
/* token-literal-diff — diff-scoped literal check (row 130, item 5, 2026-09-24).
   A new literal added to `src/styles/**` or any `*.css` file that equals a
   value already exported by the consumed design system's
   `tokens.generated.css` is a defect: the diff should have reached for the
   token instead of restating its value. Scope is the DIFF only — pre-existing
   literals elsewhere in the file are untouched findings that stay parked;
   this gate never widens to a whole-file or whole-repo sweep.

   Pure logic exported for testing:
     parseGeneratedTokens(css)        -> Map<value, [varName, ...]>
     parseAddedLines(diffText)        -> [{ file, line }]   (unified diff, + lines only)
     literalsInLine(line)             -> [literal, ...]     (numeric/hex/rem-px tokens found)
     findDiffLiterals(diffText, tokenValues) -> [{ file, line, literal, tokens }]

   Usage:
     node token-literal-diff.mjs --tokens <path to tokens.generated.css> [--diff-cmd "git diff --cached -- src/styles '*.css'"]
     (defaults to `git diff -- src/styles '*.css' '*.css'` against the working tree when --diff-cmd is omitted)
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
  }
  return out;
}

/* Reads a `tokens.generated.css`-shaped file (`--var-name: value;` lines,
   `:root`/`@theme`/any selector) and returns a Map from a normalized value
   to the list of custom-property names that carry it. Only values that look
   like a design value (hex color, px/rem/em number, or bare number) are
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

/* Parses a unified diff (`git diff` output) into one entry per ADDED line
   (`+` prefix, never `+++` file headers), tracking the target file and its
   line number in the new file from each `@@ -a,b +c,d @@` hunk header. */
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

/* Literals worth checking on one added line — hex colors, and bare/px/rem/em
   numbers not already inside a `var(...)` call (a line that already consumes
   the token via `var(--x)` is conformant, not a new literal). */
export function literalsInLine(line) {
  const withoutVarCalls = line.replace(/var\([^)]*\)/g, "");
  const out = [];
  const hexRe = /#[0-9a-fA-F]{3,8}\b/g;
  let m;
  while ((m = hexRe.exec(withoutVarCalls))) out.push(m[0].toLowerCase());
  // Numbers are scanned on the string with hex codes blanked out, so a hex
  // digit run (e.g. "00" inside #ff00aa) is never also read as a bare number.
  const withoutHex = withoutVarCalls.replace(hexRe, (h) => " ".repeat(h.length));
  const numRe = /(-?\d*\.?\d+)(px|rem|em|%)?/g;
  while ((m = numRe.exec(withoutHex))) {
    if (m[0].trim() === "") continue;
    out.push(`${m[1]}${m[2] || ""}`);
  }
  return out;
}

/* The gate: every ADDED line in the diff whose literal equals a value the
   design system already generates a token for. Returns one row per match —
   `file`, `line`, `literal`, `tokens` (the var names carrying that value). */
export function findDiffLiterals(diffText, tokenValues) {
  const defects = [];
  for (const { file, line, text } of parseAddedLines(diffText)) {
    if (!/\.css$/.test(file) && !file.includes("src/styles/")) continue;
    for (const literal of literalsInLine(text)) {
      if (tokenValues.has(literal)) {
        defects.push({ file, line, literal, tokens: tokenValues.get(literal) });
      }
    }
  }
  return defects;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.tokens || !existsSync(args.tokens)) {
    console.error("Usage: node token-literal-diff.mjs --tokens <tokens.generated.css> [--diff-cmd \"...\"] [--repo <path>]");
    process.exit(1);
  }
  const tokenValues = parseGeneratedTokens(readFileSync(args.tokens, "utf8"));
  const diffCmd = args.diffCmd || `git diff -- 'src/styles' '*.css'`;
  let diffText;
  try {
    diffText = execSync(diffCmd, { encoding: "utf8", cwd: args.repo || process.cwd(), maxBuffer: 1024 * 1024 * 32 });
  } catch (err) {
    console.error(`token-literal-diff: did not run the diff command — ${err.message}`);
    process.exit(1);
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
