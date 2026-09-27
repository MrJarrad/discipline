// Tests for the parent-side, memory-free registry check (`progress-hooks`
// fix round, 2026-09-27). checkRegistry is pure (no real timers, no real
// files — statLookup injected); the CLI process is driven end to end with a
// real registry file and real progress files on disk.
// Run: node --test hooks/bin/progress-registry-check.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, utimesSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { checkRegistry } from "./progress-registry-check.mjs";
import { saveRegistry, loadRegistry } from "./progress-registry.mjs";
import { FIFTEEN_MIN_MS, THIRTY_MIN_MS } from "../scripts/progress-watch.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const checker = join(here, "progress-registry-check.mjs");

// --- checkRegistry (pure) ----------------------------------------------------

test("an empty registry produces no messages", () => {
  const result = checkRegistry([], Date.now(), () => null);
  assert.deepEqual(result.messages, []);
  assert.deepEqual(result.updatedEntries, []);
});

test("a fresh lane (under 15 min) produces no message", () => {
  const now = Date.now();
  const entries = [{ path: "/a/progress.md", dispatchedAt: now, lastMtime: null, fired: [] }];
  const result = checkRegistry(entries, now, () => now);
  assert.deepEqual(result.messages, []);
});

test("a lane silent 15+ min fires once and persists the fired tier", () => {
  const now = Date.now();
  const mtime = now - FIFTEEN_MIN_MS;
  const entries = [{ path: "/a/progress.md", dispatchedAt: mtime, lastMtime: null, fired: [] }];
  const result = checkRegistry(entries, now, () => mtime);
  assert.equal(result.messages.length, 1);
  assert.match(result.messages[0], /\/a\/progress\.md/);
  assert.match(result.messages[0], /15 min silent/);
  assert.deepEqual(result.updatedEntries[0].fired, [15]);
});

test("a second pass at the same mtime does not re-fire the same tier", () => {
  const now = Date.now();
  const mtime = now - FIFTEEN_MIN_MS;
  const first = checkRegistry([{ path: "/a/progress.md", dispatchedAt: mtime, lastMtime: null, fired: [] }], now, () => mtime);
  const second = checkRegistry(first.updatedEntries, now + 1000, () => mtime);
  assert.deepEqual(second.messages, []);
});

test("a lane silent 30+ min fires the 30-min tier, not 15", () => {
  const now = Date.now();
  const mtime = now - THIRTY_MIN_MS - 60000;
  const entries = [{ path: "/a/progress.md", dispatchedAt: mtime, lastMtime: null, fired: [] }];
  const result = checkRegistry(entries, now, () => mtime);
  assert.equal(result.messages.length, 1);
  assert.match(result.messages[0], /30 min silent/);
});

test("a new mtime (the doer wrote a line) resets fired tiers for that lane", () => {
  const now = Date.now();
  const staleMtime = now - FIFTEEN_MIN_MS;
  const first = checkRegistry([{ path: "/a/progress.md", dispatchedAt: staleMtime, lastMtime: null, fired: [] }], now, () => staleMtime);
  assert.equal(first.messages.length, 1);

  const freshMtime = now + 1000;
  const second = checkRegistry(first.updatedEntries, now + 2000, () => freshMtime);
  assert.deepEqual(second.messages, []);
  assert.deepEqual(second.updatedEntries[0].fired, []);
});

test("multiple lanes are checked independently — one silent, one fresh", () => {
  const now = Date.now();
  const staleMtime = now - FIFTEEN_MIN_MS;
  const entries = [
    { path: "/silent/progress.md", dispatchedAt: staleMtime, lastMtime: null, fired: [] },
    { path: "/fresh/progress.md", dispatchedAt: now, lastMtime: null, fired: [] },
  ];
  const lookup = (p) => (p === "/silent/progress.md" ? staleMtime : now);
  const result = checkRegistry(entries, now, lookup);
  assert.equal(result.messages.length, 1);
  assert.match(result.messages[0], /\/silent\/progress\.md/);
});

test("a lane whose file was never created uses dispatchedAt as the clock", () => {
  const now = Date.now();
  const dispatchedAt = now - FIFTEEN_MIN_MS;
  const entries = [{ path: "/never/progress.md", dispatchedAt, lastMtime: null, fired: [] }];
  const result = checkRegistry(entries, now, () => null); // file never created
  assert.equal(result.messages.length, 1);
  assert.match(result.messages[0], /\/never\/progress\.md/);
});

// --- CLI process, end to end --------------------------------------------------

function tempRegistry() {
  const dir = mkdtempSync(join(tmpdir(), "registry-check-cli-"));
  return join(dir, "registry.json");
}

const run = (args, env) =>
  spawnSync(process.execPath, [checker, ...args], { input: "{}", encoding: "utf8", env: { ...process.env, ...env } });

test("CLI: empty registry — silent, exit 0", () => {
  const registryPath = tempRegistry();
  const result = run(["UserPromptSubmit"], { DISCIPLINE_PROGRESS_REGISTRY: registryPath });
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), "");
});

test("CLI: a stale lane on disk produces a UserPromptSubmit additionalContext line", () => {
  const dir = mkdtempSync(join(tmpdir(), "registry-check-lane-"));
  const progressPath = join(dir, "progress.md");
  writeFileSync(progressPath, "old\n");
  const staleTime = new Date(Date.now() - FIFTEEN_MIN_MS - 60000);
  utimesSync(progressPath, staleTime, staleTime);

  const registryPath = tempRegistry();
  saveRegistry([{ path: progressPath, dispatchedAt: Date.now() - FIFTEEN_MIN_MS - 60000, lastMtime: null, fired: [] }], registryPath);

  const result = run(["UserPromptSubmit"], { DISCIPLINE_PROGRESS_REGISTRY: registryPath });
  assert.equal(result.status, 0);
  const out = JSON.parse(result.stdout);
  assert.equal(out.hookSpecificOutput.hookEventName, "UserPromptSubmit");
  assert.match(out.hookSpecificOutput.additionalContext, /15 min silent/);

  // fired tier persisted back to the registry file itself.
  const updated = loadRegistry(registryPath);
  assert.deepEqual(updated[0].fired, [15]);
});

test("CLI: PostToolUse event arg echoes back as the hookEventName", () => {
  const dir = mkdtempSync(join(tmpdir(), "registry-check-lane-"));
  const progressPath = join(dir, "progress.md");
  writeFileSync(progressPath, "old\n");
  const staleTime = new Date(Date.now() - THIRTY_MIN_MS - 60000);
  utimesSync(progressPath, staleTime, staleTime);

  const registryPath = tempRegistry();
  saveRegistry([{ path: progressPath, dispatchedAt: Date.now() - THIRTY_MIN_MS - 60000, lastMtime: null, fired: [] }], registryPath);

  const result = run(["PostToolUse"], { DISCIPLINE_PROGRESS_REGISTRY: registryPath });
  const out = JSON.parse(result.stdout);
  assert.equal(out.hookSpecificOutput.hookEventName, "PostToolUse");
  assert.match(out.hookSpecificOutput.additionalContext, /30 min silent/);
});

test("CLI: unreadable stdin never throws — allowed, silent when nothing due", () => {
  const registryPath = tempRegistry();
  const result = spawnSync(process.execPath, [checker, "UserPromptSubmit"], {
    input: "not json",
    encoding: "utf8",
    env: { ...process.env, DISCIPLINE_PROGRESS_REGISTRY: registryPath },
  });
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), "");
});

// --- wiring --------------------------------------------------------------

test("hooks.json fires progress-registry-check on both UserPromptSubmit and PostToolUse", async () => {
  const { readFileSync } = await import("node:fs");
  const repo = join(here, "..", "..");
  const hooks = JSON.parse(readFileSync(join(repo, "hooks", "hooks.json"), "utf8"));

  const prompt = hooks.hooks.UserPromptSubmit || [];
  const promptEntry = prompt.flatMap((h) => h.hooks).find((h) => /progress-registry-check\.mjs/.test(h.command));
  assert.ok(promptEntry, "no UserPromptSubmit entry wiring progress-registry-check.mjs");
  assert.match(promptEntry.command, /UserPromptSubmit/);

  const post = hooks.hooks.PostToolUse || [];
  const postEntry = post.flatMap((h) => h.hooks).find((h) => /progress-registry-check\.mjs/.test(h.command));
  assert.ok(postEntry, "no PostToolUse entry wiring progress-registry-check.mjs");
  assert.match(postEntry.command, /PostToolUse/);
});
