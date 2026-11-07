// DISC-262 law: the helper sweep and the parent-never-archived rule are hooks, not prose alone.
// Run: node --test hooks/scripts/disc262-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const hooks = JSON.parse(read("hooks/hooks.json")).hooks;
const commands = (event, matcherRe) => hooks[event].filter((g) => matcherRe.test(g.matcher || "")).flatMap((g) => g.hooks.map((h) => h.command));

test("archive_session is guarded by archive-guard", () => {
  assert.ok(commands("PreToolUse", /archive_session/).some((c) => c.includes("hooks/bin/archive-guard.mjs")));
});
test("the helper sweep is seeded at SessionStart and checked at Stop", () => {
  assert.ok(commands("SessionStart", /startup/).some((c) => c.includes("helper-sweep-stop.mjs") && c.includes("start")));
  assert.ok(hooks.Stop.flatMap((g) => g.hooks.map((h) => h.command)).some((c) => c.includes("helper-sweep-stop.mjs")));
});
test("HARD-RULES 19 names both hooks", () => {
  const t = read("skills/routing/references/HARD-RULES.md").replace(/\s+/g, " ");
  assert.ok(t.includes("hooks/bin/archive-guard.mjs") && t.includes("hooks/bin/helper-sweep-stop.mjs"));
});
