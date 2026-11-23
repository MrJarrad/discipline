// 1.139.0: finish before opening (ruling 2026-10-15-finish-before-opening), routing rule 17.
// Run: node --test hooks/scripts/session25-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readLoaded } from "./skill-text.mjs"; // a SKILL.md path reads as the loaded skill: body + linked references

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const flat = (p) => readLoaded(root, p).replace(/\s+/g, " ");

test("HARD-RULES 17: the three rules with the operator's words", () => {
  const t = flat("skills/routing/references/HARD-RULES.md");
  assert.match(t, /17\. \*\*Finish before opening\*\*/);
  assert.match(t, /`2026-10-15-finish-before-opening`/);
  assert.match(t, /at most 3 look-lanes .*open per session.*backlog row.*unless he says "now"/);
  assert.match(t, /after his yes a try-out goes review, gate, merge, or is explicitly parked or dropped, before its slot takes a new look topic/);
  assert.match(t, /queues for that lane's next round unless tiny.*print under `## Build in Progress`/);
});
test("routing: rule 17 and the baton row point at it", () => {
  const t = flat("skills/routing/SKILL.md");
  assert.match(t, /17\. \*\*Finish before opening:\*\* max 3 look-lanes open per session.*backlog row unless he says "now"/);
  assert.match(t, /Operator says yes to a try-out.*rule 17/);
});
test("output style: the Plan panel task lists queued asks, pointing at rule 17", () => {
  assert.match(flat("skills/routing/references/OPERATOR-REPLIES.md"), /asks queued for that lane's next round in its description \(`routing` rule 17\)/);
});
test("wrap SECTIONS: Next block carries look: yes", () => {
  assert.match(flat("skills/wrap/references/SECTIONS.md"), /Add `look: yes` to a try-out.*`routing` rule 17/);
});
