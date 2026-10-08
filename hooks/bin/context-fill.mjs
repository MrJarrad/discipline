#!/usr/bin/env node
/* UserPromptSubmit · PostToolUse · PreCompact(auto) · SessionStart(compact) · SessionEnd — decision
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
   Window: DISCIPLINE_CONTEXT_WINDOW, else by model id (`[1m]` 1M, haiku 200k, default 1M).
   Manual vs automatic compact: PreCompact(auto) leaves a marker that
   SessionStart(compact) consumes; SessionEnd and compact delete the session markers.
   Env: DISCIPLINE_CONTEXT_WINDOW, DISCIPLINE_WRAP_AT (0.9).
   Dry-run: node context-fill.mjs < input.json */
import { closeSync, fstatSync, openSync, readdirSync, readFileSync, readSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TAIL_BYTES = 4 * 1024 * 1024;
const ACTION = "Finish in-flight merges, then run `wrap` unprompted and tell the operator in one line (`wrap` § When to wrap).";

// {tokens, model} of the last main-thread assistant turn in a transcript's text, or null.
export function contextReading(text) {
  const lines = text.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (!line.includes('"assistant"') || !line.includes('"usage"')) continue;
    let row;
    try { row = JSON.parse(line); } catch { continue; }
    const u = row?.message?.usage;
    if (row?.type !== "assistant" || row.isSidechain || !u) continue;
    return {
      tokens: (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0),
      model: String(row.message.model || ""),
    };
  }
  return null;
}

// Context tokens of the last main-thread assistant turn, or null.
export function contextTokens(text) {
  return contextReading(text)?.tokens ?? null;
}

// Window when none is configured: a [1m] id is 1M, a haiku id 200k, else 1M;
// a reading above the window can only mean the window is 1M.
function windowFor(model, tokens) {
  const w = /\[1m\]/i.test(model) ? 1_000_000 : /haiku/i.test(model) ? 200_000 : 1_000_000;
  return tokens > w ? 1_000_000 : w;
}

const PREFIX = "discipline-context-fill-";
const safeSid = (id) => String(id || "").replace(/[^\w-]/g, "");
const remove = (dir, test) => {
  try { for (const f of readdirSync(dir)) if (f.startsWith(PREFIX) && test(f)) unlinkSync(join(dir, f)); } catch { /* best effort */ }
};

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

const readdirSafe = (d) => { try { return readdirSync(d); } catch { return []; } };
const k = (n) => `${Math.round(n / 1000)}k`;

// The message for one hook input, or null. Side effect: PostToolUse marker.
export function handle(input, { window, wrapAt = 0.9, dir = tmpdir() } = {}) {
  if (!input || input.agent_id) return null;
  const event = input.hook_event_name;
  const sid = safeSid(input.session_id);
  if (event === "PreCompact") {
    if (input.trigger === "auto" && sid) {
      try { writeFileSync(join(dir, `${PREFIX}precompact-${sid}`), "1"); } catch { /* best effort */ }
    }
    return null;
  }
  if (event === "SessionEnd") {
    if (sid) remove(dir, (f) => f === `${PREFIX}precompact-${sid}` || new RegExp(`^${PREFIX}${sid}-\\d+$`).test(f));
    return null;
  }
  if (event === "SessionStart") {
    if (input.source !== "compact") return null;
    // Without a session id the origin is unknowable: keep the safe wrap message.
    let automatic = true;
    if (sid) {
      automatic = readdirSafe(dir).includes(`${PREFIX}precompact-${sid}`);
      remove(dir, (f) => f === `${PREFIX}precompact-${sid}` || new RegExp(`^${PREFIX}${sid}-\\d+$`).test(f));
    }
    return automatic
      ? `Context fill: an automatic summary just ran, so this session reached its context limit. ${ACTION}`
      : null;
  }
  if (event !== "UserPromptSubmit" && event !== "PostToolUse") return null;
  let reading;
  try { reading = contextReading(readTail(input.transcript_path)); } catch { return null; }
  if (!reading) return null;
  const { tokens } = reading;
  window = window || windowFor(reading.model, tokens);
  if (tokens / window < wrapAt) return null;
  const pct = Math.round((tokens / window) * 100);
  if (event === "PostToolUse") {
    if (!sid) return null;
    try { writeFileSync(join(dir, `${PREFIX}${sid}-${pct}`), "1", { flag: "wx" }); } catch { return null; }
  }
  return `Context fill: ${k(tokens)} of ${k(window)} (${pct}%), past the ${Math.round(wrapAt * 100)}% wrap line. ${ACTION}`;
}

function main() {
  let input;
  try { input = JSON.parse(readFileSync(0, "utf8")); } catch { return; }
  const window = Number(process.env.DISCIPLINE_CONTEXT_WINDOW) || undefined;
  const wrapAt = Number(process.env.DISCIPLINE_WRAP_AT) || 0.9;
  const message = handle(input, { window, wrapAt });
  if (message) {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: { hookEventName: input.hook_event_name, additionalContext: message },
    }));
  }
}

if (process.argv[1]?.endsWith("context-fill.mjs")) main();
