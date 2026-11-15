// DISC-336: label unlabelled open backlog rows from a class map so the ranker can use them. Run: node --test hooks/scripts/backlog-label.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { labelBacklog } from "./backlog-label.mjs";

const TXT = `---\nprefix: PF\n---\n## Open\n\n| # | Item | Raised | Status | Notes |\n| - | --- | --- | --- | --- |\n| PF-1 | plain row | d | open | see [[a|b]] |\n| PF-2 | already labelled. Agent. | d | open | |\n| PF-3 | gated row | d | open | |\n| PF-4 | untouched | d | open | |\n\n## Done archive\n\n| # | Item | Raised | Status | Notes |\n| - | --- | --- | --- | --- |\n| PF-5 | done | d | done (#1 a) | |\n`;

test("an unlabelled open row gets its trailing owner label; the other cells, including wikilink pipes, are untouched", () => {
  const r = labelBacklog(TXT, { "PF-1": "Mac" });
  assert.deepEqual(r.labelled, ["PF-1"]);
  assert.match(r.text, /\| PF-1 \| plain row\. Mac\. \| d \| open \| see \[\[a\|b\]\] \|/);
});
test("a blocker is written into the Item cell where the ranker reads it", () => {
  const r = labelBacklog(TXT, { "PF-3": { label: "Agent", blockedBy: ["PF-65", "PF-1054"] } });
  assert.match(r.text, /\| PF-3 \| gated row\. Blocked by PF-65, PF-1054\. Agent\. \|/);
});
test("a row that already has a label, a Done row and an id not in the map are left alone", () => {
  const r = labelBacklog(TXT, { "PF-2": "Mac", "PF-5": "Agent" });
  assert.deepEqual(r.labelled, []);
  assert.equal(r.text, TXT);
  assert.deepEqual(r.skipped.map((s) => s.id).sort(), ["PF-2", "PF-5"]);
});
test("an unknown label is refused", () => {
  assert.throws(() => labelBacklog(TXT, { "PF-1": "Robot" }), /Agent, Mac or Operator/);
});
test("--force replaces a label the row already carries (a gated row labelled Agent. gets its blocker)", () => {
  const r = labelBacklog(TXT, { "PF-2": { label: "Agent", blockedBy: ["PF-9"] } }, { force: true });
  assert.match(r.text, /\| PF-2 \| already labelled\. Blocked by PF-9\. Agent\. \|/);
});
