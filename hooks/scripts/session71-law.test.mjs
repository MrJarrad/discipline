// Parent lessons s71 (vault fleet/lessons/2026-11-09-s71-parent-lessons.md), one assertion per encoded rule.
// Behaviour tests: 1 (hooks/bin/archive-guard.test.mjs), 2 (mac-job-check.test.mjs), 4 (helper-create-gate.test.mjs).
// Prose rules asserted here so a later edit cannot drop them: 3, 4's note, 5.
// Run: node --test hooks/scripts/session71-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const flat = (p) => readFileSync(join(root, p), "utf8").replace(/\s+/g, " ");
const has = (p, s) => assert.ok(flat(p).includes(s), `${p} lacks: ${s}`);

test("s71 3: a reviewer brief spells the verdict shape the merge gate parses", () => {
  has("skills/dispatch-brief/SKILL.md", "Spell: `merge:` last line, `reviewer: session_<id>` verbatim.");
});

test("s71 4: the house-rules block is pasted, never a token for it", () => {
  has("skills/dispatch-brief/references/HOUSE-RULES.md", "**Paste the block, never a token for it**");
});

test("s71 5: a credential is identified by a read before the operator is asked to change it", () => {
  has("skills/cloud-dispatch/references/ENVIRONMENT-FACTS.md", "**Identify a credential by a read before asking the operator to change anything**");
});

test("s71 2: MAC-JOBS.md names the read-only version reads and the xcode exception", () => {
  has("skills/cloud-dispatch/references/MAC-JOBS.md", "**A job reads versions without side effects**");
});
