// DISC-336: the moment a lane lands, the parent is told to run next-row.mjs. Run: node --test hooks/bin/lane-landed-nudge.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handle } from "./lane-landed-nudge.mjs";
const dir = () => mkdtempSync(join(tmpdir(), "lln-"));

const bash = (command) => ({ tool_name: "Bash", tool_input: { command }, tool_response: "ok" });
const sess = (resp, input = { session_id: "session_x" }) => ({ tool_name: "mcp__claude-code-remote__get_session", tool_input: input, tool_response: resp });

test("lane-end.mjs --helper (a lane closing) nudges the parent to run next-row.mjs; lane-end.mjs --id alone (an answer struck a row) does not", () => {
  assert.match(handle(bash("node $P/hooks/scripts/lane-end.mjs --helper session_x --id PF-5"), dir()) || "", /next-row\.mjs/);
  assert.equal(handle(bash("node $P/hooks/scripts/lane-end.mjs --id PF-5"), dir()), null);
});
test("get_session on a helper that reads completed nudges once per helper; one still working does not", () => {
  const d = dir();
  assert.match(handle(sess('{"ccr":{"status_bucket":"completed"}}'), d) || "", /next-row\.mjs/);
  assert.equal(handle(sess('{"ccr":{"status_bucket":"completed"}}'), d), null); // already swept
  assert.equal(handle(sess('{"ccr":{"status_bucket":"working"}}'), dir()), null);
});
test("get_session with no session_id (the session itself) and a subagent's own call do not nudge", () => {
  assert.equal(handle(sess('{"status_bucket":"completed"}', {}), dir()), null);
  assert.equal(handle({ ...bash("node lane-end.mjs --helper session_x"), agent_id: "a1" }, dir()), null);
});
test("an unrelated Bash command does not nudge", () => {
  assert.equal(handle(bash("git status"), dir()), null);
});
