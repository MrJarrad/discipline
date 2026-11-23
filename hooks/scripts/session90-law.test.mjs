// s90 parent lessons 2-4 (vault fleet/lessons/2026-11-14-s90-parent-lessons.md), s88 lesson 4 (DISC-332) and the s91 reviewer-brief lesson.
// One verbatim assertion per rule, in the file that owns it. Run: node --test hooks/scripts/session90-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readLoaded } from "./skill-text.mjs"; // a SKILL.md path reads as the loaded skill: body + linked references

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const flat = (p) => readLoaded(root, p).replace(/\s+/g, " ");

test("s90 2: a reviewer brief's last line is literally merge: yes or merge: no", () => {
  assert.ok(flat("skills/dispatch-brief/SKILL.md").includes("**Last line literally `merge: yes` or `merge: no`**"));
});

test("s91: a reviewer brief says post your verdict on the PR, never do not comment", () => {
  assert.ok(flat("skills/dispatch-brief/SKILL.md").includes('**Say "post your verdict on the PR", never "do not comment"**'));
});

test("s90 3: an operator-approved branch delete is a Mac job, not a cloud push", () => {
  assert.ok(flat("skills/cloud-dispatch/references/MAC-JOBS.md").includes("**An operator-approved branch delete is the same one-minute Mac job**"));
});

test("s90 4: a draft PR is marked ready before the merge call; the verdict is read with get_comments", () => {
  assert.ok(flat("skills/routing/references/HARD-RULES.md").includes("**A draft PR is marked ready before the merge call**"));
});

test("DISC-332: a live Cloudflare write needs a fresh in-chat go even under a standing approval", () => {
  assert.ok(flat("skills/cloud-dispatch/references/ENVIRONMENT-FACTS.md").includes("**A live Cloudflare (or other production) write needs a fresh in-chat go from the operator, even under a standing approval**"));
});
