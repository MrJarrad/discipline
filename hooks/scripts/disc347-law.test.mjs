// DISC-347 law: Figma variable adds and renames go through the handoff toolkit's resolve step; the gates are wired and the rule has one home.
// Run: node --test hooks/scripts/disc347-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const flat = (p) => readFileSync(join(root, p), "utf8").replace(/\s+/g, " ");

test("the rule names the resolve step, the verdicts that settle, and the two gates", () => {
  const t = flat("skills/dispatch-brief/references/FIGMA-VARIABLES.md");
  for (const s of ["never a technical call", "HT-111, HT-112, HT-113", "handoff-css resolve", "REUSE or RULED", "## Resolve result", "agent-dispatch-gate", "figma-variable-gate", "pressed-tertiary"]) assert.ok(t.includes(s), s);
  assert.ok(flat("skills/routing/references/HARD-RULES.md").includes("dispatch-brief/references/FIGMA-VARIABLES.md"));
});
test("the use_figma gate is wired in hooks.json", () => {
  const h = JSON.parse(readFileSync(join(root, "hooks/hooks.json"), "utf8"));
  const cmds = h.hooks.PreToolUse.filter((e) => e.matcher === "mcp__.*__use_figma").flatMap((e) => e.hooks.map((x) => x.command));
  assert.ok(cmds.some((c) => c.includes("figma-variable-gate.mjs")));
});
