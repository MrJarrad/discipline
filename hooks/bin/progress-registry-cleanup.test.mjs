// Tests for the SubagentStop registry cleanup hook (`progress-hooks` fix
// round, 2026-09-27).
// Run: node --test hooks/bin/progress-registry-cleanup.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { saveRegistry, loadRegistry } from "./progress-registry.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const hook = join(here, "progress-registry-cleanup.mjs");

function makeTranscript(progressPath) {
  const dir = mkdtempSync(join(tmpdir(), "registry-cleanup-"));
  const transcriptPath = join(dir, "session.jsonl");
  const brief = `Size: component.\n\n## Progress\n\`${progressPath}\`\n\n**Done-when.**`;
  writeFileSync(transcriptPath, JSON.stringify({ type: "user", message: { content: brief } }) + "\n");
  return transcriptPath;
}

function tempRegistry() {
  return join(mkdtempSync(join(tmpdir(), "registry-cleanup-registry-")), "registry.json");
}

const run = (input, env) =>
  spawnSync(process.execPath, [hook], { input: JSON.stringify(input), encoding: "utf8", env: { ...process.env, ...env } });

test("removes the finished lane's own entry, leaves other lanes", () => {
  const transcriptPath = makeTranscript("/x/progress.md");
  const registryPath = tempRegistry();
  saveRegistry(
    [
      { path: "/x/progress.md", dispatchedAt: 1, lastMtime: null, fired: [] },
      { path: "/y/progress.md", dispatchedAt: 2, lastMtime: null, fired: [] },
    ],
    registryPath,
  );

  const result = run({ transcript_path: transcriptPath }, { DISCIPLINE_PROGRESS_REGISTRY: registryPath });
  assert.equal(result.status, 0);
  const remaining = loadRegistry(registryPath);
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].path, "/y/progress.md");
});

test("a line lane's brief (no ## Progress) removes nothing — no-op, never a throw", () => {
  const dir = mkdtempSync(join(tmpdir(), "registry-cleanup-line-"));
  const transcriptPath = join(dir, "session.jsonl");
  writeFileSync(transcriptPath, JSON.stringify({ type: "user", message: { content: "Size: line.\n\nFix it." } }) + "\n");

  const registryPath = tempRegistry();
  saveRegistry([{ path: "/y/progress.md", dispatchedAt: 2, lastMtime: null, fired: [] }], registryPath);

  const result = run({ transcript_path: transcriptPath }, { DISCIPLINE_PROGRESS_REGISTRY: registryPath });
  assert.equal(result.status, 0);
  assert.deepEqual(loadRegistry(registryPath), [{ path: "/y/progress.md", dispatchedAt: 2, lastMtime: null, fired: [] }]);
});

test("a path not present in the registry — no-op, never a throw", () => {
  const transcriptPath = makeTranscript("/nowhere/progress.md");
  const registryPath = tempRegistry();
  saveRegistry([{ path: "/y/progress.md", dispatchedAt: 2 }], registryPath);

  const result = run({ transcript_path: transcriptPath }, { DISCIPLINE_PROGRESS_REGISTRY: registryPath });
  assert.equal(result.status, 0);
  assert.equal(loadRegistry(registryPath).length, 1);
});

test("missing transcript path — allowed, never throws", () => {
  const registryPath = tempRegistry();
  const result = run({ transcript_path: "/does/not/exist.jsonl" }, { DISCIPLINE_PROGRESS_REGISTRY: registryPath });
  assert.equal(result.status, 0);
});

test("no transcript_path at all on the input — allowed, never throws", () => {
  const registryPath = tempRegistry();
  const result = run({}, { DISCIPLINE_PROGRESS_REGISTRY: registryPath });
  assert.equal(result.status, 0);
});

test("unparseable stdin — allowed, never throws", () => {
  const registryPath = tempRegistry();
  const result = spawnSync(process.execPath, [hook], {
    input: "not json",
    encoding: "utf8",
    env: { ...process.env, DISCIPLINE_PROGRESS_REGISTRY: registryPath },
  });
  assert.equal(result.status, 0);
});

// --- wiring --------------------------------------------------------------

test("hooks.json fires progress-registry-cleanup on SubagentStop", async () => {
  const { readFileSync } = await import("node:fs");
  const repo = join(here, "..", "..");
  const hooks = JSON.parse(readFileSync(join(repo, "hooks", "hooks.json"), "utf8"));
  const stop = hooks.hooks.SubagentStop || [];
  const entry = stop.flatMap((h) => h.hooks).find((h) => /progress-registry-cleanup\.mjs/.test(h.command));
  assert.ok(entry, "no SubagentStop entry wiring progress-registry-cleanup.mjs");
});
