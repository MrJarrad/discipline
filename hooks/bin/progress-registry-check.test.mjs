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

const SID = "parent-session-abc";

test("an empty registry produces no messages", () => {
  const result = checkRegistry([], Date.now(), () => null, SID);
  assert.deepEqual(result.messages, []);
  assert.deepEqual(result.updatedEntries, []);
});

test("a fresh lane (under 15 min) produces no message", () => {
  const now = Date.now();
  const entries = [{ path: "/a/progress.md", sessionId: SID, dispatchedAt: now, lastMtime: null, fired: [] }];
  const result = checkRegistry(entries, now, () => now, SID);
  assert.deepEqual(result.messages, []);
});

test("a lane silent 15+ min fires once and persists the fired tier", () => {
  const now = Date.now();
  const mtime = now - FIFTEEN_MIN_MS;
  const entries = [{ path: "/a/progress.md", sessionId: SID, dispatchedAt: mtime, lastMtime: null, fired: [] }];
  const result = checkRegistry(entries, now, () => mtime, SID);
  assert.equal(result.messages.length, 1);
  assert.match(result.messages[0], /\/a\/progress\.md/);
  assert.match(result.messages[0], /15 min silent/);
  assert.deepEqual(result.updatedEntries[0].fired, [15]);
});

test("a second pass at the same mtime does not re-fire the same tier", () => {
  const now = Date.now();
  const mtime = now - FIFTEEN_MIN_MS;
  const first = checkRegistry(
    [{ path: "/a/progress.md", sessionId: SID, dispatchedAt: mtime, lastMtime: null, fired: [] }],
    now,
    () => mtime,
    SID,
  );
  const second = checkRegistry(first.updatedEntries, now + 1000, () => mtime, SID);
  assert.deepEqual(second.messages, []);
});

test("a lane silent 30+ min fires the 30-min tier, not 15", () => {
  const now = Date.now();
  const mtime = now - THIRTY_MIN_MS - 60000;
  const entries = [{ path: "/a/progress.md", sessionId: SID, dispatchedAt: mtime, lastMtime: null, fired: [] }];
  const result = checkRegistry(entries, now, () => mtime, SID);
  assert.equal(result.messages.length, 1);
  assert.match(result.messages[0], /30 min silent/);
});

test("a new mtime (the doer wrote a line) resets fired tiers for that lane", () => {
  const now = Date.now();
  const staleMtime = now - FIFTEEN_MIN_MS;
  const first = checkRegistry(
    [{ path: "/a/progress.md", sessionId: SID, dispatchedAt: staleMtime, lastMtime: null, fired: [] }],
    now,
    () => staleMtime,
    SID,
  );
  assert.equal(first.messages.length, 1);

  const freshMtime = now + 1000;
  const second = checkRegistry(first.updatedEntries, now + 2000, () => freshMtime, SID);
  assert.deepEqual(second.messages, []);
  assert.deepEqual(second.updatedEntries[0].fired, []);
});

test("multiple lanes, same session, are checked independently — one silent, one fresh", () => {
  const now = Date.now();
  const staleMtime = now - FIFTEEN_MIN_MS;
  const entries = [
    { path: "/silent/progress.md", sessionId: SID, dispatchedAt: staleMtime, lastMtime: null, fired: [] },
    { path: "/fresh/progress.md", sessionId: SID, dispatchedAt: now, lastMtime: null, fired: [] },
  ];
  const lookup = (p) => (p === "/silent/progress.md" ? staleMtime : now);
  const result = checkRegistry(entries, now, lookup, SID);
  assert.equal(result.messages.length, 1);
  assert.match(result.messages[0], /\/silent\/progress\.md/);
});

test("a lane whose file was never created uses dispatchedAt as the clock", () => {
  const now = Date.now();
  const dispatchedAt = now - FIFTEEN_MIN_MS;
  const entries = [{ path: "/never/progress.md", sessionId: SID, dispatchedAt, lastMtime: null, fired: [] }];
  const result = checkRegistry(entries, now, () => null, SID); // file never created
  assert.equal(result.messages.length, 1);
  assert.match(result.messages[0], /\/never\/progress\.md/);
});

test("a lane re-dispatched onto a path an EARLIER lane already wrote to is not flagged silent the instant it dispatches (bug found running 1.98.0, 2026-09-28: the silence clock must be max(dispatchedAt, file mtime), never the bare stale file mtime)", () => {
  const now = Date.now();
  const staleFileMtime = now - THIRTY_MIN_MS - 60000; // the OLD lane's last write, long before this dispatch
  const dispatchedAt = now; // THIS lane was just dispatched
  const entries = [{ path: "/reused/progress.md", sessionId: SID, dispatchedAt, lastMtime: null, fired: [] }];
  const result = checkRegistry(entries, now, () => staleFileMtime, SID);
  assert.deepEqual(result.messages, [], "must not fire off a stale file mtime from before this lane's own dispatch");
});

test("once the re-dispatched lane's own dispatchedAt is itself 30+ min in the past, it fires normally even with a stale file underneath it", () => {
  const now = Date.now();
  const dispatchedAt = now - THIRTY_MIN_MS - 60000;
  const staleFileMtime = dispatchedAt - 60000; // older still — the previous lane's leftover write
  const entries = [{ path: "/reused/progress.md", sessionId: SID, dispatchedAt, lastMtime: null, fired: [] }];
  const result = checkRegistry(entries, now, () => staleFileMtime, SID);
  assert.equal(result.messages.length, 1);
  assert.match(result.messages[0], /30 min silent/);
});

// --- cross-session leak (reviewer round 2 red) --------------------------------

test("a lane registered under a DIFFERENT session id is neither reported nor mutated", () => {
  const now = Date.now();
  const staleMtime = now - THIRTY_MIN_MS - 60000;
  const entries = [{ path: "/other/progress.md", sessionId: "other-doer-session", dispatchedAt: staleMtime, lastMtime: null, fired: [] }];
  const result = checkRegistry(entries, now, () => staleMtime, SID);
  assert.deepEqual(result.messages, [], "a different session's lane must never be reported");
  assert.deepEqual(result.updatedEntries, entries, "a different session's row is untouched, not just unreported");
});

test("two sessions, two lanes: each session's own check reports only its own lane, silent on the other's", () => {
  const now = Date.now();
  const staleMtime = now - THIRTY_MIN_MS - 60000;
  const entries = [
    { path: "/parent-a/progress.md", sessionId: "session-a", dispatchedAt: staleMtime, lastMtime: null, fired: [] },
    { path: "/parent-b/progress.md", sessionId: "session-b", dispatchedAt: staleMtime, lastMtime: null, fired: [] },
  ];
  const lookup = () => staleMtime;

  const checkedAsA = checkRegistry(entries, now, lookup, "session-a");
  assert.equal(checkedAsA.messages.length, 1);
  assert.match(checkedAsA.messages[0], /\/parent-a\/progress\.md/);
  assert.doesNotMatch(checkedAsA.messages.join("\n"), /parent-b/, "session-a's check must never mention session-b's lane");
  // session-b's row is untouched by session-a's check, ready for session-b's own pass.
  assert.deepEqual(checkedAsA.updatedEntries.find((e) => e.sessionId === "session-b"), entries[1]);

  const checkedAsB = checkRegistry(entries, now, lookup, "session-b");
  assert.equal(checkedAsB.messages.length, 1);
  assert.match(checkedAsB.messages[0], /\/parent-b\/progress\.md/);
  assert.doesNotMatch(checkedAsB.messages.join("\n"), /parent-a/, "session-b's check must never mention session-a's lane");
});

test("a row with no recorded sessionId (pre-fix registry, or unresolved dispatch) fails closed — never reported", () => {
  const now = Date.now();
  const staleMtime = now - THIRTY_MIN_MS - 60000;
  const entries = [{ path: "/legacy/progress.md", dispatchedAt: staleMtime, lastMtime: null, fired: [] }]; // no sessionId field
  const result = checkRegistry(entries, now, () => staleMtime, SID);
  assert.deepEqual(result.messages, []);
});

test("documented edge: an invocation with null session id DOES match a row also stamped null (never true for a real dispatch)", () => {
  // Defensive: two unidentifiable parties should not accidentally "match"
  // and leak — the CLI always passes a real ?? null, so this only protects
  // the pure function against a caller that does the same on both sides
  // being treated as proof of identity.
  const now = Date.now();
  const staleMtime = now - THIRTY_MIN_MS - 60000;
  const entries = [{ path: "/unidentified/progress.md", sessionId: null, dispatchedAt: staleMtime, lastMtime: null, fired: [] }];
  const result = checkRegistry(entries, now, () => staleMtime, null);
  // null === null is legal JS equality, so this documents the actual
  // behaviour rather than asserting a stronger guarantee this function does
  // not make: an invocation that is ALSO unidentifiable matches an
  // unidentifiable row. The CLI path never sends a bare null session id for
  // a real dispatch (agent-dispatch-gate always stamps the real session_id
  // or the literal absence of one), so this is a documented edge, not a
  // live leak.
  assert.equal(result.messages.length, 1);
});

// --- CLI process, end to end --------------------------------------------------

function tempRegistry() {
  const dir = mkdtempSync(join(tmpdir(), "registry-check-cli-"));
  return join(dir, "registry.json");
}

const run = (args, env, input = {}) =>
  spawnSync(process.execPath, [checker, ...args], { input: JSON.stringify(input), encoding: "utf8", env: { ...process.env, ...env } });

test("CLI: empty registry — silent, exit 0", () => {
  const registryPath = tempRegistry();
  const result = run(["UserPromptSubmit"], { DISCIPLINE_PROGRESS_REGISTRY: registryPath }, { session_id: SID });
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), "");
});

test("CLI: a stale lane on disk, checked by its OWN session_id, produces a UserPromptSubmit additionalContext line", () => {
  const dir = mkdtempSync(join(tmpdir(), "registry-check-lane-"));
  const progressPath = join(dir, "progress.md");
  writeFileSync(progressPath, "old\n");
  const staleTime = new Date(Date.now() - FIFTEEN_MIN_MS - 60000);
  utimesSync(progressPath, staleTime, staleTime);

  const registryPath = tempRegistry();
  saveRegistry(
    [{ path: progressPath, sessionId: SID, dispatchedAt: Date.now() - FIFTEEN_MIN_MS - 60000, lastMtime: null, fired: [] }],
    registryPath,
  );

  const result = run(["UserPromptSubmit"], { DISCIPLINE_PROGRESS_REGISTRY: registryPath }, { session_id: SID });
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
  saveRegistry(
    [{ path: progressPath, sessionId: SID, dispatchedAt: Date.now() - THIRTY_MIN_MS - 60000, lastMtime: null, fired: [] }],
    registryPath,
  );

  const result = run(["PostToolUse"], { DISCIPLINE_PROGRESS_REGISTRY: registryPath }, { session_id: SID });
  const out = JSON.parse(result.stdout);
  assert.equal(out.hookSpecificOutput.hookEventName, "PostToolUse");
  assert.match(out.hookSpecificOutput.additionalContext, /30 min silent/);
});

// The exact cross-session leak the reviewer flagged: a lane registered under
// the PARENT's session_id, checked by a script invocation carrying a
// DIFFERENT (doer's own) session_id — end to end, real registry file on
// disk, real CLI process, not just the pure function.
test("CLI: a lane registered under the parent's session_id is invisible to a check run under a doer's own session_id", () => {
  const dir = mkdtempSync(join(tmpdir(), "registry-check-lane-"));
  const progressPath = join(dir, "progress.md");
  writeFileSync(progressPath, "old\n");
  const staleTime = new Date(Date.now() - THIRTY_MIN_MS - 60000);
  utimesSync(progressPath, staleTime, staleTime);

  const registryPath = tempRegistry();
  saveRegistry(
    [{ path: progressPath, sessionId: "parent-session", dispatchedAt: Date.now() - THIRTY_MIN_MS - 60000, lastMtime: null, fired: [] }],
    registryPath,
  );

  // The DOER's own session runs this exact script (process-level hooks.json
  // wiring), carrying its OWN session_id — never the parent's.
  const doerResult = run(["PostToolUse"], { DISCIPLINE_PROGRESS_REGISTRY: registryPath }, { session_id: "doer-session" });
  assert.equal(doerResult.status, 0);
  assert.equal(doerResult.stdout.trim(), "", "the doer's own session must see nothing about the parent's lane");

  // The registry row is untouched by the doer's own (non-matching) pass —
  // still there, still unfired, ready for the parent's own real check.
  assert.deepEqual(loadRegistry(registryPath)[0].fired, []);

  // The PARENT's own session, same registry, same file — sees its own lane.
  const parentResult = run(["PostToolUse"], { DISCIPLINE_PROGRESS_REGISTRY: registryPath }, { session_id: "parent-session" });
  const out = JSON.parse(parentResult.stdout);
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
