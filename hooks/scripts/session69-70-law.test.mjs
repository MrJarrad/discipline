// Parent lessons s69 and s70 (vault fleet/lessons/2026-11-09-s69-parent-lessons.md and
// 2026-11-09-s70-parent-lessons.md), one assertion per encoded rule.
// Covered already, asserted here so a later edit cannot drop them: s69 4 (WRITING.md, 1.186.0)
// and s70 2 (merge-review-gate get_me trust, 1.188.0 DISC-277).
// Run: node --test hooks/scripts/session69-70-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseStatus } from "./list-drift-check.mjs";
import { readLoaded } from "./skill-text.mjs"; // a SKILL.md path reads as the loaded skill: body + linked references

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const flat = (p) => readLoaded(root, p).replace(/\s+/g, " ");
const has = (p, s) => assert.ok(flat(p).includes(s), `${p} lacks: ${s}`);
const OS = "skills/routing/references/OPERATOR-REPLIES.md";
const WR = "skills/vault-write/references/WRITING.md";

test("s69 1: a recommendation naming a tool or a store reads the tool's schema and the estate page first", () => {
  has(OS, "A recommendation that names a tool or a storage fact reads the tool's schema and the vault's estate page for that store first");
});

test("s69 2: a not-done claim greps the vault backlog and evidence first", () => {
  has("skills/vault-recall/SKILL.md", "**Before telling the operator something has not been done or run**, grep the project's backlog and `evidence/` for it");
});

test("s69 4 (covered 1.186.0): merge a vault PR only after its checks complete", () => {
  has(WR, "**Merge a vault PR only after its checks complete**");
});

test("s69 5: an operator image never rides in a notes-only vault PR", () => {
  has("skills/vault-write/SKILL.md", "**An operator image goes to its own reviewed PR, or to R2 vault-media, the same turn**");
});

test("s69 6: a third-party plan or quota claim is probed before it is the recommended path", () => {
  has(OS, "A plan or quota claim (\"the free plan includes one monitor\") is probed before it is the recommended path, even when our own checklist says it");
});

test("s70 1: an operator idea is restated as one outcome sentence and gets his yes before a lane", () => {
  has("skills/prompt-craft/SKILL.md", "**Before a research or build lane on an operator idea, restate the outcome in one sentence and get his yes.**");
  has("skills/prompt-craft/SKILL.md", "A researcher answering the parent's framing is not the operator confirming it");
});

test("s70 3: the reviewer brief says to post the verdict on the PR", () => {
  has("skills/dispatch-brief/SKILL.md", "Verdict shape: `agents/reviewer.md` § Verdict, verbatim. Post on the PR.");
});

test("s70 4: list rows are flipped by tool, the status grammar is fixed, and the check runs before push", () => {
  has(WR, "**Flip a list row with `lane-end.mjs --backlog`, and run `list-drift-check.mjs` locally before pushing**");
  assert.equal(parseStatus("done (no change needed)"), null, "a no-change row is moot, never done");
  assert.equal(parseStatus("moot (no change needed)").kind, "moot");
});

test("s70 6: cost and timing numbers are labelled estimated, from measured per-item sizes", () => {
  has(OS, "A cost or timing number reaches him labelled *\"estimated\"*, worked from the doer's measured per-item sizes, never a first guess");
});
