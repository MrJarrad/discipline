#!/usr/bin/env node
/* Stop — DISC-295 (operator 2026-11-12: "all parent / orchestrator agents take a bit more charge over all the items
   that need doing … there isn't much proactivity with builds in progress"; ruling
   orchestrator-takes-charge-of-the-backlog). A rule alone left lanes idle, so this holds the parent's status reply or
   wrap until lane capacity was checked and acted on. In an orchestrator session (no helper marker), a final reply that
   is a status (a `## Needed from you` heading or the `Full list:` line) or follows the wrap skill must come after a
   `lane-capacity.mjs` run this turn. If the latest run printed `UNDER CAPACITY by`, a dispatch (Agent, create_session,
   Workflow) must follow it, or the run is repeated with `--reason <PFX>="why"` for each gap, which exits 0. Held at
   most once (`stop_hook_active` -> allow); any read or parse error -> silent exit 0.                                  */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const blocks = (c) => (Array.isArray(c) ? c : []);
const DISPATCH = /^(Agent|Workflow|mcp__claude-code-remote__create_session)$/;
const STATUS = /^##\s+Needed from you\b|^Full list:/m;

const resultText = (b) => { const c = b?.content; return Array.isArray(c) ? c.map((x) => (typeof x === "string" ? x : x?.text || "")).join("\n") : String(c ?? ""); };

/* The last turn (from the last real user message): the final text, whether the wrap skill ran, and the lane-capacity run. */
export function lastTurn(text) {
  let final = null, wrap = false, runId = null, runOut = null, dispatchedAfter = false;
  for (const line of text.split("\n")) {
    if (!line) continue;
    let e; try { e = JSON.parse(line); } catch { continue; }
    const c = e.message?.content;
    const results = blocks(c).filter((b) => b?.type === "tool_result");
    if (e.type === "user" && !e.isMeta && !results.length) { final = null; wrap = false; runId = null; runOut = null; dispatchedAfter = false; }
    else if (e.type === "user") { for (const b of results) if (b.tool_use_id === runId) runOut = resultText(b); }
    else if (e.type === "assistant") {
      for (const b of blocks(c)) {
        if (b?.type !== "tool_use") continue;
        if (b.name === "Skill" && /(^|:)wrap$/.test(b.input?.skill || "")) wrap = true;
        if (b.name === "Bash" && /lane-capacity\.mjs/.test(b.input?.command || "")) { runId = b.id; runOut = null; dispatchedAfter = false; }
        else if (runId && DISPATCH.test(b.name || "")) dispatchedAfter = true;
      }
      const t = typeof c === "string" ? c : blocks(c).filter((b) => b?.type === "text").map((b) => b.text).join("\n");
      if (t.trim()) final = t;
    }
  }
  return { final, wrap, ran: runId !== null, runOut, dispatchedAfter };
}

export function check({ final, wrap, ran, runOut, dispatchedAfter }) {
  if (!final || /^This session is wrapped/.test(final.trim())) return null;
  if (!wrap && !STATUS.test(final)) return null;
  if (!ran) return "Stop check (DISC-295): a status reply or wrap comes after a lane-capacity check. Write the session's lanes (id, project, state running or waiting-operator, from get_session on each helper) to a file and run `node <plugin>/hooks/scripts/lane-capacity.mjs --vault <vault> --projects <session prefixes> --lanes <file>`; dispatch the rows it lists, then reply.";
  if (/UNDER CAPACITY by/.test(runOut || "") && !dispatchedAfter) return `Stop check (DISC-295): a project is under lane capacity with open agent rows. Dispatch them now (a lane that lands is refilled from the backlog; a parent does not wait for the operator to pick), or rerun lane-capacity.mjs with --reason <PFX>="why this gap is right" for each gap. The check printed:\n${runOut}`;
  return null;
}

function main() {
  let input; try { input = JSON.parse(readFileSync(0, "utf8")); } catch { return; }
  if (input.stop_hook_active || !input.transcript_path) return;
  if (process.env.CLAUDE_CODE_REMOTE === "true") { try { readFileSync(join(homedir(), ".claude", "helper-session")); return; } catch {} }
  let reason; try { reason = check(lastTurn(readFileSync(input.transcript_path, "utf8"))); } catch { return; }
  if (reason) process.stdout.write(JSON.stringify({ decision: "block", reason }));
}

if (process.argv[1]?.endsWith("lane-capacity-stop.mjs")) main();
