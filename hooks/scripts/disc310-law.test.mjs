// DISC-310 (operator s82: "perhaps the whole structure of the doc needs to have a structure rethink or be thought about properly. I agree with this,
// but the doc needs be consistent, easy to maintain and scan"; "yes" to the layout). Mechanism: status-layout.mjs (its own tests); this pins the prose.
// Run: node --test hooks/scripts/disc310-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const flat = (p) => readFileSync(join(root, p), "utf8").replace(/\s+/g, " ");

test("DISC-310: the layout, Up next, refill and go-live-on-merge rules live once in HARD-RULES", () => {
  const h = flat("skills/routing/references/HARD-RULES.md");
  for (const s of ["**The Status doc layout** (DISC-310",
    "but the doc needs be consistent, easy to maintain and scan",
    "would it be better to perhaps group by status and sub group by project?",
    "`## Ready for you`, `## You're on it`, `## Claude's on it` (running lanes live here; there is no Running now), `## Up next`, `## Done this session`, then `Backlogs`",
    "No top-level item carries a chip (DISC-334, operator s90, ruling `2026-11-14-s90-status-labels-only-on-project-checklist`",
    "an item's section is its status, and every status change moves the item in the same op set",
    "A section move is the connector's `move` (it keeps block ids, children and comment threads); delete plus insert (`replaceItem`, carrying the whole item with every child) only where an old top-level chip must be dropped from an item that moves anyway",
    "an item with an unanswered thread is moved whole (never re-written), keeps its old chip and is named in `staleChips`; only the per-project checklist nested under a You're on it item (PF-65's case studies) keeps a chip per project",
    "the plan names every comment thread an op would drop (`droppedComments`) and refuses (`refused`) any op over an unanswered one",
    "one row is one section: a row on the doc twice keeps the live lane's item (`removeDuplicate`), and a row with Mac work still queued (`holds`) is never Done",
    "a ticked item moves to Done and an open queue row it answers is banked (`answered`); a chip changed by hand moves nothing",
    "Each section has a `###` heading per session project (Portfolio, Discipline, Handoff toolkit), \"Nothing.\" when a project is empty",
    "Up next is each project's first five from its backlog's `## Up next` ordered list (one source for every project, DISC-328; Portfolio's go-live file feeds only the \"Launch: N of M done\" line and its link)",
    "A ticked item MOVES to \"Done this session\" (never ticked in place), which is cleared at wrap with no note line; the doc has no Go-live section",
    "`status-layout.mjs --vault <vault> --projects <PFX,...> --doc <file with the xml of the doc's body node>` prints the edit ops and the session applies them with the connector, never by hand",
    "**Refill from Up next:** the moment a lane lands or parks on the operator, start the top Up next item of that project, with no asking",
    "**Tick go-live on merge:** a merged row that is a go-live line is ticked in the go-live file the same turn: `go-live-tick.mjs --vault <vault> --rows <ids> --apply` writes the tick and prints the launch line, then `status-layout.mjs` prints the doc ops",
    "An id the vault does not hold is `unknown` (stale checkout: pull the vault first), never landed"]) assert.ok(h.includes(s), s);
});
test("DISC-310: the output style and wrap point at the rule instead of restating it", () => {
  assert.ok(flat("output-styles/discipline.md").includes("(DISC-310, `routing` HARD-RULES)"));
  const w = flat("skills/wrap/references/SECTIONS.md");
  assert.ok(w.includes("status-layout.mjs --vault <vault> --projects <prefixes> --doc <xml>") && w.includes("ticked items move to Done this session"));
});

test("DISC-310 round 2: the always-on style no longer lists the old sections; it points at the layout rule and status-layout.mjs", () => {
  const style = flat("output-styles/discipline.md");
  assert.ok(!style.includes("Sections: **Waiting on you**") && !style.includes("**Running now** (`- [ ]` per lane"));
  assert.ok(style.includes("§ The Status doc layout: **run `status-layout.mjs`**"));
  for (const f of ["skills/pause-resume/SKILL.md", "skills/wrap/references/SECTIONS.md", "output-styles/discipline.md"]) assert.ok(!/"Running now"/.test(flat(f)), f);
});
