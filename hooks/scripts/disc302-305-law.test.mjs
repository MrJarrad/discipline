// DISC-302 (operator s81: "can you make sure status in the needed from you doc get updated with responses") and
// DISC-305 (operator s81: "I think status is correct"; "a way to group different projects within the doc may be worthwhile").
// Mechanisms: queue-page-sync.mjs (chipChanges, projects, toAddUnder, misfiled) and needed-from-you-stop.mjs; this pins the prose.
// Run: node --test hooks/scripts/disc302-305-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const flat = (p) => readFileSync(join(root, p), "utf8").replace(/\s+/g, " ");

test("DISC-302: the rule names the same-turn chip change, the plan field and the Stop check", () => {
  const h = flat("skills/routing/references/HARD-RULES.md");
  for (const s of ["the turn the operator answers an item, its Status chip changes to Done",
    "`queue-page-sync.mjs` prints each as `chipChanges`", "replace of the dropdown carrying a new dropdown chip",
    "`needed-from-you-stop.mjs` refuses a reply when a row answered this turn (`lane-end.mjs --id`) has no chip change in the Status doc write"]) assert.ok(h.includes(s), s);
});
test("DISC-305: the doc is called Status, one doc for all projects, a ### heading per project; the reply heading is unchanged", () => {
  const h = flat("skills/routing/references/HARD-RULES.md");
  for (const s of ["The Status doc is called \"Status\" (operator s81: *\"I think status is correct\"*)",
    "one doc for all projects, with a `### <PFX> — <project>` heading per project inside \"Waiting on you\" and \"Running now\"",
    "`toAddUnder`, `misfiled`", "the reply heading stays `## Needed from you`"]) assert.ok(h.includes(s), s);
  assert.ok(flat("skills/wrap/references/SECTIONS.md").includes("under its project's `### <PFX> — <project>` heading"));
  const style = flat("output-styles/discipline.md");
  assert.ok(style.includes("Full list: [Status](<url>)"));
  assert.ok(!style.includes("Full list: [Needed from you]"));
});
