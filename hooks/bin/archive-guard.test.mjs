// archive-guard — DISC-262 (operator 2026-11-07: "we don't archive parent sessions").
// Run: node --test hooks/bin/archive-guard.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const hook = fileURLToPath(new URL("./archive-guard.mjs", import.meta.url));
const run = (session_id, transcriptLines) => {
  const t = join(mkdtempSync(join(tmpdir(), "ag-")), "t.jsonl");
  writeFileSync(t, transcriptLines.map((l) => JSON.stringify(l)).join("\n"));
  const r = spawnSync(process.execPath, [hook], { input: JSON.stringify({ tool_name: "mcp__claude-code-remote__archive_session", tool_input: { session_id }, transcript_path: t }), encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim() ? JSON.parse(r.stdout).hookSpecificOutput : null;
};
const call = (name, input, result, id = "c1") => [
  { message: { content: [{ type: "tool_use", id, name: `mcp__claude-code-remote__${name}`, input }] } },
  { message: { content: [{ type: "tool_result", tool_use_id: id, content: [{ type: "text", text: JSON.stringify(result) }] }] } },
];
const sess = (id, title, parent) => ({ id, title, parent_session_id: parent });

test("a session whose get_session title starts 'Helper ·' and has a parent may be archived", () => {
  const d = run("session_h1", call("get_session", { session_id: "session_h1" }, { ccr: sess("session_h1", "Helper · portfolio fix — no action needed", "session_p") }));
  assert.equal(d, null);
});

test("a helper listed in a list_sessions page may be archived", () => {
  const page = { ccr: { data: [sess("session_p", "portfolio · 7 Nov (wrapped)"), sess("session_h2", "Helper · x — no action needed", "session_p")] } };
  assert.equal(run("session_h2", call("list_sessions", {}, page)), null);
});

test("a parent session is denied, wrapped or not", () => {
  for (const title of ["portfolio · 7 Nov ← talk here", "portfolio · 7 Nov (wrapped)"]) {
    const d = run("session_p", call("get_session", {}, { ccr: sess("session_p", title) }));
    assert.equal(d?.permissionDecision, "deny");
    assert.match(d.permissionDecisionReason, /parent/i);
  }
});

test("a session whose title the transcript never showed is denied, naming get_session", () => {
  const d = run("session_unknown", []);
  assert.equal(d?.permissionDecision, "deny");
  assert.match(d.permissionDecisionReason, /get_session/);
});

test("a 'Helper ·' title with no parent is not a helper (denied)", () => {
  const d = run("session_h3", call("get_session", {}, { ccr: sess("session_h3", "Helper · odd") }));
  assert.equal(d?.permissionDecision, "deny");
});

test("unreadable input fails closed", () => {
  const r = spawnSync(process.execPath, [hook], { input: "not json", encoding: "utf8" });
  assert.equal(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision, "deny");
});
