// vault-mcp-write-guard — DISC-221 L6 (lesson 2026-10-31-s43 #6): a helper's
// create_or_update_file replaced a vault file with an 8-byte placeholder.
// Run: node --test hooks/bin/vault-mcp-write-guard.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const hook = fileURLToPath(new URL("./vault-mcp-write-guard.mjs", import.meta.url));
const SHA = "0123456789abcdef0123456789abcdef01234567";
const run = (tool_input, transcriptLines = []) => {
  const t = join(mkdtempSync(join(tmpdir(), "vmwg-")), "t.jsonl");
  writeFileSync(t, transcriptLines.map((l) => JSON.stringify(l)).join("\n"));
  const r = spawnSync(process.execPath, [hook], { input: JSON.stringify({ tool_name: "mcp__github__create_or_update_file", tool_input, transcript_path: t }), encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim() ? JSON.parse(r.stdout).hookSpecificOutput : null;
};
const vault = (extra) => ({ owner: "MrJarrad", repo: "jhd-vault", path: "projects/p/notes.md", branch: "claude/x", message: "m", ...extra });
const readOf = (path, text) => [
  { message: { content: [{ type: "tool_use", id: "r1", name: "mcp__github__get_file_contents", input: { owner: "MrJarrad", repo: "jhd-vault", path } }] } },
  { message: { content: [{ type: "tool_result", tool_use_id: "r1", content: [{ type: "text", text }] }] } },
];

test("an 8-byte update of an existing vault file is denied, naming the floor", () => {
  const d = run(vault({ content: "restored", sha: SHA }));
  assert.equal(d?.permissionDecision, "deny");
  assert.match(d.permissionDecisionReason, /256 bytes/);
});

test("a full-size update is allowed; a new small file (no sha) is allowed; another repo is not checked", () => {
  assert.equal(run(vault({ content: "x".repeat(4000), sha: SHA })), null);
  assert.equal(run(vault({ content: "tiny", path: "projects/p/new.md" })), null);
  assert.equal(run({ ...vault({ content: "tiny", sha: SHA }), repo: "discipline" }), null);
});

test("an update under half the size this session last read of that path is denied", () => {
  const lines = readOf("projects/p/notes.md", "y".repeat(4000));
  const d = run(vault({ content: "z".repeat(1000), sha: SHA }), lines);
  assert.equal(d?.permissionDecision, "deny");
  assert.match(d.permissionDecisionReason, /4000/);
  assert.equal(run(vault({ content: "z".repeat(3000), sha: SHA }), lines), null);
  assert.equal(run(vault({ content: "z".repeat(1000), sha: SHA, path: "projects/p/other.md" }), lines), null);
});

test("unreadable input denies for safety (fails closed)", () => {
  const r = spawnSync(process.execPath, [hook], { input: "not json", encoding: "utf8" });
  assert.equal(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision, "deny");
});
