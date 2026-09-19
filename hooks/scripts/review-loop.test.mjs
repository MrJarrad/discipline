// Tests for the 1.68.0 review-loop law carried by the shipped skills and agents.
// Same principle as dispatch-law.test.mjs: the law's WORDS are its interface, so
// the operator-ratified sentences are asserted here rather than trusted to review.
// Run: node --test scripts/review-loop.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(repo, p), "utf8");

// Every agent-consumed doc the plugin ships — the law's blast radius.
const shippedDocs = () => [
  ...readdirSync(join(repo, "agents"))
    .filter((f) => f.endsWith(".md"))
    .map((f) => `agents/${f}`),
  ...readdirSync(join(repo, "skills"), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => `skills/${d.name}/SKILL.md`)
    .filter((rel) => existsSync(join(repo, rel))),
  ...readdirSync(join(repo, "output-styles"))
    .filter((f) => f.endsWith(".md"))
    .map((f) => `output-styles/${f}`),
  "operator-rules.md",
  "doer-rules.md",
  "README.md",
];

const reviewer = read("agents/reviewer.md");
const routing = read("skills/routing/SKILL.md");
const dispatchBrief = read("skills/dispatch-brief/SKILL.md");
const doerRules = read("doer-rules.md");
const modelRouting = read("skills/model-routing/SKILL.md");
const presentForReview = read("skills/present-for-review/SKILL.md");
const wrap = read("skills/wrap/SKILL.md");
const disciplineStyle = read("output-styles/discipline.md");

// --- Locked row 1: one review round, capped at two -------------------------
// 1.81.0 (`lean-lane-cadence-2026-09-16`): the cap dropped from three rounds to
// one, with round 2 reserved for a red finding. Amber and note ride the next
// change on that surface instead of buying a round.

test("reviewer names the one-round default, the two-round cap and the halt", () => {
  assert.match(reviewer, /One review round is the default/i);
  assert.match(reviewer, /cap: 2 review rounds per change/i);
  assert.match(reviewer, /round 2 exists only for a red finding/i);
  assert.match(reviewer, /there is no round 3/i);
  assert.match(reviewer, /halt/i);
});

test("amber and note ride the next change rather than buying a round", () => {
  assert.match(reviewer, /amber and note ride the next change on that surface/i);
  assert.match(reviewer, /notes ledger/i);
});

test("routing's baton table halts the loop at the cap and presents to the operator", () => {
  const baton = routing.slice(routing.indexOf("## Baton handoff table"));
  assert.match(baton, /round 2/i);
  assert.match(baton, /operator/i, "cap handoff goes to the operator, not another round");
});

test("a prototype lane batons to the operator, never to a reviewer", () => {
  const baton = routing.slice(routing.indexOf("## Baton handoff table"), routing.indexOf("## Persona dispatch table"));
  assert.match(baton, /prototype/i);
  assert.match(baton, /no reviewer, no suite/i);
});

test("a merge dispatch states the review record", () => {
  assert.match(routing, /states the review record/i);
  assert.match(read("agents/releaseops.md"), /\*\*The brief states the review record\*\*/);
  assert.match(read("skills/release-deploy/SKILL.md"), /The merge brief states the review record/);
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
  }
});

// The stale law hides across line wraps, so every shipped doc is swept as a whole
// string (newline-tolerant), not line by line — that is how R1 escaped round 1.
test("no shipped doc still says done = reviewer PASS or carries a verdict-sense BLOCK", () => {
  const stale = [
    [/reviewer\s+PASS/i, "done = reviewer PASS — merge is gates green + no red finding"],
    [/done\s*=\s*reviewer/i, "done = reviewer verdict — merge is gates green + no red finding"],
    [/\b(?:is|are)\s+BLOCK\b/i, "verdict-sense BLOCK — say 'is a red finding'"],
  ];
  // reviewer.md deliberately names the shape it must never return.
  const allowed = /never a bare PASS\/BLOCK merge verdict/i;
  for (const rel of shippedDocs()) {
    const text = read(rel).replace(allowed, "");
    for (const [pattern, why] of stale) {
      assert.doesNotMatch(text, pattern, `${rel} must not carry: ${why}`);
    }
  }
});

// --- Locked row 3: operator is first eyes on UI --------------------------

// Updated at 1.84.0 (`review-after-sign-off-2026-09-19`): review no longer runs
// concurrent with the operator's look — it runs after the operator's yes, and
// still never gates the link.
test("the operator preview link precedes review, which now runs after the yes, and never gates on it", () => {
  assert.match(presentForReview, /first eyes/i);
  assert.match(presentForReview, /runs after the yes/i);
  assert.doesNotMatch(presentForReview, /agent review runs\s*\*\*concurrently\*\*/i);
  assert.match(presentForReview, /never gate/i);
});

// --- Locked row 4: notes ledger + effort tier ----------------------------

test("doer-rules carries the notes-ledger rule", () => {
  assert.match(doerRules, /notes ledger/i);
  assert.match(doerRules, /compact/i);
  assert.match(doerRules, /re-read/i);
});

test("dispatch-brief carries an effort tier field and checklist line", () => {
  const persona = dispatchBrief.slice(dispatchBrief.indexOf("## Persona + model"));
  assert.match(persona, /routine \| contested \| high-stakes|routine \\\| contested/i);
  assert.match(persona, /effort tier/i);
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
