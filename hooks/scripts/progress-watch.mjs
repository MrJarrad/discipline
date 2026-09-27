#!/usr/bin/env node
/* Parent-side half of the progress-hooks ruling (`progress-hooks`,
   2026-09-27, operator: "yes" to both hooks; "yes, steps plus the 10-minute
   floor"). doer-rules.md § You are the doer has always asked the PARENT to
   read the worktree diff at 15 minutes silent and stop + re-brief at 30 —
   nothing made that mechanical; it relied on the parent remembering to
   check. Claude Code hooks are event-triggered (a tool call, a session
   boundary), never wall-clock-triggered, so there is no hook event that
   fires purely on a timer to interrupt an already-running parent session —
   `hooks/bin/progress-floor.mjs`'s own header explains the doer side of
   that same fact. The closest REAL mechanism is this: a small script the
   PARENT starts itself, once, at dispatch, via `run_in_background` and the
   Monitor tool ("stream events from a background process — each stdout
   line is a notification", per the Bash tool's own description) — it polls
   the lane's progress-file mtime and prints exactly one line at 15 minutes
   silent and one more at 30, then exits. Every stdout line becomes a
   Monitor notification the parent actually receives, which is the honest
   substitute for a "hook that watches the clock while nobody calls a tool" —
   there is no hook for that.

   Usage (parent, right after dispatching the lane):
     node progress-watch.mjs <progress-file-path> [--poll-ms 30000]
   then hand the process to Monitor with run_in_background. Exits on its own
   once the 30-minute line has printed — the parent stops the lane itself;
   this script's job is the notification, not the stop.

   The polling loop is intentionally the only impure part; the tier decision
   (`nextTier`) and the silence-reset rule (`tick`) are pure and unit-tested
   directly, with no timers involved. */
import { existsSync, statSync } from "node:fs";

export const FIFTEEN_MIN_MS = 15 * 60 * 1000;
export const THIRTY_MIN_MS = 30 * 60 * 1000;

/* Pure: given how long the file has been silent and which tiers already
   fired this silence, return the next tier to fire (15 or 30), or null. 30
   always takes priority over 15 when both are newly due in the same tick
   (a slow poll interval could otherwise skip straight past 15). */
export function nextTier(elapsedMs, fired) {
  if (elapsedMs >= THIRTY_MIN_MS && !fired.has(30)) return 30;
  if (elapsedMs >= FIFTEEN_MIN_MS && !fired.has(15)) return 15;
  return null;
}

export function tierMessage(tier, path) {
  if (tier === 30) {
    return `progress-watch: ${path} — 30 min silent. Stop the lane and re-brief a fresh agent from the last recorded milestone (doer-rules.md § You are the doer).`;
  }
  return `progress-watch: ${path} — 15 min silent. Read the worktree diff directly; the doer may still be working (doer-rules.md § You are the doer).`;
}

/* Pure state transition for one poll. `state` is { lastMtime: number|null,
   fired: Set<15|30> }. A new mtime (the doer wrote a line) clears both
   tiers — the silence that mattered is over, even if the doer goes quiet
   again later. Returns { state, message } — message is null when nothing is
   newly due this tick. */
export function tick(state, { mtime, now }) {
  let fired = state.fired;
  if (state.lastMtime !== null && mtime !== state.lastMtime) {
    fired = new Set(); // a new line landed — the prior silence is resolved
  }
  const elapsedMs = now - mtime;
  const tier = nextTier(elapsedMs, fired);
  const nextFired = tier ? new Set(fired).add(tier) : fired;
  return { state: { lastMtime: mtime, fired: nextFired }, tier };
}

function readMtimeOrDispatch(path, dispatchMs) {
  if (existsSync(path)) return statSync(path).mtimeMs;
  return dispatchMs; // never created yet — silence is measured from dispatch
}

function parseArgs(argv) {
  const args = { path: null, pollMs: 30000 };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--poll-ms") args.pollMs = Number(argv[++i]) || args.pollMs;
    else rest.push(argv[i]);
  }
  args.path = rest[0] || null;
  return args;
}

function main() {
  const { path, pollMs } = parseArgs(process.argv.slice(2));
  if (!path) {
    console.error("usage: progress-watch.mjs <progress-file-path> [--poll-ms N]");
    process.exit(1);
  }

  const dispatchMs = Date.now();
  let state = { lastMtime: null, fired: new Set() };

  const timer = setInterval(() => {
    const mtime = readMtimeOrDispatch(path, dispatchMs);
    const result = tick(state, { mtime, now: Date.now() });
    state = result.state;
    if (result.tier) {
      console.log(tierMessage(result.tier, path));
      if (result.tier === 30) {
        clearInterval(timer);
        process.exit(0);
      }
    }
  }, pollMs);
}

if (process.argv[1] && process.argv[1].endsWith("progress-watch.mjs")) main();
