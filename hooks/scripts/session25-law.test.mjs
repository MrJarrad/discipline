// 1.139.0: finish before opening (ruling 2026-10-15-finish-before-opening), routing rule 17.
// Run: node --test hooks/scripts/session25-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const flat = (p) => readFileSync(join(root, p), "utf8").replace(/\s+/g, " ");

test("HARD-RULES 17: the three rules with the operator's words", () => {
  const t = flat("skills/routing/references/HARD-RULES.md");
  assert.match(t, /17\. \*\*Finish before opening\*\*/);
  assert.match(t, /sort of end up half doing a job and not finishing and switching focus/);
  assert.match(t, /at most 3 look-lanes .*open per session.*backlog row.*unless he says "now"/);
  assert.match(t, /after his yes a try-out goes review, gate, merge, or is explicitly parked or dropped, before its slot takes a new look topic/);
  assert.match(t, /queues for that lane's next round unless tiny.*print under `## Build in Progress`/);
});
test("routing: rule 17 and the baton row point at it", () => {
  const t = flat("skills/routing/SKILL.md");
  assert.match(t, /17\. \*\*Finish before opening:\*\* max 3 look-lanes open per session.*backlog row unless he says "now"/);
  assert.match(t, /Operator says yes to a try-out.*rule 17/);
});
test("output style: Build in Progress lists queued asks, pointing at rule 17", () => {
  assert.match(flat("output-styles/discipline.md"), /asks queued for that lane's next round listed under it \(`routing` rule 17\)/);
});
test("wrap SECTIONS: Next block carries look: yes", () => {
  assert.match(flat("skills/wrap/references/SECTIONS.md"), /Add `look: yes` to a try-out.*`routing` rule 17/);
});
