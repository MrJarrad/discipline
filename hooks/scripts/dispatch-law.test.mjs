// Tests for the dispatch-surface law text carried by the shipped skills.
// The law's WORDS are its interface — an orchestrator only obeys what the file
// says, so the operator-ratified sentences are asserted verbatim here.
// Run: node --test scripts/dispatch-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(repo, p), "utf8");

const routing = read("skills/routing/SKILL.md");
const dispatchBrief = read("skills/dispatch-brief/SKILL.md");
const cloudDispatch = read("skills/cloud-dispatch/SKILL.md");
const reviewer = read("agents/reviewer.md");

// Operator, 2026-08-29 (fleet ruling 2026-08-29-verification-lanes-are-doer-lanes).
const RULE_9_VERBATIM = "if a task can be done in cloud, it is";

test("routing carries the operator's cloud-default sentence verbatim", () => {
  assert.ok(
    routing.includes(RULE_9_VERBATIM),
    "routing rule 9 must quote the operator sentence verbatim",
  );
});

test("routing scopes the egress gap to the deployed surface, not slice builds", () => {
  assert.match(routing, /deployed surface/);
  assert.match(routing, /egress[- ]gap/i);
  assert.match(
    routing,
    /own build[\s\S]{0,40}\*\*not\*\* machine-bound/i,
    "the 2026-08-30 failure mode must be named as a non-justification",
  );
});

test("dispatch-brief's vehicle section mirrors the same egress-gap scoping", () => {
  assert.match(dispatchBrief, /deployed surface/);
  assert.match(dispatchBrief, /own build[\s\S]{0,40}\*\*not\*\* machine-bound/i);
});

test("dispatch-brief's checklist gates the machine-bound justification on the scoped list", () => {
  const checklist = dispatchBrief.slice(dispatchBrief.indexOf("## Checklist before dispatch"));
  assert.match(checklist, /deployed surface/);
  assert.match(checklist, /review tier/i, "brief must name FULL or LIGHT review tier");
});

test("review tiers are named FULL and LIGHT in both the brief skill and the reviewer", () => {
  for (const [name, text] of [["dispatch-brief", dispatchBrief], ["reviewer", reviewer]]) {
    assert.match(text, /\bFULL\b/, `${name} must name the FULL tier`);
    assert.match(text, /\bLIGHT\b/, `${name} must name the LIGHT tier`);
  }
});

test("reviewer samples the engineer's evidence rather than re-deriving all of it", () => {
  assert.match(reviewer, /sample/i);
  assert.match(reviewer, /re-derive/i);
});

test("cloud-dispatch keeps fix rounds warm in the same session", () => {
  assert.match(cloudDispatch, /warm/i);
  assert.match(cloudDispatch, /same session/i);
});

test("prototype-first is a dispatch-time step for unproven mechanisms", () => {
  assert.match(dispatchBrief, /prototype/i);
});
