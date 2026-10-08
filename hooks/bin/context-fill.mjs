#!/usr/bin/env node
/* UserPromptSubmit · PostToolUse · SessionStart(compact) — decision
   `2026-10-08-proactive-wrap-at-90`: wrap at about 90% context usage. The
   orchestrator cannot read context fill in-turn, so this hook reads it: the
   last main-thread assistant turn's input + cache-creation + cache-read tokens
   in the session transcript are the same count the client's usage popover
   shows as "Context window". At or past the wrap line it injects one
   `additionalContext` line; an automatic compaction (SessionStart source
   "compact") is itself the signal. Never a deny.
   Orchestrator only: an input carrying `agent_id` is a subagent's and is ignored.
   UserPromptSubmit reports every prompt past the line; PostToolUse at most once
   per percent point (marker in the OS tmpdir keyed by session_id).
   Env: DISCIPLINE_CONTEXT_WINDOW (default 1000000), DISCIPLINE_WRAP_AT (0.9).
   Dry-run: node context-fill.mjs < input.json */
import { closeSync, fstatSync, openSync, readFileSync, readSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TAIL_BYTES = 4 * 1024 * 1024;
const ACTION = "Finish in-flight merges, then run `wrap` unprompted and tell the operator in one line (`wrap` § When to wrap).";

// Context tokens of the last main-thread assistant turn in a transcript's text, or null.
export function contextTokens(text) {
  const lines = text.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (!line.includes('"assistant"') || !line.includes('"usage"')) continue;
    let row;
    try { row = JSON.parse(line); } catch { continue; }
    const u = row?.message?.usage;
    if (row?.type !== "assistant" || row.isSidechain || !u) continue;
    return (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
  }
  return null;
}

function readTail(path) {
  const fd = openSync(path, "r");
  try {
    const size = fstatSync(fd).size;
    const len = Math.min(size, TAIL_BYTES);
    const buf = Buffer.alloc(len);
    readSync(fd, buf, 0, len, size - len);
    return buf.toString("utf8");
  } finally { closeSync(fd); }
}

const k = (n) => `${Math.round(n / 1000)}k`;

// The message for one hook input, or null. Side effect: PostToolUse marker.
export function handle(input, { window = 1_000_000, wrapAt = 0.9, dir = tmpdir() } = {}) {
  if (!input || input.agent_id) return null;
  const event = input.hook_event_name;
  if (event === "SessionStart") {
    return input.source === "compact"
      ? `Context fill: an automatic summary just ran, so this session reached its context limit. ${ACTION}`
      : null;
  }
  if (event !== "UserPromptSubmit" && event !== "PostToolUse") return null;
  let tokens;
  try { tokens = contextTokens(readTail(input.transcript_path)); } catch { return null; }
  if (tokens == null || tokens / window < wrapAt) return null;
  const pct = Math.round((tokens / window) * 100);
  if (event === "PostToolUse") {
    const sid = String(input.session_id || "").replace(/[^\w-]/g, "");
    if (!sid) return null;
    try { writeFileSync(join(dir, `discipline-context-fill-${sid}-${pct}`), "1", { flag: "wx" }); } catch { return null; }
  }
  return `Context fill: ${k(tokens)} of ${k(window)} (${pct}%), past the ${Math.round(wrapAt * 100)}% wrap line. ${ACTION}`;
}

function main() {
  let input;
  try { input = JSON.parse(readFileSync(0, "utf8")); } catch { return; }
  const window = Number(process.env.DISCIPLINE_CONTEXT_WINDOW) || 1_000_000;
  const wrapAt = Number(process.env.DISCIPLINE_WRAP_AT) || 0.9;
  const message = handle(input, { window, wrapAt });
  if (message) {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: { hookEventName: input.hook_event_name, additionalContext: message },
    }));
  }
}

if (process.argv[1]?.endsWith("context-fill.mjs")) main();
