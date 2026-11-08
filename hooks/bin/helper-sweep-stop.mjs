#!/usr/bin/env node
/* Stop — DISC-262 (operator 2026-11-07: "there's a lot of helpers" … "there was meant to be something in
   discipline that handles all this"). HARD-RULES 19's helper sweep ran only when the parent remembered; s60's
   wrap and s61's start skipped it and nine finished helpers stayed open. A hook cannot call list_sessions or
   archive_session (MCP tools), so this makes the parent run them:
   an orchestrator session (it Read orchestrator/cockpit.md, or ran the wrap skill) that has not run
   helper-sweep.mjs successfully is blocked, once per session and phase (start, wrap): the retry and every
   later turn pass. At wrap the sweep must come after the wrap skill. A sweep counts only when its Bash call
   returned without is_error. A helper session (marker file, as parent-return-stop) is never checked. No
   SessionStart seed: the marker is written after SessionStart, so a seed would tell helpers to archive
   (review A1). Any read or parse error -> silent exit 0.                                                  */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";

const blocks = (e) => (Array.isArray(e?.message?.content) ? e.message.content : []);
const REPOINT_HOLDS = 3;
const SWEEP = "node <plugin>/hooks/scripts/helper-sweep.mjs --self <own id> --sessions <saved get_session/list_sessions files> --landed <session-dir>/landed-helpers";

/* Session ids listed under the sweep output's "## Re-point" heading (the tool_result content is text or text parts). */
function repointIds(content) {
  const text = Array.isArray(content) ? content.map((c) => (typeof c === "string" ? c : c?.text || "")).join("\n") : String(content ?? "");
  const at = text.indexOf("## Re-point");
  return at < 0 ? [] : [...text.slice(at).matchAll(/^- (session_\w+) \|/gm)].map((m) => m[1]);
}

/* null when no sweep is due, else { phase: "start"|"wrap", reason }. Lines are transcript JSONL. */
export function sweepDue(lines) {
  let cockpit = false, wrapAt = -1, sweepAt = -1, i = 0, repoint = [];
  const sweeps = new Map(); // tool_use id -> position
  const sent = []; // { id, at }: send_message targets (DISC-268: the re-point messages)
  for (const line of lines) {
    i++;
    let e; try { e = JSON.parse(line); } catch { continue; }
    for (const p of blocks(e)) {
      if (p?.type === "tool_use") {
        const inp = p.input || {};
        if (p.name === "Read" && /orchestrator\/cockpit\.md$/.test(inp.file_path || "")) cockpit = true;
        if (p.name === "Skill" && /(^|:)wrap$/.test(inp.skill || "")) wrapAt = i;
        if (p.name === "Bash" && /helper-sweep\.mjs/.test(inp.command || "")) sweeps.set(p.id, i);
        if (/send_message$/.test(p.name || "") && inp.session_id) sent.push({ id: String(inp.session_id), at: i });
      } else if (p?.type === "tool_result" && sweeps.has(p.tool_use_id) && !p.is_error) {
        if (sweeps.get(p.tool_use_id) >= sweepAt) repoint = repointIds(p.content);
        sweepAt = Math.max(sweepAt, sweeps.get(p.tool_use_id));
      }
    }
  }
  if (!cockpit && wrapAt < 0) return null;
  if (wrapAt >= 0) return sweepAt > wrapAt ? null : { phase: "wrap", reason: `Stop check (DISC-262): the wrap skill ran but the helper sweep has not run successfully after it. Save list_sessions (every page) to files, run ${SWEEP} --keep <…> --merged <…>, call archive_session on each Archive row, and put the Keep and Surface ids on the cockpit wrap block's Helpers: line (HARD-RULES 19).` };
  if (sweepAt >= 0) {
    // DISC-268: a sweep that lists helpers to re-point is finished only when each has been sent its message.
    const pending = repoint.filter((id) => !sent.some((s) => s.id === id && s.at > sweepAt));
    return pending.length ? { phase: "repoint", reason: `Stop check (DISC-268): the helper sweep lists helpers still pointed at a wrapped parent. Send each its re-point message with send_message (the \`message\` text under "## Re-point" in the sweep output) — still unsent: ${pending.join(", ")}.` } : null;
  }
  return { phase: "start", reason: `Stop check (DISC-262): this orchestrator session has not run the helper sweep. Call get_session on the ids in the cockpit's Helpers: line, save each result, run ${SWEEP}, and call archive_session on each Archive row (HARD-RULES 19).` };
}

function isHelper() {
  if (process.env.CLAUDE_CODE_REMOTE !== "true") return false;
  try { readFileSync(join(homedir(), ".claude", "helper-session"), "utf8"); return true; } catch { return false; }
}

function main() {
  if (isHelper()) return;
  let input; try { input = JSON.parse(readFileSync(0, "utf8")); } catch { return; }
  if (!input.transcript_path) return;
  let due; try { due = sweepDue(readFileSync(input.transcript_path, "utf8").split("\n").filter(Boolean)); } catch { return; }
  if (!due) return;
  const key = String(input.session_id || basename(input.transcript_path)).replace(/[^\w.-]/g, "_");
  const state = join(homedir(), ".claude", "helper-sweep-stop", `${key}.${due.phase}`);
  /* start and wrap are told once per session. The re-point hold repeats while rows stay unsent, at most
     REPOINT_HOLDS times, so a helper that cannot be reached cannot trap the session (review of #150, A2). */
  let held = 0;
  if (existsSync(state)) {
    if (due.phase !== "repoint") return;
    held = parseInt(readFileSync(state, "utf8"), 10) || 0;
    if (held >= REPOINT_HOLDS) return;
  }
  try { mkdirSync(join(homedir(), ".claude", "helper-sweep-stop"), { recursive: true }); writeFileSync(state, due.phase === "repoint" ? String(held + 1) : new Date().toISOString()); } catch { return; }
  process.stdout.write(JSON.stringify({ decision: "block", reason: due.reason }));
}

if (process.argv[1]?.endsWith("helper-sweep-stop.mjs")) main();
