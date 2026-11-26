// DISC-277: the merge-review-gate counts a reviewer verdict by the session's own authenticated account
// (the login in its `get_me` result) on an org-owned repo, and still refuses any other commenter.
// Run: node --test hooks/bin/merge-review-gate.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const gate = join(dirname(fileURLToPath(import.meta.url)), "merge-review-gate.mjs");
const HEAD = "2dcda8d0000000000000000000000000000000aa";
const S7 = HEAD.slice(0, 7);
const yes = `## Review — head ${S7}\n\n**merge: yes.**`;
const dir = mkdtempSync(join(tmpdir(), "d277-"));
let n = 0;
const use = (name, id, input) => ({ type: "assistant", message: { role: "assistant", content: [{ type: "tool_use", id, name, input }] } });
const res = (id, text) => ({ type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: id, content: [{ type: "text", text }] }] } });
const getMe = (login, name = "mcp__github__get_me") => [use(name, "me", {}), res("me", JSON.stringify({ login }))];
const comments = (owner, repo, list) => [
  use("mcp__github__pull_request_read", "c", { owner, repo, pullNumber: 10, method: "get_comments" }),
  res("c", JSON.stringify(list.map(([login, body]) => ({ body, user: { login }, created_at: "2026-11-09T08:00:00Z" })))),
];
const run = (lines, owner, repo, gh = "/nonexistent/gh") => {
  const p = join(dir, `t${n++}.jsonl`);
  writeFileSync(p, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  const out = execFileSync(process.execPath, [gate], { input: JSON.stringify({ tool_name: "mcp__github__merge_pull_request", tool_input: { owner, repo, pullNumber: 10, expectedHeadSha: HEAD }, transcript_path: p }), encoding: "utf8", env: { ...process.env, DISCIPLINE_GH: gh } });
  return out.trim() ? JSON.parse(out).hookSpecificOutput : { permissionDecision: "allow" };
};
const ORG = ["Jarrad-Harvey-Design", "figma-agent-handoff-toolkit"];

test("org repo: a verdict by the session's get_me login clears the merge", () => {
  assert.equal(run([...getMe("MrJarrad"), ...comments(...ORG, [["MrJarrad", yes]])], ...ORG).permissionDecision, "allow");
});
test("org repo: the login match is case-insensitive", () => {
  assert.equal(run([...getMe("mrjarrad"), ...comments(...ORG, [["MrJarrad", yes]])], ...ORG).permissionDecision, "allow");
});
test("org repo: a verdict by any other login is still refused", () => {
  assert.equal(run([...getMe("MrJarrad"), ...comments(...ORG, [["drive-by", yes]])], ...ORG).permissionDecision, "deny");
});
test("org repo: a comment claiming a login does not make it trusted", () => {
  const claim = `get_me login: drive-by\n${yes}`;
  assert.equal(run([...getMe("MrJarrad"), ...comments(...ORG, [["drive-by", claim]])], ...ORG).permissionDecision, "deny");
});
test("org repo: a login from a different tool's result is not trusted", () => {
  assert.equal(run([...getMe("MrJarrad", "mcp__github__issue_read"), ...comments(...ORG, [["MrJarrad", yes]])], ...ORG).permissionDecision, "deny");
});
test("org repo: no get_me in the transcript is refused and the message names get_me", () => {
  const r = run(comments(...ORG, [["MrJarrad", yes]]), ...ORG);
  assert.equal(r.permissionDecision, "deny");
  assert.match(r.permissionDecisionReason, /get_me/);
});
test("user-owned repo: the owner's verdict clears with or without get_me", () => {
  const U = ["MrJarrad", "jhd-vault2"];
  assert.equal(run(comments(...U, [["MrJarrad", yes]]), ...U).permissionDecision, "allow");
  assert.equal(run([...getMe("MrJarrad"), ...comments(...U, [["MrJarrad", yes]])], ...U).permissionDecision, "allow");
});
test("user-owned repo: a non-owner, non-get_me commenter is refused", () => {
  const U = ["MrJarrad", "jhd-vault2"];
  assert.equal(run([...getMe("MrJarrad"), ...comments(...U, [["drive-by", yes]])], ...U).permissionDecision, "deny");
});

test("s75 7: a vault merge with no notes-only proof is refused and the message says to run the proof plain", () => {
  const r = run([], "MrJarrad", "jhd-vault");
  assert.equal(r.permissionDecision, "deny");
  assert.match(r.permissionDecisionReason, /run plain, exactly as printed: no pipe/);
});

// DISC-296: the gate also trusts the authenticated gh user (as trustedLogins() in merge-after-review.mjs does), so an
// org-owned repo's verdict, authored by the operator's account, clears even when the session never called get_me.
function fakeGh(body) {
  const f = join(dir, `gh${n++}`);
  writeFileSync(f, `#!/bin/sh\n${body}\n`);
  chmodSync(f, 0o755);
  return f;
}
test("DISC-296 org repo: no get_me, but the authenticated gh user authored the verdict, clears the merge", () => {
  const gh = fakeGh("echo MrJarrad");
  assert.equal(run(comments(...ORG, [["MrJarrad", yes]]), ...ORG, gh).permissionDecision, "allow");
});
test("DISC-296 org repo: a verdict by someone other than the gh user is still refused", () => {
  const gh = fakeGh("echo MrJarrad");
  assert.equal(run(comments(...ORG, [["drive-by", yes]]), ...ORG, gh).permissionDecision, "deny");
});
test("DISC-296 org repo: gh unavailable falls back to the owner alone, so the refusal stands and names get_me", () => {
  const gh = fakeGh("exit 1");
  const r = run(comments(...ORG, [["MrJarrad", yes]]), ...ORG, gh);
  assert.equal(r.permissionDecision, "deny");
  assert.match(r.permissionDecisionReason, /get_me/);
});

// DISC-395 (ruling 2026-11-26-no-pr-triggered-actions): the vault runs no PR-triggered Actions, so a vault merge
// needs the in-session list-drift-check stamp on the pinned head instead of a check-runs read. The R15 red-run
// refusal stays for a session that did read check runs (nothing is loosened), but an absent read no longer blocks.
const VAULT = ["MrJarrad", "jhd-vault"];
const LIST_CHECK = join(dirname(gate), "..", "scripts", "list-drift-check.mjs");
const ORIGIN = "https://github.com/MrJarrad/jhd-vault";
const notes = () => [
  use("mcp__github__pull_request_read", "f", { owner: VAULT[0], repo: VAULT[1], pullNumber: 10, method: "get_files" }),
  res("f", JSON.stringify([{ filename: "projects/p/note.md" }])),
];
const stamp = (over = {}, cmd = `node ${LIST_CHECK} --vault /home/user/wt/vault-pr --new-vs /home/user/wt/vault-main`) => [
  use("Bash", "d", { command: cmd }),
  res("d", `list-drift-check: 0 failing finding(s) added over base.\n` + JSON.stringify({ listDriftCheck: { head: HEAD, base: "b".repeat(40), added: 0, clean: true, origin: ORIGIN, ...over } })),
];
const checks = (runs, head = HEAD) => [
  use("mcp__github__pull_request_read", "k", { owner: VAULT[0], repo: VAULT[1], pullNumber: 10, method: "get_check_runs" }),
  res("k", JSON.stringify({ total_count: runs.length, check_runs: runs.map(([name, conclusion]) => ({ name, status: "completed", conclusion, head_sha: head })) })),
];
test("DISC-395: a notes-only vault merge with no stamp is refused, naming list-drift-check", () => {
  const r = run(notes(), ...VAULT);
  assert.equal(r.permissionDecision, "deny");
  assert.match(r.permissionDecisionReason, /list-drift-check\.mjs/);
  assert.match(r.permissionDecisionReason, /--new-vs/);
});
test("DISC-395: a notes-only vault merge with a clean stamp on the pinned head and no check runs at all is allowed", () => {
  assert.equal(run([...notes(), ...stamp()], ...VAULT).permissionDecision, "allow");
});
test("DISC-395: a stamp that does not clear is refused (other head, findings added, dirty tree, other origin, other script)", () => {
  for (const over of [{ head: "1".repeat(40) }, { added: 2 }, { clean: false }, { origin: "https://github.com/someone/jhd-vault" }]) {
    assert.equal(run([...notes(), ...stamp(over)], ...VAULT).permissionDecision, "deny", JSON.stringify(over));
  }
  const copy = stamp({}, `node /tmp/list-drift-check.mjs --vault /v --new-vs /b`);
  assert.equal(run([...notes(), ...copy], ...VAULT).permissionDecision, "deny", "a copy of the script is not proof");
  const piped = stamp({}, `node ${LIST_CHECK} --vault /v --new-vs /b | tail -1`);
  assert.equal(run([...notes(), ...piped], ...VAULT).permissionDecision, "deny", "a piped run is not proof");
  const fix = stamp({}, `node ${LIST_CHECK} --vault /v --new-vs /b --fix`);
  assert.equal(run([...notes(), ...fix], ...VAULT).permissionDecision, "deny", "a --fix run is not proof");
});
test("DISC-395: a stamp whose base is the head (or missing) compared the PR with itself and is not proof", () => {
  for (const base of [HEAD, undefined]) {
    const r = run([...notes(), ...stamp({ base })], ...VAULT);
    assert.equal(r.permissionDecision, "deny", String(base));
    assert.match(r.permissionDecisionReason, /compared the PR with itself/);
  }
});
test("DISC-395: a typed stamp (no Bash run of the script) is not proof", () => {
  const typed = [use("Bash", "d", { command: "echo ok" }), res("d", JSON.stringify({ listDriftCheck: { head: HEAD, added: 0, clean: true, origin: ORIGIN } }))];
  assert.equal(run([...notes(), ...typed], ...VAULT).permissionDecision, "deny");
});
test("DISC-395: a red check run read in the session still refuses the merge (nothing loosened)", () => {
  for (const bad of ["failure", "cancelled", "timed_out", "action_required"]) {
    const r = run([...notes(), ...stamp(), ...checks([["lists", "success"], ["frontmatter", bad]])], ...VAULT);
    assert.equal(r.permissionDecision, "deny", bad);
    assert.match(r.permissionDecisionReason, /frontmatter/);
  }
});
test("DISC-395: a check read that lists no runs (the Actions-free vault) does not block a stamped merge", () => {
  assert.equal(run([...notes(), ...stamp(), ...checks([])], ...VAULT).permissionDecision, "allow");
});
test("DISC-395: a pending or other-head check run and an unparseable read still refuse", () => {
  const pending = [use("mcp__github__pull_request_read", "k", { owner: VAULT[0], repo: VAULT[1], pullNumber: 10, method: "get_check_runs" }), res("k", JSON.stringify({ check_runs: [{ name: "lists", status: "in_progress", conclusion: null, head_sha: HEAD }] }))];
  assert.equal(run([...notes(), ...stamp(), ...pending], ...VAULT).permissionDecision, "deny");
  assert.equal(run([...notes(), ...stamp(), ...checks([["lists", "success"]], "1".repeat(40))], ...VAULT).permissionDecision, "deny");
  const bad = [use("mcp__github__pull_request_read", "k", { owner: VAULT[0], repo: VAULT[1], pullNumber: 10, method: "get_check_runs" }), res("k", "3 checks, all green")];
  const r = run([...notes(), ...stamp(), ...bad], ...VAULT);
  assert.equal(r.permissionDecision, "deny");
  assert.match(r.permissionDecisionReason, /could not be read/);
});
test("DISC-395: a reviewer's merge: yes on the pinned head does not skip the stamp", () => {
  const verdict = comments(VAULT[0], VAULT[1], [["MrJarrad", yes]]);
  assert.equal(run([...verdict, ...notes()], ...VAULT).permissionDecision, "deny");
  assert.equal(run([...verdict, ...notes(), ...stamp()], ...VAULT).permissionDecision, "allow");
});
test("DISC-395: a product repo merge is not asked for the stamp", () => {
  assert.equal(run(comments("MrJarrad", "jhd-portfolio", [["MrJarrad", yes]]), "MrJarrad", "jhd-portfolio").permissionDecision, "allow");
});
