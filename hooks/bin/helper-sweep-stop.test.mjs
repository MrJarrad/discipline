// helper-sweep-stop — DISC-262: the helper sweep at session start and at wrap cannot be skipped.
// Run: node --test hooks/bin/helper-sweep-stop.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { sweepDue } from "./helper-sweep-stop.mjs";

const hook = fileURLToPath(new URL("./helper-sweep-stop.mjs", import.meta.url));
const use = (name, input) => ({ message: { content: [{ type: "tool_use", id: name + Math.random(), name, input }] } });
const cockpit = use("Read", { file_path: "/home/user/jhd-vault/orchestrator/cockpit.md" });
const wrap = use("Skill", { skill: "discipline:wrap" });
const sweep = use("Bash", { command: "node /p/hooks/scripts/helper-sweep.mjs --self session_a --sessions /tmp/s.json" });
const lines = (...es) => es.map((e) => JSON.stringify(e));

test("an orchestrator session (cockpit read) that never swept is due at the start", () => {
  assert.match(sweepDue(lines(cockpit)), /helper-sweep/);
});
test("after the sweep ran, the start check passes", () => {
  assert.equal(sweepDue(lines(cockpit, sweep)), null);
});
test("a session that never read the cockpit is not an orchestrator: nothing due", () => {
  assert.equal(sweepDue(lines(use("Read", { file_path: "/x/y.md" }))), null);
});
test("at wrap a sweep from before the wrap does not count", () => {
  assert.match(sweepDue(lines(cockpit, sweep, wrap)), /wrap/i);
});
test("at wrap a sweep after the wrap skill passes", () => {
  assert.equal(sweepDue(lines(cockpit, wrap, sweep)), null);
});

const stop = (env, transcriptLines, extra = {}) => {
  const t = join(mkdtempSync(join(tmpdir(), "hss-")), "t.jsonl");
  writeFileSync(t, transcriptLines.join("\n"));
  const r = spawnSync(process.execPath, [hook, ...(extra.args || [])], { input: JSON.stringify({ transcript_path: t, stop_hook_active: extra.active }), encoding: "utf8", env: { ...process.env, HOME: mkdtempSync(join(tmpdir(), "home-")), ...env } });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim() ? JSON.parse(r.stdout) : null;
};
test("the Stop hook blocks once, and lets the retry through", () => {
  assert.equal(stop({}, lines(cockpit))?.decision, "block");
  assert.equal(stop({}, lines(cockpit), { active: true }), null);
});
test("start mode seeds the session with the sweep instruction", () => {
  const r = spawnSync(process.execPath, [hook, "start"], { input: "{}", encoding: "utf8", env: { ...process.env, HOME: mkdtempSync(join(tmpdir(), "home-")) } });
  assert.match(JSON.parse(r.stdout).hookSpecificOutput.additionalContext, /helper-sweep/);
});
