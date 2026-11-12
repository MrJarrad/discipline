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
test("s71 lesson 4 (review R1): a reviewer-persona brief quoting a lane's size needs no block", () => {
  assert.equal(withMode("Persona: reviewer (sonnet)\n## Contract\nSize: component\nthe lane under review\nreviewer: session_<id from your own get_session>\n"), null);
  assert.equal(withMode("- **Persona**: reviewer\nSize: system\nreviewer: session_<id from your own get_session>\n"), null);
  assert.equal(withMode("Persona: engineer (sonnet)\nSize: component\n")?.permissionDecision, "deny");
});

// s83 lesson 5: reviewers copied the parent's session id (the one in ~/.claude/helper-session) into their `reviewer:` line.
// A reviewer-persona helper brief names the reviewer's own id source: get_session.
test("s83 5: a reviewer-persona helper brief must name get_session for its own session id; with it, allowed", () => {
  const out = withMode("Persona: reviewer (sonnet)\nSize: line\nPost the verdict with a reviewer: line.\n");
  assert.equal(out.permissionDecision, "deny");
  assert.match(out.permissionDecisionReason, /get_session/);
  assert.equal(withMode("- **Persona**: reviewer\nSize: line\nreviewer: session_<the id your own get_session returns, never ~/.claude/helper-session>\n"), null);
  assert.equal(withMode("Persona: engineer (sonnet)\nSize: line\n"), null);
});
