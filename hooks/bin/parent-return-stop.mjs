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
   made a state change (an edit, a git push or commit, a GitHub write, including `gh api` POST/PUT/PATCH/DELETE) or says
   `next: parent`; otherwise a helper waiting on the operator would message the
   parent "no change" on every event. DISC-364: the same holds for an automated turn after the marker's parent
   asked the helper to stay quiet (until a later parent message); the ask never hushes the turn its own message
   started, a message from any other session is ignored, and red CI, a new PR or a review comment in the reply
   always reports (named gap: that last test reads the reply's words). Blocks at most once (`stop_hook_active` -> allow);
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
// A GitHub write by gh: an explicit non-GET method, a field flag (an implicit POST), or a pr create/merge/review/comment/close.
const GH_WRITE = /\bgh\s+api\b(?=.*(?:(?:-X|--method)[ =]+(?:POST|PUT|PATCH|DELETE)\b|(?:\s-[fF]\b|--field\b|--raw-field\b|--input\b)))(?!.*(?:-X|--method)[ =]+GET\b)|\bgh\s+pr\s+(?:create|merge|review|comment|close|edit)\b/i;
const MUTATING_BASH = new RegExp(`\\bgit\\s+(push|commit)\\b|${GH_WRITE.source}`, "i");
// DISC-364: the marker's parent can ask a helper to stay quiet; the ask scopes to automated turns (a wake or a system
// notification), never to the turn the message itself started, and a real result (red CI, a new PR, a review comment) still reports.
const FROM_SESSION = /<cross-session-message\b[^>]*\bfrom(?:-session)?="([^"]*)"/;
const QUIET_ASK = /\b(stay|keep|be)\s+quiet\b|\bno\s+(reply|response|message)\s+(needed|necessary|required)\b|\b(do\s*n['o]?t|do not)\s+(reply|respond|message|ping)\b/i;
const AUTOMATED = /^\s*\[SYSTEM NOTIFICATION\b/;
const REAL_RESULT = /\b(ci|checks?|build|suite|job|tests?)\b[^.\n]{0,30}\b(red|failing|failed|fails)\b|\b(red|failing|failed)\s+(ci|checks?|build|suite|jobs?|tests?)\b|\b(review comment|requested changes|changes requested|merge conflict)\b(?!\s*[,.]?\s*(none|$))(?<!\bno\s+review comment)|\b(opened|created|new)\s+(a\s+)?(draft\s+)?(pr|pull request)\b/i;

const blocks = (c) => (Array.isArray(c) ? c : []);
const isToolResult = (c) => blocks(c).some((b) => b?.type === "tool_result");

/* The last assistant text since the last real user message, and whether that turn called send_message. */
export function lastTurn(transcriptText, parent = "") {
  let text = null, sent = false, wake = false, changed = false, hushed = false, auto = false;
  for (const line of transcriptText.split("\n")) {
    if (!line) continue;
    let e; try { e = JSON.parse(line); } catch { continue; }
    const c = e.message?.content;
    if (e.type === "user" && !e.isMeta && !isToolResult(c)) {
      text = null; sent = false; changed = false;
      const body = typeof c === "string" ? c : blocks(c).map((b) => b?.text || "").join("\n");
      wake = WAKE.test(body);
      const from = FROM_SESSION.exec(body);
      // The marker's parent speaks: a quiet ask sets the hush, any other parent message lifts it. Other senders change nothing.
      if (from && /^session_\w+$/.test(parent) && from[1] === parent) hushed = QUIET_ASK.test(body);
      auto = !from && AUTOMATED.test(body);
    }
    else if (e.type === "assistant") {
      if (blocks(c).some((b) => b?.type === "tool_use" && SEND.test(b.name || ""))) sent = true;
      if (blocks(c).some((b) => b?.type === "tool_use" && (MUTATING_TOOL.test(b.name || "") || (b.name === "Bash" && MUTATING_BASH.test(b.input?.command || ""))))) changed = true;
      const t = typeof c === "string" ? c : blocks(c).filter((b) => b?.type === "text").map((b) => b.text).join("\n");
      if (t.trim()) text = t;
    }
  }
  return { text, sent, quiet: (wake || (hushed && auto)) && !changed };
}

export function check({ text, sent, quiet = false, parent, self }) {
  if (sent || !text) return null;
  if (text.trim().length < ACK_MAX && !NEXT_PARENT.test(text)) return null;
  if (quiet && !NEXT_PARENT.test(text) && !REAL_RESULT.test(text)) return null;
  // DISC-240: a marker holding the helper's own id is not a parent; fall back to @parent.
  const to = /^session_\w+$/.test(parent) && parent !== self ? `"${parent}"` : `"@parent"`;
  return `Stop check (DISC-216): this is a helper session and this turn's return has not reached the parent. Send the full return with send_message (claude-code-remote; session_id ${to}), then end the turn.`;
}

function main() {
  if (process.env.CLAUDE_CODE_REMOTE !== "true") return;
  let parent; try { parent = readFileSync(join(homedir(), HELPER_MARKER), "utf8").trim(); } catch { return; }
  let input; try { input = JSON.parse(readFileSync(0, "utf8")); } catch { return; }
  if (input.stop_hook_active || !input.transcript_path) return;
  let reason; try { reason = check({ ...lastTurn(readFileSync(input.transcript_path, "utf8"), parent), parent, self: input.session_id }); } catch { return; }
  if (reason) process.stdout.write(JSON.stringify({ decision: "block", reason }));
}

if (process.argv[1]?.endsWith("parent-return-stop.mjs")) main();
