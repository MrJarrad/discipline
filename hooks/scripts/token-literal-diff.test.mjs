// token-literal-diff — diff-scoped literal check (row 130, item 5, 2026-09-24;
// precision fixes round 2, 2026-09-24).
// Run: node --test hooks/scripts/token-literal-diff.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseGeneratedTokens,
  parseAddedLines,
  declarationValuesInLine,
  literalsInLine,
  findDiffLiterals,
  defaultDiffText,
} from "./token-literal-diff.mjs";

const scriptPath = fileURLToPath(new URL("./token-literal-diff.mjs", import.meta.url));

test("parseGeneratedTokens indexes hex, px and rem values by var name", () => {
  const css = `:root {\n  --color-brand: #FF00AA;\n  --space-4: 8px;\n  --radius-lg: 1.5rem;\n  --font-family: "Inter", sans-serif;\n}\n`;
  const map = parseGeneratedTokens(css);
  assert.deepEqual(map.get("#ff00aa"), ["--color-brand"]);
  assert.deepEqual(map.get("8px"), ["--space-4"]);
  assert.deepEqual(map.get("1.5rem"), ["--radius-lg"]);
  assert.equal(map.has('"inter", sans-serif'), false, "free-text values are never indexed");
});

test("parseGeneratedTokens collects every var name sharing one value", () => {
  const css = `:root {\n  --space-4: 8px;\n  --gap-sm: 8px;\n}\n`;
  const map = parseGeneratedTokens(css);
  assert.deepEqual(map.get("8px"), ["--space-4", "--gap-sm"]);
});

test("parseAddedLines reads only + lines with their new-file line numbers", () => {
  const diff = [
    "diff --git a/src/styles/card.css b/src/styles/card.css",
    "index 111..222 100644",
    "--- a/src/styles/card.css",
    "+++ b/src/styles/card.css",
    "@@ -10,3 +10,4 @@",
    " .card {",
    "-  gap: 4px;",
    "+  gap: 8px;",
    "+  color: #ff00aa;",
    " }",
  ].join("\n");
  const added = parseAddedLines(diff);
  assert.deepEqual(added, [
    { file: "src/styles/card.css", line: 11, text: "  gap: 8px;" },
    { file: "src/styles/card.css", line: 12, text: "  color: #ff00aa;" },
  ]);
});

// --- declaration-value scoping (selectors/class names never match) --------

test("declarationValuesInLine extracts only the text between : and ;", () => {
  assert.deepEqual(declarationValuesInLine("  gap: 8px;"), ["8px"]);
});

test("declarationValuesInLine returns nothing for a selector, even a number-shaped class name", () => {
  assert.deepEqual(declarationValuesInLine(".gap-8 {"), []);
  assert.deepEqual(declarationValuesInLine("#brand-header-8px {"), []);
});

test("declarationValuesInLine yields nothing for a bare property with no value at all", () => {
  assert.deepEqual(declarationValuesInLine("  gap:"), []);
});

test("declarationValuesInLine extracts multiple declarations on one line", () => {
  assert.deepEqual(declarationValuesInLine("gap: 8px; color: #ff00aa;"), ["8px", "#ff00aa"]);
});

// --- round 3 (2026-09-24): the terminator is ';', '}', or end-of-line ------

test("declarationValuesInLine: no terminator on the line — a diff line still under construction (--x: 12px)", () => {
  assert.deepEqual(declarationValuesInLine("--x: 12px"), ["12px"]);
});

test("declarationValuesInLine: inline rule closing with } and no trailing ; (.a{padding:12px})", () => {
  assert.deepEqual(declarationValuesInLine(".a{padding:12px}"), ["12px"]);
});

test("declarationValuesInLine: a plain declaration, leading whitespace, no terminator (  padding: 12px)", () => {
  assert.deepEqual(declarationValuesInLine("  padding: 12px"), ["12px"]);
});

test("declarationValuesInLine: two declarations in one inline rule, ; then } (a{padding:12px;margin:12px})", () => {
  assert.deepEqual(declarationValuesInLine("a{padding:12px;margin:12px}"), ["12px", "12px"]);
});

test("declarationValuesInLine: a normal terminated declaration (--x: 12px;)", () => {
  assert.deepEqual(declarationValuesInLine("--x: 12px;"), ["12px"]);
});

test("declarationValuesInLine: selectors still yield nothing under the new terminator set", () => {
  assert.deepEqual(declarationValuesInLine(".gap-8 {"), []);
  assert.deepEqual(declarationValuesInLine("#brand-header-8px {"), []);
});

// --- literalsInLine: word boundaries, unit handling, unitless 0/1 exclusion

test("literalsInLine ignores literals already inside var()", () => {
  assert.deepEqual(literalsInLine(" var(--space-4)"), []);
});

test("literalsInLine finds a unit'd px/hex literal", () => {
  assert.deepEqual(literalsInLine(" 8px #FF00AA"), ["#ff00aa", "8px"]);
});

test("literalsInLine word-boundaries numbers — 18px is never misread as 8px", () => {
  assert.deepEqual(literalsInLine(" 18px"), ["18px"]);
});

test("literalsInLine skips bare (unitless) 0 and 1 — flex/opacity/z-index/line-height false positives", () => {
  assert.deepEqual(literalsInLine(" 1"), []);
  assert.deepEqual(literalsInLine(" 0"), []);
});

test("literalsInLine keeps other bare unitless numbers (12, 0.1-0.9) as candidates", () => {
  assert.deepEqual(literalsInLine(" 12"), ["12"]);
  assert.deepEqual(literalsInLine(" 0.1"), ["0.1"]);
  assert.deepEqual(literalsInLine(" 0.9"), ["0.9"]);
});

test("literalsInLine keeps px/rem/% literals even when the bare digits would be 0 or 1", () => {
  assert.deepEqual(literalsInLine(" 0px"), ["0px"]);
  assert.deepEqual(literalsInLine(" 1rem"), ["1rem"]);
  assert.deepEqual(literalsInLine(" 100%"), ["100%"]);
});

// --- findDiffLiterals: end-to-end scoping ----------------------------------

test("findDiffLiterals flags an added declaration-value literal matching a generated token, scoped to css files under src/styles", () => {
  const diff = [
    "diff --git a/src/styles/card.css b/src/styles/card.css",
    "--- a/src/styles/card.css",
    "+++ b/src/styles/card.css",
    "@@ -1,1 +1,2 @@",
    " .card {",
    "+  gap: 8px;",
    " }",
  ].join("\n");
  const tokenValues = new Map([["8px", ["--space-4"]]]);
  const defects = findDiffLiterals(diff, tokenValues);
  assert.equal(defects.length, 1);
  assert.equal(defects[0].file, "src/styles/card.css");
  assert.equal(defects[0].line, 2);
  assert.equal(defects[0].literal, "8px");
  assert.deepEqual(defects[0].tokens, ["--space-4"]);
});

test("findDiffLiterals never matches inside a selector — a class name shaped like a token value", () => {
  const diff = [
    "diff --git a/src/styles/card.css b/src/styles/card.css",
    "--- a/src/styles/card.css",
    "+++ b/src/styles/card.css",
    "@@ -1,1 +1,2 @@",
    " .card {",
    "+.gap-8px {",
    " }",
  ].join("\n");
  const tokenValues = new Map([["8px", ["--space-4"]]]);
  assert.deepEqual(findDiffLiterals(diff, tokenValues), []);
});

test("findDiffLiterals ignores a matching literal outside src/styles or *.css (diff scope only)", () => {
  const diff = [
    "diff --git a/src/app/page.tsx b/src/app/page.tsx",
    "--- a/src/app/page.tsx",
    "+++ b/src/app/page.tsx",
    "@@ -1,1 +1,2 @@",
    " const x = 1;",
    "+const gap = 8;",
  ].join("\n");
  const tokenValues = new Map([["8", ["--count"]]]);
  assert.deepEqual(findDiffLiterals(diff, tokenValues), []);
});

test("findDiffLiterals leaves a pre-existing (unchanged) literal alone — diff-scoped, not whole-file", () => {
  const diff = [
    "diff --git a/src/styles/card.css b/src/styles/card.css",
    "--- a/src/styles/card.css",
    "+++ b/src/styles/card.css",
    "@@ -1,2 +1,2 @@",
    " .card { gap: 8px; }",
    "-.old { margin: 4px; }",
    "+.new { margin: 4px; }",
  ].join("\n");
  const tokenValues = new Map([["8px", ["--space-4"]]]);
  const defects = findDiffLiterals(diff, tokenValues);
  assert.deepEqual(defects, []);
});

test("findDiffLiterals skips a bare 1 even when a token happens to carry the unitless value 1 (opacity/flex false-positive guard)", () => {
  const diff = [
    "diff --git a/src/styles/card.css b/src/styles/card.css",
    "--- a/src/styles/card.css",
    "+++ b/src/styles/card.css",
    "@@ -1,1 +1,2 @@",
    " .card {",
    "+  flex: 1;",
    " }",
  ].join("\n");
  const tokenValues = new Map([["1", ["--some-unitless-token"]]]);
  assert.deepEqual(findDiffLiterals(diff, tokenValues), []);
});

test("findDiffLiterals flags a bare unitless literal (not 0/1) matching an unitless token", () => {
  const diff = [
    "diff --git a/src/styles/card.css b/src/styles/card.css",
    "--- a/src/styles/card.css",
    "+++ b/src/styles/card.css",
    "@@ -1,1 +1,2 @@",
    " .card {",
    "+  line-height: 1.5;",
    " }",
  ].join("\n");
  const tokenValues = new Map([["1.5", ["--line-height-body"]]]);
  const defects = findDiffLiterals(diff, tokenValues);
  assert.equal(defects.length, 1);
  assert.equal(defects[0].literal, "1.5");
});

// --- full CLI run against a scratch git repo --------------------------------

function makeScratchRepo() {
  const dir = mkdtempSync(join(tmpdir(), "token-literal-diff-repo-"));
  execFileSync("git", ["init", "-q", "-b", "main", dir]);
  execFileSync("git", ["-C", dir, "config", "user.email", "test@example.com"]);
  execFileSync("git", ["-C", dir, "config", "user.name", "test"]);
  mkdirSync(join(dir, "src", "styles"), { recursive: true });
  writeFileSync(join(dir, "src", "styles", "card.css"), ".card {\n  gap: 4px;\n}\n");
  execFileSync("git", ["-C", dir, "add", "."]);
  execFileSync("git", ["-C", dir, "commit", "-q", "-m", "init"]);
  return dir;
}

test("CLI exits 1 and names file:line when the working-tree diff adds a literal matching a generated token", () => {
  const repo = makeScratchRepo();
  const tokensPath = join(repo, "tokens.generated.css");
  writeFileSync(tokensPath, ":root {\n  --space-4: 8px;\n}\n");
  writeFileSync(join(repo, "src", "styles", "card.css"), ".card {\n  gap: 8px;\n}\n");
  try {
    let threw = false;
    let output = "";
    try {
      execFileSync("node", [scriptPath, "--tokens", tokensPath, "--repo", repo], { encoding: "utf8" });
    } catch (err) {
      threw = true;
      output = err.stderr || err.stdout || "";
    }
    assert.equal(threw, true, "must exit non-zero on a matching literal");
    assert.match(output, /src\/styles\/card\.css:2/);
    assert.match(output, /--space-4/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("CLI exits 0 when the diff adds a literal that consumes the token via var()", () => {
  const repo = makeScratchRepo();
  const tokensPath = join(repo, "tokens.generated.css");
  writeFileSync(tokensPath, ":root {\n  --space-4: 8px;\n}\n");
  writeFileSync(join(repo, "src", "styles", "card.css"), ".card {\n  gap: var(--space-4);\n}\n");
  try {
    const out = execFileSync("node", [scriptPath, "--tokens", tokensPath, "--repo", repo], { encoding: "utf8" });
    assert.match(out, /0 new literals/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

// --- default diff: merge-base(HEAD, main)...HEAD PLUS the working tree -----

test("defaultDiffText includes a literal already committed on the branch (ahead of main) as well as the working tree", () => {
  const repo = makeScratchRepo();
  execFileSync("git", ["-C", repo, "checkout", "-q", "-b", "feature"]);
  // Committed on the branch, ahead of main:
  writeFileSync(join(repo, "src", "styles", "card.css"), ".card {\n  gap: 8px;\n}\n");
  execFileSync("git", ["-C", repo, "add", "."]);
  execFileSync("git", ["-C", repo, "commit", "-q", "-m", "committed change"]);
  // Still uncommitted in the working tree:
  writeFileSync(join(repo, "src", "styles", "card.css"), ".card {\n  gap: 8px;\n  margin: 12px;\n}\n");
  try {
    const diffText = defaultDiffText(repo, "main");
    assert.match(diffText, /\+\s*gap: 8px;/, "committed-on-branch change must appear");
    assert.match(diffText, /\+\s*margin: 12px;/, "uncommitted working-tree change must appear");
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("defaultDiffText falls back to the working-tree diff alone when no merge-base can be resolved", () => {
  const repo = makeScratchRepo();
  writeFileSync(join(repo, "src", "styles", "card.css"), ".card {\n  gap: 8px;\n}\n");
  try {
    const diffText = defaultDiffText(repo, "no-such-branch");
    assert.match(diffText, /\+\s*gap: 8px;/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
