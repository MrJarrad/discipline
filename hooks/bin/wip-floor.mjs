#!/usr/bin/env node
/* PostToolUse (all tools) — the commit half of the `progress-hooks` doer
   floor. `doer-rules.md` § You are the doer already says "a milestone is a
   progress line AND a local WIP commit" and names the shape (stage by name,
   never `add -A`, never stash) — `progress-floor.mjs` mechanises the first
   half (the progress line); nothing mechanised the second. A lane can write
   a progress line every 10 minutes and still sit on 15 uncommitted files, as
   `lanes-survive-interruption` (2026-09-25) already found once.

   Fires the same way `progress-floor.mjs` does — after every tool call in
   the doer's own session, resolving the lane's WORKTREE (not its progress
   path) from the brief's `Repo`/`worktree` lines via
   `agent-dispatch-gate.mjs`'s own `findRepoContext` — reused rather than
   re-derived, so a brief the dispatch gate parsed is read the same way here.
   `git status --porcelain` against that worktree plus the on-disk mtime of
   each changed path decides staleness; past 10 minutes uncommitted, it
   injects a reminder via `additionalContext` — never a deny, fail-open at
   every step (no brief, no worktree, not a git dir, git unavailable).

   Throttled to at most once per minute PER WORKTREE (a small JSON cache,
   `~/.claude/wip-floor-throttle.json`, mirroring the shape of
   `progress-registry.mjs`'s own state file) — this hook runs on every tool
   call, so an unthrottled git-status-plus-stat-every-changed-path cost on
   every single call would be needless overhead once the reminder has
   already fired for the same staleness window; a throttled repeat call also
   skips ALL git/stat work, the cheapest path a repeat call can take.

   A deleted path with no reason on disk to read an mtime from is skipped
   when computing staleness (its age can't be measured) rather than treated
   as always-stale or always-fresh — the other changed paths still count.

   Usage: fires from hooks.json; also callable directly for a dry-run —
     node wip-floor.mjs < hook-input.json                                    */
import { readFileSync, statSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { findRepoContext } from "./agent-dispatch-gate.mjs";
import { firstUserMessageText } from "./progress-floor.mjs";

export const WIP_STALE_MS = 10 * 60 * 1000;
export const THROTTLE_MS = 60 * 1000;

/* Resolve the lane's own git worktree directory from a brief's text — the
   worktree line when the brief names one, else the repo line itself (a
   dispatch working directly in `<repo>/main` with no separate worktree).
   null when the brief names neither (a `Size: line` lane, or a brief this
   hook cannot parse). */
export function resolveWorktreePath(briefText) {
  const context = findRepoContext(briefText);
  if (!context) return null;
  return context.worktreePath || context.repoPath || null;
}

/* Parse `git status --porcelain` output into the list of changed paths,
   relative to the directory `git -C <dir> status` was run against. Handles
   the rename shape (`R  old -> new` — keeps the new path) and a
   quote-wrapped path (git quotes any path carrying unusual characters). */
export function parsePorcelainPaths(output) {
  const paths = [];
  for (const line of String(output || "").split("\n")) {
    if (line.length < 4) continue;
    let rest = line.slice(3);
    const arrow = rest.indexOf(" -> ");
    if (arrow !== -1) rest = rest.slice(arrow + 4);
    rest = rest.trim();
    if (rest.startsWith('"') && rest.endsWith('"')) rest = rest.slice(1, -1);
    if (rest) paths.push(rest);
  }
  return paths;
}

/* The oldest mtime-age (ms) among `paths`, each resolved against
   `worktreePath` — null when none of the paths could be stat'd (all
   deleted, or the worktree itself is gone). Injectable `statFn` for tests. */
export function oldestChangeAgeMs(worktreePath, paths, now = Date.now(), statFn = statSync) {
  let oldest = null;
  for (const path of paths) {
    let st;
    try {
      st = statFn(join(worktreePath, path));
    } catch {
      continue; // deleted or unreadable — can't measure this one, skip it
    }
    const age = now - st.mtimeMs;
    if (oldest === null || age > oldest) oldest = age;
  }
  return oldest;
}

/* The reminder text injected once a worktree has a stale uncommitted
   change. Matches the lock's own wording (`2026-09-29-wip-floor` lock). */
export function reminderText(worktreePath) {
  return (
    `You have uncommitted changes older than 10 min in ${worktreePath}: commit a WIP ` +
    `snapshot now, staging paths by name (never add -A, never stash).`
  );
}

/* Pure decision: given the count of changed paths and the oldest age among
   the ones that could be measured, the message to inject or null. No
   changes, or none old enough, or none measurable at all → null. */
export function wipReminder(worktreePath, { changedCount, oldestAgeMs }) {
  if (!changedCount) return null;
  if (oldestAgeMs === null || oldestAgeMs === undefined) return null;
  if (oldestAgeMs < WIP_STALE_MS) return null;
  return reminderText(worktreePath);
}

export function throttlePath() {
  return process.env.DISCIPLINE_WIP_THROTTLE || join(homedir(), ".claude", "wip-floor-throttle.json");
}

// Never throws — a missing or corrupt throttle cache reads as empty, the
// same fail-open posture `progress-registry.mjs` takes on its own state file.
export function loadThrottle(path = throttlePath()) {
  if (!existsSync(path)) return {};
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function saveThrottle(map, path = throttlePath()) {
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(map, null, 2) + "\n");
  } catch {
    /* fail-open — a throttle write failure is never worse than the reminder
       it would otherwise gate */
  }
}

/* Pure: has this worktree already fired within the last THROTTLE_MS? */
export function isThrottled(map, worktreePath, now = Date.now()) {
  const last = map[worktreePath];
  return typeof last === "number" && now - last < THROTTLE_MS;
}

function readHookInput() {
  try {
    return JSON.parse(readFileSync(0, "utf8") || "{}");
  } catch {
    return {};
  }
}

function main() {
  const input = readHookInput();
  const transcriptPath = input.transcript_path;
  if (!transcriptPath || !existsSync(transcriptPath)) process.exit(0);

  let brief = "";
  try {
    brief = firstUserMessageText(readFileSync(transcriptPath, "utf8"));
  } catch {
    process.exit(0);
  }

  const worktreePath = resolveWorktreePath(brief);
  if (!worktreePath) process.exit(0); // no resolvable worktree — nothing to check

  const now = Date.now();
  const throttleMap = loadThrottle();
  if (isThrottled(throttleMap, worktreePath, now)) process.exit(0); // cheapest path: no git/stat work at all

  let statusOutput;
  try {
    statusOutput = execFileSync("git", ["-C", worktreePath, "status", "--porcelain"], { encoding: "utf8" });
  } catch {
    process.exit(0); // not a git dir (worktree not created yet), or git unavailable
  }

  const paths = parsePorcelainPaths(statusOutput);
  if (paths.length === 0) process.exit(0); // clean worktree

  const oldestAgeMs = oldestChangeAgeMs(worktreePath, paths, now);
  const message = wipReminder(worktreePath, { changedCount: paths.length, oldestAgeMs });
  if (!message) process.exit(0);

  throttleMap[worktreePath] = now;
  saveThrottle(throttleMap);

  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext: message,
      },
    }),
  );
  process.exit(0);
}

if (process.argv[1] && process.argv[1].endsWith("wip-floor.mjs")) main();
