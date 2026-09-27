// Tests for the doer-side progress-floor hook (`progress-hooks`, 2026-09-27:
// "yes, steps plus the 10-minute floor"). The pure decision (`staleReminder`)
// is unit-tested directly; the transcript-parsing and path-resolution helpers
// are tested against realistic JSONL/brief shapes; the CLI process is driven
// end to end with a real transcript file and a real (or missing) progress
// file on disk.
// Run: node --test hooks/bin/progress-floor.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import {
  STALE_MS,
  expandHome,
  firstUserMessageText,
  resolveProgressPath,
  reminderText,
  staleReminder,
} from "./progress-floor.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const hook = join(here, "progress-floor.mjs");

// --- staleReminder (pure decision) -----------------------------------------

test("a fresh file (under 10 min) produces no reminder", () => {
  assert.equal(staleReminder("/x/progress.md", { fileExists: true, fileAgeMs: STALE_MS - 1000 }), null);
});

test("a stale file (10 min or more) produces a reminder naming the age", () => {
  const msg = staleReminder("/x/progress.md", { fileExists: true, fileAgeMs: STALE_MS + 60000 });
  assert.match(msg, /\/x\/progress\.md/);
  assert.match(msg, /still on step N of M — doing X/);
  assert.match(msg, /11 min ago/);
});

test("a missing file under the dispatch floor produces no reminder", () => {
  assert.equal(staleReminder("/x/progress.md", { fileExists: false, dispatchAgeMs: STALE_MS - 1000 }), null);
});

test("a missing file past the dispatch floor reminds to create it", () => {
  const msg = staleReminder("/x/progress.md", { fileExists: false, dispatchAgeMs: STALE_MS + 1000 });
  assert.match(msg, /no progress file yet at \/x\/progress\.md/);
});

test("a missing dispatch-time anchor (Infinity) still reminds rather than staying silent", () => {
  const msg = staleReminder("/x/progress.md", { fileExists: false });
  assert.match(msg, /no progress file yet/);
});

test("reminderText names the file, the age, and the exact line format", () => {
  assert.match(reminderText("/x/progress.md", 12), /still on step N of M — doing X/);
  assert.match(reminderText("/x/progress.md", 12), /12 min ago/);
  assert.match(reminderText("/x/progress.md", null), /stamping the dispatch time/);
});

// --- expandHome -------------------------------------------------------------

test("expandHome resolves a ~/ path against $HOME", () => {
  const home = process.env.HOME;
  assert.equal(expandHome("~/a/b.md"), `${home}/a/b.md`);
  assert.equal(expandHome("/already/absolute.md"), "/already/absolute.md");
});

// --- firstUserMessageText ----------------------------------------------------

test("firstUserMessageText reads the first user message's plain-string content", () => {
  const jsonl = [
    JSON.stringify({ type: "system", message: { content: "noise" } }),
    JSON.stringify({ type: "user", message: { content: "Size: component.\n\n## Progress\n`/x/progress.md`" } }),
    JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "reply" }] } }),
  ].join("\n");
  assert.match(firstUserMessageText(jsonl), /## Progress/);
});

test("firstUserMessageText reads a content-block array too", () => {
  const jsonl = JSON.stringify({
    type: "user",
    message: { content: [{ type: "text", text: "Size: component.\n\n## Progress\n`/x/progress.md`" }] },
  });
  assert.match(firstUserMessageText(jsonl), /## Progress/);
});

test("firstUserMessageText skips a user record with empty content and reads the next", () => {
  const jsonl = [
    JSON.stringify({ type: "user", message: { content: "" } }),
    JSON.stringify({ type: "user", message: { content: "real brief with ## Progress\n`/x/progress.md`" } }),
  ].join("\n");
  assert.match(firstUserMessageText(jsonl), /real brief/);
});

test("firstUserMessageText returns empty string on unparseable or empty input", () => {
  assert.equal(firstUserMessageText(""), "");
  assert.equal(firstUserMessageText("not json\n{also not json}"), "");
});

// --- resolveProgressPath ------------------------------------------------------

test("resolveProgressPath reads the same path shape agent-dispatch-gate accepts", () => {
  const brief = "Size: component.\n\n## Progress\n`/Users/x/vault/main/p/progress.md`\n\n**Done-when.**";
  assert.equal(resolveProgressPath(brief), "/Users/x/vault/main/p/progress.md");
});

test("resolveProgressPath returns null for a line lane (no ## Progress section)", () => {
  assert.equal(resolveProgressPath("Size: line.\n\nJust fix the one file."), null);
});

test("resolveProgressPath is not fooled by a backticked mention before the real heading", () => {
  const brief =
    "**Context.** Write to `## Progress` every 10 min.\n\n" +
    "## Progress\n`/Users/x/vault/main/p/progress.md`\n\n**Done-when.**";
  assert.equal(resolveProgressPath(brief), "/Users/x/vault/main/p/progress.md");
});

// --- CLI process, end to end --------------------------------------------------

function makeSession() {
  const dir = mkdtempSync(join(tmpdir(), "progress-floor-"));
  const progressPath = join(dir, "progress.md");
  const transcriptPath = join(dir, "session.jsonl");
  return { dir, progressPath, transcriptPath };
}

function writeTranscript(transcriptPath, progressPath) {
  const brief = `Size: component.\n\n## Progress\n\`${progressPath}\`\n\n**Done-when.**`;
  const line = JSON.stringify({ type: "user", message: { content: brief } });
  writeFileSync(transcriptPath, line + "\n");
}

const run = (input) => spawnSync(process.execPath, [hook], { input: JSON.stringify(input), encoding: "utf8" });

test("hook process: no progress file yet, dispatch fresh (transcript just written) — allowed, silent", () => {
  const { progressPath, transcriptPath } = makeSession();
  writeTranscript(transcriptPath, progressPath);
  const result = run({ transcript_path: transcriptPath });
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), "");
});

test("hook process: fresh progress file — allowed, silent", () => {
  const { progressPath, transcriptPath } = makeSession();
  writeTranscript(transcriptPath, progressPath);
  writeFileSync(progressPath, "2026-09-27T18:00:00Z dispatched\n");
  const result = run({ transcript_path: transcriptPath });
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), "");
});

test("hook process: stale progress file (mtime backdated 11 min) — reminder injected", () => {
  const { progressPath, transcriptPath } = makeSession();
  writeTranscript(transcriptPath, progressPath);
  writeFileSync(progressPath, "2026-09-27T18:00:00Z dispatched\n");
  const staleTime = new Date(Date.now() - 11 * 60 * 1000);
  utimesSync(progressPath, staleTime, staleTime);
  const result = run({ transcript_path: transcriptPath });
  assert.equal(result.status, 0);
  const out = JSON.parse(result.stdout);
  assert.equal(out.hookSpecificOutput.hookEventName, "PostToolUse");
  assert.match(out.hookSpecificOutput.additionalContext, /still on step N of M — doing X/);
});

test("hook process: a line lane's brief (no ## Progress) is never checked", () => {
  const dir = mkdtempSync(join(tmpdir(), "progress-floor-"));
  const transcriptPath = join(dir, "session.jsonl");
  writeFileSync(
    transcriptPath,
    JSON.stringify({ type: "user", message: { content: "Size: line.\n\nJust fix the file." } }) + "\n",
  );
  const result = run({ transcript_path: transcriptPath });
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), "");
});

test("hook process: missing transcript path — allowed, never throws", () => {
  const result = run({ transcript_path: "/does/not/exist.jsonl" });
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), "");
});

test("hook process: no transcript_path at all on the input — allowed, never throws", () => {
  const result = run({});
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), "");
});

test("hook process: unparseable stdin — allowed, never throws", () => {
  const result = spawnSync(process.execPath, [hook], { input: "not json", encoding: "utf8" });
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), "");
});

// --- wiring --------------------------------------------------------------

test("hooks.json fires progress-floor on PostToolUse for every tool", async () => {
  const { readFileSync } = await import("node:fs");
  const repo = join(here, "..", "..");
  const hooks = JSON.parse(readFileSync(join(repo, "hooks", "hooks.json"), "utf8"));
  const post = hooks.hooks.PostToolUse;
  const entry = post.find((h) => /progress-floor\.mjs/.test(h.hooks[0].command));
  assert.ok(entry, "no PostToolUse entry wiring progress-floor.mjs");
  assert.equal(entry.matcher, "*", "must fire on every tool, not a subset");
});
