// 1.131.0 (backlog 163, 158, 156, 159 + queue-row lesson).
// Run: node --test hooks/scripts/session21-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const flat = (p) => readFileSync(join(root, p), "utf8").replace(/\s+/g, " ");

test("present-for-review probes the served preview for a new-code marker", () => {
  assert.match(flat("skills/present-for-review/SKILL.md"), /Probe the served preview for the new code before relaying.*PREVIEW-PROBE\.md/);
  const r = flat("skills/present-for-review/references/PREVIEW-PROBE.md");
  assert.match(r, /headless Chromium/);
  assert.match(r, /unique to the new code/);
  assert.match(r, /Never push an empty commit/);
});

test("dispatch-brief block lane starts from the banked options ruling", () => {
  const b = flat("skills/dispatch-brief/references/BRIEF-CRAFT.md");
  assert.match(b, /block lane starts from the banked per-block options ruling/);
  assert.match(b, /open PRs touching the block/);
});

test("output style: closing other-projects line and the wrapped-session rule", () => {
  const s = flat("output-styles/discipline.md");
  assert.match(s, /Other projects have N open items — say if you want them/);
  assert.match(s, /A wrapped session prints no queue and no status.*This session is wrapped — continue in a fresh session.*"reopen"/);
  assert.match(flat("skills/wrap/references/CLOSING-CHECKS.md"), /message beginning "reopen" reopens it/);
});

test("vault-write and wrap carry the section-scoped queue edit rule", () => {
  assert.match(flat("skills/vault-write/SKILL.md"), /finds the section header first.*matches the row's text, not `\| N \|` alone/);
  assert.match(flat("skills/wrap/references/SECTIONS.md"), /git diff <session's first commit> -- orchestrator\/operator-queue\.md/);
});

test("lane-sweep refuses symlinked and non-worktree .git pointers", () => {
  const s = flat("hooks/scripts/lane-sweep.mjs");
  assert.match(s, /lstatSync\(path\)\.isSymbolicLink\(\)/);
  assert.match(s, /\.git\[\\\\\/\]worktrees/);
});

test("1.131.0 versions and CHANGED entry", () => {
  for (const f of [".claude-plugin/plugin.json", ".claude-plugin/marketplace.json"]) {
    assert.match(readFileSync(join(root, f), "utf8"), /"version": "1\.131\.0"/);
  }
  assert.match(flat("CHANGED.txt"), /^1\.131\.0 — `2026-10-12-1131-backlog-sweep`: backlog 163, 158, 156, 159.*encoded: 1\.131\.0/);
});
