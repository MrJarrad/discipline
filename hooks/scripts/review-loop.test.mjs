// Tests for the 1.68.0 review-loop law carried by the shipped skills and agents.
// Same principle as dispatch-law.test.mjs: the law's WORDS are its interface, so
// the operator-ratified sentences are asserted here rather than trusted to review.
// Run: node --test scripts/review-loop.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(repo, p), "utf8");

const reviewer = read("agents/reviewer.md");
const routing = read("skills/routing/SKILL.md");
const dispatchBrief = read("skills/dispatch-brief/SKILL.md");
const modelRouting = read("skills/model-routing/SKILL.md");
const presentForReview = read("skills/present-for-review/SKILL.md");
const wrap = read("skills/wrap/SKILL.md");
const disciplineStyle = read("output-styles/discipline.md");

// --- Locked row 1: hard cap of three review rounds ------------------------

test("reviewer names the three-round cap and the halt-and-present behaviour", () => {
  assert.match(reviewer, /cap: 3 review rounds per\s+change/i);
  assert.match(reviewer, /round 4|fourth round/i);
  assert.match(reviewer, /halt/i);
});

test("routing's baton table halts the loop at the cap and presents to the operator", () => {
  const baton = routing.slice(routing.indexOf("## Baton handoff table"));
  assert.match(baton, /round 3|third round/i);
  assert.match(baton, /operator/i, "cap handoff goes to the operator, not another round");
});

test("wrap records review rounds per change", () => {
  assert.match(wrap, /review rounds/i);
});

// --- Locked row 2: reviewer informs; CI + parent decide -------------------

test("reviewer returns severity-ranked findings, not a bare merge verdict", () => {
  for (const sev of [/\bred\b/i, /\bamber\b/i, /\bnote\b/i]) assert.match(reviewer, sev);
  assert.match(reviewer, /severity/i);
});

test("every finding is independently re-validated before it surfaces", () => {
  assert.match(reviewer, /re-validat/i);
  assert.match(reviewer, /finder\s*(?:→|->)\s*validator/i);
});

test("enumeration, precedent and determinism claims are re-derived, never sampled", () => {
  assert.match(reviewer, /enumeration/i);
  assert.match(reviewer, /precedent/i);
  assert.match(reviewer, /determinis/i);
  assert.match(reviewer, /grep-\s*or\s*rerun-verified/i);
});

test("one worktree one agent is a precondition to starting the review", () => {
  assert.match(reviewer, /one worktree, one agent/i);
  assert.match(reviewer, /precondition/i);
});

test("merge is CI green plus no red finding — not 'done = reviewer PASS'", () => {
  for (const [name, text] of [
    ["routing", routing],
    ["dispatch-brief", dispatchBrief],
    ["discipline output style", disciplineStyle],
  ]) {
    assert.match(text, /no red finding/i, `${name} must state the merge condition`);
    assert.doesNotMatch(
      text,
      /only reviewer \*{0,2}PASS\*{0,2} (?:is|may be) (?:operator-facing )?done/i,
      `${name} must not still say done = reviewer PASS`,
    );
  }
});

// --- Locked row 3: operator is first eyes on UI --------------------------

test("the operator preview link precedes agent review and never gates on it", () => {
  assert.match(presentForReview, /first eyes/i);
  assert.match(presentForReview, /concurrent/i);
  assert.match(presentForReview, /never gate/i);
});

// --- Locked row 4: notes ledger + effort tier ----------------------------

test("dispatch-brief carries the notes-ledger rule", () => {
  assert.match(dispatchBrief, /notes ledger/i);
  assert.match(dispatchBrief, /compact/i);
  assert.match(dispatchBrief, /re-read/i);
});

test("dispatch-brief carries an effort tier field and checklist line", () => {
  assert.match(dispatchBrief, /routine \| contested \| high-stakes|routine \\\| contested/i);
  const checklist = dispatchBrief.slice(dispatchBrief.indexOf("## Checklist before dispatch"));
  assert.match(checklist, /effort tier/i);
});

test("model-routing maps all three effort tiers to model and thinking budget", () => {
  for (const tier of [/routine/i, /contested/i, /high-stakes/i]) assert.match(modelRouting, tier);
  assert.match(modelRouting, /thinking budget/i);
});

// --- Locked row 5: LIGHT default, FULL justified -------------------------

test("LIGHT is the standing default and FULL is the justified exception", () => {
  assert.match(reviewer, /LIGHT[\s\S]{0,80}standing default/i);
  assert.match(reviewer, /FULL[\s\S]{0,80}justified exception/i);
});

test("the no-tier fallback runs LIGHT, not FULL", () => {
  assert.match(reviewer, /No tier in the brief\s*(?:→|->)\s*run \*\*LIGHT\*\*/i);
  assert.doesNotMatch(reviewer, /No tier in the brief\s*(?:→|->)\s*run \*\*FULL\*\*/i);
  assert.match(dispatchBrief, /Unnamed tier\s+defaults to `?LIGHT/i);
});

test("the reviewer never evaluates look", () => {
  assert.match(reviewer, /never evaluates? look/i);
});

test("routing's baton table carries the small-fix no-reviewer path", () => {
  const baton = routing.slice(routing.indexOf("## Baton handoff table"));
  assert.match(baton, /small fix/i);
  assert.match(baton, /no reviewer/i);
});

// --- Locked row 6: out of scope, must not appear -------------------------

test("nothing in the touched law mentions subagent token roll-up or budgets", () => {
  for (const [name, text] of [
    ["reviewer", reviewer],
    ["routing", routing],
    ["dispatch-brief", dispatchBrief],
    ["present-for-review", presentForReview],
  ]) {
    assert.doesNotMatch(text, /token roll-?up|subagent (?:token|budget)/i, `${name} is out of scope`);
  }
});

// --- AC7: deterministic gates precede review -----------------------------

test("deterministic gates are green before a reviewer is solicited", () => {
  assert.match(dispatchBrief, /before a reviewer is (?:solicited|dispatched)/i);
  assert.match(reviewer, /red build/i);
  assert.match(reviewer, /return(?:s)? immediately/i);
});

// --- AC8: the live lock file is read, not the copied snapshot ------------

test("reviewer reads the live lock file and reds a spec drift", () => {
  assert.match(reviewer, /live lock file/i);
  assert.match(reviewer, /spec drifted/i);
});
