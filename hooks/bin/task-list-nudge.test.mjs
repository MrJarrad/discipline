import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { step, NUDGE } from "./task-list-nudge.mjs";

const run = (sid, tool) => spawnSync("node", [new URL("./task-list-nudge.mjs", import.meta.url).pathname],
  { input: JSON.stringify({ session_id: sid, tool_name: tool }), encoding: "utf8" }).stdout;

test("nudges on the second dispatch with no task call, once", () => {
  let r = step({}, "Agent"); assert.equal(r.message, null);
  r = step(r.state, "Agent"); assert.equal(r.message, NUDGE);
  r = step(r.state, "Agent"); assert.equal(r.message, null);
});

test("silent once a task call has run", () => {
  let r = step({}, "TaskCreate");
  r = step(r.state, "Agent"); r = step(r.state, "Agent");
  assert.equal(r.message, null);
});

test("TaskCreate is not counted as a dispatch", () => {
  let r = step({}, "Agent"); r = step(r.state, "TaskUpdate");
  assert.equal(r.message, null);
});

test("CLI emits additionalContext on the second dispatch and persists state", () => {
  const sid = `t${process.pid}`;
  try {
    assert.equal(run(sid, "Agent"), "");
    const out = JSON.parse(run(sid, "Agent"));
    assert.match(out.hookSpecificOutput.additionalContext, /TaskCreate/);
    assert.equal(run(sid, "Agent"), "");
  } finally { rmSync(join(tmpdir(), `discipline-task-nudge-${sid}.json`), { force: true }); }
});
