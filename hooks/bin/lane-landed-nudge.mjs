#!/usr/bin/env node
/* PostToolUse (Bash|get_session) — DISC-336 (ruling 2026-11-15-s91-autonomous-backlog-throughput): the moment a lane
   lands, tell the parent to run next-row.mjs and start what it prints. A lane landing is `lane-end.mjs --helper` running (the
   lane-close step, DISC-325; a bare `lane-end.mjs --id` only strikes a row an operator answered) or `get_session` on a helper
   reading `completed` for the first time this session (a marker per helper id, exclusive-create; review of #225, AMBER 3). A hook cannot see the lanes, so it names the
   command; next-row-stop.mjs is what refuses to let the turn end without it. Orchestrator only: a subagent's call
   (`agent_id`) and a get_session with no session_id (the session itself) are ignored. Never a deny. */
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const NUDGE = "A lane landed. Doers may be under target: write the lanes (id, project, state, role, rows held) to a file and run `node <plugin>/hooks/scripts/next-row.mjs --vault <vault> --projects <session prefixes> --lanes <file>`, then start the rows it prints (create_session, one helper per entry) before replying.";
const respText = (r) => (typeof r === "string" ? r : JSON.stringify(r ?? ""));

export function handle(input, dir = tmpdir()) {
  if (input?.agent_id) return null;
  const name = input?.tool_name;
  if (name === "Bash") { const c = input.tool_input?.command || ""; return /lane-end\.mjs/.test(c) && /--helper\b/.test(c) ? NUDGE : null; }
  if (name === "mcp__claude-code-remote__get_session") {
    if (!input.tool_input?.session_id) return null;
    if (!/status_bucket\\?"\s*:\s*\\?"(?:SESSION_STATUS_BUCKET_)?completed/i.test(respText(input.tool_response))) return null;
    const key = `${input.session_id || "s"}-${input.tool_input.session_id}`.replace(/[^\w-]/g, "");
    try { writeFileSync(join(dir, `discipline-landed-${key}`), "1", { flag: "wx" }); } catch { return null; } // already swept
    return NUDGE;
  }
  return null;
}

function main() {
  let input; try { input = JSON.parse(readFileSync(0, "utf8")); } catch { return; }
  const message = handle(input);
  if (message) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: message } }));
}
if (process.argv[1]?.endsWith("lane-landed-nudge.mjs")) main();
