// Tests for the SubagentStop registry cleanup hook (`progress-hooks` fix
// round, 2026-09-27; reviewer round 2 red: must read `agent_transcript_path`
// — the finished SUBAGENT's own transcript — never `transcript_path`, which
// on a SubagentStop event is the PARENT session's own transcript. Every
// fixture below models the real input shape: both fields present, pointing
// at two distinct files, so a hook that reads the wrong one is caught.
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

// The SUBAGENT's own transcript — carries the finished lane's brief.
function makeAgentTranscript(progressPath) {
  const dir = mkdtempSync(join(tmpdir(), "registry-cleanup-agent-"));
  const transcriptPath = join(dir, "agent-session.jsonl");
  const brief = `Size: component.\n\n## Progress\n\`${progressPath}\`\n\n**Done-when.**`;
  writeFileSync(transcriptPath, JSON.stringify({ type: "user", message: { content: brief } }) + "\n");
  return transcriptPath;
}

// The PARENT's own transcript — a distinct file, carrying a DIFFERENT
// brief/progress path (or none at all). If a hook ever reads this one
// instead of `agent_transcript_path`, it resolves the wrong path (or none),
// and a test asserting on the SUBAGENT's own path fails.
function makeParentTranscript(decoyProgressPath) {
  const dir = mkdtempSync(join(tmpdir(), "registry-cleanup-parent-"));
  const transcriptPath = join(dir, "parent-session.jsonl");
  const content =
    decoyProgressPath === null
      ? JSON.stringify({ type: "user", message: { content: "orchestrator session, no lane brief here" } })
      : JSON.stringify({
          type: "user",
          message: { content: `Size: component.\n\n## Progress\n\`${decoyProgressPath}\`\n\n**Done-when.**` },
        });
  writeFileSync(transcriptPath, content + "\n");
  return transcriptPath;
}

function tempRegistry() {
  return join(mkdtempSync(join(tmpdir(), "registry-cleanup-registry-")), "registry.json");
}

const run = (input, env) =>
  spawnSync(process.execPath, [hook], { input: JSON.stringify(input), encoding: "utf8", env: { ...process.env, ...env } });

test("removes the finished lane's own entry (read off agent_transcript_path), leaves other lanes", () => {
  const agentTranscriptPath = makeAgentTranscript("/x/progress.md");
  const parentTranscriptPath = makeParentTranscript(null);
  const registryPath = tempRegistry();
  saveRegistry(
    [
      { path: "/x/progress.md", dispatchedAt: 1, lastMtime: null, fired: [] },
      { path: "/y/progress.md", dispatchedAt: 2, lastMtime: null, fired: [] },
    ],
    registryPath,
  );

  const result = run(
    { transcript_path: parentTranscriptPath, agent_transcript_path: agentTranscriptPath },
    { DISCIPLINE_PROGRESS_REGISTRY: registryPath },
  );
  assert.equal(result.status, 0);
  const remaining = loadRegistry(registryPath);
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].path, "/y/progress.md");
});

test("never reads the parent's own transcript_path — a decoy progress path there is ignored", () => {
  // The PARENT transcript names /decoy/progress.md; the real finished
  // subagent's own transcript names /x/progress.md. Only /x/progress.md may
  // be removed; /decoy/progress.md must survive untouched.
  const agentTranscriptPath = makeAgentTranscript("/x/progress.md");
  const parentTranscriptPath = makeParentTranscript("/decoy/progress.md");
  const registryPath = tempRegistry();
  saveRegistry(
    [
      { path: "/x/progress.md", dispatchedAt: 1, lastMtime: null, fired: [] },
      { path: "/decoy/progress.md", dispatchedAt: 2, lastMtime: null, fired: [] },
    ],
    registryPath,
  );

  const result = run(
    { transcript_path: parentTranscriptPath, agent_transcript_path: agentTranscriptPath },
    { DISCIPLINE_PROGRESS_REGISTRY: registryPath },
  );
  assert.equal(result.status, 0);
  const remaining = loadRegistry(registryPath);
  assert.deepEqual(remaining.map((e) => e.path), ["/decoy/progress.md"]);
});

test("a line lane's brief (no ## Progress) removes nothing — no-op, never a throw", () => {
  const dir = mkdtempSync(join(tmpdir(), "registry-cleanup-line-"));
  const agentTranscriptPath = join(dir, "agent-session.jsonl");
  writeFileSync(agentTranscriptPath, JSON.stringify({ type: "user", message: { content: "Size: line.\n\nFix it." } }) + "\n");
  const parentTranscriptPath = makeParentTranscript(null);

  const registryPath = tempRegistry();
  saveRegistry([{ path: "/y/progress.md", dispatchedAt: 2, lastMtime: null, fired: [] }], registryPath);

  const result = run(
    { transcript_path: parentTranscriptPath, agent_transcript_path: agentTranscriptPath },
    { DISCIPLINE_PROGRESS_REGISTRY: registryPath },
  );
  assert.equal(result.status, 0);
  assert.deepEqual(loadRegistry(registryPath), [{ path: "/y/progress.md", dispatchedAt: 2, lastMtime: null, fired: [] }]);
});

test("a path not present in the registry — no-op, never a throw", () => {
  const agentTranscriptPath = makeAgentTranscript("/nowhere/progress.md");
  const parentTranscriptPath = makeParentTranscript(null);
  const registryPath = tempRegistry();
  saveRegistry([{ path: "/y/progress.md", dispatchedAt: 2 }], registryPath);

  const result = run(
    { transcript_path: parentTranscriptPath, agent_transcript_path: agentTranscriptPath },
    { DISCIPLINE_PROGRESS_REGISTRY: registryPath },
  );
  assert.equal(result.status, 0);
  assert.equal(loadRegistry(registryPath).length, 1);
});

test("missing agent_transcript_path — allowed, never throws", () => {
  const registryPath = tempRegistry();
  const parentTranscriptPath = makeParentTranscript(null);
  const result = run(
    { transcript_path: parentTranscriptPath, agent_transcript_path: "/does/not/exist.jsonl" },
    { DISCIPLINE_PROGRESS_REGISTRY: registryPath },
  );
  assert.equal(result.status, 0);
});

test("no agent_transcript_path at all on the input (only transcript_path) — allowed, never throws, removes nothing", () => {
  const registryPath = tempRegistry();
  const parentTranscriptPath = makeParentTranscript("/decoy/progress.md");
  saveRegistry([{ path: "/decoy/progress.md", dispatchedAt: 2, lastMtime: null, fired: [] }], registryPath);
  const result = run({ transcript_path: parentTranscriptPath }, { DISCIPLINE_PROGRESS_REGISTRY: registryPath });
  assert.equal(result.status, 0);
  assert.equal(loadRegistry(registryPath).length, 1, "the decoy row must survive — no agent_transcript_path to act on");
});

test("no transcript fields at all on the input — allowed, never throws", () => {
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
