#!/usr/bin/env node
/* PostToolUse (Bash|get_session) — DISC-336 (ruling 2026-11-15-s91-autonomous-backlog-throughput): the moment a lane
   lands, tell the parent to run next-row.mjs and start what it prints. A lane landing is `lane-end.mjs` running (the
   lane-close step, DISC-325) or `get_session` on a helper reading `completed`. A hook cannot see the lanes, so it names the
   command; next-row-stop.mjs is what refuses to let the turn end without it. Orchestrator only: a subagent's call
   (`agent_id`) and a get_session with no session_id (the session itself) are ignored. Never a deny. */
import { readFileSync } from "node:fs";

export const NUDGE = "A lane landed. Doers may be under target: write the lanes (id, project, state, role, rows held) to a file and run `node <plugin>/hooks/scripts/next-row.mjs --vault <vault> --projects <session prefixes> --lanes <file>`, then start the rows it prints (create_session, one helper per entry) before replying.";
const respText = (r) => (typeof r === "string" ? r : JSON.stringify(r ?? ""));

export function handle(input) {
  if (input?.agent_id) return null;
  const name = input?.tool_name;
  if (name === "Bash") return /lane-end\.mjs/.test(input.tool_input?.command || "") ? NUDGE : null;
  if (name === "mcp__claude-code-remote__get_session") {
    if (!input.tool_input?.session_id) return null;
    return /status_bucket\\?"\s*:\s*\\?"(?:SESSION_STATUS_BUCKET_)?completed/i.test(respText(input.tool_response)) ? NUDGE : null;
  }
  return null;
}

function main() {
  let input; try { input = JSON.parse(readFileSync(0, "utf8")); } catch { return; }
  const message = handle(input);
  if (message) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: message } }));
}
if (process.argv[1]?.endsWith("lane-landed-nudge.mjs")) main();
