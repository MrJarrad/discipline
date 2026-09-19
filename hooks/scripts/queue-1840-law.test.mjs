// The 1.84.0 queue: two operator rulings banked — review-after-sign-off-2026-09-19
// (look-lane review moves from concurrent to after the operator's yes) and
// brief-carries-operator-words-2026-09-18 (a hoverboard-session ruling, queued
// since the 18th, wrongly set to `skipped` during 1.83.0, restored to `queued`
// by the parent) — encoded whole across every surface each ruling names. One
// test per surface row, asserting the rule's own sentence at its own home so a
// later edit that softens or drops one fails here.
// Run: node --test hooks/scripts/queue-1840-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(repo, p), "utf8");
const flat = (text) => text.replace(/\s+/g, " ");
const carries = (file, sentence) =>
  assert.ok(
    flat(read(file)).includes(flat(sentence)),
    `${file} no longer carries: ${sentence}`,
  );

// --- review-after-sign-off-2026-09-19 ---------------------------------------

test("routing's Baton table sends a UI-change engineer landing to the operator with reviewer after the yes", () => {
  const routing = flat(read("skills/routing/SKILL.md"));
  assert.match(
    routing,
    /Engineer landed, \*\*UI change\*\* \| \*\*Operator\*\* — preview link; reviewer after the yes/i,
  );
  assert.doesNotMatch(routing, /preview link first; review is concurrent/i);
});

test("present-for-review states review runs after the yes, never concurrent, and never gates the link", () => {
  const present = flat(read("skills/present-for-review/SKILL.md"));
  assert.match(present, /review runs after the yes and never\s*gates the link/i);
  assert.match(present, /\*\*never gates the link\*\*/i);
  assert.doesNotMatch(present, /agent review runs\s*\*\*concurrently\*\*/i);
  assert.match(
    present,
    /Mechanism-only changes.*are reviewed immediately at engineer-done, as before/i,
  );
});

test("the reviewer's preconditions gate a look-lane review on the operator's yes being recorded", () => {
  const reviewer = flat(read("agents/reviewer.md"));
  assert.match(
    reviewer,
    /A look-lane review is solicited only with the operator's yes recorded/i,
  );
  assert.match(reviewer, /mechanism-only changes are exempt and review immediately/i);
  const floor = flat(read("agents/references/reviewer-preconditions-and-tier.md"));
  assert.match(
    floor,
    /Mechanism-only\s*changes.*skip\s*this precondition and review immediately/i,
  );
});

test("output-styles/discipline.md's bar states operator yes precedes the review on a look-lane", () => {
  carries(
    "output-styles/discipline.md",
    "on a look-lane, the operator's yes precedes the review",
  );
});

test("doer-rules.md's engineer-return row sends a UI change to next: operator, never next: reviewer", () => {
  carries(
    "doer-rules.md",
    "Engineer return for a UI change is `next: operator`, never `next: reviewer`",
  );
});

// --- brief-carries-operator-words-2026-09-18 --------------------------------

test("dispatch-brief's one rule carries verbatim words, no invented numbers, outcomes not mechanisms, mandatory read-back, short/single, marked additions", () => {
  const brief = flat(read("skills/dispatch-brief/SKILL.md"));
  assert.match(brief, /operator's words and images are the\s*contract, quoted verbatim/i);
  assert.match(brief, /no invented\s*numbers/i);
  assert.match(brief, /never\s*mechanisms/i);
  assert.match(brief, /confirmed read-back.*is quoted in the brief/i);
  assert.match(brief, /parent's own additions are prefixed "parent:"/i);
  const raw = read("skills/dispatch-brief/SKILL.md");
  assert.match(raw, /\[ \] Every number sourced or knobbed/);
  assert.match(raw, /\[ \] No mechanism prescribed/);
  assert.match(raw, /\[ \] Parent additions marked "parent:"/);
});

test("prompt-craft states outcome altitude for look work, mechanism offered only as an option", () => {
  const prompt = flat(read("skills/prompt-craft/SKILL.md"));
  assert.match(
    prompt,
    /never the mechanism that produces it/i,
  );
  assert.match(prompt, /one\s*option, not required/i);
});

test("grilling makes the read-back mandatory for any brief interpreting a visual note", () => {
  const grilling = flat(read("skills/grilling/SKILL.md"));
  assert.match(
    grilling,
    /Any brief that interprets a look note is played\s*back to the operator in plain words \*\*before\*\* dispatch/i,
  );
  assert.match(
    grilling,
    /confirmed read-back.*is quoted verbatim as the brief's contract line/i,
  );
});

test("the reviewer flags a brief target with no source", () => {
  carries(
    "agents/reviewer.md",
    "Flag any target in the brief that has no source",
  );
});

// --- version bump ------------------------------------------------------------

test("plugin.json and marketplace.json carry one matching semver, at or past 1.84.0", () => {
  const plugin = JSON.parse(read(".claude-plugin/plugin.json"));
  const marketplace = JSON.parse(read(".claude-plugin/marketplace.json"));
  const semver = /^\d+\.\d+\.\d+$/;
  assert.match(plugin.version, semver);
  assert.equal(plugin.version, marketplace.plugins[0].version);
  const [major, minor] = plugin.version.split(".").map(Number);
  assert.ok(major > 1 || (major === 1 && minor >= 84), `${plugin.version} regressed before 1.84.0`);
});
