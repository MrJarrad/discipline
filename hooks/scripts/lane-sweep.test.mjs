// lane-sweep — pure-logic tests for the matcher (`matchProcess`,
// `isWaitLoopShell`) and the port bound. No real process is ever swept here.
// Run: node --test hooks/scripts/lane-sweep.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import {
  matchProcess,
  isWaitLoopShell,
  shellExecutableBasename,
  parseEtimeSeconds,
  staleRegistryEntries,
  REGISTRY_STALE_MS,
} from "./lane-sweep.mjs";
import { saveRegistry, loadRegistry } from "../bin/progress-registry.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const sweep = join(here, "lane-sweep.mjs");

test("isWaitLoopShell matches an until/pgrep/sleep polling loop", () => {
  assert.equal(isWaitLoopShell("bash -c 'until pgrep -f done-marker; do sleep 2; done'"), true);
});

test("isWaitLoopShell matches the while spelling", () => {
  assert.equal(isWaitLoopShell("zsh -c 'while ! pgrep -f server; do sleep 1; done'"), true);
});

test("isWaitLoopShell does not match a shell missing pgrep or sleep", () => {
  assert.equal(isWaitLoopShell("bash -c 'until curl -sf localhost:3000; do echo waiting; done'"), false);
  assert.equal(isWaitLoopShell("bash -c 'pgrep -f server'"), false);
});

test("matchProcess sweeps a doer's own wait-loop shell once past 60s old", () => {
  const proc = { pid: 500, ppid: 1, etime: "05:00", argv: "bash -c 'until pgrep -f done-marker; do sleep 2; done'" };
  const result = matchProcess(proc, new Map(), "/some/session/dir", new Set());
  assert.equal(result.match, true);
  assert.match(result.reason, /wait loop/);
});

test("matchProcess never sweeps a wait-loop shell younger than 60s", () => {
  const proc = { pid: 500, ppid: 1, etime: "00:10", argv: "bash -c 'until pgrep -f done-marker; do sleep 2; done'" };
  const result = matchProcess(proc, new Map(), "/some/session/dir", new Set());
  assert.equal(result.match, false);
});

test("matchProcess never sweeps the sweep's own pid even if it looks like a wait loop", () => {
  const proc = { pid: 500, ppid: 1, etime: "05:00", argv: "bash -c 'until pgrep -f done-marker; do sleep 2; done'" };
  const result = matchProcess(proc, new Map(), "/some/session/dir", new Set([500]));
  assert.equal(result.match, false);
  assert.match(result.reason, /own pid/);
});

test("matchProcess never sweeps an operator keepalive wait-loop — live parent, under 30 min, not this session", () => {
  const proc = { pid: 501, ppid: 12345, etime: "10:00", argv: "bash -c 'until pgrep -f my-dev-server; do sleep 5; done'" };
  const result = matchProcess(proc, new Map(), "/some/other/session/dir", new Set());
  assert.equal(result.match, false);
  assert.match(result.reason, /operator keepalive/);
});

test("matchProcess sweeps a wait-loop shell with a live (non-1) parent when it names THIS session's dir", () => {
  const proc = { pid: 502, ppid: 12345, etime: "10:00", argv: "bash -c 'until pgrep -f /some/session/dir/marker; do sleep 2; done'" };
  const result = matchProcess(proc, new Map(), "/some/session/dir", new Set());
  assert.equal(result.match, true);
});

test("matchProcess sweeps a wait-loop shell with a live parent once it is old enough (>= 30 min), even without the session dir", () => {
  const proc = { pid: 503, ppid: 12345, etime: "31:00", argv: "bash -c 'until pgrep -f done-marker; do sleep 2; done'" };
  const result = matchProcess(proc, new Map(), "/some/other/session/dir", new Set());
  assert.equal(result.match, true);
});

test("matchProcess never sweeps a non-shell process whose argv happens to mention pgrep/sleep", () => {
  const proc = { pid: 500, ppid: 1, etime: "05:00", argv: "node /some/script.js --until pgrep --sleep 2" };
  const result = matchProcess(proc, new Map(), "/some/session/dir", new Set());
  assert.equal(result.match, false);
});

test("matchProcess sweeps a next server listening on a port inside 3220-3299", () => {
  const proc = { pid: 42, ppid: 1, etime: "40:00", argv: "next-server (v14.0.0)" };
  const ports = new Map([[42, [3230]]]);
  const result = matchProcess(proc, ports, "", new Set());
  assert.equal(result.match, true);
  assert.equal(result.port, 3230);
});

test("matchProcess never sweeps a next server outside the 3220-3299 band (e.g. 3211 hoverboard, or 3300+)", () => {
  const proc1 = { pid: 43, ppid: 1, etime: "40:00", argv: "next-server (v14.0.0)" };
  assert.equal(matchProcess(proc1, new Map([[43, [3211]]]), "", new Set()).match, false);
  const proc2 = { pid: 44, ppid: 1, etime: "40:00", argv: "next-server (v14.0.0)" };
  assert.equal(matchProcess(proc2, new Map([[44, [3300]]]), "", new Set()).match, false);
});

// --- registry backstop (progress-hooks fix round, 2026-09-27) --------------

test("staleRegistryEntries: an entry stale past 24h is returned", () => {
  const now = Date.now();
  const entries = [{ path: "/a/progress.md", dispatchedAt: now - REGISTRY_STALE_MS - 60000, lastMtime: null, fired: [] }];
  const result = staleRegistryEntries(entries, now, REGISTRY_STALE_MS, () => now - REGISTRY_STALE_MS - 60000);
  assert.equal(result.length, 1);
  assert.equal(result[0].path, "/a/progress.md");
});

test("staleRegistryEntries: an entry fresh under 24h is not returned", () => {
  const now = Date.now();
  const entries = [{ path: "/a/progress.md", dispatchedAt: now, lastMtime: null, fired: [] }];
  const result = staleRegistryEntries(entries, now, REGISTRY_STALE_MS, () => now);
  assert.equal(result.length, 0);
});

test("staleRegistryEntries: a recently-touched file rescues an old dispatch time", () => {
  const now = Date.now();
  const entries = [{ path: "/a/progress.md", dispatchedAt: now - REGISTRY_STALE_MS - 60000, lastMtime: null, fired: [] }];
  // file was actually touched an hour ago, despite the old dispatch time
  const result = staleRegistryEntries(entries, now, REGISTRY_STALE_MS, () => now - 60 * 60 * 1000);
  assert.equal(result.length, 0);
});

test("staleRegistryEntries: a never-created file falls back to dispatchedAt", () => {
  const now = Date.now();
  const entries = [{ path: "/never/progress.md", dispatchedAt: now - REGISTRY_STALE_MS - 60000, lastMtime: null, fired: [] }];
  const result = staleRegistryEntries(entries, now, REGISTRY_STALE_MS, () => null);
  assert.equal(result.length, 1);
});

test("CLI: the default sweep purges only the stale registry entry, leaves the fresh one", () => {
  const dir = mkdtempSync(join(tmpdir(), "lane-sweep-registry-"));
  const registryPath = join(dir, "registry.json");
  const now = Date.now();
  saveRegistry(
    [
      { path: "/stale/progress.md", dispatchedAt: now - REGISTRY_STALE_MS - 60000, lastMtime: null, fired: [] },
      { path: "/fresh/progress.md", dispatchedAt: now, lastMtime: null, fired: [] },
    ],
    registryPath,
  );

  const result = spawnSync(process.execPath, [sweep, "--session-dir", "/nonexistent-session-dir"], {
    encoding: "utf8",
    env: { ...process.env, DISCIPLINE_PROGRESS_REGISTRY: registryPath },
  });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /registry path=\/stale\/progress\.md action=purged/);

  const remaining = loadRegistry(registryPath);
  assert.deepEqual(remaining, [{ path: "/fresh/progress.md", dispatchedAt: now, lastMtime: null, fired: [] }]);
});

test("CLI: --dry-run reports the purge but leaves the registry untouched", () => {
  const dir = mkdtempSync(join(tmpdir(), "lane-sweep-registry-"));
  const registryPath = join(dir, "registry.json");
  const now = Date.now();
  const entries = [{ path: "/stale/progress.md", dispatchedAt: now - REGISTRY_STALE_MS - 60000, lastMtime: null, fired: [] }];
  saveRegistry(entries, registryPath);

  const result = spawnSync(process.execPath, [sweep, "--session-dir", "/nonexistent-session-dir", "--dry-run"], {
    encoding: "utf8",
    env: { ...process.env, DISCIPLINE_PROGRESS_REGISTRY: registryPath },
  });
  assert.match(result.stdout, /action=would purge/);
  assert.deepEqual(loadRegistry(registryPath), entries);
});
