// 1.126.0 (backlog 157): disk and parallel lanes. Run: node --test hooks/scripts/session17-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(root, p), "utf8");

test("1.126.0 CHANGED entry exists; manifests and the top CHANGED entry carry one version", () => {
  const v = JSON.parse(read(".claude-plugin/plugin.json")).version;
  assert.equal(JSON.parse(read(".claude-plugin/marketplace.json")).plugins[0].version, v);
  assert.equal(/^(\d+\.\d+\.\d+) — /.exec(read("CHANGED.txt"))?.[1], v, "top CHANGED entry must be the current version");
  assert.match(read("CHANGED.txt"), /^1\.126\.0 — .*disk-and-parallel-lanes/m);
});

test("cloud-dispatch: disk read before dispatch, relative 5 GB rule, child session, never the operator", () => {
  const d = read("skills/cloud-dispatch/SKILL.md");
  assert.match(d, /## Disk before dispatch/);
  assert.match(d, /largest live worktree/);
  assert.match(d, /at\s+least 5 GB/);
  assert.match(d, /create_session/);
  assert.match(d, /never asked to\s+move sessions for disk/);
});

test("routing HARD-RULES 13: lane-end sweep drops node_modules/.next, never a root clone", () => {
  const h = read("skills/routing/references/HARD-RULES.md");
  assert.match(h, /--clean-artifacts/);
  assert.match(h, /node_modules` and `\.next`/);
});

test("dispatch-brief HOUSE-RULES: shared DS clone, token values, sequential browser repros", () => {
  const h = read("skills/dispatch-brief/references/HOUSE-RULES.md");
  assert.match(h, /Shared clones/);
  assert.match(h, /never switch it/);
  assert.match(h, /resolved value/);
  assert.match(h, /one at a time with a hard timeout/);
});
