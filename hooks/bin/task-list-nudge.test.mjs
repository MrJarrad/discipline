import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handle, NUDGE } from "./task-list-nudge.mjs";

const fresh = () => mkdtempSync(join(tmpdir(), "task-nudge-"));
const ev = (tool_name, extra = {}) => ({ session_id: "s1", tool_name, ...extra });

test("nudges on the first dispatch with no task call, once", () => {
  const d = fresh();
  assert.equal(handle(ev("Agent"), d), NUDGE);
  assert.equal(handle(ev("Agent"), d), null);
  rmSync(d, { recursive: true });
});

test("silent once the orchestrator has made a task call", () => {
  const d = fresh();
  handle(ev("TaskCreate"), d);
  assert.equal(handle(ev("Agent"), d), null);
  rmSync(d, { recursive: true });
});

test("a subagent's own dispatch is not nudged and its TaskCreate does not silence the orchestrator", () => {
  const d = fresh();
  assert.equal(handle(ev("Agent", { agent_id: "a1" }), d), null);
  handle(ev("TaskCreate", { agent_id: "a1" }), d);
  assert.equal(handle(ev("Agent"), d), NUDGE);
  rmSync(d, { recursive: true });
});

test("concurrent first dispatches nudge at most once", async () => {
  const d = fresh();
  const script = new URL("./task-list-nudge.mjs", import.meta.url).pathname;
  const run = () => new Promise((res) => {
    const p = spawnSync("node", [script], { input: JSON.stringify(ev("Agent")), encoding: "utf8", env: { ...process.env, TMPDIR: d } });
    res(p.stdout);
  });
  const outs = await Promise.all(Array.from({ length: 6 }, run));
  assert.equal(outs.filter(Boolean).length, 1);
  assert.match(JSON.parse(outs.find(Boolean)).hookSpecificOutput.additionalContext, /TaskCreate/);
  rmSync(d, { recursive: true });
});
