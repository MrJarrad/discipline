#!/usr/bin/env node
/* PostToolUse (Agent|Task|TaskCreate|TaskUpdate) — ruling
   `2026-10-02-plan-panel-task-list`: the live task list (the Claude app's
   Plan panel) is standing visibility. When the second Agent dispatch of a
   session lands and no TaskCreate/TaskUpdate has run, inject one reminder via
   `additionalContext`. Never a deny; once per session; silent after any task
   call. State: a small JSON file in the OS tmpdir keyed by `session_id`.
   Usage: fires from hooks.json; dry-run: node task-list-nudge.mjs < input.json */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DISPATCHES = new Set(["Agent", "Task"]);
const TASK_CALLS = new Set(["TaskCreate", "TaskUpdate"]);
export const NUDGE =
  "Task list: two lanes are dispatched and no live task list exists. Call TaskCreate now — one task per operator-level deliverable (not per lane), in_progress while lanes run, completed only when merged/live/answered — so the app's Plan panel shows the work.";

// Pure: next state + message (or null) for one tool event.
export function step(state, toolName) {
  const s = { agents: 0, tasks: false, nudged: false, ...state };
  if (TASK_CALLS.has(toolName)) s.tasks = true;
  else if (DISPATCHES.has(toolName)) s.agents += 1;
  const fire = s.agents >= 2 && !s.tasks && !s.nudged;
  if (fire) s.nudged = true;
  return { state: s, message: fire ? NUDGE : null };
}

function main() {
  let input;
  try { input = JSON.parse(readFileSync(0, "utf8")); } catch { return; }
  const name = input?.tool_name;
  if (!DISPATCHES.has(name) && !TASK_CALLS.has(name)) return;
  const sid = String(input.session_id || "").replace(/[^\w-]/g, "");
  if (!sid) return;
  const file = join(tmpdir(), `discipline-task-nudge-${sid}.json`);
  let prev = {};
  try { if (existsSync(file)) prev = JSON.parse(readFileSync(file, "utf8")); } catch { /* fresh */ }
  const { state, message } = step(prev, name);
  try { writeFileSync(file, JSON.stringify(state)); } catch { /* best effort */ }
  if (message) {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: message },
    }));
  }
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("task-list-nudge.mjs")) main();
