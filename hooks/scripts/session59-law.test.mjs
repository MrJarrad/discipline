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
  // one owner: HELPER-SESSIONS points at the charter instead of restating the rule
  assert.ok(flat("skills/cloud-dispatch/references/HELPER-SESSIONS.md").includes("the `reviewer:` line rule in `agents/reviewer.md` § Verdict shape"));
  assert.ok(flat("agents/reviewer.md").includes("the id `get_session` returns for your own session, never the parent's id in `~/.claude/helper-session`"));
});

test("DISC-271: an in-session reviewer subagent has no session id and omits the reviewer: line", () => {
  const rule = "A reviewer subagent has no session id and omits the line; a verdict whose `reviewer:` line is not a session id is not counted at all (`merge-after-review.mjs`).";
  assert.ok(flat("agents/reviewer.md").includes(rule));
});
