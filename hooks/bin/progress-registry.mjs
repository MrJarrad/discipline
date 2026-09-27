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

   Lane shape: { path, dispatchedAt, lastMtime: number|null, fired: number[] }
   — `fired` and `lastMtime` mirror the state `progress-watch.mjs`'s `tick()`
   already tracks in memory; this registry is that same state, persisted. */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
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

// Expand a `~/` path the same way a shell would — hook input never runs
// through a shell, so `~` is never expanded for us. Shared here (rather than
// duplicated per hook) so every consumer of a brief-derived progress path —
// the dispatch gate, the doer-side floor hook, the registry check — resolves
// it the same way.
export function expandHome(path) {
  if (!path.startsWith("~/")) return path;
  return path.replace(/^~/, process.env.HOME || "");
}
