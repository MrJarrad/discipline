// helper-sweep-stop — DISC-262: the helper sweep at session start and at wrap cannot be skipped.
// Run: node --test hooks/bin/helper-sweep-stop.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { sweepDue } from "./helper-sweep-stop.mjs";

const hook = fileURLToPath(new URL("./helper-sweep-stop.mjs", import.meta.url));
let n = 0;
const use = (name, input, result, content = "x") => {
  const id = `t${++n}`;
  const out = [{ message: { content: [{ type: "tool_use", id, name, input }] } }];
  if (result) out.push({ message: { content: [{ type: "tool_result", tool_use_id: id, is_error: result === "error", content }] } });
  return out;
};
const cockpit = use("Read", { file_path: "/home/user/jhd-vault/orchestrator/cockpit.md" }, "ok");
const wrap = use("Skill", { skill: "discipline:wrap" }, "ok");
const sweepCmd = { command: "node /p/hooks/scripts/helper-sweep.mjs --self session_a --sessions /tmp/s.json" };
const sweep = use("Bash", sweepCmd, "ok");
const lines = (...parts) => parts.flat().map((e) => JSON.stringify(e));

test("an orchestrator session (cockpit Read) that never swept is due at the start", () => {
  assert.match(sweepDue(lines(cockpit)).reason, /helper-sweep/);
  assert.equal(sweepDue(lines(cockpit)).phase, "start");
});
test("after a successful sweep, nothing is due", () => {
  assert.equal(sweepDue(lines(cockpit, sweep)), null);
});
test("a sweep that errored does not count", () => {
  assert.ok(sweepDue(lines(cockpit, use("Bash", sweepCmd, "error"))));
});
test("a sweep with no result yet does not count", () => {
  assert.ok(sweepDue(lines(cockpit, use("Bash", sweepCmd))));
});
test("a session that only mentions cockpit.md in a command, or reads another file, is not an orchestrator", () => {
  assert.equal(sweepDue(lines(use("Bash", { command: "grep x orchestrator/cockpit.md" }, "ok"), use("Read", { file_path: "/x/y.md" }, "ok"))), null);
});
test("at wrap a sweep from before the wrap does not count; one after does", () => {
  const due = sweepDue(lines(cockpit, sweep, wrap));
  assert.equal(due.phase, "wrap");
  assert.match(due.reason, /wrap/i);
  assert.equal(sweepDue(lines(cockpit, wrap, sweep)), null);
});

// DISC-268(1): a sweep that lists helpers to re-point is not finished until each one has been messaged.
const repointOut = "## Archive (0)\n\n## Re-point (2)\n- session_h1 | Your parent session session_old has wrapped; session_a is your parent now.\n- session_h2 | Your parent session session_old has wrapped; session_a is your parent now.\n";
const sweepWithRepoint = use("Bash", sweepCmd, "ok", repointOut);
const sendTo = (id) => use("mcp__claude-code-remote__send_message", { session_id: id, message: "re-pointed" }, "ok");
test("DISC-268: a sweep with helpers to re-point is due until each is sent a message after it", () => {
  const due = sweepDue(lines(cockpit, sweepWithRepoint));
  assert.equal(due.phase, "repoint");
  assert.match(due.reason, /session_h1/);
  assert.match(sweepDue(lines(cockpit, sweepWithRepoint, sendTo("session_h1"))).reason, /session_h2/);
  assert.doesNotMatch(sweepDue(lines(cockpit, sweepWithRepoint, sendTo("session_h1"))).reason, /session_h1/);
  assert.equal(sweepDue(lines(cockpit, sweepWithRepoint, sendTo("session_h1"), sendTo("session_h2"))), null);
});
test("DISC-268: a message sent before the sweep does not count as the re-point", () => {
  assert.equal(sweepDue(lines(cockpit, sendTo("session_h1"), sendTo("session_h2"), sweepWithRepoint))?.phase, "repoint");
});

const stop = (home, session_id, transcriptLines) => {
  const t = join(mkdtempSync(join(tmpdir(), "hss-")), "t.jsonl");
  writeFileSync(t, transcriptLines.join("\n"));
  const r = spawnSync(process.execPath, [hook], { input: JSON.stringify({ transcript_path: t, session_id }), encoding: "utf8", env: { ...process.env, HOME: home } });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim() ? JSON.parse(r.stdout) : null;
};
test("the Stop hook blocks once per session and phase, then lets every later turn through", () => {
  const home = mkdtempSync(join(tmpdir(), "home-"));
  assert.equal(stop(home, "s1", lines(cockpit))?.decision, "block");
  assert.equal(stop(home, "s1", lines(cockpit)), null, "second turn of the same session passes");
  assert.equal(stop(home, "s2", lines(cockpit))?.decision, "block", "another session is its own");
  assert.equal(stop(home, "s1", lines(cockpit, wrap))?.decision, "block", "wrap is its own phase");
  assert.equal(stop(home, "s1", lines(cockpit, wrap)), null);
});
test("a helper session (marker file) is never checked", () => {
  const home = mkdtempSync(join(tmpdir(), "home-"));
  spawnSync("mkdir", ["-p", join(home, ".claude")]); writeFileSync(join(home, ".claude", "helper-session"), "session_parent");
  const t = join(mkdtempSync(join(tmpdir(), "hss-")), "t.jsonl"); writeFileSync(t, lines(cockpit).join("\n"));
  const r = spawnSync(process.execPath, [hook], { input: JSON.stringify({ transcript_path: t, session_id: "h" }), encoding: "utf8", env: { ...process.env, HOME: home, CLAUDE_CODE_REMOTE: "true" } });
  assert.equal(r.stdout.trim(), "");
});
test("there is no SessionStart seed: a helper must never be told to archive", () => {
  const r = spawnSync(process.execPath, [hook, "start"], { input: "{}", encoding: "utf8" });
  assert.equal(r.stdout.trim(), "");
});
