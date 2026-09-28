// Tests for `withRegistryLock` — the fix for bugs found running 1.98.0
// (2026-09-28): finished lanes never removed from the registry, and 15/30-min
// warnings re-firing on every prompt/tool call despite `fired` being
// recorded. Root cause: every writer (register, check, cleanup) did an
// unsynchronized loadRegistry -> mutate one row -> saveRegistry(whole array)
// against ONE shared file, while many of these run as genuinely concurrent
// OS processes (background lanes finishing, PostToolUse firing on every tool
// call in the parent AND in every doer's own session). Last writer wins and
// silently drops every other process's mutation in between — a lost-update
// race. These tests drive real concurrent child processes against a real
// file — the race is an inter-process one, not reproducible with in-memory
// calls in a single process.
// Run: node --test hooks/bin/progress-registry-lock.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { loadRegistry, withRegistryLock } from "./progress-registry.mjs";

const here = dirname(fileURLToPath(import.meta.url));

function tempRegistryPath() {
  return join(mkdtempSync(join(tmpdir(), "progress-registry-lock-")), "registry.json");
}

// A standalone script (not importable — needs to run as its own OS process) that adds exactly
// one row via the OLD unsynchronized pattern this test proves is unsafe, and one via the new
// locked primitive, selected by argv.
function writeRacerScript(dir) {
  const scriptPath = join(dir, "racer.mjs");
  writeFileSync(
    scriptPath,
    `
import { loadRegistry, saveRegistry, upsertLane, withRegistryLock } from ${JSON.stringify(join(here, "progress-registry.mjs"))};
const [, , mode, registryPath, rowPath] = process.argv;
const lane = { path: rowPath, dispatchedAt: Date.now(), lastMtime: null, fired: [] };
if (mode === "unsynced") {
  const entries = loadRegistry(registryPath);
  saveRegistry(upsertLane(entries, lane), registryPath);
} else {
  withRegistryLock((entries) => upsertLane(entries, lane), registryPath);
}
`,
  );
  return scriptPath;
}

function runConcurrently(scriptPath, mode, registryPath, n) {
  const waits = [];
  for (let i = 0; i < n; i++) {
    const child = spawn(process.execPath, [scriptPath, mode, registryPath, `/lane-${i}.md`]);
    waits.push(new Promise((resolve, reject) => child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`racer exited ${code}`))))));
  }
  return Promise.all(waits);
}

test("the OLD unsynchronized load->mutate->save pattern loses concurrent rows (documents the race, not a request to keep it)", async () => {
  const registryPath = tempRegistryPath();
  const scriptPath = writeRacerScript(dirname(registryPath));
  const n = 25;
  await runConcurrently(scriptPath, "unsynced", registryPath, n);
  const entries = loadRegistry(registryPath);
  assert.ok(entries.length < n, `expected the old pattern to lose rows under real concurrency (got ${entries.length}/${n} — if this ever reliably holds at ${n}, raise n)`);
});

test("withRegistryLock: N concurrent processes each adding one row lose none — every row present", async () => {
  const registryPath = tempRegistryPath();
  const scriptPath = writeRacerScript(dirname(registryPath));
  const n = 25;
  await runConcurrently(scriptPath, "locked", registryPath, n);
  const entries = loadRegistry(registryPath);
  assert.equal(entries.length, n, `expected all ${n} concurrently-written rows to survive, got ${entries.length}`);
  const paths = new Set(entries.map((e) => e.path));
  for (let i = 0; i < n; i++) assert.ok(paths.has(`/lane-${i}.md`), `missing /lane-${i}.md`);
});

test("withRegistryLock releases its lock file on both the happy path and a throwing mutate", () => {
  const registryPath = tempRegistryPath();
  withRegistryLock((entries) => entries, registryPath);
  assert.equal(existsSync(`${registryPath}.lock`), false, "lock left behind after a clean mutate");

  assert.throws(() => withRegistryLock(() => { throw new Error("boom"); }, registryPath));
  assert.equal(existsSync(`${registryPath}.lock`), false, "lock left behind after a throwing mutate");
});

test("withRegistryLock steals a stale lock rather than waiting out a crashed holder", () => {
  const registryPath = tempRegistryPath();
  const lockPath = `${registryPath}.lock`;
  writeFileSync(lockPath, "");
  // Back-date the lock file well past the stale threshold.
  const old = new Date(Date.now() - 60_000);
  utimesSync(lockPath, old, old);

  const result = withRegistryLock((entries) => entries, registryPath);
  assert.deepEqual(result, []);
  assert.equal(existsSync(lockPath), false, "the stolen-then-released lock should be gone again");
});

test("withRegistryLock: mutate returning { entries, messages } persists entries and passes messages back", () => {
  const registryPath = tempRegistryPath();
  const result = withRegistryLock(
    (entries) => ({ entries: [...entries, { path: "/a.md" }], messages: ["hi"] }),
    registryPath,
  );
  assert.deepEqual(result.messages, ["hi"]);
  assert.deepEqual(loadRegistry(registryPath), [{ path: "/a.md" }]);
});

test("withRegistryLock: returning the same entries reference is a no-op (no write, mtime untouched)", () => {
  const registryPath = tempRegistryPath();
  withRegistryLock((entries) => [...entries, { path: "/seed.md" }], registryPath);
  const before = readFileSync(registryPath, "utf8");
  withRegistryLock((entries) => entries, registryPath); // identity — nothing changed
  const after = readFileSync(registryPath, "utf8");
  assert.equal(before, after);
});
