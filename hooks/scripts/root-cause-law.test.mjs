// 2026-11-28: fix the root cause, never patch the symptom (ruling 2026-11-28-root-cause-not-patch), with its tie-break.
// Run: node --test hooks/scripts/root-cause-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const flat = (p) => readFileSync(join(root, p), "utf8").replace(/\s+/g, " ");

test("doer-rules: a symptom patch is not a fix, a bigger fix goes up as a recommendation, a temporary patch is labelled", () => {
  const d = flat("doer-rules.md");
  const rule = d.slice(d.indexOf("**Fix the cause, never patch the symptom.**"));
  assert.ok(d.includes("**Fix the cause, never patch the symptom.**"));
  for (const s of [
    "A special case, override, retry or hard-coded value that hides the failure is no fix",
    "rebuild until it works",
    "A real fix larger than the ask goes up as one recommendation, the patch named as the alternative",
    "a knowingly temporary patch is labelled, with the row that replaces it",
  ]) assert.ok(rule.includes(s), s);
});

test("doer-rules tie-break: a fix that conflicts with a ruling raises one decision card, neither patched silently nor stalled", () => {
  const d = flat("doer-rules.md");
  const rule = d.slice(d.indexOf("**Fix the cause, never patch the symptom.**"));
  for (const s of [
    "conflicts with an existing ruling or decision is neither patched silently nor stalled",
    "raise one decision card naming the conflict, the proper fix, the patch and your recommendation",
    "patch now, log a rebuild row with a trigger date",
  ]) assert.ok(rule.includes(s), s);
});

test("doer-rules: the reviewer marks a symptom patch a finding, and the reviewer and ux-designer read doer-rules whole", () => {
  assert.ok(flat("doer-rules.md").includes("A reviewer marks a symptom patch a finding."));
  for (const a of ["agents/reviewer.md", "agents/ux-designer.md", "agents/engineer.md"])
    assert.ok(flat(a).includes("`doer-rules.md`"), a);
});
