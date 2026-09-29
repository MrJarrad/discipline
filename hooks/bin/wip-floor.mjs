/* The commit half of the `progress-hooks` doer floor — a library of pure
   and small-impure pieces `progress-floor.mjs` imports and calls from its
   own `main()` (folded in per the lock's own words: "extend the 10-min
   progress-floor hook"; one spawn per tool call, not two).
   `doer-rules.md` § You are the doer already says "a milestone is a
   progress line AND a local WIP commit" and names the shape (stage by name,
   never `add -A`, never stash) — `progress-floor.mjs` mechanised the first
   half (the progress line); nothing mechanised the second. A lane can write
   a progress line every 10 minutes and still sit on 15 uncommitted files, as
   `lanes-survive-interruption` (2026-09-25) already found once.

   Resolves the lane's WORKTREE (not its progress path) from the brief's
   `Repo`/`worktree` lines via `agent-dispatch-gate.mjs`'s own
   `findRepoContext` — reused rather than re-derived. `git status
   --porcelain` against that worktree plus the on-disk mtime of each changed
   path decides staleness; past 10 minutes uncommitted, `wipReminderForWorktree`
   returns a reminder string for the caller to fold into its own
   `additionalContext` — never a deny, fail-open at every step (no worktree,
   not a git dir, git unavailable).

   Throttled to at most once per minute PER WORKTREE (a small JSON cache,
   `~/.claude/wip-floor-throttle.json`, mirroring the shape of
   `progress-registry.mjs`'s own state file) — a throttled repeat call skips
   ALL git/stat work, the cheapest path a repeat call can take. On every
   write, the cache is pruned of entries whose worktree no longer exists on
   disk or that are older than 24h — an unbounded lane count over a long
   session must never grow this file forever.

   A deleted path with no reason on disk to read an mtime from is skipped
   when computing staleness (its age can't be measured) rather than treated
   as always-stale or always-fresh — the other changed paths still count. */
import { readFileSync, statSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { findRepoContext } from "./agent-dispatch-gate.mjs";

export const WIP_STALE_MS = 10 * 60 * 1000;
export const THROTTLE_MS = 60 * 1000;
export const THROTTLE_PRUNE_MS = 24 * 60 * 60 * 1000;

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

/* Drop any entry older than THROTTLE_PRUNE_MS, and any entry whose worktree
   path no longer exists on disk — a lane that finished and its worktree was
   removed, or a long session accumulating one row per lane it ever touched,
   must never grow this cache forever. Injectable `existsFn` for tests. */
export function pruneThrottle(map, now = Date.now(), existsFn = existsSync) {
  const pruned = {};
  for (const [worktreePath, firedAt] of Object.entries(map)) {
    if (typeof firedAt !== "number") continue;
    if (now - firedAt > THROTTLE_PRUNE_MS) continue;
    if (!existsFn(worktreePath)) continue;
    pruned[worktreePath] = firedAt;
  }
  return pruned;
}

/* The one entry point the caller (`progress-floor.mjs`'s `main()`) needs:
   given a resolved worktree path, the reminder string or null. Composes
   every piece above — throttle check (cheapest path, no git/stat work at
   all when throttled), `git status --porcelain`, path parsing, oldest-age
   computation, the pure decision, and — only when a reminder actually
   fires — a pruned throttle write. Never throws; every internal step
   already fails open. */
export function wipReminderForWorktree(worktreePath, now = Date.now()) {
  const throttleMap = loadThrottle();
  if (isThrottled(throttleMap, worktreePath, now)) return null; // cheapest path: no git/stat work at all

  let statusOutput;
  try {
    statusOutput = execFileSync("git", ["-C", worktreePath, "status", "--porcelain"], { encoding: "utf8" });
  } catch {
    return null; // not a git dir (worktree not created yet), or git unavailable
  }

  const paths = parsePorcelainPaths(statusOutput);
  if (paths.length === 0) return null; // clean worktree

  const oldestAgeMs = oldestChangeAgeMs(worktreePath, paths, now);
  const message = wipReminder(worktreePath, { changedCount: paths.length, oldestAgeMs });
  if (!message) return null;

  const pruned = pruneThrottle(throttleMap, now);
  pruned[worktreePath] = now;
  saveThrottle(pruned);

  return message;
}
