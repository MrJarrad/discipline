// DISC-302 (operator s81: "can you make sure status in the needed from you doc get updated with responses") and
// DISC-305 (operator s81: "I think status is correct"; "a way to group different projects within the doc may be worthwhile").
// Mechanisms: queue-page-sync.mjs (chipChanges; heading placement moved to status-layout.mjs, DISC-312) and needed-from-you-stop.mjs; this pins the prose.
// Run: node --test hooks/scripts/disc302-305-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const flat = (p) => readFileSync(join(root, p), "utf8").replace(/\s+/g, " ");

test("DISC-302 / DISC-334: the rule names the same-turn move to Done and the Stop check", () => {
  const h = flat("skills/routing/references/HARD-RULES.md");
  for (const s of ["**Answers move the item (DISC-302", "the turn the operator answers an item, it moves to Done this session (`status-layout.mjs --set ROW=done --line ROW=\"…\"`)",
    "`needed-from-you-stop.mjs` refuses a reply when a row answered this turn (`lane-end.mjs --id`) is not named in a Status doc write of that turn"]) assert.ok(h.includes(s), s);
  assert.ok(!h.includes("prints each as `chipChanges`"), "the chip-change mechanism is retired");
});
test("DISC-305: the doc is called Status, one doc for all projects, a ### heading per project; the reply heading is unchanged", () => {
  const h = flat("skills/routing/references/HARD-RULES.md");
  for (const s of ["The Status doc is called \"Status\" (operator s81: *\"I think status is correct\"*)",
    "one doc for all projects, with a `###` heading per project inside each section",
    "`status-layout.mjs` owns those headings and where an item sits", "the reply heading stays `## Needed from you`"]) assert.ok(h.includes(s), s);
  assert.ok(flat("skills/wrap/references/SECTIONS.md").includes("placed by `status-layout.mjs`"));
  assert.ok(!/toAddUnder|misfiled/.test(flat("skills/routing/references/HARD-RULES.md") + flat("skills/wrap/references/SECTIONS.md")), "DISC-312: the retired heading fields are not named as live");
  const style = flat("skills/routing/references/OPERATOR-REPLIES.md");
  assert.ok(style.includes("Full list: [Status](<url>)"));
  assert.ok(!style.includes("Full list: [Needed from you]"));
});

test("s81: an automated wake with no new ask gets no chat text; the result goes to the Status doc", () => {
  const style = flat("skills/routing/references/OPERATOR-REPLIES.md");
  for (const x of ["gets no chat text at all", "`2026-11-12-s81-parent-lessons`", "`needed-from-you-stop.mjs` holds a reply to a wake that raised no new ask"]) assert.ok(style.includes(x), x);
  assert.ok(!style.includes("at most one line, no queue reprint"));
});

test("s81 (review AMBER 5): one wording for the wake rule across the output style, HARD-RULES, wrap and the wrap closing checks", () => {
  for (const f of ["skills/routing/references/OPERATOR-REPLIES.md", "skills/routing/references/HARD-RULES.md", "skills/wrap/references/CLOSING-CHECKS.md"])
    assert.ok(/no chat text at all/.test(flat(f)), f);
  assert.ok(flat("skills/wrap/SKILL.md").includes("automated events get no chat text"));
  assert.ok(!/ends silently|end silently|one line at most/i.test([flat("skills/routing/references/HARD-RULES.md"), flat("skills/wrap/SKILL.md")].join(" ")));
  assert.ok(!/At most one line: "Wrapped/.test(flat("skills/wrap/references/CLOSING-CHECKS.md")));
});
test("s81 (review NOTE): the Stop fallback link text reads [Status] and no message says Status doc doc", () => {
  const hook = readFileSync(join(root, "hooks/bin/needed-from-you-stop.mjs"), "utf8");
  assert.ok(!/Status doc doc/.test(hook));
  assert.ok(!/exact line `Full list: \[Needed from you\]/.test(hook.replace(/\\`/g, "`")));
});

// DISC-307: one item format, one home (HARD-RULES), emitted by queue-page-sync.
test("DISC-307: the Status item format is defined once in HARD-RULES and pointed at from the output style", () => {
  const h = flat("skills/routing/references/HARD-RULES.md");
  for (const s of ["**One Status item format** (DISC-307", "ideally though we would consistently format things like i've done for pf-15131",
    "Every item on the Status doc is bold \"(ID) Title.\" plus one bold state line", "**Problem:**, **Solution:**, **Decision:**", "**Recommended:** and **Alternative:** are each their own nested bullet",
    "**Look:** (a link and what to do, ending \"Say yes, or what's off.\")", "A short item is bold \"(ID) Title.\" and one plain line",
    "`queue-page-sync.mjs` emits this shape for every `toAdd` item"]) assert.ok(h.includes(s), s);
  assert.ok(flat("skills/routing/references/OPERATOR-REPLIES.md").includes("(DISC-307, `routing` HARD-RULES)"));
});
