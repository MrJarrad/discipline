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

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(repo, p), "utf8");

const dispatchBrief = read("skills/dispatch-brief/SKILL.md");
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
test("the dispatch-brief skill stays under its 1450-word ceiling", () => {
  const count = words(dispatchBrief);
  assert.ok(count <= 1450, `dispatch-brief is ${count} words; the ceiling is 1450`);
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
  const list = dispatchBrief.slice(dispatchBrief.indexOf("## Before you dispatch"));
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

// Ceiling raised 200 -> 210 at 1.92.0: Changes 3 and 4, plus the parent's
// ledger-block ruling answering hoverboard-rounds-14-15 items 1 and 3 —
// real growth (runtime-proof bullet, dispatch-time-stamp/15-min sentence,
// deployed-link-timing bullet, gate-run-lane bullet).
test("doer-rules.md stays under its 210-line ceiling", () => {
  const lines = doerRules.trimEnd().split("\n").length;
  assert.ok(lines <= 210, `doer-rules.md is ${lines} lines; the ceiling is 210`);
});

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
