#!/usr/bin/env node
/* PostToolUse (Agent|Task|TaskCreate|TaskUpdate) — ruling
   `2026-10-02-plan-panel-task-list`: the live task list (the Claude app's
   Plan panel) is standing visibility in every session that does work. When
   the first Agent dispatch of a session lands and no TaskCreate/TaskUpdate
   has run, inject one reminder via `additionalContext`. Never a deny.
   Orchestrator only: a hook input carrying `agent_id` is a subagent's own
   call and is ignored (it neither nudges nor counts as the orchestrator's
   task list). At-most-once: two marker files in the OS tmpdir keyed by
   `session_id`; the nudge marker is created with exclusive-create (`wx`), so
   concurrent dispatches cannot both nudge.
   Usage: fires from hooks.json; dry-run: node task-list-nudge.mjs < input.json */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DISPATCHES = new Set(["Agent", "Task"]);
const TASK_CALLS = new Set(["TaskCreate", "TaskUpdate"]);
export const NUDGE =
  "Task list: a lane is dispatched and no live task list exists. Call TaskCreate now — one task per operator-level deliverable (not per lane), in_progress while lanes run, completed only when merged/live/answered — so the app's Plan panel shows the work.";

// Returns the nudge message for one hook input, or null. Side effects: markers.
export function handle(input, dir = tmpdir()) {
  const name = input?.tool_name;
  if (input?.agent_id) return null;
  if (!DISPATCHES.has(name) && !TASK_CALLS.has(name)) return null;
  const sid = String(input.session_id || "").replace(/[^\w-]/g, "");
  if (!sid) return null;
  const tasks = join(dir, `discipline-task-nudge-${sid}.tasks`);
  const nudged = join(dir, `discipline-task-nudge-${sid}.nudged`);
  if (TASK_CALLS.has(name)) {
    try { writeFileSync(tasks, "1"); } catch { /* best effort */ }
    return null;
  }
  if (existsSync(tasks)) return null;
  try { writeFileSync(nudged, "1", { flag: "wx" }); } catch { return null; }
  return NUDGE;
}

function main() {
  let input;
  try { input = JSON.parse(readFileSync(0, "utf8")); } catch { return; }
  const message = handle(input);
  if (message) {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: message },
    }));
  }
}

if (process.argv[1]?.endsWith("task-list-nudge.mjs")) main();
