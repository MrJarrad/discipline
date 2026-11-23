// DISC-347: a Figma variable add or rename is never a technical call; it needs a settled handoff-css resolve report first.
// Proven through figma-variable-gate.mjs (the use_figma PreToolUse gate). Edge cases live in hooks/bin/figma-variable-gate.test.mjs.
// Run: node --test hooks/scripts/disc347-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const gate = join(root, "hooks/bin/figma-variable-gate.mjs");
const NAME = "color/background/action/quaternary";
const ADD = `const c = figma.variables.getLocalVariableCollections()[0]; figma.variables.createVariable("${NAME}", c, "COLOR");`;
const report = (verdict) => {
  const p = join(mkdtempSync(join(tmpdir(), "disc347-")), "report.json");
  const settled = ["REUSE", "RULED"].includes(verdict);
  writeFileSync(p, JSON.stringify({ needs: [{ id: "n1", name: NAME, verdict }], open: settled ? 0 : 1, counts: { [verdict]: 1 } }));
  return p;
};
const decide = (description) => {
  const r = spawnSync(process.execPath, [gate], { input: JSON.stringify({ tool_name: "mcp__figma__use_figma", tool_input: { fileKey: "a".repeat(22), code: ADD, description } }), encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim() ? JSON.parse(r.stdout).hookSpecificOutput.permissionDecision : "allow";
};

test("the gate is wired on use_figma and the rule's home names both gates", () => {
  const h = JSON.parse(readFileSync(join(root, "hooks/hooks.json"), "utf8"));
  const cmds = h.hooks.PreToolUse.filter((e) => e.matcher === "mcp__.*__use_figma").flatMap((e) => e.hooks.map((x) => x.command));
  assert.ok(cmds.some((c) => c.includes("figma-variable-gate.mjs")));
  const home = readFileSync(join(root, "skills/dispatch-brief/references/FIGMA-VARIABLES.md"), "utf8");
  assert.ok(home.includes("agent-dispatch-gate") && home.includes("figma-variable-gate"));
  assert.ok(readFileSync(join(root, "skills/routing/references/HARD-RULES.md"), "utf8").includes("dispatch-brief/references/FIGMA-VARIABLES.md"));
});

test("a variable add with no resolve report is refused", () => {
  assert.equal(decide("add the alias"), "deny");
});

test("a report whose need is still open is refused; a settled one (RULED or REUSE) lets the add through", () => {
  assert.equal(decide(`Resolve: ${report("NEW_NAME")}`), "deny");
  assert.equal(decide(`Resolve: ${report("RULED")}`), "allow");
  assert.equal(decide(`Resolve: ${report("REUSE")}`), "allow");
});
