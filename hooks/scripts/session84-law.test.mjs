// s84 parent lessons (vault fleet/lessons/2026-11-12-s84-parent-lessons.md). One verbatim assertion per lesson, in the file that owns it.
// Lesson 1 has red-first tests in hooks/bin/pr-row-gate.test.mjs; this pins the prose.
// Run: node --test hooks/scripts/session84-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const flat = (p) => readFileSync(join(root, p), "utf8").replace(/\s+/g, " ");

test("s84 1: a gate-tightening PR states the per-use cost, and pr-row-gate refuses it without", () => {
  assert.ok(flat("skills/agent-ops/references/DOS-AND-DONTS.md").includes("A PR about a gate or guard carries `Per-use cost: <calls one use takes now, and before>`; `pr-row-gate.mjs` refuses it without."));
});
