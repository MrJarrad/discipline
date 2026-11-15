// DISC-336: a turn started by a wake, or one that saw a lane land, ends only after next-row.mjs ran and its rows were started or reasoned.
// Run: node --test hooks/bin/next-row-stop.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const hook = fileURLToPath(new URL("./next-row-stop.mjs", import.meta.url));
const user = (text) => ({ type: "user", message: { content: text } });
const said = (text) => ({ type: "assistant", message: { content: [{ type: "text", text }] } });
const called = (name, input = {}, id = "t") => ({ type: "assistant", message: { content: [{ type: "tool_use", id, name, input }] } });
const result = (text, id = "t") => ({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: id, content: text }] } });
const RUN = { command: "node $P/hooks/scripts/next-row.mjs --vault /v --projects PF --lanes /tmp/l.json" };
const UNDER = "Doers: 6 working of target 8\nUNDER TARGET by 2: start next\n  - PF-3 first\nUNDER TARGET: start the rows above, or rerun with --reason";
const FINE = "Doers: 8 working of target 8\nAt target (or nothing agent-doable left, or every gap reasoned).";
const WAKE = '<wake reason="external-event"><event source="github">CI green</event></wake>';

function run(entries, { marker = null, stopActive = false, remote = "true", vault = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "nrs-"));
  const transcript = join(dir, "t.jsonl");
  writeFileSync(transcript, entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
  const home = join(dir, "home");
  if (marker !== null) { mkdirSync(join(home, ".claude"), { recursive: true }); writeFileSync(join(home, ".claude", "helper-session"), marker + "\n"); }
  const v = join(dir, "vault"); mkdirSync(join(v, "projects"), { recursive: true });
  const env = { ...process.env, HOME: home, CLAUDE_CODE_REMOTE: remote };
  delete env.DISCIPLINE_VAULT_ROOT;
  if (vault) env.DISCIPLINE_VAULT_ROOT = v;
  const r = spawnSync(process.execPath, [hook], { input: JSON.stringify({ transcript_path: transcript, stop_hook_active: stopActive, session_id: "s" }), env, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout ? JSON.parse(r.stdout) : null;
}

test("a wake turn that never ran next-row.mjs is held once and told the command", () => {
  const out = run([user(WAKE), said("PR merged.")]);
  assert.equal(out?.decision, "block");
  assert.match(out.reason, /next-row\.mjs/);
  assert.equal(run([user(WAKE), said("PR merged.")], { stopActive: true }), null);
});

test("a wake turn whose run printed UNDER TARGET is held until a dispatch follows or the run is reasoned", () => {
  const ran = [user(WAKE), called("Bash", RUN), result(UNDER)];
  assert.equal(run([...ran, said("noted")])?.decision, "block");
  assert.equal(run([...ran, called("mcp__claude-code-remote__create_session", {}, "c"), result("ok", "c"), said("started PF-3")]), null);
  assert.equal(run([...ran, called("Agent", {}, "c"), result("ok", "c"), said("started")]), null);
});

test("a run at target, or one rerun with --reason, lets the turn end", () => {
  assert.equal(run([user(WAKE), called("Bash", RUN), result(FINE), said("ok")]), null);
});

test("a turn that closed a lane (lane-end.mjs) or read a completed helper is held even with no wake", () => {
  const laneEnd = called("Bash", { command: "node $P/hooks/scripts/lane-end.mjs --helper session_x --id PF-5" });
  assert.equal(run([user("carry on"), laneEnd, said("PF-5 merged.")])?.decision, "block");
  const done = [user("carry on"), called("mcp__claude-code-remote__get_session", { session_id: "session_x" }), result('{"status_bucket":"completed"}'), said("helper landed")];
  assert.equal(run(done)?.decision, "block");
});

test("an ordinary operator turn with no landing is not held", () => {
  assert.equal(run([user("what colour is the nav"), said("It is grey.")]), null);
});

test("silent in a cloud helper (marker), with no vault, and in a wrapped session", () => {
  assert.equal(run([user(WAKE), said("x")], { marker: "session_parent" }), null);
  assert.equal(run([user(WAKE), said("x")], { vault: false }), null);
  assert.equal(run([user(WAKE), said("This session is wrapped — continue in a fresh session")]), null);
});
