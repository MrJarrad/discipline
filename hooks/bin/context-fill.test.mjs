import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
  handle({ hook_event_name: "PreCompact", trigger: "auto", session_id: "s" }, opts(d));
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

// --- 1.115.0: manual vs automatic compact, marker cleanup, window size ---
import { existsSync, readdirSync } from "node:fs";
const markers = (d) => readdirSync(d).filter((f) => f.startsWith("discipline-context-fill-"));
const compact = (extra = {}) => ({ hook_event_name: "SessionStart", source: "compact", session_id: "s", ...extra });

test("a manual compact (no PreCompact(auto) marker) says nothing", () => {
  const d = fresh();
  assert.equal(handle(compact(), opts(d)), null);
  rmSync(d, { recursive: true });
});

test("PreCompact(auto) leaves a marker; the compact that follows is automatic and consumes it", () => {
  const d = fresh();
  assert.equal(handle({ hook_event_name: "PreCompact", trigger: "auto", session_id: "s" }, opts(d)), null);
  assert.equal(markers(d).length, 1);
  assert.match(handle(compact(), opts(d)), /automatic summary/);
  assert.equal(markers(d).length, 0);
  assert.equal(handle(compact(), opts(d)), null);
  rmSync(d, { recursive: true });
});

test("a stale PreCompact(auto) marker (compact never followed) does not make a later manual compact automatic", () => {
  const d = fresh();
  handle({ hook_event_name: "PreCompact", trigger: "auto", session_id: "s" }, { ...opts(d), now: 1_000_000 });
  assert.equal(handle(compact(), { ...opts(d), now: 1_000_000 + 11 * 60_000 }), null);
  assert.equal(markers(d).length, 0, "stale marker is consumed");
  rmSync(d, { recursive: true });
});

test("a marker inside the 10-minute window is automatic; a legacy '1' marker is stale", () => {
  const d = fresh();
  handle({ hook_event_name: "PreCompact", trigger: "auto", session_id: "s" }, { ...opts(d), now: 1_000_000 });
  assert.match(handle(compact(), { ...opts(d), now: 1_000_000 + 9 * 60_000 }), /automatic summary/);
  writeFileSync(join(d, "discipline-context-fill-precompact-s"), "1");
  assert.equal(handle(compact(), opts(d)), null);
  rmSync(d, { recursive: true });
});

test("PreCompact(manual) writes no marker", () => {
  const d = fresh();
  handle({ hook_event_name: "PreCompact", trigger: "manual", session_id: "s" }, opts(d));
  assert.equal(markers(d).length, 0);
  rmSync(d, { recursive: true });
});

test("a compact without a session id keeps the safe wrap message", () => {
  const d = fresh();
  assert.match(handle(compact({ session_id: undefined }), opts(d)), /automatic summary/);
  rmSync(d, { recursive: true });
});

test("compact clears the session's percent markers so nudges can fire again", () => {
  const d = fresh();
  const p = transcript(d, [assistant(910_000)]);
  const ev = { hook_event_name: "PostToolUse", session_id: "s", transcript_path: p };
  assert.ok(handle(ev, opts(d)));
  writeFileSync(join(d, "discipline-context-fill-other-91"), "1");
  handle(compact(), opts(d));
  assert.deepEqual(markers(d), ["discipline-context-fill-other-91"]);
  rmSync(d, { recursive: true });
});

test("SessionEnd removes every marker of that session and no other", () => {
  const d = fresh();
  writeFileSync(join(d, "discipline-context-fill-s-91"), "1");
  writeFileSync(join(d, "discipline-context-fill-precompact-s"), "1");
  writeFileSync(join(d, "discipline-context-fill-s2-91"), "1");
  handle({ hook_event_name: "SessionEnd", session_id: "s" }, opts(d));
  assert.deepEqual(markers(d), ["discipline-context-fill-s2-91"]);
  rmSync(d, { recursive: true });
});

const modelTurn = (model, read) => JSON.stringify({
  type: "assistant", isSidechain: false,
  message: { model, usage: { input_tokens: 2, cache_creation_input_tokens: 0, cache_read_input_tokens: read } },
});
const promptAt = (d, model, read, o = {}) => {
  const p = transcript(d, [modelTurn(model, read)]);
  return handle({ hook_event_name: "UserPromptSubmit", session_id: "s", transcript_path: p }, { wrapAt: 0.9, dir: d, ...o });
};

test("a haiku model is a 200k window: 185k is past the line", () => {
  const d = fresh();
  assert.match(promptAt(d, "claude-haiku-4-5", 185_000), /185k of 200k \(93%\)/);
  rmSync(d, { recursive: true });
});

test("a [1m] model id is a 1M window; other models default to 1M", () => {
  const d = fresh();
  assert.equal(promptAt(d, "claude-sonnet-4-5[1m]", 185_000), null);
  assert.equal(promptAt(d, "claude-opus-5-5", 185_000), null);
  rmSync(d, { recursive: true });
});

test("an explicit window beats the model id", () => {
  const d = fresh();
  assert.equal(promptAt(d, "claude-haiku-4-5", 185_000, { window: 1_000_000 }), null);
  rmSync(d, { recursive: true });
});

test("a reading above a 200k window widens it to 1M, never past 100%", () => {
  const d = fresh();
  assert.match(promptAt(d, "claude-haiku-4-5", 950_000), /950k of 1000k \(95%\)/);
  rmSync(d, { recursive: true });
});

test("hooks.json wires PreCompact(auto) and SessionEnd to the script", () => {
  const h = JSON.parse(readFileSync(new URL("../hooks.json", import.meta.url), "utf8")).hooks;
  const cmds = (ev) => JSON.stringify(h[ev] || []);
  assert.match(cmds("PreCompact"), /context-fill\.mjs/);
  assert.equal(h.PreCompact[0].matcher, "auto");
  assert.match(cmds("SessionEnd"), /context-fill\.mjs/);
});
