// Tests for the lane registry (`progress-hooks` fix round, 2026-09-27).
// Run: node --test hooks/bin/progress-registry.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadRegistry, saveRegistry, upsertLane, removeLane, registryPath } from "./progress-registry.mjs";

function tempRegistryPath() {
  const dir = mkdtempSync(join(tmpdir(), "progress-registry-"));
  return join(dir, "nested", "progress-registry.json");
}

test("registryPath defaults under $HOME/.claude, overridable by env", () => {
  const home = process.env.HOME;
  assert.equal(registryPath(), `${home}/.claude/progress-registry.json`);
  process.env.DISCIPLINE_PROGRESS_REGISTRY = "/tmp/x/registry.json";
  assert.equal(registryPath(), "/tmp/x/registry.json");
  delete process.env.DISCIPLINE_PROGRESS_REGISTRY;
});

test("loadRegistry on a missing file returns []", () => {
  assert.deepEqual(loadRegistry(tempRegistryPath()), []);
});

test("loadRegistry on a corrupt file returns [] rather than throwing", () => {
  const path = tempRegistryPath();
  saveRegistry([{ path: "/x/progress.md", dispatchedAt: 1 }], path);
  writeFileSync(path, "not json");
  assert.deepEqual(loadRegistry(path), []);
});

test("saveRegistry creates parent directories, then loadRegistry reads it back", () => {
  const path = tempRegistryPath();
  const entries = [{ path: "/x/progress.md", dispatchedAt: 123, lastMtime: null, fired: [] }];
  saveRegistry(entries, path);
  assert.ok(existsSync(path));
  assert.deepEqual(loadRegistry(path), entries);
});

test("saveRegistry replaces the file atomically (temp + rename) and leaves no temp file behind", () => {
  const dir = mkdtempSync(join(tmpdir(), "registry-atomic-"));
  const path = join(dir, "registry.json");
  saveRegistry([{ path: "/a" }], path);
  const before = statSync(path).ino;
  saveRegistry([{ path: "/b" }], path);
  assert.notEqual(statSync(path).ino, before, "an in-place write keeps the inode; a rename replaces it");
  assert.deepEqual(readdirSync(dir), ["registry.json"]);
  assert.deepEqual(loadRegistry(path), [{ path: "/b" }]);
});

test("upsertLane adds a new lane", () => {
  const result = upsertLane([], { path: "/a/progress.md", dispatchedAt: 1 });
  assert.deepEqual(result, [{ path: "/a/progress.md", dispatchedAt: 1 }]);
});

test("upsertLane replaces an existing lane at the same path rather than duplicating", () => {
  const initial = [{ path: "/a/progress.md", dispatchedAt: 1, fired: [] }];
  const result = upsertLane(initial, { path: "/a/progress.md", dispatchedAt: 2, fired: [15] });
  assert.equal(result.length, 1);
  assert.deepEqual(result[0], { path: "/a/progress.md", dispatchedAt: 2, fired: [15] });
});

test("upsertLane leaves other lanes untouched", () => {
  const initial = [{ path: "/a/progress.md", dispatchedAt: 1 }, { path: "/b/progress.md", dispatchedAt: 2 }];
  const result = upsertLane(initial, { path: "/a/progress.md", dispatchedAt: 3 });
  assert.equal(result.length, 2);
  assert.ok(result.some((e) => e.path === "/b/progress.md" && e.dispatchedAt === 2));
});

test("removeLane drops the named path and leaves the rest", () => {
  const initial = [{ path: "/a/progress.md" }, { path: "/b/progress.md" }];
  assert.deepEqual(removeLane(initial, "/a/progress.md"), [{ path: "/b/progress.md" }]);
});

test("removeLane on a path not present is a no-op, never a throw", () => {
  const initial = [{ path: "/a/progress.md" }];
  assert.deepEqual(removeLane(initial, "/nope.md"), initial);
});
