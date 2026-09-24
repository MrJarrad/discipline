// token-literal-diff — diff-scoped literal check (row 130, item 5, 2026-09-24).
// Run: node --test hooks/scripts/token-literal-diff.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseGeneratedTokens, parseAddedLines, literalsInLine, findDiffLiterals } from "./token-literal-diff.mjs";

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

test("literalsInLine ignores literals already inside var()", () => {
  assert.deepEqual(literalsInLine("  gap: var(--space-4);"), []);
});

test("literalsInLine finds a bare px/hex literal", () => {
  assert.deepEqual(literalsInLine("  gap: 8px; color: #FF00AA;"), ["#ff00aa", "8px"]);
});

test("findDiffLiterals flags an added literal matching a generated token, scoped to css files under src/styles", () => {
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
  // the unchanged "gap: 8px" line (context, not +) never appears in parseAddedLines
  const defects = findDiffLiterals(diff, tokenValues);
  assert.deepEqual(defects, []);
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
