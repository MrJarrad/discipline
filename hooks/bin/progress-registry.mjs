#!/usr/bin/env node
/* The lane registry `progress-registry-check.mjs` reads and
   `agent-dispatch-gate.mjs` writes to — makes the 15/30-minute parent-side
   check need no memory (`progress-hooks` fix round, 2026-09-27, coordinator:
   "progress-watch.mjs only runs if the parent remembers to start it, which
   is the exact failure the operator saw. Make it need no memory.").

   One JSON file, one entry per in-flight above-line lane, keyed by its
   progress-file path (the same path `agent-dispatch-gate.mjs` already
   requires and validates at dispatch). A lane is added the moment its
   dispatch is allowed (no separate "remember to start a watcher" step) and
   removed the moment its doer session ends (`progress-registry-cleanup.mjs`,
   wired to `SubagentStop`) or by `lane-sweep.mjs`'s stale-entry backstop.

   Global, not per-repo: the parent dispatches across many repos/worktrees
   from one long-lived session, so the registry lives in the parent's own
   home, not any one product repo — overridable via
   `$DISCIPLINE_PROGRESS_REGISTRY` for tests and for a sandboxed run with no
   writable `$HOME`.

   Interface (deep module — small surface):
     registryPath() -> string
     loadRegistry(path?) -> Lane[]
     saveRegistry(entries, path?) -> void
     upsertLane(entries, lane) -> Lane[]   (pure)
     removeLane(entries, path) -> Lane[]   (pure)
     withRegistryLock(mutate, path?) -> mutate's return value

   Lane shape: { path, dispatchedAt, lastMtime: number|null, fired: number[] }
   — `fired` and `lastMtime` mirror the state `progress-watch.mjs`'s `tick()`
   already tracks in memory; this registry is that same state, persisted.

   Root cause fixed here (bugs found running 1.98.0, 2026-09-28): every
   writer — `agent-dispatch-gate.mjs` (register), `progress-registry-check.mjs`
   (PostToolUse/UserPromptSubmit, matcher `*` — fires on EVERY tool call, in
   the parent session AND inside every dispatched doer's own session) and
   `progress-registry-cleanup.mjs` (SubagentStop) — did an unsynchronized
   `loadRegistry() -> mutate one row -> saveRegistry(wholeArray)`. With many
   background lanes in flight (a single real session logged 128
   `run_in_background` dispatches) these run as genuinely concurrent OS
   processes against the one shared file; whichever finishes writing LAST
   wins and silently discards every other process's mutation in between —
   a classic lost-update race. Proved directly: 30 processes each adding one
   row to an empty registry via the old unsynchronized pattern left as few as
   8 of 30 rows. This explains both symptoms: a `SubagentStop` cleanup's
   row-removal getting undone by a `progress-registry-check` write that read
   the registry a moment earlier (rows never removed), and a `fired` update
   getting reverted by another concurrent write that read the pre-update
   state for the same row (15/30-minute tiers re-arming on every call).
   `withRegistryLock` closes the race: an mkdir-based advisory lock (atomic
   file creation, no new dependency) around the read-mutate-write, with a
   bounded synchronous wait and a stale-lock steal so a crashed holder can
   never wedge the registry shut — fail-open past the deadline, the same
   posture every other path in this file already takes. */
import { readFileSync, writeFileSync, mkdirSync, existsSync, openSync, closeSync, unlinkSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

export function registryPath() {
  return process.env.DISCIPLINE_PROGRESS_REGISTRY || join(homedir(), ".claude", "progress-registry.json");
}

/* Never throws — a missing or corrupt registry reads as empty, the same
   fail-open posture every other hook in this plugin takes on its own state
   file (commit-gate's marker, session-journal's journal). */
export function loadRegistry(path = registryPath()) {
  if (!existsSync(path)) return [];
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveRegistry(entries, path = registryPath()) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(entries, null, 2) + "\n");
}

// Pure: add or replace the lane keyed by its own progress path — a
// re-dispatch to the same path (should not happen, but never two rows for
// one lane if it does) replaces rather than duplicates.
export function upsertLane(entries, lane) {
  return [...entries.filter((e) => e.path !== lane.path), lane];
}

// Pure: drop the lane at `path`, if present. A no-op path is not an error —
// cleanup racing a registry that never had the entry (e.g. a `line` lane
// with nothing registered) is expected, not exceptional.
export function removeLane(entries, path) {
  return entries.filter((e) => e.path !== path);
}

const LOCK_STALE_MS = 5000; // a lock this old is a crashed holder, not a slow one — steal it
const LOCK_TIMEOUT_MS = 1500; // bounded — a hook must not hang the tool call it's attached to
const LOCK_RETRY_MS = 20;

function lockFilePath(path) {
  return `${path}.lock`;
}

// Synchronous sleep with no CPU spin — the standard Atomics.wait trick, built-ins only.
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// Acquire an advisory lock for `path` via exclusive file creation (`wx` — atomic: fails if the
// file already exists). Returns the lock's own path once held, or null if the deadline passed
// without acquiring one (fail-open — proceeding unlocked is still better than a hook that hangs
// or denies a tool call over lock contention).
function acquireLock(path) {
  const lp = lockFilePath(path);
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  for (;;) {
    try {
      closeSync(openSync(lp, "wx"));
      return lp;
    } catch (err) {
      if (err?.code !== "EEXIST") return null; // an fs error unrelated to contention — give up unlocked
      try {
        if (Date.now() - statSync(lp).mtimeMs > LOCK_STALE_MS) {
          try {
            unlinkSync(lp);
          } catch {
            /* another process stole it first — just retry */
          }
          continue;
        }
      } catch {
        continue; // the lock vanished between the failed create and this stat — retry immediately
      }
      if (Date.now() >= deadline) return null;
      sleepSync(LOCK_RETRY_MS);
    }
  }
}

function releaseLock(lockPathHeld) {
  if (!lockPathHeld) return;
  try {
    unlinkSync(lockPathHeld);
  } catch {
    /* already gone (e.g. stolen as stale) — nothing left to release */
  }
}

/* The one safe way to mutate the registry from more than one process: holds an advisory lock
   for the whole read-mutate-write, so a concurrent writer never reads state this call is about
   to overwrite. `mutate(entries) -> nextEntries | { entries: nextEntries, ...extra }` runs while
   the lock is held; returning `entries` unchanged (or a same-length array `===` to the input by
   reference) skips the write — a no-op check never bumps the file's mtime. Returns whatever
   `mutate` returned, so callers needing extra data back (e.g. messages to print) can shape it
   that way. Never throws — a lock or fs failure falls back to running `mutate` unlocked rather
   than blocking the caller's tool call. */
export function withRegistryLock(mutate, path = registryPath()) {
  const lockPathHeld = acquireLock(path);
  try {
    const entries = loadRegistry(path);
    const result = mutate(entries);
    const nextEntries = Array.isArray(result) ? result : result?.entries;
    if (nextEntries && nextEntries !== entries) saveRegistry(nextEntries, path);
    return result;
  } finally {
    releaseLock(lockPathHeld);
  }
}

// Expand a `~/` path the same way a shell would — hook input never runs
// through a shell, so `~` is never expanded for us. Shared here (rather than
// duplicated per hook) so every consumer of a brief-derived progress path —
// the dispatch gate, the doer-side floor hook, the registry check — resolves
// it the same way.
export function expandHome(path) {
  if (!path.startsWith("~/")) return path;
  return path.replace(/^~/, process.env.HOME || "");
}
