// DISC-216: a helper session's return reaches its parent without the brief remembering to ask.
// Run: node --test hooks/bin/parent-return-stop.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const hook = fileURLToPath(new URL("./parent-return-stop.mjs", import.meta.url));
const SEND = "mcp__claude-code-remote__send_message";
const LONG = "PR is up: https://github.com/x/y/pull/1. Suite green, 412 pass. ".repeat(4) + "\n\nnext: reviewer";

const user = (text) => ({ type: "user", timestamp: "2026-10-29T12:00:00Z", message: { content: text } });
const said = (text) => ({ type: "assistant", message: { content: [{ type: "text", text }] } });
const called = (name, input = {}) => ({ type: "assistant", message: { content: [{ type: "tool_use", id: "t", name, input }] } });
const result = () => ({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t", content: "ok" }] } });

function run(entries, { child = "1", stopActive = false, path } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "prs-"));
  const transcript = path ?? join(dir, "t.jsonl");
  if (!path) writeFileSync(transcript, entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
  const env = { ...process.env };
  delete env.CLAUDE_CODE_CHILD_SESSION;
  if (child !== null) env.CLAUDE_CODE_CHILD_SESSION = child;
  const r = spawnSync(process.execPath, [hook], {
    input: JSON.stringify({ transcript_path: transcript, stop_hook_active: stopActive, session_id: "s" }),
    env, encoding: "utf8",
  });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout ? JSON.parse(r.stdout) : null;
}

test("a helper's turn that ends with a return and no send_message is blocked once, pointing at @parent", () => {
  const out = run([user("This message is your task — run it now."), said(LONG)]);
  assert.equal(out?.decision, "block");
  assert.match(out.reason, /send_message/);
  assert.match(out.reason, /@parent/);
});

test("a helper's turn that already called send_message passes", () => {
  assert.equal(run([user("go"), called(SEND, { session_id: "@parent", message: "x" }), result(), said(LONG)]), null);
});

test("a send_message from an earlier turn does not count for this one", () => {
  assert.equal(run([user("go"), called(SEND), result(), said(LONG), user("next task"), said(LONG)])?.decision, "block");
});

test("another server's send_message (mail) is not a return to the parent", () => {
  assert.equal(run([user("go"), called("mcp__gmail__send_message"), result(), said(LONG)])?.decision, "block");
});

test("a tiny ack is not nudged; a short reply carrying `next: parent` is", () => {
  assert.equal(run([user("wake"), said("Nothing new on the PR; still waiting on CI.")]), null);
  assert.equal(run([user("go"), said("Read-back sent.\n\nnext: parent (go?)")])?.decision, "block");
});

test("the orchestrator (no CLAUDE_CODE_CHILD_SESSION, or not 1) is never nudged", () => {
  assert.equal(run([user("go"), said(LONG)], { child: null }), null);
  assert.equal(run([user("go"), said(LONG)], { child: "0" }), null);
});

test("no loop, and quiet on errors", () => {
  assert.equal(run([user("go"), said(LONG)], { stopActive: true }), null);
  assert.equal(run([], { path: "/nonexistent/t.jsonl" }), null);
  const bad = spawnSync(process.execPath, [hook], { input: "not json", env: { ...process.env, CLAUDE_CODE_CHILD_SESSION: "1" }, encoding: "utf8" });
  assert.equal(bad.status, 0);
  assert.equal(bad.stdout, "");
});
