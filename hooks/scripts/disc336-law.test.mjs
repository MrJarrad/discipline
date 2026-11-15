// DISC-336 law: autonomous backlog throughput has a mechanism — ranked list, doer target, a nudge on landing, a Stop check on wakes.
// Run: node --test hooks/scripts/disc336-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const flat = (p) => readFileSync(join(root, p), "utf8").replace(/\s+/g, " ");
const HARD = "skills/routing/references/HARD-RULES.md";

test("HARD-RULES states the rule at the lane-capacity paragraph: eight doers, next-row.mjs, the nudge and the Stop check", () => {
  const t = flat(HARD);
  for (const s of ["A parent keeps eight doers working, from a ranked list", "next-row.mjs --vault", "`lane-landed-nudge.mjs` prints the reminder", "`next-row-stop.mjs` holds a turn that a wake started", "That second stop is not checked, so starting the rows is the parent's act", "`row-add.mjs` refuses an open backlog row with no trailing", "an unlabelled row is never dispatched", "DON'T: wait for the operator to pick the next item, or end a wake turn without the run"])
    assert.ok(t.includes(s), s);
});
test("both hooks are wired", () => {
  const hooks = JSON.parse(readFileSync(join(root, "hooks/hooks.json"), "utf8")).hooks;
  const cmds = (ev) => hooks[ev].flatMap((g) => g.hooks.map((h) => h.command));
  assert.ok(cmds("Stop").some((c) => c.includes("next-row-stop.mjs")));
  assert.ok(hooks.PostToolUse.some((g) => /get_session/.test(g.matcher) && g.hooks.some((h) => h.command.includes("lane-landed-nudge.mjs"))));
});
test("the doer target is 8 and portfolio's cap does not bind below it", async () => {
  const { DEFAULT_TARGET } = await import("./lib/backlog-rank.mjs");
  const { CAPACITY } = await import("./lane-capacity.mjs");
  assert.equal(DEFAULT_TARGET, 8);
  assert.ok(CAPACITY.PF >= DEFAULT_TARGET);
});
