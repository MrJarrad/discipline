#!/usr/bin/env node
/* Stop — DISC-336 (operator 2026-11-15: "picking up new tasks when tasks get completed ... pretty autonomous by you";
   ruling 2026-11-15-s91-autonomous-backlog-throughput). lane-capacity-stop (DISC-295) only looks at status replies and
   wraps, so a lane that landed on a wake slipped past it. This holds the end of a turn that a wake started, or in which a
   lane closed (lane-end.mjs ran, or get_session read a helper `completed`), until `next-row.mjs` ran this turn. If the
   latest run printed `UNDER TARGET by`, a dispatch (Agent, create_session, Workflow) must follow it, or the run is
   repeated with `--reason "why"`, which exits 0. Held at most once (stop_hook_active -> allow); a read or parse error, no
   vault, a wrapped session, or a cloud helper (marker file) -> silent exit 0. Own file and functions: it shares nothing with
   lane-capacity-stop.mjs or helper-sweep-stop.mjs.
   What it enforces (review of #225, AMBER 1): the FIRST hold. The usual flow is wake, no run, first Stop blocks, the parent runs
   next-row.mjs and sees UNDER TARGET; that second Stop arrives with stop_hook_active and is allowed, so starting the rows is
   not checked there. The first hold's reason therefore says "run it AND start its rows now"; the dispatch check below bites
   only when the parent ran next-row.mjs before the first Stop.
   A lane "landing" (AMBER 3): `lane-end.mjs --helper` (a bare `lane-end.mjs --id` only strikes a row an operator answered), or a
   helper read `completed` by get_session that no earlier turn already read completed. */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { resolveVault, stopVerdict } from "../scripts/lib/resolve-vault.mjs";

const WAKE = /<wake\b|<task-notification\b|<cross-session-message\b/;
const DISPATCH = /^(Agent|Workflow|mcp__claude-code-remote__create_session)$/;
const blocks = (c) => (Array.isArray(c) ? c : []);
const resultText = (b) => { const c = b?.content; return Array.isArray(c) ? c.map((x) => (typeof x === "string" ? x : x?.text || "")).join("\n") : String(c ?? ""); };

export function lastTurn(text) {
  let final = null, trigger = false, runId = null, runOut = null, dispatchedAfter = false;
  const sessionCalls = new Map(); // tool_use id -> helper session id
  const seen = new Set(), turnSeen = new Set(); // helpers read completed in earlier turns / in this one
  for (const line of text.split("\n")) {
    if (!line) continue;
    let e; try { e = JSON.parse(line); } catch { continue; }
    const c = e.message?.content;
    const results = blocks(c).filter((b) => b?.type === "tool_result");
    if (e.type === "user" && !e.isMeta && !results.length) {
      final = null; runId = null; runOut = null; dispatchedAfter = false; sessionCalls.clear();
      turnSeen.forEach((x) => seen.add(x)); turnSeen.clear();
      trigger = WAKE.test(typeof c === "string" ? c : blocks(c).map((b) => b?.text || "").join("\n"));
    } else if (e.type === "user") {
      for (const b of results) {
        if (b.tool_use_id === runId) runOut = resultText(b);
        const helper = sessionCalls.get(b.tool_use_id);
        if (helper && /"status_bucket"\s*:\s*"(?:SESSION_STATUS_BUCKET_)?completed"/i.test(resultText(b))) { if (!seen.has(helper)) trigger = true; turnSeen.add(helper); }
      }
    } else if (e.type === "assistant") {
      for (const b of blocks(c)) {
        if (b?.type !== "tool_use") continue;
        const cmd = b.input?.command || "";
        if (b.name === "Bash" && /next-row\.mjs/.test(cmd)) { runId = b.id; runOut = null; dispatchedAfter = false; }
        else if (b.name === "Bash" && /lane-end\.mjs/.test(cmd) && /--helper\b/.test(cmd)) trigger = true;
        else if (b.name === "mcp__claude-code-remote__get_session" && b.input?.session_id) sessionCalls.set(b.id, b.input.session_id);
        else if (runId && DISPATCH.test(b.name || "")) dispatchedAfter = true;
      }
      const t = typeof c === "string" ? c : blocks(c).filter((b) => b?.type === "text").map((b) => b.text).join("\n");
      if (t.trim()) final = t;
    }
  }
  return { final, trigger, ran: runId !== null, runOut, dispatchedAfter };
}

export function check({ final, trigger, ran, runOut, dispatchedAfter }) {
  if (!trigger || (final && /^This session is wrapped/.test(final.trim()))) return null;
  if (!ran) return "Stop check (DISC-336): a lane landed or a wake arrived, and doers may be under target. Write the session's lanes (id, project, state running or waiting-operator, role doer or reviewer, rows held; from get_session on each helper) to a file, run `node <plugin>/hooks/scripts/next-row.mjs --vault <vault> --projects <session prefixes> --lanes <file>` AND start the rows it prints now (create_session, one helper per entry), or rerun it with --reason \"why this gap is right\". This check holds the turn once: the second stop is not checked, so starting the rows is your act, not the hook's.";
  if (/UNDER TARGET by/.test(runOut || "") && !dispatchedAfter) return `Stop check (DISC-336): doers are under target with agent-doable rows ready. Start them now (create_session, one helper per entry; the next row starts when a lane lands, the parent does not wait to be asked), or rerun next-row.mjs with --reason "why this gap is right". The check printed:\n${runOut}`;
  return null;
}

function main() {
  let input; try { input = JSON.parse(readFileSync(0, "utf8")); } catch { return; }
  if (input.stop_hook_active || !input.transcript_path) return;
  const found = resolveVault(); if (!found) return;
  if (process.env.CLAUDE_CODE_REMOTE === "true") { try { readFileSync(join(homedir(), ".claude", "helper-session")); return; } catch {} }
  let reason; try { reason = check(lastTurn(readFileSync(input.transcript_path, "utf8"))); } catch { return; }
  if (reason) process.stdout.write(JSON.stringify(stopVerdict(reason, found.via)));
}

if (process.argv[1]?.endsWith("next-row-stop.mjs")) main();
