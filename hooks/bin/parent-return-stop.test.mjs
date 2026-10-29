// DISC-216: a helper session's return reaches its parent without the brief remembering to ask.
// Run: node --test hooks/bin/parent-return-stop.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
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

// The orchestrator's own cloud env (parent, 2026-10-29): CLAUDE_CODE_CHILD_SESSION=1 is set there too.
const ORCHESTRATOR_ENV = { CLAUDE_CODE_CHILD_SESSION: "1", CLAUDE_CODE_ENTRYPOINT: "remote_desktop", CLAUDE_CODE_SESSION_ATTENDED: "1", CLAUDE_CODE_HOSTED_DESKTOP: "1", CLAUDE_CODE_REMOTE: "true" };
const PARENT = "session_019vvsL25nhA75yyQzy7YKuY";

function run(entries, { marker = PARENT, stopActive = false, path } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "prs-"));
  const transcript = path ?? join(dir, "t.jsonl");
  if (!path) writeFileSync(transcript, entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
  const home = join(dir, "home");
  if (marker !== null) { mkdirSync(join(home, ".claude"), { recursive: true }); writeFileSync(join(home, ".claude", "helper-session"), marker + "\n"); }
  const env = { ...process.env, ...ORCHESTRATOR_ENV, HOME: home };
  const r = spawnSync(process.execPath, [hook], {
    input: JSON.stringify({ transcript_path: transcript, stop_hook_active: stopActive, session_id: "s" }),
    env, encoding: "utf8",
  });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout ? JSON.parse(r.stdout) : null;
}

test("a helper's turn that ends with a return and no send_message is blocked once, naming the parent id from the marker", () => {
  const out = run([user("This message is your task — run it now."), said(LONG)]);
  assert.equal(out?.decision, "block");
  assert.match(out.reason, /send_message/);
  assert.ok(out.reason.includes(PARENT));
  assert.match(run([user("go"), said(LONG)], { marker: "" }).reason, /"@parent"/, "an empty marker still marks a helper; the send goes to @parent");
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

test("the orchestrator's env set (CLAUDE_CODE_CHILD_SESSION=1 included) with no helper marker is never nudged", () => {
  assert.equal(run([user("go"), said(LONG)], { marker: null }), null);
});

test("no loop, and quiet on errors", () => {
  assert.equal(run([user("go"), said(LONG)], { stopActive: true }), null);
  assert.equal(run([], { path: "/nonexistent/t.jsonl" }), null);
  const home = mkdtempSync(join(tmpdir(), "prs-"));
  mkdirSync(join(home, ".claude"));
  writeFileSync(join(home, ".claude", "helper-session"), PARENT);
  const bad = spawnSync(process.execPath, [hook], { input: "not json", env: { ...process.env, HOME: home }, encoding: "utf8" });
  assert.equal(bad.status, 0);
  assert.equal(bad.stdout, "");
});
