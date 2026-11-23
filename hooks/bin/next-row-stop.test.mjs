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

function run(entries, { marker = null, stopActive = false, remote = "true", vault = true, fallback = false, local = false, mode } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "nrs-"));
  const transcript = join(dir, "t.jsonl");
  writeFileSync(transcript, entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
  const home = join(dir, "home");
  if (marker !== null) { mkdirSync(join(home, ".claude"), { recursive: true }); writeFileSync(join(home, ".claude", "helper-session"), marker + "\n"); }
  const v = join(dir, "vault"); mkdirSync(join(v, "projects"), { recursive: true });
  const env = { ...process.env, HOME: home, CLAUDE_CODE_REMOTE: remote };
  delete env.DISCIPLINE_VAULT_ROOT;
  if (local) mkdirSync(join(home, "JHD", "vault", "main", "projects"), { recursive: true });
  if (fallback) { env.DISCIPLINE_CLOUD_VAULT = v; delete env.DISCIPLINE_VAULT_ROOT; } else if (local) delete env.DISCIPLINE_VAULT_ROOT; else env.DISCIPLINE_VAULT_ROOT = vault ? v : "none";
  if (mode) env.DISCIPLINE_OUTCOME_CHECKS = mode;
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

test("a run at target lets the turn end; so does a rerun with --reason, whose output no longer says UNDER TARGET", () => {
  assert.equal(run([user(WAKE), called("Bash", RUN), result(FINE), said("ok")]), null);
  const RERUN = { command: `${RUN.command} --reason "waiting on a review slot"` };
  const REASONED = "Doers: 6 working of target 8\nGap of 2 reasoned: waiting on a review slot";
  const ran = [user(WAKE), called("Bash", RUN, "a"), result(UNDER, "a"), called("Bash", RERUN, "b"), result(REASONED, "b"), said("held on purpose")];
  assert.equal(run(ran), null);
});

test("AMBER 1: the first hold tells the parent to run next-row AND start its rows now, and says the second pass is not checked", () => {
  const out = run([user(WAKE), said("PR merged.")]);
  assert.match(out.reason, /next-row\.mjs/);
  assert.match(out.reason, /start (the|its) rows/i);
  assert.match(out.reason, /second (stop|pass).*not checked/i);
});

test("AMBER 1 pinned: after the hold, a run that prints UNDER TARGET with no dispatch is allowed on the second pass (stop_hook_active)", () => {
  const entries = [user(WAKE), called("Bash", RUN), result(UNDER), said("noted")];
  assert.equal(run(entries)?.decision, "block"); // run before the first Stop: the dispatch check bites
  assert.equal(run(entries, { stopActive: true }), null); // second pass is intentionally unchecked
});

test("AMBER 3: lane-end with --helper holds the turn; lane-end --id alone (an operator answer struck a row) does not", () => {
  const withHelper = called("Bash", { command: "node $P/hooks/scripts/lane-end.mjs --helper session_x --id PF-5" });
  const idOnly = called("Bash", { command: "node $P/hooks/scripts/lane-end.mjs --id PF-5" });
  assert.equal(run([user("carry on"), withHelper, said("PF-5 merged.")])?.decision, "block");
  assert.equal(run([user("carry on"), idOnly, said("struck PF-5.")]), null);
});

test("AMBER 3: a helper read completed holds the turn once; the same helper read completed again in a later turn does not", () => {
  const look = (id) => [called("mcp__claude-code-remote__get_session", { session_id: "session_x" }, id), result('{"status_bucket":"completed"}', id)];
  assert.equal(run([user("carry on"), ...look("t1"), said("helper landed")])?.decision, "block");
  assert.equal(run([user("carry on"), ...look("t1"), said("helper landed"), user("how are we looking"), ...look("t2"), said("still landed")]), null);
});

test("an ordinary operator turn with no landing is not held", () => {
  assert.equal(run([user("what colour is the nav"), said("It is grey.")]), null);
});

test("silent in a cloud helper (marker), with no vault, and in a wrapped session", () => {
  assert.equal(run([user(WAKE), said("x")], { marker: "session_parent" }), null);
  assert.equal(run([user(WAKE), said("x")], { vault: false }), null);
  assert.equal(run([user(WAKE), said("This session is wrapped — continue in a fresh session")]), null);
});

test("DISC-351: the cloud clone is found with no env var and only warns; blocks in block mode", () => {
  const warned = run([user(WAKE), said("landed")], { fallback: true });
  assert.equal(warned.decision, undefined);
  assert.match(warned.systemMessage, /warn-only.*next-row\.mjs/s);
  assert.equal(run([user(WAKE), said("landed")], { fallback: true, mode: "block" })?.decision, "block");
});

test("DISC-351: a vault at ~/JHD/vault/main with no env var blocks as it always did", () => {
  assert.equal(run([user(WAKE), said("landed")], { local: true })?.decision, "block");
});
