// s83 parent lessons (vault fleet/lessons/2026-11-12-s83-parent-lessons.md). One verbatim assertion per lesson, in the file that owns it.
// Mechanism lessons (5, 6, and the path message of 2) have red-first tests in their own *.test.mjs; this pins the prose.
// Run: node --test hooks/scripts/session83-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const flat = (p) => readFileSync(join(root, p), "utf8").replace(/\s+/g, " ");

test("s83 1: the verdict heading is spelled with the full 40-hex sha, and the parent re-reads comments after the last post", () => {
  assert.ok(flat("agents/reviewer.md").includes("spelled `## Review — round N of 2, tier X, head <40-hex>`"));
  assert.ok(flat("skills/dispatch-brief/SKILL.md").includes("Its first line is the heading `## Review — round N of 2, tier X, head <40-hex>`"));
  assert.ok(flat("skills/routing/references/HARD-RULES.md").includes("Re-read the PR's comments after the last post, then merge (s83)"));
});
