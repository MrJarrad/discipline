// 1.162.0: DISC-224 — what a session start puts in context, measured from the transcript,
// through the first status reply (the first assistant text carrying `## Needed from you`).
// Run: node --test hooks/scripts/start-cost.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const bin = join(dirname(fileURLToPath(import.meta.url)), "start-cost.mjs");
const dir = mkdtempSync(join(tmpdir(), "start-cost-"));
let n = 0;
const A = (content) => ({ type: "assistant", message: { role: "assistant", content } });
const U = (content) => ({ type: "user", message: { role: "user", content } });
const use = (id, name, input = {}) => ({ type: "tool_use", id, name, input });
const res = (id, chars) => ({ type: "tool_result", tool_use_id: id, content: [{ type: "text", text: "x".repeat(chars) }] });
const file = (lines) => { const p = join(dir, `t${n++}.jsonl`); writeFileSync(p, lines.map((l) => JSON.stringify(l)).join("\n") + "\n"); return p; };
const run = (...a) => spawnSync(process.execPath, [bin, ...a], { encoding: "utf8" });

const session = () => file([
  U("let's continue portfolio"),
  A([use("1", "mcp__claude-code-remote__list_sessions", { limit: 40 })]), U([res("1", 25000)]),
  A([use("2", "Bash", { command: "node session-resume.mjs /v" })]), U([res("2", 6000)]),
  A([use("3", "mcp__github__pull_request_read", { method: "get_files", pullNumber: 353 })]), U([res("3", 9000)]),
  A([{ type: "text", text: "Status.\n\n## Needed from you\n\n1. **PF-1** …" }]),
  A([use("4", "Bash", { command: "git log" })]), U([res("4", 99999)]),
]);

test("counts tool results only up to the first status reply, grouped by tool, largest first", () => {
  const r = run(session(), "--json");
  assert.equal(r.status, 0, r.stderr);
  const j = JSON.parse(r.stdout);
  assert.equal(j.reachedStatus, true);
  assert.equal(j.toolResultChars, 40000);
  assert.deepEqual(j.byTool.map((x) => [x.tool, x.chars]), [["list_sessions", 25000], ["pull_request_read get_files", 9000], ["Bash", 6000]]);
});

test("--max fails the run when tool results through the first status reply exceed it", () => {
  assert.equal(run(session(), "--max", "50000").status, 0);
  const r = run(session(), "--max", "30000");
  assert.equal(r.status, 1);
  assert.match(r.stdout, /40000 chars of tool results before the first status reply; the budget is 30000/);
});

test("a transcript with no status reply says so and counts everything", () => {
  const p = file([A([use("1", "Bash", { command: "ls" })]), U([res("1", 10)])]);
  const j = JSON.parse(run(p, "--json").stdout);
  assert.equal(j.reachedStatus, false);
  assert.equal(j.toolResultChars, 10);
});
