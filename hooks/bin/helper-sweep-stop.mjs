#!/usr/bin/env node
/* SessionStart ("start") and Stop — DISC-262 (operator 2026-11-07: "there's a lot of helpers" … "there was meant
   to be something in discipline that handles all this"). HARD-RULES 19's helper sweep ran only when the parent
   remembered; s60's wrap and s61's start skipped it and nine finished helpers stayed open.
   A hook cannot call list_sessions or archive_session (MCP tools), so this makes the parent run them:
   - start: seeds additionalContext with the start-sweep step (non-helper sessions only).
   - Stop: an orchestrator session (it read orchestrator/cockpit.md) that has not run helper-sweep.mjs is
     blocked once; after the wrap skill ran, the sweep must come after it. A helper session (marker file, as
     parent-return-stop) is never checked. Blocks at most once (stop_hook_active -> allow); any read or parse
     error -> silent exit 0.                                                                                   */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const blocks = (e) => (Array.isArray(e?.message?.content) ? e.message.content : []);
const SWEEP = "node <plugin>/hooks/scripts/helper-sweep.mjs --self <own id> --sessions <saved get_session/list_sessions files>";

/* null when no sweep is due, else the instruction. Lines are transcript JSONL. */
export function sweepDue(lines) {
  let cockpit = false, wrapAt = -1, sweepAt = -1, i = 0;
  for (const line of lines) {
    i++;
    let e; try { e = JSON.parse(line); } catch { continue; }
    for (const p of blocks(e)) {
      if (p?.type !== "tool_use") continue;
      const inp = p.input || {};
      if (p.name === "Read" && /orchestrator\/cockpit\.md$/.test(inp.file_path || "")) cockpit = true;
      if (p.name === "Bash" && /cockpit\.md/.test(inp.command || "")) cockpit = true;
      if (p.name === "Skill" && /(^|:)wrap$/.test(inp.skill || "")) wrapAt = i;
      if (p.name === "Bash" && /helper-sweep\.mjs/.test(inp.command || "")) sweepAt = i;
    }
  }
  if (!cockpit && wrapAt < 0) return null;
  if (wrapAt >= 0 && sweepAt < wrapAt) return `Stop check (DISC-262): the wrap skill ran but the helper sweep did not run after it. Save list_sessions (every page) to files, run ${SWEEP} --keep <…> --merged <…>, call archive_session on each Archive row, and put the Keep and Surface ids on the cockpit wrap block's Helpers: line (HARD-RULES 19).`;
  if (wrapAt < 0 && sweepAt < 0) return `Stop check (DISC-262): this orchestrator session has not run the helper sweep. Call get_session on the ids in the cockpit's Helpers: line, save each result, run ${SWEEP}, and call archive_session on each Archive row (HARD-RULES 19).`;
  return null;
}

function isHelper() {
  if (process.env.CLAUDE_CODE_REMOTE !== "true") return false;
  try { readFileSync(join(homedir(), ".claude", "helper-session"), "utf8"); return true; } catch { return false; }
}

function main() {
  if (isHelper()) return;
  if (process.argv[2] === "start") {
    console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: `Helper sweep (DISC-262, HARD-RULES 19): before other work, get_session on the ids in the cockpit wrap block's Helpers: line, save each result, run ${SWEEP}, archive each Archive row, send each Re-point message. Only "Helper ·" sessions are ever archived.` } }));
    return;
  }
  let input; try { input = JSON.parse(readFileSync(0, "utf8")); } catch { return; }
  if (input.stop_hook_active || !input.transcript_path) return;
  let reason; try { reason = sweepDue(readFileSync(input.transcript_path, "utf8").split("\n").filter(Boolean)); } catch { return; }
  if (reason) process.stdout.write(JSON.stringify({ decision: "block", reason }));
}

if (process.argv[1]?.endsWith("helper-sweep-stop.mjs")) main();
