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

test("s84 2: a design-system merge that changes a portfolio-used API is followed in the same session by the pin bump", () => {
  assert.ok(flat("skills/routing/references/HARD-RULES.md").includes("**A design-system merge that changes an API the portfolio uses is followed, in the same session, by the portfolio's pin bump** (s84:"));
});

test("s84 3: a design-system review needing handoff-css is a cloud reviewer with it attached read, or a local one (Local because: (c))", () => {
  assert.ok(flat("skills/cloud-dispatch/references/HELPER-SESSIONS.md").includes("is a cloud reviewer with `handoff-css` attached `read`, or a local one** (s84 → s85)"));
  assert.ok(flat("skills/cloud-dispatch/references/HELPER-SESSIONS.md").includes("with `Local because: (c)`"));
});

test("s84 4: a follow-up after a lane lands is a fresh helper; messaging a live one works only as a re-point naming the new parent id", () => {
  assert.ok(flat("skills/cloud-dispatch/references/HELPER-SESSIONS.md").includes("**A follow-up after a lane lands is a fresh helper, not a message to the old one** (s84 HT-128 docs:"));
});
