// The 1.110.0 lesson (ui-controls-never-clicked-2026-10-05): interactive UI is verified by
// operating every control type. One verbatim assertion at each file that owns the behaviour.
// Run: node --test hooks/scripts/ui-controls-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(repo, p), "utf8");

test("qa-acceptance owns the rule: a driven row per control type", () => {
  const q = read("skills/qa-acceptance/SKILL.md");
  assert.match(q, /Interactive UI is verified by operating it, not by looking at it/);
  assert.match(q, /one class-5 row per\s+control type it ships/);
  assert.match(q, /\*\*opens, picks, applies\*\*/);
});

test("dispatch-brief done-when names the driven rows for a UI lane", () => {
  assert.match(read("skills/dispatch-brief/SKILL.md"), /A UI lane's done-when names a driven row per control type\*\* \(\[ACCURACY\.md\]/);
  assert.match(read("skills/dispatch-brief/references/ACCURACY.md"), /one driven row per control type it ships\*\* — real mouse\s+and keyboard input/);
});

test("present-for-review: the driven-row check follows the yes", () => {
  assert.match(read("skills/present-for-review/SKILL.md"), /The driven-row check follows the yes/);
});

test("reviewer: look-only evidence on interactive UI is red", () => {
  assert.match(read("agents/reviewer.md"), /Interactive UI: a driven row per control type\.\*\* Look-only evidence is red/);
});

test("TECHNICAL-DESIGN points at the owner instead of restating", () => {
  assert.match(read("skills/design-craft/references/TECHNICAL-DESIGN.md"), /that\s+each control \*works\* is `qa-acceptance` § The eight row classes/);
});
