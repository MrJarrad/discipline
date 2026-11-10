// DISC-291: helper-session lifecycle, the two operator rules (s78): a helper whose work landed ends archived;
// a helper holding open work when its parent wraps is adopted by the next parent. The mechanism is in helper-sweep.mjs,
// helper-sweep-stop.mjs and archive-guard.mjs (their own tests); this pins the prose that tells the parent how to use it.
// Run: node --test hooks/scripts/disc291-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const flat = (p) => readFileSync(join(root, p), "utf8").replace(/\s+/g, " ");
const HR = "skills/routing/references/HARD-RULES.md";

test("DISC-291 rule 1: landed helpers end archived; open PR and operator-ask helpers are Re-point rows, not Archive rows", () => {
  const h = flat(HR);
  for (const s of [
    "**Rule 1: a helper whose work has landed ends archived, with no sidebar step for the operator**",
    "once it is landed (`--merged`, `--landed`) or has been quiet past 12 hours",
    "never archives one with an open PR (`--keep`",
    "waiting on an operator answer recorded in the queue (`--waiting <ids>`); under a wrapped parent those are Re-point rows, not Archive rows",
    "until every Archive row has an `archive_session` call after the sweep",
  ]) assert.ok(h.includes(s), s);
});

test("DISC-291 rule 2: adopt = re-point, track by id on the Helpers: line, archive later; start reads the last five lines", () => {
  const h = flat(HR);
  for (const s of [
    "**Rule 2: a helper still holding open work when its parent wraps is adopted by the next parent**",
    "Adopt = re-point",
    "a count, \"orphans\" or \"the operator's sidebar\" is never a substitute for ids",
    "helper-sweep.mjs --cockpit <cockpit.md>",
  ]) assert.ok(h.includes(s), s);
  assert.ok(flat("skills/wrap/references/CLOSING-CHECKS.md").includes("The sweep's `Helpers:` line (ids of every helper still open) goes on the cockpit wrap block with this session's own id"));
  assert.ok(flat("skills/cloud-dispatch/references/HELPER-SESSIONS.md").includes("the next parent adopts it (HARD-RULES 19, rules 1 and 2, DISC-291)"));
});

test("DISC-291: the mechanisms exist where the prose points", () => {
  const sweep = readFileSync(join(root, "hooks/scripts/helper-sweep.mjs"), "utf8");
  assert.match(sweep, /--waiting/); assert.match(sweep, /--cockpit/);
  assert.match(readFileSync(join(root, "hooks/bin/helper-sweep-stop.mjs"), "utf8"), /phase: "archive"/);
});
