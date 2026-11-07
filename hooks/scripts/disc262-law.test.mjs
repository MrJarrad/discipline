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

test("archive_session is guarded by archive-guard, whatever the MCP server's name", () => {
  const g = hooks.PreToolUse.find((x) => x.hooks.some((h) => h.command.includes("hooks/bin/archive-guard.mjs")));
  assert.ok(g, "registered");
  assert.ok(new RegExp(`^(${g.matcher})$`).test("mcp__claude-code-remote__archive_session"));
  assert.ok(new RegExp(`^(${g.matcher})$`).test("mcp__abc123__archive_session"));
});
test("the helper sweep is checked at Stop and never seeded at SessionStart (helpers would be told to archive)", () => {
  assert.ok(hooks.Stop.flatMap((g) => g.hooks.map((h) => h.command)).some((c) => c.includes("helper-sweep-stop.mjs")));
  assert.ok(!JSON.stringify(hooks.SessionStart).includes("helper-sweep-stop"));
});
test("HARD-RULES 19 names both hooks", () => {
  const t = read("skills/routing/references/HARD-RULES.md").replace(/\s+/g, " ");
  assert.ok(t.includes("hooks/bin/archive-guard.mjs") && t.includes("hooks/bin/helper-sweep-stop.mjs"));
});
