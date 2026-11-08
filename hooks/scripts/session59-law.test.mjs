// DISC-271: a reviewer's verdict names its own session (get_session), never the helper-session file.
// Run: node --test hooks/scripts/session59-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const flat = (p) => readFileSync(join(root, p), "utf8").replace(/\s+/g, " ");

test("DISC-271: the reviewer: line takes get_session's own id, never ~/.claude/helper-session", () => {
  const rule = "The `reviewer:` line is the id `get_session` returns for your own session, never the id in `~/.claude/helper-session` (that file holds the parent's).";
  assert.ok(flat("skills/cloud-dispatch/references/HELPER-SESSIONS.md").includes(rule));
  assert.ok(flat("agents/reviewer.md").includes("the id `get_session` returns for your own session, never the parent's id in `~/.claude/helper-session`"));
});

test("DISC-271: an in-session reviewer subagent has no session id and omits the reviewer: line", () => {
  const rule = "A reviewer subagent has no session id and omits the line; the merge gate ignores a `reviewer:` value that is not a session id.";
  assert.ok(flat("agents/reviewer.md").includes(rule));
});
