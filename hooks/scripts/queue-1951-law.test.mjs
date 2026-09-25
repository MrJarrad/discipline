// The 1.95.1 queue: `2026-09-25-fix-asks-problem-solution.md` — operator: "something
// else i would find helpful when we're fixing things, is a really short simple
// explanation as to what was causing the problem and what fixed it (problem and
// solution). This could be included with the ready for review text in needed from me."
//
// Rule: when a **fix** is ready for the operator's look, its message carries a
// one-line **Problem:** (what caused it, plain words) and a one-line **Solution:**
// (what fixed it), before the link; a new feature needs no Problem line.
//
// Run: node --test hooks/scripts/queue-1951-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(repo, p), "utf8");
const flat = (text) => text.replace(/\s+/g, " ");

// --- output-styles/discipline.md: the rule itself ---------------------------

test("discipline.md: a fix ready for review carries Problem/Solution before the link", () => {
  const doc = flat(read("output-styles/discipline.md"));
  assert.match(doc, /A \*\*fix\*\* ready for his look carries one-line \*\*Problem:\*\*/);
  assert.match(doc, /\*\*Solution:\*\* \(what fixed it\) before the link/);
  assert.match(doc, /a new feature needs no Problem line/);
});

test("discipline.md: the Problem/Solution rule quotes the operator's own words", () => {
  const doc = flat(read("output-styles/discipline.md"));
  assert.match(doc, /a really short simple explanation as to what was causing the problem and what fixed it/);
});

test("discipline.md still fits its 130-line phone-read budget", () => {
  const lines = read("output-styles/discipline.md").trimEnd().split("\n").length;
  assert.ok(lines <= 130, `style is ${lines} lines; budget is 130`);
});

// --- present-for-review: the operator message example -----------------------

test("present-for-review: states the fix-carries-Problem/Solution, feature-doesn't rule", () => {
  const doc = flat(read("skills/present-for-review/SKILL.md"));
  assert.match(doc, /A fix carries Problem\/Solution; a feature doesn't/);
  assert.match(doc, /leads with one-line \*\*Problem:\*\*.*and \*\*Solution:\*\*.*before the link/);
});

test("present-for-review: a fix example shows both Problem: and Solution: lines", () => {
  const doc = flat(read("skills/present-for-review/SKILL.md"));
  assert.match(doc, /Example \(fix, native\): \*Problem: .*Solution: .*Ready to look/);
  assert.match(doc, /Example \(fix, web\): \*Problem: .*Solution: .*Ready to look.*jarrad\.design/);
});

test("present-for-review: a feature example carries no Problem: line", () => {
  const doc = read("skills/present-for-review/SKILL.md");
  const line = doc.split("\n").find((l) => l.startsWith("Example (feature"));
  assert.ok(line, "a feature example must exist");
  assert.doesNotMatch(line, /Problem:/);
});

// --- CHANGED.txt + version bump ---------------------------------------------

test("the 1.95.1 CHANGED entry names the ruling and the Problem/Solution rule", () => {
  const changed = read("CHANGED.txt");
  const entryMatch = /^1\.95\.1 —[\s\S]*?(?=\n\n\d+\.\d+\.\d+ —|$)/m.exec(changed);
  assert.ok(entryMatch, "1.95.1's own CHANGED entry must exist");
  const entry = entryMatch[0];
  assert.match(entry, /fix-asks-problem-solution|Problem\/Solution|Problem:.*Solution:/);
});

test("plugin.json and marketplace.json agree at 1.95.1", () => {
  const plugin = JSON.parse(read(".claude-plugin/plugin.json"));
  const marketplace = JSON.parse(read(".claude-plugin/marketplace.json"));
  assert.equal(plugin.version, "1.95.1");
  assert.equal(marketplace.plugins[0].version, "1.95.1");
});
