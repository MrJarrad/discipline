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

// Review of #150 A1: the sweep the hook asks for must read the landed list, or lane-end --helper does nothing.
test("DISC-268 A1: the start and wrap sweep commands pass --landed, and that command archives a landed helper", () => {
  const dir = mkdtempSync(join(tmpdir(), "landed-"));
  writeFileSync(join(dir, "landed-helpers"), "h_done\n");
  const sessions = join(dir, "s.json");
  const s = (id, title, extra = {}) => ({ id, title, status_bucket: "SESSION_STATUS_BUCKET_COMPLETED", created_at: "2026-11-08T09:00:00Z", updated_at: "2026-11-08T09:30:00Z", ...extra });
  writeFileSync(sessions, JSON.stringify({ data: [s("p_live", "Discipline · 8 Nov ← talk here"), s("h_done", "Helper · x — no action needed", { parent_session_id: "p_live" })] }));
  for (const due of [sweepDue(lines(cockpit)), sweepDue(lines(cockpit, wrap))]) {
    assert.match(due.reason, /--landed <session-dir>\/landed-helpers/);
  }
  const bin = fileURLToPath(new URL("../scripts/helper-sweep.mjs", import.meta.url));
  const r = spawnSync(process.execPath, [bin, "--self", "me", "--sessions", sessions, "--landed", join(dir, "landed-helpers")], { encoding: "utf8" });
  assert.match(r.stdout.slice(r.stdout.indexOf("## Archive"), r.stdout.indexOf("## Keep")), /h_done/);
});

// Review of #150 A2: the re-point hold blocks every turn while rows are unsent (capped, so an unreachable helper cannot trap the session).
test("DISC-268 A2: the re-point hold re-blocks while rows are unsent, ends when they are sent, and is capped at 3", () => {
  const home = mkdtempSync(join(tmpdir(), "home-"));
  const pending = lines(cockpit, sweepWithRepoint);
  for (let i = 0; i < 3; i++) assert.equal(stop(home, "r1", pending)?.decision, "block", `turn ${i + 1}`);
  assert.equal(stop(home, "r1", pending), null, "capped after 3 holds");
  assert.equal(stop(home, "r2", pending)?.decision, "block");
  assert.equal(stop(home, "r2", lines(cockpit, sweepWithRepoint, sendTo("session_h1"), sendTo("session_h2"))), null, "all sent: passes");
});

// DISC-291 (operator s78: "must be archived when completed"): the gate used to pass once the sweep ran, so Archive
// rows nobody archived (s73–s76: nine) passed silently. Each Archive row now needs an archive_session call after the sweep
// (a refused call still counts: the refusal is then one named line), held like the Re-point rows.
const archiveOut = "## Archive (2)\n- session_h1 | Helper · a | completed; parent wrapped\n- session_h2 | Helper · b | completed; parent wrapped\n\n## Keep (0)\n\n## Surface (0)\n\n## Re-point (0)\n";
const sweepWithArchive = use("Bash", sweepCmd, "ok", archiveOut);
const archiveCall = (id) => use("mcp__claude-code-remote__archive_session", { session_id: id }, "ok");
test("DISC-291: a sweep with Archive rows is due until each id has an archive_session call after it, at start and at wrap", () => {
  for (const base of [[cockpit], [cockpit, wrap]]) {
    const due = sweepDue(lines(...base, sweepWithArchive));
    assert.equal(due.phase, "archive");
    assert.match(due.reason, /session_h1/); assert.match(due.reason, /session_h2/);
    const one = sweepDue(lines(...base, sweepWithArchive, archiveCall("session_h1")));
    assert.match(one.reason, /session_h2/); assert.doesNotMatch(one.reason, /session_h1/);
    assert.equal(sweepDue(lines(...base, sweepWithArchive, archiveCall("session_h1"), archiveCall("session_h2"))), null);
  }
});
test("DISC-291: an archive_session call made before the sweep does not count", () => {
  assert.equal(sweepDue(lines(cockpit, archiveCall("session_h1"), archiveCall("session_h2"), sweepWithArchive))?.phase, "archive");
});
test("DISC-291: a refused archive_session (tool error) still counts as attempted, so a guard refusal cannot trap the session", () => {
  const refused = (id) => use("mcp__claude-code-remote__archive_session", { session_id: id }, "error");
  assert.equal(sweepDue(lines(cockpit, sweepWithArchive, refused("session_h1"), refused("session_h2"))), null);
});
test("DISC-291: the archive hold re-blocks while rows are unarchived and is capped at 3", () => {
  const home = mkdtempSync(join(tmpdir(), "home-"));
  const pending = lines(cockpit, sweepWithArchive);
  for (let i = 0; i < 3; i++) assert.equal(stop(home, "a1", pending)?.decision, "block", `turn ${i + 1}`);
  assert.equal(stop(home, "a1", pending), null, "capped after 3 holds");
});

// DISC-291: s77's wrap wrote "Orphans from s73–s76 (9) need the operator's sidebar" on the Helpers: line, naming no ids,
// so no later sweep could find them. A wrap that writes such a line to the cockpit is held until the line names ids.
const cockpitEdit = (text) => use("Edit", { file_path: "/home/user/jhd-vault/orchestrator/cockpit.md", old_string: "x", new_string: text }, "ok");
test("DISC-291: at wrap, a cockpit Helpers: line that counts orphans or sends them to the sidebar is held", () => {
  const bad = cockpitEdit("- Helpers: (live) session_a1. Orphans from s73–s76 (9) need the operator's sidebar.");
  const due = sweepDue(lines(cockpit, wrap, sweep, bad));
  assert.equal(due?.phase, "helpers");
  assert.match(due.reason, /ids/);
});
test("DISC-291: at wrap, a Helpers: line of ids, or 'none', passes; an edit before the wrap skill is not checked", () => {
  assert.equal(sweepDue(lines(cockpit, wrap, sweep, cockpitEdit("- Helpers: session_a1, session_b2"))), null);
  assert.equal(sweepDue(lines(cockpit, wrap, sweep, cockpitEdit("- Helpers: none"))), null);
  assert.equal(sweepDue(lines(cockpit, cockpitEdit("- Helpers: Orphans (9) in the sidebar"), wrap, sweep)), null);
});

// DISC-291 round 1 review of #181.
// R1: `helper-sweep.mjs --cockpit` only prints ids and exits 0; it must not satisfy the "sweep ran" gate, or the archive hold never fires.
const cockpitCmd = use("Bash", { command: "node /p/hooks/scripts/helper-sweep.mjs --cockpit /v/orchestrator/cockpit.md" }, "ok", "session_x1\nsession_x2");
test("R1: a --cockpit call does not count as the sweep, at start or at wrap", () => {
  assert.equal(sweepDue(lines(cockpit, cockpitCmd))?.phase, "start");
  assert.equal(sweepDue(lines(cockpit, wrap, cockpitCmd))?.phase, "wrap");
  assert.equal(sweepDue(lines(cockpit, cockpitCmd, sweep)), null, "the real sweep after it still counts");
});
test("R1: a sweep command without --sessions does not count either", () => {
  assert.equal(sweepDue(lines(cockpit, use("Bash", { command: "node /p/hooks/scripts/helper-sweep.mjs --self session_a" }, "ok")))?.phase, "start");
});
test("note 1: the start reason names --keep and --waiting so the parent passes them", () => {
  const r = sweepDue(lines(cockpit)).reason;
  assert.match(r, /--keep/); assert.match(r, /--waiting/); assert.match(r, /--cockpit/);
});

// A1: judge only the last cockpit write that carries a Helpers: line, and only the lines it adds.
const BAD = "- Helpers: Orphans (9) need sidebar";
test("A1: a bad Helpers: line followed by a good correction is not held", () => {
  assert.equal(sweepDue(lines(cockpit, wrap, sweep, cockpitEdit(BAD), cockpitEdit("- Helpers: session_k"))), null);
  assert.equal(sweepDue(lines(cockpit, wrap, sweep, cockpitEdit("- Helpers: session_k"), cockpitEdit(BAD)))?.phase, "helpers", "the LAST one is judged");
});
test("A1: an Edit that keeps an old bad line in old_string and only adds a good one is not held", () => {
  const edit = use("Edit", { file_path: "/v/orchestrator/cockpit.md", old_string: `${BAD}\nnext`, new_string: `${BAD}\n- Helpers: session_k\nnext` }, "ok");
  assert.equal(sweepDue(lines(cockpit, wrap, sweep, edit)), null);
});
test("A1: a Write that re-emits a Helpers: line the session read from the cockpit is not held; a new bad one is", () => {
  const read = use("Read", { file_path: "/v/orchestrator/cockpit.md" }, "ok", `intro\n${BAD}\n`);
  const write = (c) => use("Write", { file_path: "/v/orchestrator/cockpit.md", content: c }, "ok");
  assert.equal(sweepDue(lines(read, wrap, sweep, write(`${BAD}\n- Helpers: session_k\n`))), null);
  assert.equal(sweepDue(lines(read, wrap, sweep, write("- Helpers: 3 left in the sidebar\n")))?.phase, "helpers");
});
test("A1: a cockpit written through Bash (vault-write, heredoc) is judged the same way", () => {
  const sh = (c) => use("Bash", { command: `cat >> /v/orchestrator/cockpit.md <<'EOF'\n${c}\nEOF` }, "ok");
  assert.equal(sweepDue(lines(cockpit, wrap, sweep, sh(BAD)))?.phase, "helpers");
  assert.equal(sweepDue(lines(cockpit, wrap, sweep, sh("- Helpers: session_k"))), null);
});

test("DISC-292: a read-only Bash command naming cockpit.md and Helpers: after the wrap is not a cockpit write; a write form still is", () => {
  const bad = "Helpers: orphans need the sidebar";
  const read = use("Bash", { command: `grep -n "Helpers:" orchestrator/cockpit.md; echo '${bad}'` }, "ok");
  assert.equal(sweepDue(lines(cockpit, wrap, sweep, read)), null, "grep and echo to the terminal write nothing");
  for (const command of [
    `echo '${bad}' >> orchestrator/cockpit.md`,
    `cat >> orchestrator/cockpit.md <<'EOF'\n${bad}\nEOF`,
    `echo '${bad}' | tee -a orchestrator/cockpit.md`,
    `sed -i 's/x/${bad}/' orchestrator/cockpit.md`,
  ]) assert.equal(sweepDue(lines(cockpit, wrap, sweep, use("Bash", { command }, "ok")))?.phase, "helpers", command);
});
