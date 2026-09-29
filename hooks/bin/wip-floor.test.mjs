// Tests for the WIP-commit floor library (`2026-09-29-wip-floor` lock,
// operator "yes" — fix round 2: folded into `progress-floor.mjs`'s own
// `main()`, so this module carries no CLI/process entry of its own anymore;
// `progress-floor.test.mjs` covers the end-to-end/wiring behaviour).
// Run: node --test hooks/bin/wip-floor.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, utimesSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  WIP_STALE_MS,
  THROTTLE_MS,
  THROTTLE_PRUNE_MS,
  resolveWorktreePath,
  parsePorcelainPaths,
  oldestChangeAgeMs,
  reminderText,
  wipReminder,
  loadThrottle,
  saveThrottle,
  isThrottled,
  pruneThrottle,
  wipReminderForWorktree,
} from "./wip-floor.mjs";

// --- wipReminder (pure decision) --------------------------------------------

test("no changed paths — no reminder", () => {
  assert.equal(wipReminder("/wt", { changedCount: 0, oldestAgeMs: null }), null);
});

test("changed paths but none measurable (all deleted) — no reminder", () => {
  assert.equal(wipReminder("/wt", { changedCount: 2, oldestAgeMs: null }), null);
});

test("changed paths, oldest under the floor — no reminder", () => {
  assert.equal(wipReminder("/wt", { changedCount: 1, oldestAgeMs: WIP_STALE_MS - 1000 }), null);
});

test("changed paths, oldest at or past the floor — reminder naming the worktree", () => {
  const msg = wipReminder("/wt", { changedCount: 1, oldestAgeMs: WIP_STALE_MS });
  assert.match(msg, /\/wt/);
  assert.match(msg, /commit a WIP snapshot now/);
  assert.match(msg, /never add -A, never stash/);
});

test("reminderText names the worktree and the exact staging rule", () => {
  const msg = reminderText("/x/wt");
  assert.match(msg, /uncommitted changes older than 10 min in \/x\/wt/);
  assert.match(msg, /staging paths by name/);
});

// --- resolveWorktreePath ------------------------------------------------------

test("resolveWorktreePath prefers the worktree line over the repo line", () => {
  const brief = "Repo `/x/repo`, worktree `/x/repo/worktrees/feat-a`, branch `feat/a`.";
  assert.equal(resolveWorktreePath(brief), "/x/repo/worktrees/feat-a");
});

test("resolveWorktreePath falls back to the repo line when no worktree is named", () => {
  const brief = "Repo `/x/repo`, working directly on main.";
  assert.equal(resolveWorktreePath(brief), "/x/repo");
});

test("resolveWorktreePath returns null with no Repo line at all", () => {
  assert.equal(resolveWorktreePath("Size: line.\n\nJust fix the one file."), null);
});

// --- parsePorcelainPaths -------------------------------------------------------

test("parsePorcelainPaths reads a plain modified/added/untracked line", () => {
  assert.deepEqual(parsePorcelainPaths(" M src/a.mjs\n?? src/b.mjs\n"), ["src/a.mjs", "src/b.mjs"]);
});

test("parsePorcelainPaths keeps only the new path of a rename", () => {
  assert.deepEqual(parsePorcelainPaths("R  old/a.mjs -> new/a.mjs\n"), ["new/a.mjs"]);
});

test("parsePorcelainPaths strips quote-wrapped paths", () => {
  assert.deepEqual(parsePorcelainPaths('?? "src/weird name.mjs"\n'), ["src/weird name.mjs"]);
});

test("parsePorcelainPaths returns [] for empty or blank output", () => {
  assert.deepEqual(parsePorcelainPaths(""), []);
  assert.deepEqual(parsePorcelainPaths("\n\n"), []);
});

// --- oldestChangeAgeMs -----------------------------------------------------

test("oldestChangeAgeMs returns the max age among stat-able paths", () => {
  const now = 1_000_000;
  const statFn = (p) => {
    if (p.endsWith("old.mjs")) return { mtimeMs: now - WIP_STALE_MS - 5000 };
    if (p.endsWith("new.mjs")) return { mtimeMs: now - 1000 };
    throw new Error("ENOENT");
  };
  assert.equal(oldestChangeAgeMs("/wt", ["old.mjs", "new.mjs"], now, statFn), WIP_STALE_MS + 5000);
});

test("oldestChangeAgeMs returns null when every path fails to stat", () => {
  const statFn = () => {
    throw new Error("ENOENT");
  };
  assert.equal(oldestChangeAgeMs("/wt", ["gone.mjs"], 1_000_000, statFn), null);
});

// --- throttle ----------------------------------------------------------------

test("isThrottled is true within THROTTLE_MS of the last fire, false after", () => {
  const now = 1_000_000;
  const map = { "/wt": now - THROTTLE_MS + 1000 };
  assert.equal(isThrottled(map, "/wt", now), true);
  assert.equal(isThrottled({ "/wt": now - THROTTLE_MS - 1000 }, "/wt", now), false);
});

test("isThrottled is false for a worktree with no entry", () => {
  assert.equal(isThrottled({}, "/other", 1_000_000), false);
});

test("loadThrottle round-trips through saveThrottle", () => {
  const dir = mkdtempSync(join(tmpdir(), "wip-throttle-"));
  const path = join(dir, "throttle.json");
  saveThrottle({ "/wt": 123 }, path);
  assert.deepEqual(loadThrottle(path), { "/wt": 123 });
});

test("loadThrottle reads a missing or corrupt file as empty", () => {
  const dir = mkdtempSync(join(tmpdir(), "wip-throttle-"));
  assert.deepEqual(loadThrottle(join(dir, "missing.json")), {});
  const bad = join(dir, "bad.json");
  writeFileSync(bad, "not json");
  assert.deepEqual(loadThrottle(bad), {});
});

// --- pruneThrottle -----------------------------------------------------------

test("pruneThrottle drops an entry older than THROTTLE_PRUNE_MS even if the worktree exists", () => {
  const now = 1_000_000_000;
  const map = { "/wt": now - THROTTLE_PRUNE_MS - 1 };
  assert.deepEqual(pruneThrottle(map, now, () => true), {});
});

test("pruneThrottle drops an entry whose worktree no longer exists, even if fresh", () => {
  const now = 1_000_000_000;
  const map = { "/gone": now - 1000 };
  assert.deepEqual(pruneThrottle(map, now, () => false), {});
});

test("pruneThrottle keeps a fresh entry for an existing worktree", () => {
  const now = 1_000_000_000;
  const map = { "/wt": now - 1000 };
  assert.deepEqual(pruneThrottle(map, now, () => true), { "/wt": now - 1000 });
});

test("pruneThrottle drops a malformed (non-numeric) entry", () => {
  const now = 1_000_000_000;
  assert.deepEqual(pruneThrottle({ "/wt": "not-a-number" }, now, () => true), {});
});

// --- wipReminderForWorktree, end to end against a real git worktree ----------

function makeGitWorktree() {
  const dir = mkdtempSync(join(tmpdir(), "wip-floor-repo-"));
  execFileSync("git", ["init", "-q"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: dir });
  writeFileSync(join(dir, "README.md"), "seed\n");
  execFileSync("git", ["add", "README.md"], { cwd: dir });
  execFileSync("git", ["commit", "-q", "-m", "seed"], { cwd: dir });
  return dir;
}

test("wipReminderForWorktree: stale uncommitted change — reminder, and throttle written", () => {
  const worktreeDir = makeGitWorktree();
  const changedFile = join(worktreeDir, "a.mjs");
  writeFileSync(changedFile, "stale\n");
  const staleTime = new Date(Date.now() - WIP_STALE_MS - 60000);
  utimesSync(changedFile, staleTime, staleTime);
  const throttlePath = join(mkdtempSync(join(tmpdir(), "wip-throttle-")), "throttle.json");
  process.env.DISCIPLINE_WIP_THROTTLE = throttlePath;
  try {
    const message = wipReminderForWorktree(worktreeDir);
    assert.match(message, /commit a WIP snapshot now/);
    assert.match(message, new RegExp(worktreeDir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.ok(typeof loadThrottle(throttlePath)[worktreeDir] === "number");
  } finally {
    delete process.env.DISCIPLINE_WIP_THROTTLE;
  }
});

test("wipReminderForWorktree: fresh uncommitted change — null", () => {
  const worktreeDir = makeGitWorktree();
  writeFileSync(join(worktreeDir, "a.mjs"), "fresh\n");
  const throttlePath = join(mkdtempSync(join(tmpdir(), "wip-throttle-")), "throttle.json");
  process.env.DISCIPLINE_WIP_THROTTLE = throttlePath;
  try {
    assert.equal(wipReminderForWorktree(worktreeDir), null);
  } finally {
    delete process.env.DISCIPLINE_WIP_THROTTLE;
  }
});

test("wipReminderForWorktree: clean worktree — null", () => {
  const worktreeDir = makeGitWorktree();
  const throttlePath = join(mkdtempSync(join(tmpdir(), "wip-throttle-")), "throttle.json");
  process.env.DISCIPLINE_WIP_THROTTLE = throttlePath;
  try {
    assert.equal(wipReminderForWorktree(worktreeDir), null);
  } finally {
    delete process.env.DISCIPLINE_WIP_THROTTLE;
  }
});

test("wipReminderForWorktree: not a git directory — null, never throws", () => {
  const dir = mkdtempSync(join(tmpdir(), "wip-floor-notgit-"));
  const throttlePath = join(mkdtempSync(join(tmpdir(), "wip-throttle-")), "throttle.json");
  process.env.DISCIPLINE_WIP_THROTTLE = throttlePath;
  try {
    assert.equal(wipReminderForWorktree(dir), null);
  } finally {
    delete process.env.DISCIPLINE_WIP_THROTTLE;
  }
});

test("wipReminderForWorktree: throttle holds — a second stale call within a minute stays silent", () => {
  const worktreeDir = makeGitWorktree();
  const changedFile = join(worktreeDir, "a.mjs");
  writeFileSync(changedFile, "stale\n");
  const staleTime = new Date(Date.now() - WIP_STALE_MS - 60000);
  utimesSync(changedFile, staleTime, staleTime);
  const throttlePath = join(mkdtempSync(join(tmpdir(), "wip-throttle-")), "throttle.json");
  process.env.DISCIPLINE_WIP_THROTTLE = throttlePath;
  try {
    const first = wipReminderForWorktree(worktreeDir);
    assert.notEqual(first, null);
    const second = wipReminderForWorktree(worktreeDir);
    assert.equal(second, null, "throttled repeat call must stay silent");
  } finally {
    delete process.env.DISCIPLINE_WIP_THROTTLE;
  }
});

test("wipReminderForWorktree: firing prunes a stale entry for an already-removed worktree", () => {
  const worktreeDir = makeGitWorktree();
  const changedFile = join(worktreeDir, "a.mjs");
  writeFileSync(changedFile, "stale\n");
  const staleTime = new Date(Date.now() - WIP_STALE_MS - 60000);
  utimesSync(changedFile, staleTime, staleTime);
  const throttlePath = join(mkdtempSync(join(tmpdir(), "wip-throttle-")), "throttle.json");

  // A worktree that no longer exists on disk, pre-seeded into the cache.
  const removedWorktree = mkdtempSync(join(tmpdir(), "wip-floor-removed-"));
  rmSync(removedWorktree, { recursive: true, force: true });
  saveThrottle({ [removedWorktree]: Date.now() - THROTTLE_MS - 1000 }, throttlePath);

  process.env.DISCIPLINE_WIP_THROTTLE = throttlePath;
  try {
    wipReminderForWorktree(worktreeDir);
    const after = loadThrottle(throttlePath);
    assert.ok(!(removedWorktree in after), "removed worktree's entry must be pruned on write");
    assert.ok(worktreeDir in after, "the firing worktree's own entry must be written");
  } finally {
    delete process.env.DISCIPLINE_WIP_THROTTLE;
  }
});
