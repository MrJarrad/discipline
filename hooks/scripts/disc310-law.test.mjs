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
    "An item's section always matches its chip",
    "moving an item is delete plus insert with the new chip (the connector cannot set a chip in place)",
    "when the operator flips a chip the next run moves the item and banks an open queue row as answered (`answered`)",
    "Each section has a `###` heading per session project (Portfolio, Discipline, Handoff toolkit), \"Nothing.\" when a project is empty",
    "Up next is each project's first five from its backlog's `## Up next` ordered list (Portfolio: `projects/portfolio/portfolio-go-live.md`, with \"Launch: N of M done\" and a link)",
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
