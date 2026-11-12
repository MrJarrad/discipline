// DISC-295: a parent status reply or wrap is held once when a project is under lane capacity with open agent rows.
// Run: node --test hooks/bin/lane-capacity-stop.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const hook = fileURLToPath(new URL("./lane-capacity-stop.mjs", import.meta.url));
const STATUS = "The footer fix is not done, 2 of 4.\n\n## Needed from you\n\nNothing needed from you.";
const user = (text) => ({ type: "user", message: { content: text } });
const said = (text) => ({ type: "assistant", message: { content: [{ type: "text", text }] } });
const called = (name, input = {}, id = "t") => ({ type: "assistant", message: { content: [{ type: "tool_use", id, name, input }] } });
const result = (text, id = "t", is_error = false) => ({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: id, content: text, is_error }] } });
const RUN = { command: "node $P/hooks/scripts/lane-capacity.mjs --vault /v --projects PF --lanes /tmp/l.json" };
const UNDER = "PF: 2 of 5 lanes running; 3 open agent rows\n  UNDER CAPACITY by 3: dispatch next\n  - PF-1 build the footer. Agent.\nUNDER CAPACITY: dispatch the rows above, or rerun with --reason";
const FINE = "PF: 5 of 5 lanes running; 3 open agent rows\nAt capacity (or out of agent rows, or every gap reasoned).";

function run(entries, { marker = null, stopActive = false, remote = "true", vault = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "lcs-"));
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

test("a status reply with no lane-capacity run this turn is held once and told the command", () => {
  const out = run([user("how are we looking"), said(STATUS)]);
  assert.equal(out?.decision, "block");
  assert.match(out.reason, /lane-capacity\.mjs/);
  assert.equal(run([user("how are we looking"), said(STATUS)], { stopActive: true }), null);
});

test("a status reply after a run that came back at capacity passes", () => {
  assert.equal(run([user("go"), called("Bash", RUN), result(FINE), said(STATUS)]), null);
});

test("a status reply after an under-capacity run with no dispatch is held and prints the rows to dispatch", () => {
  const out = run([user("go"), called("Bash", RUN), result(UNDER, "t", true), said(STATUS)]);
  assert.equal(out?.decision, "block");
  assert.match(out.reason, /PF-1/);
});

test("a dispatch after the under-capacity run lets the reply pass", () => {
  for (const name of ["Agent", "mcp__claude-code-remote__create_session", "Workflow"]) {
    assert.equal(run([user("go"), called("Bash", RUN), result(UNDER, "t", true), called(name, {}, "d"), result("ok", "d"), said(STATUS)]), null, name);
  }
});

test("a wrap (the wrap skill loaded this turn) is held the same way, with or without a Needed-from-you heading", () => {
  const wrap = called("Skill", { skill: "discipline:wrap" }, "w");
  assert.equal(run([user("wrap"), wrap, result("ok", "w"), said("Wrapped.")])?.decision, "block");
  assert.equal(run([user("wrap"), wrap, result("ok", "w"), called("Bash", RUN), result(UNDER, "t", true), said("Wrapped.")])?.decision, "block");
  assert.equal(run([user("wrap"), wrap, result("ok", "w"), called("Bash", RUN), result(FINE), said("Wrapped.")]), null);
});

test("an ordinary reply, a helper session, and a wrapped session's one-liner are never held", () => {
  assert.equal(run([user("rename it"), said("Renamed the heading to Contact.")]), null);
  assert.equal(run([user("go"), said(STATUS)], { marker: "session_abc" }), null);
  assert.equal(run([user("hi"), said("This session is wrapped — continue in a fresh session")]), null);
});

// Review round 1 RED 1: no vault guard and no wake exemption false-refused ordinary replies.
test("without DISCIPLINE_VAULT_ROOT (no vault, so no project backlog to refill from) nothing is held", () => {
  assert.equal(run([user("how are we looking"), said(STATUS)], { vault: false }), null);
  assert.equal(run([user("wrap"), called("Skill", { skill: "discipline:wrap" }, "w"), result("ok", "w"), said("Wrapped.")], { vault: false }), null);
});
test("a turn started by a wake event (a CI-green event, a bot edit) is never held", () => {
  const wake = user('<wake reason="external-event"><event source="github" kind="check_suite">green</event></wake>');
  assert.equal(run([user("go"), wake, said(STATUS)]), null);
});
