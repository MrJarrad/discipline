// Tests for the WIP-commit floor hook (`2026-09-29-wip-floor` lock, operator
// "yes"): a reminder, never a block, when a lane's own worktree has
// uncommitted changes older than 10 minutes. Pure decisions unit-tested
// directly; the CLI process driven end to end against a real git worktree.
// Run: node --test hooks/bin/wip-floor.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync, execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, utimesSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  WIP_STALE_MS,
  THROTTLE_MS,
  resolveWorktreePath,
  parsePorcelainPaths,
  oldestChangeAgeMs,
  reminderText,
  wipReminder,
  loadThrottle,
  saveThrottle,
  isThrottled,
} from "./wip-floor.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const hook = join(here, "wip-floor.mjs");

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

// --- CLI process, end to end -------------------------------------------------

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

function makeSession(worktreeDir) {
  const dir = mkdtempSync(join(tmpdir(), "wip-floor-session-"));
  const transcriptPath = join(dir, "session.jsonl");
  const throttlePath = join(dir, "throttle.json");
  const brief = `Repo \`${worktreeDir}\`, working directly on main.\n\n## Progress\n\`${join(dir, "progress.md")}\`\n`;
  writeFileSync(transcriptPath, JSON.stringify({ type: "user", message: { content: brief } }) + "\n");
  return { dir, transcriptPath, throttlePath };
}

const run = (input, env = {}) =>
  spawnSync(process.execPath, [hook], {
    input: JSON.stringify(input),
    encoding: "utf8",
    env: { ...process.env, ...env },
  });

test("hook process: stale uncommitted change — reminder injected", () => {
  const worktreeDir = makeGitWorktree();
  const changedFile = join(worktreeDir, "a.mjs");
  writeFileSync(changedFile, "stale\n");
  const staleTime = new Date(Date.now() - WIP_STALE_MS - 60000);
  utimesSync(changedFile, staleTime, staleTime);
  const { transcriptPath, throttlePath } = makeSession(worktreeDir);

  const result = run({ transcript_path: transcriptPath }, { DISCIPLINE_WIP_THROTTLE: throttlePath });
  assert.equal(result.status, 0);
  const out = JSON.parse(result.stdout);
  assert.equal(out.hookSpecificOutput.hookEventName, "PostToolUse");
  assert.match(out.hookSpecificOutput.additionalContext, /commit a WIP snapshot now/);
  assert.match(out.hookSpecificOutput.additionalContext, new RegExp(worktreeDir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("hook process: fresh uncommitted change — silent", () => {
  const worktreeDir = makeGitWorktree();
  writeFileSync(join(worktreeDir, "a.mjs"), "fresh\n");
  const { transcriptPath, throttlePath } = makeSession(worktreeDir);

  const result = run({ transcript_path: transcriptPath }, { DISCIPLINE_WIP_THROTTLE: throttlePath });
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), "");
});

test("hook process: clean worktree (no changes at all) — silent", () => {
  const worktreeDir = makeGitWorktree();
  const { transcriptPath, throttlePath } = makeSession(worktreeDir);

  const result = run({ transcript_path: transcriptPath }, { DISCIPLINE_WIP_THROTTLE: throttlePath });
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), "");
});

test("hook process: no resolvable worktree (line-lane brief) — silent", () => {
  const dir = mkdtempSync(join(tmpdir(), "wip-floor-session-"));
  const transcriptPath = join(dir, "session.jsonl");
  writeFileSync(
    transcriptPath,
    JSON.stringify({ type: "user", message: { content: "Size: line.\n\nJust fix the file." } }) + "\n",
  );
  const result = run({ transcript_path: transcriptPath }, { DISCIPLINE_WIP_THROTTLE: join(dir, "throttle.json") });
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), "");
});

test("hook process: Repo line pointing at a non-git directory — silent, never throws", () => {
  const dir = mkdtempSync(join(tmpdir(), "wip-floor-notgit-"));
  const { transcriptPath, throttlePath } = makeSession(dir);
  const result = run({ transcript_path: transcriptPath }, { DISCIPLINE_WIP_THROTTLE: throttlePath });
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), "");
});

test("hook process: missing transcript path — allowed, never throws", () => {
  const result = run({ transcript_path: "/does/not/exist.jsonl" });
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), "");
});

test("hook process: throttle holds — a second stale call within a minute stays silent", () => {
  const worktreeDir = makeGitWorktree();
  const changedFile = join(worktreeDir, "a.mjs");
  writeFileSync(changedFile, "stale\n");
  const staleTime = new Date(Date.now() - WIP_STALE_MS - 60000);
  utimesSync(changedFile, staleTime, staleTime);
  const { transcriptPath, throttlePath } = makeSession(worktreeDir);

  const first = run({ transcript_path: transcriptPath }, { DISCIPLINE_WIP_THROTTLE: throttlePath });
  assert.notEqual(first.stdout.trim(), "");

  const second = run({ transcript_path: transcriptPath }, { DISCIPLINE_WIP_THROTTLE: throttlePath });
  assert.equal(second.status, 0);
  assert.equal(second.stdout.trim(), "", "throttled repeat call must stay silent");
});

test("hook process: throttle expired (backdated entry) — reminder fires again", () => {
  const worktreeDir = makeGitWorktree();
  const changedFile = join(worktreeDir, "a.mjs");
  writeFileSync(changedFile, "stale\n");
  const staleTime = new Date(Date.now() - WIP_STALE_MS - 60000);
  utimesSync(changedFile, staleTime, staleTime);
  const { transcriptPath, throttlePath } = makeSession(worktreeDir);
  saveThrottle({ [worktreeDir]: Date.now() - THROTTLE_MS - 1000 }, throttlePath);

  const result = run({ transcript_path: transcriptPath }, { DISCIPLINE_WIP_THROTTLE: throttlePath });
  assert.notEqual(result.stdout.trim(), "");
});

// --- wiring --------------------------------------------------------------

test("hooks.json fires wip-floor on PostToolUse for every tool", async () => {
  const { readFileSync } = await import("node:fs");
  const repo = join(here, "..", "..");
  const hooks = JSON.parse(readFileSync(join(repo, "hooks", "hooks.json"), "utf8"));
  const post = hooks.hooks.PostToolUse;
  const entry = post.find((h) => h.hooks.some((c) => /wip-floor\.mjs/.test(c.command)));
  assert.ok(entry, "no PostToolUse entry wiring wip-floor.mjs");
  assert.equal(entry.matcher, "*", "must fire on every tool, not a subset");
});
