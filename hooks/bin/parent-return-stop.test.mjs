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

function run(entries, { marker = PARENT, stopActive = false, path, remote = "true", self = "s" } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "prs-"));
  const transcript = path ?? join(dir, "t.jsonl");
  if (!path) writeFileSync(transcript, entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
  const home = join(dir, "home");
  if (marker !== null) { mkdirSync(join(home, ".claude"), { recursive: true }); writeFileSync(join(home, ".claude", "helper-session"), marker + "\n"); }
  const env = { ...process.env, ...ORCHESTRATOR_ENV, HOME: home, CLAUDE_CODE_REMOTE: remote };
  const r = spawnSync(process.execPath, [hook], {
    input: JSON.stringify({ transcript_path: transcript, stop_hook_active: stopActive, session_id: self }),
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

// DISC-217 (1): a skill load after send_message writes an isMeta user entry; it is not a new turn.
test("an isMeta user entry after send_message does not reset the turn", () => {
  const meta = { ...user("Base directory for this skill: ..."), isMeta: true };
  assert.equal(run([user("go"), called(SEND), result(), meta, said(LONG)]), null);
});

// DISC-217 (2): on a Mac every local session shares the home folder, so the marker counts only in a cloud session.
test("the helper marker is honoured only when CLAUDE_CODE_REMOTE=true", () => {
  assert.equal(run([user("go"), said(LONG)], { remote: "" }), null);
  assert.equal(run([user("go"), said(LONG)], { remote: "false" }), null);
  assert.equal(run([user("go"), said(LONG)])?.decision, "block");
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

test("a marker holding the helper's own session id is refused: the block names @parent, never itself (DISC-240)", () => {
  const SELF = "session_019vvsL1vmDhfftZ5CxJaQvR";
  const out = run([user("This message is your task — run it now."), said(LONG)], { marker: SELF, self: SELF });
  assert.equal(out.decision, "block");
  assert.ok(out.reason.includes('session_id "@parent"'), out.reason);
  assert.ok(!out.reason.includes(SELF), out.reason);
});

// DISC-294 (s79 lesson 3): a wake-event turn (GitHub bot edit, green check suite) that changed nothing is not a return.
const wake = (body = "PR #584 edited by a bot") => user(`<wake reason="external-event"><event source="github" type="pull_request">${body}</event></wake>`);
const LONG_WAIT = "Nothing changed on the PR: still waiting on the operator's look, CI green, no review comment. ".repeat(4);

test("a wake-event turn that ran only reads and says nothing changed is let through", () => {
  assert.equal(run([user("go"), called(SEND), result(), wake(), called("Read"), result(), said(LONG_WAIT)]), null);
});

test("a wake-event turn that pushed or edited is still held", () => {
  assert.equal(run([user("go"), wake(), called("Edit"), result(), said(LONG)])?.decision, "block");
  assert.equal(run([user("go"), wake(), called("Bash", { command: "git push -u origin d1" }), result(), said(LONG)])?.decision, "block");
  assert.equal(run([user("go"), wake(), called("mcp__github__add_issue_comment"), result(), said(LONG)])?.decision, "block");
});

test("a wake-event turn that says `next: parent` is held", () => {
  assert.equal(run([user("go"), wake(), called("Read"), result(), said("CI red on pf #584.\n\nnext: parent")])?.decision, "block");
});

test("the first brief, an automated notification that is not a wake event, is still a task turn", () => {
  assert.equal(run([user("[SYSTEM NOTIFICATION - NOT USER INPUT] This message is your task"), called("Read"), result(), said(LONG)])?.decision, "block");
});

// DISC-364: a parent that asked the helper to stay quiet, and a no-change wake, do not force a return.
// Round 1 review (#252): the quiet ask is the marker's parent's, scopes to automated turns, and never hides a real result.
const parentSays = (body, from = PARENT) => user(`<cross-session-message from-session="${from}">${body}</cross-session-message>`);
const auto = (body = "bot edit on PR #584") => user(`[SYSTEM NOTIFICATION - NOT USER INPUT] ${body}`);
const QUIET = "Nothing changed on the PR; I am still waiting on the operator, CI green, no review comment. ".repeat(3);
const HUSH = "Stay quiet until I message you; no reply needed on bot edits.";

test("an automated turn after the marker's parent asked for quiet is let through when nothing changed", () => {
  assert.equal(run([user("go"), called(SEND), result(), parentSays(HUSH), said("ok"), auto(), called("Read"), result(), said(QUIET)]), null);
});

test("the quiet request holds on a later automated no-change turn, and a wake turn too", () => {
  assert.equal(run([user("go"), parentSays(HUSH), said("ok"), auto(), said(QUIET), auto("another bot edit"), called("Read"), result(), said(QUIET)]), null);
});

test("without a quiet request an automated no-change turn that is not a wake is still a return", () => {
  assert.equal(run([user("go"), said("ok"), auto(), called("Read"), result(), said(QUIET)])?.decision, "block");
});

test("a quiet request from a session that is not the marker's parent is ignored", () => {
  assert.equal(run([user("go"), parentSays(HUSH, "session_someone_else"), said("ok"), auto(), called("Read"), result(), said(QUIET)])?.decision, "block");
  assert.equal(run([user("go"), parentSays(HUSH), said("ok"), auto(), called("Read"), result(), said(QUIET)], { marker: "" })?.decision, "block", "no parent id in the marker: nobody can hush");
});

test("a quiet request never hushes the turn the message itself started: a task brief that says 'do not reply to bot comments' still returns", () => {
  assert.equal(run([user("go"), parentSays("Review PR 9. Do not reply to bot comments; report the verdict when done."), called("Read"), result(), said("Verdict: merge no, 2 blockers. ".repeat(8))])?.decision, "block");
  assert.equal(run([user("go"), parentSays("Run the suite. Don't message me until it is green; then return."), called("Bash", { command: "npm test" }), result(), said("Suite red: 3 failures in parent-return-stop. ".repeat(6))])?.decision, "block");
});

test("a later parent message that is not a quiet request lifts the hush", () => {
  assert.equal(run([user("go"), parentSays(HUSH), said("ok"), parentSays("New task: check PR 9 and report."), said("ok"), auto(), called("Read"), result(), said(QUIET)])?.decision, "block");
});

test("red CI, a new PR or a review comment reports even when quiet, with no `next: parent` line", () => {
  const redCi = "CI is red on discipline #252: the suite job failed at test 15. ".repeat(4);
  const review = "A review comment from the reviewer asks for changes on hooks/bin/parent-return-stop.mjs. ".repeat(3);
  for (const reply of [redCi, review]) {
    assert.equal(run([user("go"), parentSays(HUSH), said("ok"), auto(), called("Read"), result(), said(reply)])?.decision, "block", reply);
    assert.equal(run([user("go"), wake(), called("Read"), result(), said(reply)])?.decision, "block", `wake: ${reply}`);
  }
  assert.equal(run([user("go"), parentSays(HUSH), said("ok"), auto(), called("Bash", { command: "gh pr create --draft -t x -b y" }), result(), said(QUIET)])?.decision, "block", "a PR opened this turn");
});

test("a quiet request does not hide a state change or `next: parent`", () => {
  assert.equal(run([user("go"), parentSays(HUSH), said("ok"), auto(), called("Edit"), result(), said(LONG)])?.decision, "block");
  assert.equal(run([user("go"), parentSays(HUSH), said("ok"), auto(), called("Read"), result(), said("Waiting.\n\nnext: parent")])?.decision, "block");
});

test("a GitHub write through gh api is a state change on a wake turn, with or without -X", () => {
  for (const command of [
    "gh api -X POST repos/x/y/issues/1/comments -f body=hi",
    "gh api repos/x/y/pulls/3 --method PATCH -f state=closed",
    "gh api repos/x/y/pulls -f title=t -f head=b -f base=main",
    "gh api repos/x/y/pulls --raw-field title=t",
    "gh api repos/x/y/issues -F title=t",
    "gh api repos/x/y/pulls --field title=t",
    "gh pr create --draft",
    "gh pr comment 3 --body hi",
  ]) assert.equal(run([user("go"), wake(), called("Bash", { command }), result(), said(LONG)])?.decision, "block", command);
  for (const command of ["gh api repos/x/y/pulls/3", "gh api -X GET search/code -f q=foo", "gh pr view 3"]) {
    assert.equal(run([user("go"), wake(), called("Bash", { command }), result(), said(LONG_WAIT)]), null, command);
  }
});
