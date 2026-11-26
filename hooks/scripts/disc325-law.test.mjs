// DISC-325 law: a landed lane's helper and reviewer are archived in the lane-end step, by the printed sequence, not at wrap.
// Run: node --test hooks/scripts/disc325-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const flat = (p) => readFileSync(join(root, p), "utf8").replace(/\s+/g, " ");

test("HARD-RULES 19 sends the parent to lane-end's printed sequence at lane close", () => {
  assert.ok(flat("skills/routing/references/HARD-RULES.md").includes("lane-end --helper"));
});
test("wrap's closing check names the lane-end archive as the first path and the sweep as the backstop", () => {
  assert.match(flat("skills/wrap/references/CLOSING-CHECKS.md"), /lane-end --helper.*backstop/);
});
