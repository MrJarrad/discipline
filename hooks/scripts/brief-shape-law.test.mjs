// Tests for the 1.77.0 two-tier brief law: tier 1 is doer-rules.md (standing
// rules every dispatched agent carries), tier 2 is a dispatch-brief skill that
// points at the contract in four parts with eight mandatory items.
// The shape IS the law here, so the shape is asserted as counts and ceilings.
// Run: node --test scripts/brief-shape-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readLoaded } from "./skill-text.mjs"; // a SKILL.md path reads as the loaded skill: body + linked references

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readLoaded(repo, p);

const dispatchBrief = read("skills/dispatch-brief/SKILL.md");
// Word ceilings and the checklist count are about the body the model always loads, not its references.
const dispatchBriefBody = readFileSync(join(repo, "skills/dispatch-brief/SKILL.md"), "utf8");
const doerRules = read("doer-rules.md");

const words = (text) => text.split(/\s+/).filter(Boolean).length;

// Ceiling raised 900 -> 1000 at 1.84.0: `brief-carries-operator-words-2026-09-18`
// added the one-rule paragraph and three checklist items; the elaboration lives
// in references/BRIEF-WORDS.md, offloaded rather than inlined in full.
// Ceiling raised 1000 -> 1100 at 1.85.0: `accuracy-before-the-link` added the
// one-contract-unit rule and the pixel-proof done-when; the elaboration lives in
// references/ACCURACY.md.
// 1.86.0: `brief-is-the-lever` added the Interrogate the brief pointer and the
// `## Interrogated` field, offloaded to references/INTERROGATE.md — the
// ceiling stayed at 1100, the growth paid for by trims elsewhere in the file.
// Ceiling raised 1100 -> 1200 at 1.87.0: two operator rulings landed together —
// `sonnet-default-ceiling` (Persona + model paragraph) and the doer read-back
// (done-when addition) — real growth, not paid for by trims this round.
// Ceiling raised 1200 -> 1250 at 1.88.0: `lane-progress-file` added the
// `## Progress` field and its checklist row — real growth.
// Ceiling raised 1250 -> 1350 at 1.89.0: `proportionality` added the `Size:`
// field, the verification-rule sentence, and a checklist row — real growth.
// Ceiling raised 1350 -> 1450 at 1.92.0: Change 1 (Source-contract lock-row
// kinds pointer) and Change 1 additions (House rules block pointer, runtime
// proof sentence in § State, two checklist rows) — real growth, offloaded to
// SOURCE-CONTRACT-LOCKS.md and HOUSE-RULES.md rather than inlined in full.
// Ceiling raised 1450 -> 1500 at 1.95.0: `media-load-standard` added the
// media-touching-lane done-when clause (`media-loading`) — real growth.
// Ceiling raised 1500 -> 1520 at 1.102.0: the literal `Skills:` line, the Bash
// agent-label sentence and the BRIEF-CRAFT pointer — the lesson rollout's briefing
// facts live in references/BRIEF-CRAFT.md; only the pointers are here.
// Ceiling raised 1520 -> 1560 at 1.155.0 (measured 1555): the create_session
// open/marker/close lines (DISC-216), at the moment a helper brief is written.
// Raised 1560 -> 1580 at s74: the reviewer brief says which reviewers sign `reviewer:` (s74 lesson 2).
// Raised 1580 -> 1603 (measured) at s74 lesson 3: the Source contract template carries the Worktree line.
// Raised 1664 -> 1702 (measured) at s90/s91: the reviewer brief carries the literal merge: line and the post-your-verdict wording.
// Raised 1603 -> 1645 (measured) at s76 lesson 7: the reviewer brief carries the invoke-for-real wording and the Mac access question. 1645 -> 1655 (measured) at s83 lesson 1: the spelled verdict heading. 1702 (measured) at s84: the reviewer's own get_session id.
test("the dispatch-brief skill stays under its 1702-word ceiling", () => {
  const count = words(dispatchBriefBody);
  assert.ok(count <= 1702, `dispatch-brief is ${count} words; the ceiling is 1702`);
});

test("the scenario table has exactly eight rows", () => {
  const start = dispatchBrief.indexOf("## Pick the contract");
  const table = dispatchBrief.slice(start, dispatchBrief.indexOf("\n## ", start + 1));
  const rows = table.match(/^\| \d \|/gm) || [];
  assert.equal(rows.length, 8, `the scenario table has ${rows.length} rows; the ratified count is 8`);
});

// Count raised 13 -> 14 at 1.86.0: brief interrogation added one checklist item.
// Count raised 11 -> 13 at 1.85.0: one-contract-unit per lane and pixel proof in
// done-when. Count raised 8 -> 11 at 1.84.0: `brief-carries-operator-words-2026-09-18` added
// the sourced/knobbed, no-mechanism, and parent-marked checks.
// Count raised 14 -> 15 at 1.88.0: `lane-progress-file` added the `## Progress` checklist row.
// Count raised 15 -> 16 at 1.89.0: `proportionality` added the `Size:` checklist row.
// Count raised 16 -> 18 at 1.92.0: Change 1 additions added the House-rules-block
// row and the Source-contract lock-row-kind row.
test("the only checklist is eighteen items, and the old one is gone", () => {
  assert.doesNotMatch(dispatchBrief, /## Checklist before dispatch/);
  const list = dispatchBriefBody.slice(dispatchBriefBody.indexOf("## Before you dispatch"));
  const items = list.match(/^\[ \]/gm) || [];
  assert.equal(items.length, 18, `the list is ${items.length} items; the ratified count is 18`);
});

test("the brief is four parts, each named", () => {
  const parts = dispatchBrief.slice(dispatchBrief.indexOf("## The brief — four parts"));
  for (const part of [/\*\*Goal\*\*/, /\*\*Context\*\*/, /\*\*Constraints\*\*/, /\*\*Done-when\*\*/]) {
    assert.match(parts, part);
  }
});

test("the one rule is the contract pointer", () => {
  assert.match(
    dispatchBrief,
    /\*\*The brief points at the contract; it never restates it\.\*\*/,
    "the one rule must be stated verbatim",
  );
});

// Word and line budgets: skill-ceilings.test.mjs BUDGETS.
test("doer-rules carries the four standing sections", () => {
  for (const heading of [
    "## You are the doer",
    "## Repo and safety",
    "## Fixed evidence return",
    "## Ports",
    "## Notes ledger",
  ]) {
    assert.ok(doerRules.includes(heading), `doer-rules.md missing: ${heading}`);
  }
});

test("every agent points at doer-rules.md and reads it whole", () => {
  for (const file of readdirSync(join(repo, "agents")).filter((f) => f.endsWith(".md"))) {
    assert.match(
      read(`agents/${file}`),
      /Standing rules: `doer-rules\.md` — read it whole\./,
      `agents/${file} must point at doer-rules.md`,
    );
  }
});

test("s84: the Reviewer brief says the reviewer: id is the reviewer's own get_session id, no session_id", () => {
  assert.match(dispatchBrief, /`<id>` is your own `get_session` id \(no session_id\)/);
});
