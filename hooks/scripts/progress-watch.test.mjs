// Tests for the parent-side progress watcher (`progress-hooks`, 2026-09-27).
// The tier decision and the silence-reset state transition are pure and
// tested with no real timers; the CLI process is smoke-tested end to end
// with a fast poll interval against a real file on disk.
// Run: node --test hooks/scripts/progress-watch.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { FIFTEEN_MIN_MS, THIRTY_MIN_MS, nextTier, tierMessage, tick } from "./progress-watch.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const watcher = join(here, "progress-watch.mjs");

// --- nextTier ----------------------------------------------------------------

test("under 15 minutes silent: no tier due", () => {
  assert.equal(nextTier(FIFTEEN_MIN_MS - 1000, new Set()), null);
});

test("15 minutes silent, 15 not yet fired: fires 15", () => {
  assert.equal(nextTier(FIFTEEN_MIN_MS, new Set()), 15);
});

test("15 minutes silent, 15 already fired: nothing due again", () => {
  assert.equal(nextTier(FIFTEEN_MIN_MS + 60000, new Set([15])), null);
});

test("30 minutes silent, neither fired: fires 30, not 15 — 30 takes priority", () => {
  assert.equal(nextTier(THIRTY_MIN_MS, new Set()), 30);
});

test("30 minutes silent, 15 fired but not 30: fires 30", () => {
  assert.equal(nextTier(THIRTY_MIN_MS, new Set([15])), 30);
});

test("30 minutes silent, both fired: nothing due", () => {
  assert.equal(nextTier(THIRTY_MIN_MS + 60000, new Set([15, 30])), null);
});

// --- tick (silence-reset state transition) ------------------------------------

test("tick fires 15 once elapsed crosses the floor, from a fresh state", () => {
  const state = { lastMtime: null, fired: new Set() };
  const now = Date.now();
  const mtime = now - FIFTEEN_MIN_MS;
  const result = tick(state, { mtime, now });
  assert.equal(result.tier, 15);
  assert.ok(result.state.fired.has(15));
});

test("tick does not re-fire 15 on a later tick with the same mtime", () => {
  const now = Date.now();
  const mtime = now - FIFTEEN_MIN_MS;
  const first = tick({ lastMtime: null, fired: new Set() }, { mtime, now });
  const second = tick(first.state, { mtime, now: now + 60000 });
  assert.equal(second.tier, null);
});

test("a new mtime (the doer wrote a line) clears fired tiers — silence resolved", () => {
  const now = Date.now();
  const staleMtime = now - FIFTEEN_MIN_MS;
  const afterFifteen = tick({ lastMtime: null, fired: new Set() }, { mtime: staleMtime, now });
  assert.equal(afterFifteen.tier, 15);

  // The doer writes a fresh line: mtime advances, we're fresh again.
  const freshTick = tick(afterFifteen.state, { mtime: now, now: now + 1000 });
  assert.equal(freshTick.tier, null);
  assert.equal(freshTick.state.fired.size, 0);

  // Goes silent again for 15 more minutes from the NEW mtime — fires again.
  const silentAgain = tick(freshTick.state, { mtime: now, now: now + 1000 + FIFTEEN_MIN_MS });
  assert.equal(silentAgain.tier, 15);
});

test("elapsed straight past 30 with no prior tick fires 30, never 15 first", () => {
  const now = Date.now();
  const mtime = now - THIRTY_MIN_MS - 60000;
  const result = tick({ lastMtime: null, fired: new Set() }, { mtime, now });
  assert.equal(result.tier, 30);
});

// --- tierMessage ---------------------------------------------------------------

test("tierMessage names the file and the doer-rules action for each tier", () => {
  assert.match(tierMessage(15, "/x/progress.md"), /\/x\/progress\.md/);
  assert.match(tierMessage(15, "/x/progress.md"), /Read the worktree diff/);
  assert.match(tierMessage(30, "/x/progress.md"), /Stop the lane and re-brief/);
});

// --- CLI process, end to end (fast poll, real file, no real 15/30 min wait) ---

function waitForLine(child, timeoutMs) {
  return new Promise((resolvePromise, reject) => {
    let out = "";
    const timer = setTimeout(() => reject(new Error(`no output within ${timeoutMs}ms; got: ${out}`)), timeoutMs);
    child.stdout.on("data", (chunk) => {
      out += chunk.toString();
      if (out.includes("\n")) {
        clearTimeout(timer);
        resolvePromise(out);
      }
    });
  });
}

test("CLI: a progress file already stale past 15 min at watch-start prints the 15-min line promptly", async () => {
  const dir = mkdtempSync(join(tmpdir(), "progress-watch-"));
  const path = join(dir, "progress.md");
  writeFileSync(path, "old line\n");
  const staleTime = new Date(Date.now() - FIFTEEN_MIN_MS - 60000);
  utimesSync(path, staleTime, staleTime);

  const child = spawn(process.execPath, [watcher, path, "--poll-ms", "50"]);
  try {
    const out = await waitForLine(child, 5000);
    assert.match(out, /15 min silent/);
    assert.match(out, new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  } finally {
    child.kill();
  }
});

test("CLI: a fresh progress file prints nothing within a few poll cycles", async () => {
  const dir = mkdtempSync(join(tmpdir(), "progress-watch-"));
  const path = join(dir, "progress.md");
  writeFileSync(path, "fresh line\n");

  const child = spawn(process.execPath, [watcher, path, "--poll-ms", "50"]);
  let sawOutput = false;
  child.stdout.on("data", () => {
    sawOutput = true;
  });
  await new Promise((r) => setTimeout(r, 300));
  child.kill();
  assert.equal(sawOutput, false);
});

test("CLI: no path argument exits 1 with a usage message, never hangs", async () => {
  const result = await new Promise((resolvePromise) => {
    const child = spawn(process.execPath, [watcher]);
    let err = "";
    child.stderr.on("data", (c) => (err += c.toString()));
    child.on("exit", (code) => resolvePromise({ code, err }));
  });
  assert.equal(result.code, 1);
  assert.match(result.err, /usage:/);
});
