// helper-create-gate — s61 lesson 1: eight helpers inherited ask-first mode and sat two hours on an unseen approval.
// Run: node --test hooks/bin/helper-create-gate.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const hook = fileURLToPath(new URL("./helper-create-gate.mjs", import.meta.url));
const run = (tool_input) => {
  const r = spawnSync(process.execPath, [hook], { input: JSON.stringify({ tool_name: "mcp__claude-code-remote__create_session", tool_input }), encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim() ? JSON.parse(r.stdout).hookSpecificOutput : null;
};

test("create_session without permission_mode is denied with the fix", () => {
  const out = run({ prompt: "This message is your task — run it now.", title: "Helper · x — no action needed" });
  assert.equal(out.permissionDecision, "deny");
  assert.match(out.permissionDecisionReason, /permission_mode: "auto"/);
});

test("create_session with an explicit permission_mode passes", () => {
  assert.equal(run({ prompt: "x", permission_mode: "auto" }), null);
});

const withMode = (prompt) => run({ prompt, permission_mode: "auto" });
test("s71 lesson 4: a brief carrying the bare HOUSE_RULES token is denied", () => {
  const out = withMode("## Constraints\nHOUSE_RULES\n");
  assert.equal(out.permissionDecision, "deny");
  assert.match(out.permissionDecisionReason, /HOUSE_RULES/);
});
test("s71 lesson 4: a component- or system-size brief without the block is denied; with it, allowed", () => {
  for (const size of ["component", "system"]) assert.equal(withMode(`Size: ${size}\n## Constraints\n- x\n`)?.permissionDecision, "deny");
  assert.equal(withMode("Size: component\n## House rules\n- **Design system** — x\n"), null);
});
test("s71 lesson 4: a line-size or reviewer brief needs no block", () => {
  assert.equal(withMode("Size: line\n## Constraints\n- x\n"), null);
  assert.equal(withMode("Reviewer brief. Size: line"), null);
});
