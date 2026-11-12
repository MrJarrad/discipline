#!/usr/bin/env node
/* Stop — DISC-216 (operator 2026-10-29: "do we need to fix something in
   discplines so helpers are communicating better?"). Helper sessions made by
   create_session finished their turn and went idle without send_message, so
   the return sat unread until a parent check-in (s37 ~8h). A shell hook cannot
   call send_message (an MCP tool), so this one makes the helper do it: in a
   helper session, a turn whose final reply is a return and which made no
   claude-code-remote send_message is blocked once with an instruction to send
   it to the parent. A helper is marked by HELPER_MARKER, which the brief's
   first step writes with the parent's session id; each cloud session has its
   own container, so the file marks this session only. No env var marks a
   helper: CLAUDE_CODE_CHILD_SESSION=1 is set in the orchestrator too (parent,
   2026-10-29), and the entrypoint only says "not desktop". On a Mac every
   local session shares one home folder, so the marker counts only when
   CLAUDE_CODE_REMOTE=true (DISC-217). An isMeta user entry (a skill load) is
   not a new turn, so it does not reset `sent` (DISC-217).
   A tiny ack (under ACK_MAX characters with no `next: parent` line) is let
   through so it does not wake the parent for nothing; `next: parent` always
   counts as a return. DISC-294 (s79 lesson 3): a turn that a wake event started
   (`<wake ...>`: a GitHub bot edit, a green check suite) is a return only when it
   made a state change (an edit, a git push or commit, a GitHub write) or says
   `next: parent`; otherwise a helper waiting on the operator would message the
   parent "no change" on every event. Blocks at most once (`stop_hook_active` -> allow);
   any read or parse error -> silent exit 0.                                */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const ACK_MAX = 200;
export const HELPER_MARKER = join(".claude", "helper-session");
const SEND = /^mcp__claude-code-remote__send_message$/;
const NEXT_PARENT = /next:\s*parent/i;

const WAKE = /<wake\b/;
const MUTATING_TOOL = /^(Edit|Write|NotebookEdit)$|^mcp__github__(create_|update_|merge_|push_files|delete_|add_|issue_write|pull_request_review_write)/;
const MUTATING_BASH = /\bgit\s+(push|commit)\b/;

const blocks = (c) => (Array.isArray(c) ? c : []);
const isToolResult = (c) => blocks(c).some((b) => b?.type === "tool_result");

/* The last assistant text since the last real user message, and whether that turn called send_message. */
export function lastTurn(transcriptText) {
  let text = null, sent = false, wake = false, changed = false;
  for (const line of transcriptText.split("\n")) {
    if (!line) continue;
    let e; try { e = JSON.parse(line); } catch { continue; }
    const c = e.message?.content;
    if (e.type === "user" && !e.isMeta && !isToolResult(c)) {
      text = null; sent = false; changed = false;
      wake = WAKE.test(typeof c === "string" ? c : blocks(c).map((b) => b?.text || "").join("\n"));
    }
    else if (e.type === "assistant") {
      if (blocks(c).some((b) => b?.type === "tool_use" && SEND.test(b.name || ""))) sent = true;
      if (blocks(c).some((b) => b?.type === "tool_use" && (MUTATING_TOOL.test(b.name || "") || (b.name === "Bash" && MUTATING_BASH.test(b.input?.command || ""))))) changed = true;
      const t = typeof c === "string" ? c : blocks(c).filter((b) => b?.type === "text").map((b) => b.text).join("\n");
      if (t.trim()) text = t;
    }
  }
  return { text, sent, quiet: wake && !changed };
}

export function check({ text, sent, quiet = false, parent, self }) {
  if (sent || !text) return null;
  if (text.trim().length < ACK_MAX && !NEXT_PARENT.test(text)) return null;
  if (quiet && !NEXT_PARENT.test(text)) return null;
  // DISC-240: a marker holding the helper's own id is not a parent; fall back to @parent.
  const to = /^session_\w+$/.test(parent) && parent !== self ? `"${parent}"` : `"@parent"`;
  return `Stop check (DISC-216): this is a helper session and this turn's return has not reached the parent. Send the full return with send_message (claude-code-remote; session_id ${to}), then end the turn.`;
}

function main() {
  if (process.env.CLAUDE_CODE_REMOTE !== "true") return;
  let parent; try { parent = readFileSync(join(homedir(), HELPER_MARKER), "utf8").trim(); } catch { return; }
  let input; try { input = JSON.parse(readFileSync(0, "utf8")); } catch { return; }
  if (input.stop_hook_active || !input.transcript_path) return;
  let reason; try { reason = check({ ...lastTurn(readFileSync(input.transcript_path, "utf8")), parent, self: input.session_id }); } catch { return; }
  if (reason) process.stdout.write(JSON.stringify({ decision: "block", reason }));
}

if (process.argv[1]?.endsWith("parent-return-stop.mjs")) main();
