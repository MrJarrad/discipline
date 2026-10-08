import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { contextTokens, handle } from "./context-fill.mjs";

// Fixture lines mirror a real transcript's assistant usage block (Claude Code jsonl).
const assistant = (read, created = 0, input = 2, extra = {}) => JSON.stringify({
  type: "assistant", isSidechain: false,
  message: { usage: { input_tokens: input, cache_creation_input_tokens: created, cache_read_input_tokens: read, output_tokens: 500 } },
  ...extra,
});
const user = JSON.stringify({ type: "user", message: { content: "x".repeat(200) } });

const fresh = () => mkdtempSync(join(tmpdir(), "context-fill-"));
const transcript = (dir, lines) => {
  const p = join(dir, "t.jsonl");
  writeFileSync(p, lines.join("\n") + "\n");
  return p;
};
const opts = (dir) => ({ window: 1_000_000, wrapAt: 0.9, dir });

test("context tokens are the last main-thread assistant turn's input + cache tokens", () => {
  const text = [assistant(100_000), user, assistant(738_901, 1_264), user, assistant(5, 0, 1, { isSidechain: true })].join("\n");
  assert.equal(contextTokens(text), 740_167);
});

test("below the wrap line the prompt hook says nothing", () => {
  const d = fresh();
  const p = transcript(d, [assistant(734_900)]);
  assert.equal(handle({ hook_event_name: "UserPromptSubmit", session_id: "s", transcript_path: p }, opts(d)), null);
  rmSync(d, { recursive: true });
});

test("at or past 90% the prompt hook tells the orchestrator to wrap, with the reading", () => {
  const d = fresh();
  const p = transcript(d, [user, assistant(905_000)]);
  const m = handle({ hook_event_name: "UserPromptSubmit", session_id: "s", transcript_path: p }, opts(d));
  assert.match(m, /905k of 1000k \(91%\)/);
  assert.match(m, /run `wrap` unprompted/);
  rmSync(d, { recursive: true });
});

test("tool-use readings nudge once per percent point, not on every call", () => {
  const d = fresh();
  const p = transcript(d, [assistant(910_000)]);
  const ev = { hook_event_name: "PostToolUse", session_id: "s", transcript_path: p };
  assert.ok(handle(ev, opts(d)));
  assert.equal(handle(ev, opts(d)), null);
  writeFileSync(p, assistant(921_000) + "\n");
  assert.ok(handle(ev, opts(d)));
  rmSync(d, { recursive: true });
});

test("an automatic compaction is itself the wrap signal", () => {
  const d = fresh();
  assert.match(handle({ hook_event_name: "SessionStart", source: "compact", session_id: "s" }, opts(d)), /automatic summary/);
  assert.equal(handle({ hook_event_name: "SessionStart", source: "startup", session_id: "s" }, opts(d)), null);
  rmSync(d, { recursive: true });
});

test("a subagent's hook input is ignored", () => {
  const d = fresh();
  const p = transcript(d, [assistant(990_000)]);
  assert.equal(handle({ hook_event_name: "UserPromptSubmit", agent_id: "a1", session_id: "s", transcript_path: p }, opts(d)), null);
  rmSync(d, { recursive: true });
});

test("a missing or unreadable transcript is silent, never a crash", () => {
  const d = fresh();
  assert.equal(handle({ hook_event_name: "UserPromptSubmit", session_id: "s", transcript_path: join(d, "nope.jsonl") }, opts(d)), null);
  rmSync(d, { recursive: true });
});

test("the CLI emits additionalContext for the event that fired, window from the environment", () => {
  const d = fresh();
  const p = transcript(d, [assistant(460_000)]);
  const script = new URL("./context-fill.mjs", import.meta.url).pathname;
  const r = spawnSync("node", [script], {
    input: JSON.stringify({ hook_event_name: "UserPromptSubmit", session_id: "s", transcript_path: p }),
    encoding: "utf8", env: { ...process.env, TMPDIR: d, DISCIPLINE_CONTEXT_WINDOW: "500000" },
  });
  const out = JSON.parse(r.stdout).hookSpecificOutput;
  assert.equal(out.hookEventName, "UserPromptSubmit");
  assert.match(out.additionalContext, /460k of 500k \(92%\)/);
  rmSync(d, { recursive: true });
});
