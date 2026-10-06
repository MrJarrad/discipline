// Per-queue law pins, one file. Each block below is the former queue-NNNN-law.test.mjs
// (block-scoped so helpers do not collide); every test is kept as written.
// Run: node --test hooks/scripts/queue-law.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { lintLessonLedger, namedRulingsFromChangedEntry, topChangedEntry } from "./lesson-ledger.mjs";
import { matchProcess, parseEtimeSeconds, parseWorktreePorcelain, shellExecutableBasename, worktreesToRemove } from "./lane-sweep.mjs";
import { spawnSync } from "node:child_process";
import { checkAgentDispatch, checkComponentSystemProgress, checkLineNoReadBack, checkSkillsNamed, checkSourceContractLockRows } from "../bin/agent-dispatch-gate.mjs";
import { GRANDFATHERED, duplicateRowNumbers, rowWritten } from "./queue-write-check.mjs";
import { findRow, replaceRow } from "./lane-end.mjs";

// ======== queue-1810-law ========
{
// The 1.81.0 queue: every ruling and lesson banked on 2026-09-13 and 2026-09-16
// has to live as a RULE in the file it named, not as a changelog line. This file
// is the ledger's enforcement arm — one test per queue row, asserting the rule's
// own sentence at its own home. A later edit that softens or deletes one fails
// here rather than being discovered the next time a lane gets it wrong.
//
// Round-cap wording is asserted in review-loop.test.mjs; single-home ownership in
// law-single-source.test.mjs. This file covers the rows those two do not.

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(repo, p), "utf8");
const flat = (text) => text.replace(/\s+/g, " ");
const carries = (file, sentence) =>
  assert.ok(
    flat(read(file)).includes(flat(sentence)),
    `${file} no longer carries: ${sentence}`,
  );

// --- lean-lane-cadence-2026-09-16 (fleet law, not a prototype note) ---------

test("the lane gate cadence is stated in doer-rules, prototypes exempted", () => {
  carries("doer-rules.md", "**Touched gates per row; one full suite per lane.**");
  carries("doer-rules.md", "**Never two full suites at once on one machine**");
  carries("doer-rules.md", "A **prototype lane runs no suite at all**");
});

test("prototype carries the no-suite-until-the-pick clause and the operator baton", () => {
  const prototype = read("skills/prototype/SKILL.md");
  assert.match(prototype, /No suite until the pick/i);
  assert.match(prototype, /no test suite and no review round/i);
  assert.match(prototype, /engineer → operator/i);
});

test("dispatch-brief demands invariants and a framing-checked measurement", () => {
  const brief = read("skills/dispatch-brief/SKILL.md");
  assert.match(brief, /\*\*invariants\*\*/i);
  assert.match(brief, /what must not change/i);
  assert.match(brief, /measurement-named AC/i);
  assert.match(brief, /operator's (own )?crop/i);
  assert.match(brief, /^\[ \] Invariants stated; measurement ACs framing-checked$/m);
});

test("the parent looks at a disclosed visual gap before the operator hears it", () => {
  carries(
    "skills/present-for-review/SKILL.md",
    "**Look at every disclosed gap before the operator hears it.**",
  );
  assert.match(read("skills/present-for-review/SKILL.md"), /at zoom/i);
});

// --- operator-is-the-cheapest-visual-gate-2026-09-16 ------------------------

test("the cheapest-visual-gate sentence is in doer-rules and dispatch-brief", () => {
  carries("doer-rules.md", "**The operator is the cheapest visual gate.**");
  assert.match(
    read("skills/dispatch-brief/SKILL.md"),
    /the operator is the cheapest visual gate/i,
  );
  assert.match(read("skills/prototype/SKILL.md"), /cheapest visual gate/i);
});

test("visual lanes return the link, not renders", () => {
  const doerRules = read("doer-rules.md");
  assert.match(doerRules, /the link to the\s+running build/i);
  assert.match(doerRules, /no screenshot\s+harness, row scan, or pixel diff/i);
});

// --- operator-queue-visible-2026-09-16 --------------------------------------

test("the output style names the queue file and the Needed from you heading", () => {
  const style = read("output-styles/discipline.md");
  assert.match(style, /orchestrator\/operator-queue\.md/);
  assert.match(style, /`## Needed from you`/);
  assert.match(style, /Nothing needed from you/);
  assert.match(style, /struck, never deleted/i);
  assert.doesNotMatch(
    style,
    /End every status with one next-action sentence/i,
    "the bare next-action rule is superseded by the queue rule",
  );
});

test("wrap, pause-resume and present-for-review all carry the queue verbatim", () => {
  for (const file of [
    "skills/wrap/SKILL.md",
    "skills/pause-resume/SKILL.md",
    "skills/present-for-review/SKILL.md",
  ]) {
    assert.match(read(file), /operator-queue\.md/, `${file} does not name the queue file`);
    assert.match(read(file), /verbatim|in full/i, `${file} does not demand the full row text`);
  }
});

// --- one-worktree-name-per-lane-2026-09-16 ----------------------------------

test("the worktree-name rule names the lane-kind forms and the own-tree limit", () => {
  carries("doer-rules.md", "**One worktree name per lane, and you remove only your own.**");
  const doerRules = read("doer-rules.md");
  for (const form of ["upload-<sha>", "review-r<n>-<sha>", "fix-<sha>-<topic>"]) {
    assert.ok(doerRules.includes(form), `doer-rules.md is missing the ${form} form`);
  }
  assert.match(read("agents/reviewer.md"), /own\*\* lane-named tree/i);
});

// --- borders-paint-at-whole-css-pixels-2026-09-16 ---------------------------

test("design-system states the whole-CSS-pixel border floor and the rounding form", () => {
  const ds = read("skills/design-system/SKILL.md");
  assert.match(ds, /\*\*Border tokens paint at whole CSS pixels\.\*\*/);
  assert.match(ds, /`2\.5px` token paints `2px` at DSR 1, 2 and 3/);
  assert.match(ds, /round\(down, <token>, 1px\)/);
  assert.match(ds, /never a device-pixel step/i);
});

test("audit-build measures the painted border, not the specified one", () => {
  const audit = read("skills/audit-build/SKILL.md");
  assert.match(audit, /\*\*Borders: measure painted, not specified\.\*\*/);
  assert.match(audit, /round\(down, token, 1px\)/);
});

// --- one-implementation-per-component + conform-every-rendering -------------

test("one implementation per component is a build rule and a red at review", () => {
  assert.match(read("skills/design-system/SKILL.md"), /\*\*One implementation per component or block\.\*\*/);
  assert.match(read("skills/design-system/SKILL.md"), /enumerate every rendering/i);
  assert.match(read("skills/markup-standard/SKILL.md"), /\*\*One implementation per component\.\*\*/);
  carries("agents/reviewer.md", "**One implementation per component — a second is red.**");
});

// --- spacers-are-margins-2026-09-13 ----------------------------------------

test("spacers resolve to margin or gap and never render a node", () => {
  const ds = read("skills/design-system/SKILL.md");
  assert.match(ds, /\*\*Spacers are margins\.\*\*/);
  assert.match(ds, /margin-block-start/);
  assert.match(ds, /\*\*A Spacer never renders a DOM node\.\*\*/);
  assert.match(ds, /stays padding/i);
});

// --- semantic-labelling-is-a-build-standard-2026-09-16 ----------------------

test("semantics are decided in code and never requested of the design file", () => {
  carries(
    "skills/markup-standard/SKILL.md",
    "**Semantics are decided in code, never authored in the design file.**",
  );
  assert.match(read("skills/markup-standard/SKILL.md"), /guidance, not a spec/i);
  assert.match(read("skills/capture-figma/SKILL.md"), /Never file a memo asking a designer to annotate semantics/i);
});

// --- export-values-win-no-drift-questions-2026-09-13 ------------------------

test("a value drift resolves to the export instead of stopping for a ruling", () => {
  carries("agents/engineer.md", "**A value drift resolves to the export, and is not a question.**");
  const engineer = read("agents/engineer.md");
  assert.match(engineer, /binds no token where one is expected/i);
  assert.match(engineer, /makes something not work/i);
});

// --- small-fix-merges-carry-the-review-record-2026-09-16 --------------------

test("the merge brief states the review record in all three homes", () => {
  assert.match(read("agents/releaseops.md"), /separate dispatches/i);
  assert.match(read("skills/release-deploy/SKILL.md"), /never route a refused merge through a peer\s+session/i);
  assert.match(read("skills/routing/SKILL.md"), /"no reviewer" is refused/);
});

// --- generative-plugins-publish-from-repo-2026-09-16 ------------------------

test("Figma plugin fixes are routed to the figma-plugins repo, not the in-app editor", () => {
  const capture = read("skills/capture-figma/SKILL.md");
  assert.match(capture, /figma-plugins\/main\/handoff\/<plugin>\//);
  assert.match(capture, /themeColors: true/);
  assert.match(capture, /a showUI option, not a manifest field/i);
  assert.match(read("skills/routing/references/LIBRARIES.md"), /figma-plugins\/main\/handoff/);
});
}

// ======== queue-1820-law ========
{
// The 1.82.0 queue: two operator rulings banked 2026-09-16 — fresh-context-per-task and
// cheapest-artefact-first — encoded whole across every surface each ruling names. One test
// per surface row, asserting the rule's own sentence at its own home so a later edit that
// softens or drops one fails here.

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(repo, p), "utf8");
const flat = (text) => text.replace(/\s+/g, " ");
const carries = (file, sentence) =>
  assert.ok(
    flat(read(file)).includes(flat(sentence)),
    `${file} no longer carries: ${sentence}`,
  );

// --- fresh-context-per-task-2026-09-16 --------------------------------------

test("routing states resume-only-for-red before the baton table", () => {
  const routing = flat(read("skills/routing/SKILL.md"));
  assert.match(routing, /## Resume vs fresh/);
  assert.match(routing, /Resume only to fix a red on the same sha/i);
  assert.match(routing, /Everything else is a fresh `Agent`/);
});

test("routing's identity gate no longer calls same-domain follow-ups SendMessage", () => {
  const routing = read("skills/routing/SKILL.md");
  assert.match(routing, /same-sha red findings only are parent `SendMessage`/);
  assert.doesNotMatch(routing, /same-domain follow-ups are parent `SendMessage`/);
});

test("dispatch-brief treats a continuation slice as a fresh agent with artefacts by path", () => {
  const brief = read("skills/dispatch-brief/SKILL.md");
  assert.match(brief, /A continuation slice is a fresh agent, not a resume/i);
  assert.match(brief, /named \*\*by path\*\*, never carried as/i);
});

test("reviewer round cap makes round two a fresh reviewer reading findings by path", () => {
  const reviewer = flat(read("agents/reviewer.md"));
  assert.match(reviewer, /A round-two reviewer is a fresh agent/i);
  assert.match(reviewer, /by path.{0,20}never carried from memory of writing them/i);
});

test("pause-resume cross-references fresh-context for its resume step", () => {
  carries(
    "skills/pause-resume/SKILL.md",
    "the same rule as `fresh-context-per-task`",
  );
});

test("model-routing budgets per fresh dispatch, naming resumed context as a token multiplier", () => {
  const mr = read("skills/model-routing/SKILL.md");
  assert.match(mr, /Resumed context is a hidden token multiplier/i);
  assert.match(mr, /Budget \*\*per fresh dispatch\*\*/);
});

// --- cheapest-artefact-first-2026-09-16 -------------------------------------

test("routing carries the rung ladder next to the persona table", () => {
  const routing = flat(read("skills/routing/SKILL.md"));
  assert.match(routing, /## Rung ladder \(name the rung before dispatch\)/);
  assert.match(routing, /\| 1 \| A question with a recommended answer, in chat \| `grilling` \|/);
  assert.match(routing, /\| 3 \| A toggle on one route, or a knob sheet \| `prototype` \|/);
  assert.match(
    routing,
    /No rung is climbed until the ruling from the rung below is in hand/,
  );
});

test("dispatch-brief's Constraints carry a Rung field and the checklist asks for it", () => {
  const brief = read("skills/dispatch-brief/SKILL.md");
  assert.match(brief, /\*\*`Rung:`\*\*/);
  assert.match(brief, /^\[ \] Model, surface-prefixed description, tier, rung; skills named$/m);
});

test("grilling and prototype cross-reference their rung numbers", () => {
  const grilling = read("skills/grilling/SKILL.md");
  const prototype = read("skills/prototype/SKILL.md");
  assert.match(grilling, /Grilling is \*\*rung 1\*\*/);
  assert.match(prototype, /Prototype is \*\*rung 3\*\*/);
});

test("the output style shows decisions at the lowest rung that exposes them", () => {
  carries(
    "output-styles/discipline.md",
    "Shown at the lowest rung that exposes it",
  );
});

test("engineer and ux-designer name a rung-4 return for a rung-2 decision as a defect", () => {
  const engineer = flat(read("agents/engineer.md"));
  const uxDesigner = flat(read("agents/ux-designer.md"));
  assert.match(engineer, /Returning a rung-4 build for a rung-2 decision is a defect/);
  assert.match(uxDesigner, /Returning a rung-4 render for a rung-2 decision is a defect/);
});

// --- version bump ------------------------------------------------------------
// Converted on touch (1.83.0, gates-assert-mechanism-not-values-2026-09-19): a
// gate pinning "== 1.82.0" re-anchors on every later release. The mechanism —
// both files carry one matching semver, at or past 1.82.0 — is what's
// asserted; the exact current number is queue-1830's fixture to check.

test("plugin.json and marketplace.json carry one matching semver, at or past 1.82.0", () => {
  const plugin = JSON.parse(read(".claude-plugin/plugin.json"));
  const marketplace = JSON.parse(read(".claude-plugin/marketplace.json"));
  const semver = /^\d+\.\d+\.\d+$/;
  assert.match(plugin.version, semver);
  assert.equal(plugin.version, marketplace.plugins[0].version);
  const [major, minor] = plugin.version.split(".").map(Number);
  assert.ok(major > 1 || (major === 1 && minor >= 82), `${plugin.version} regressed before 1.82.0`);
});
}

// ======== queue-1830-law ========
{
// The 1.83.0 queue: one operator ruling banked 2026-09-16 (dated 2026-09-19) —
// gates-assert-mechanism-not-values — encoded whole across every surface the
// ruling names. One test per surface row, asserting the rule's own sentence at
// its own home so a later edit that softens or drops one fails here.

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(repo, p), "utf8");
const flat = (text) => text.replace(/\s+/g, " ");
const carries = (file, sentence) =>
  assert.ok(
    flat(read(file)).includes(flat(sentence)),
    `${file} no longer carries: ${sentence}`,
  );

// --- gates-assert-mechanism-not-values-2026-09-19 ---------------------------

test("test-first states the mechanism-not-value rule with a DO/DON'T pair", () => {
  const testFirst = flat(read("skills/test-first/SKILL.md"));
  assert.match(testFirst, /never a value copied out of the contract into the test/i);
  assert.match(testFirst, /\*\*is the\s*fixture, read at run time\*\*/i);
  const raw = read("skills/test-first/SKILL.md");
  assert.match(raw, /DON'T:/);
  assert.match(raw, /DO:/);
  assert.match(raw, /pinned to the current export/);
});

test("qa-acceptance treats an AC verified by a copied number as unverified", () => {
  carries(
    "skills/qa-acceptance/SKILL.md",
    "An AC verified by a value copied out of the contract",
  );
  assert.match(
    flat(read("skills/qa-acceptance/SKILL.md")),
    /must read the contract at run time and assert the mechanism/i,
  );
});

test("the reviewer names a contract-enumerating comment red and a pinning gate amber-or-red", () => {
  const reviewer = flat(read("agents/reviewer.md"));
  assert.match(reviewer, /Contract-enumerating comment = red/i);
  assert.match(reviewer, /pinning gate = amber-or-red by blast radius/i);
  const floor = flat(read("agents/references/reviewer-evidence-and-floor.md"));
  assert.match(floor, /A comment enumerating the contract is red/i);
  assert.match(floor, /amber-or-red by blast radius/i);
  assert.match(floor, /convert.*the next time their surface is touched/i);
});

test("dispatch-brief's Constraints name the contract path the gate reads and retro-apply on touch", () => {
  const brief = read("skills/dispatch-brief/SKILL.md");
  assert.match(brief, /contract path read at run time/i);
  assert.match(brief, /pinning gate converts now/i);
});

test("doer-rules.md states the fixture-is-the-contract rule", () => {
  carries("doer-rules.md", "A gate's fixture is the contract, never a copy.");
  assert.match(
    flat(read("doer-rules.md")),
    /reads the banked export json, the design-system's generated tokens, or the ruling's constant file \*\*at run time\*\*/i,
  );
});

// --- version bump ------------------------------------------------------------
// Retro-applied at 1.84.0 touch (doer-rules.md: a pinning gate converts on
// touch, same as the 1.82.0 test's pin converted in 1.83.0).

test("plugin.json and marketplace.json carry one matching semver, at or past 1.83.0", () => {
  const plugin = JSON.parse(read(".claude-plugin/plugin.json"));
  const marketplace = JSON.parse(read(".claude-plugin/marketplace.json"));
  const semver = /^\d+\.\d+\.\d+$/;
  assert.match(plugin.version, semver);
  assert.equal(plugin.version, marketplace.plugins[0].version);
  const [major, minor] = plugin.version.split(".").map(Number);
  assert.ok(major > 1 || (major === 1 && minor >= 83), `${plugin.version} regressed before 1.83.0`);
});
}

// ======== queue-1840-law ========
{
// The 1.84.0 queue: two operator rulings banked — review-after-sign-off-2026-09-19
// (look-lane review moves from concurrent to after the operator's yes) and
// brief-carries-operator-words-2026-09-18 (a hoverboard-session ruling, queued
// since the 18th, wrongly set to `skipped` during 1.83.0, restored to `queued`
// by the parent) — encoded whole across every surface each ruling names. One
// test per surface row, asserting the rule's own sentence at its own home so a
// later edit that softens or drops one fails here.

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(repo, p), "utf8");
const flat = (text) => text.replace(/\s+/g, " ");
const carries = (file, sentence) =>
  assert.ok(
    flat(read(file)).includes(flat(sentence)),
    `${file} no longer carries: ${sentence}`,
  );

// --- review-after-sign-off-2026-09-19 ---------------------------------------

test("routing's Baton table sends a look-judged engineer landing to the operator, then merge, then a trailing reviewer", () => {
  // Superseded at 1.94.0 by `review-trails-the-operator-2026-09-20` (row 130
  // item 10): review no longer waits after landing to run as a pre-merge
  // gate on the operator's yes — it runs trailing, on the merged sha, in
  // the background, never queued in front of the look. The row still keeps
  // the operator first and the reviewer off look judgment.
  const routing = flat(read("skills/routing/SKILL.md"));
  assert.match(
    routing,
    /Engineer landed, \*\*look-judged\*\* \| \*\*Operator\*\* → merge on yes → \*\*Reviewer trailing\*\* on the merged sha/i,
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
}

// ======== queue-1850-law ========
{
// The 1.85.0 queue: one operator ruling encoded whole —
// accuracy-before-the-link-2026-09-20 ("What we want is accuracy in build" +
// two addenda). Four changes: (a) the coverage ledger replaces the deviation
// table and generalises to every contract, (b) one contract unit per lane at
// any model, (c) layout examples become a page x state x device table before
// build, (d) pixel proof at the operator's framing, never computed style.
// One test per surface row, asserting the rule's own sentence at its own home
// so a later edit that softens or drops one fails here.

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(repo, p), "utf8");
const flat = (text) => text.replace(/\s+/g, " ");
const carries = (file, sentence) =>
  assert.ok(
    flat(read(file)).includes(flat(sentence)),
    `${file} no longer carries: ${sentence}`,
  );

// --- (a) the coverage ledger, home + specialisations -------------------------

test("qa-acceptance is the ledger's one home: row shape, missing row red, variance never collapsed", () => {
  const qa = flat(read("skills/qa-acceptance/SKILL.md"));
  assert.match(qa, /## The coverage ledger — one row per contract item/);
  assert.match(qa, /\| item \| source ref \| built at `file:line` \| measured value \| mode \| status \|/);
  assert.match(qa, /\*\*A contract item with no row is red\.\*\*/);
  assert.match(qa, /one literal covering several contract modes is red/);
  assert.match(qa, /There is no second table of deviations\./);
  // every contract in the widened lock has a specialisation row
  for (const skill of ["handoff-to-code", "capture-figma", "capture-website", "capture-motion-source"]) {
    assert.ok(qa.includes(`\`${skill}\``), `qa-acceptance names no item for ${skill}`);
  }
});

test("each contract skill points at the ledger without restating it", () => {
  for (const file of [
    "skills/capture-figma/SKILL.md",
    "skills/capture-website/SKILL.md",
    "skills/capture-motion-source/SKILL.md",
  ]) {
    assert.match(flat(read(file)), /`qa-acceptance` § The coverage ledger/, `${file} does not point at the ledger`);
  }
});

test("handoff-to-code's house overlay carries the node ledger, the mode rule and the composition table", () => {
  const overlay = flat(read("skills/handoff-to-code/references/coverage-ledger.md"));
  assert.match(overlay, /\*\*Every node id in scope gets one row, written before any code is written\.\*\*/);
  assert.match(overlay, /\*\*A node in scope with no row is red\*\*/);
  assert.match(overlay, /\| page \| state \| device \| visible set \|/);
  assert.match(
    overlay,
    /\*\*The layout-example export pair is a required input to every component-set lane that has one\.\*\*/,
  );
  assert.match(overlay, /no example pair named while one exists is a malformed brief/);
  assert.match(overlay, /\*\*Scope stops at an `◆instance of` boundary\*\* — the instance is one row/);
  assert.match(overlay, /carries a row per mode — or a mode column with every mode filled/);
});

test("the mirrored handoff-to-code SKILL.md is not the place the house law was written", () => {
  // the skill file is a byte mirror of handoff-css; house law lives in the overlay
  const skill = read("skills/handoff-to-code/SKILL.md");
  assert.doesNotMatch(skill, /coverage ledger/i, "house law was written into the mirrored skill file");
});

test("doer-rules and the engineer charter return the ledger, deviation as a status value", () => {
  carries(
    "doer-rules.md",
    "Every lane also returns a **coverage ledger** — one row per item in its contract",
  );
  carries("doer-rules.md", "a contract item with no row is red");
  carries("agents/engineer.md", "a contract item with no row is a red finding");
  carries(
    "agents/engineer.md",
    "one literal covering several contract modes is red even when one mode measures right",
  );
});

// --- (b) one contract unit per lane, always ----------------------------------

test("dispatch-brief makes a multi-unit brief malformed at any model", () => {
  const brief = flat(read("skills/dispatch-brief/SKILL.md"));
  assert.match(brief, /\*\*One contract unit per lane, always\*\*/);
  assert.match(brief, /malformed at any model/);
  const raw = read("skills/dispatch-brief/SKILL.md");
  assert.match(raw, /\[ \] One contract unit per lane/);
  const accuracy = flat(read("skills/dispatch-brief/references/ACCURACY.md"));
  assert.match(accuracy, /malformed at any model, at any effort tier/);
  assert.match(
    accuracy,
    /\*\*The layout-example pair travels with the lane as context, not as a second unit\.\*\*/,
  );
});

test("model-routing sends a wide brief to a slice, never to a bigger model", () => {
  const routing = flat(read("skills/model-routing/SKILL.md"));
  assert.match(routing, /\*\*one contract unit per lane, always\*\*/i);
  assert.match(routing, /\*\*malformed at any model\*\*, never a reason to pick a bigger one/);
  assert.match(routing, /\*\*A wide brief is never an escalation\.\*\*/);
  assert.doesNotMatch(routing, /a whole-surface brief goes to `opus`/);
});

// --- (d) pixel proof at the operator's framing --------------------------------

test("present-for-review holds the link for both proofs, and calls neither a review round", () => {
  const present = flat(read("skills/present-for-review/SKILL.md"));
  assert.match(present, /## Before the link goes out/);
  assert.match(
    present,
    /headed screenshot at the operator's viewport and at each breakpoint family, with a pixel assertion on the region built/,
  );
  assert.match(present, /A `getComputedStyle` read is not proof that anything painted/);
  assert.match(present, /\*\*Neither is a review round\*\*/);
  assert.match(present, /The link waits on these two proofs being in the doer's return — never on a reviewer verdict/);
  const doer = flat(read("doer-rules.md"));
  assert.match(doer, /\*\*it is not a review round\*\* — the link waits on these two proofs being in the return, never on a reviewer/);
});

test("doer-rules, dispatch-brief done-when and both charters require pixel proof over computed style", () => {
  carries("doer-rules.md", "**Pixel proof before the link.**");
  assert.match(
    flat(read("skills/dispatch-brief/SKILL.md")),
    /done-when names \*\*pixel proof at the operator's framing\*\* — computed-style reads are not proof/,
  );
  carries("agents/engineer.md", "**`status: match` means you saw it paint.**");
  carries("agents/ux-designer.md", "**Rendered evidence is headed and pixel-asserted**");
});

test("qa-acceptance's description fires on the ledger, and the engineer's baton follows doer-rules row 5", () => {
  const qaDescription = /^---\r?\n[\s\S]*?\r?\n---/.exec(read("skills/qa-acceptance/SKILL.md"))[0];
  assert.match(qaDescription, /coverage ledger/);
  assert.match(qaDescription, /one row per item|a missing row is red/);
  const engineer = flat(read("agents/engineer.md"));
  assert.match(engineer, /a \*\*UI change returns `next: operator`\*\*/);
  assert.doesNotMatch(engineer, /name \*\*next: reviewer\*\* in your evidence return and \*\*stop\*\*/);
});

// --- version bump ------------------------------------------------------------

test("plugin.json and marketplace.json carry one matching semver, at or past 1.85.0", () => {
  const plugin = JSON.parse(read(".claude-plugin/plugin.json"));
  const marketplace = JSON.parse(read(".claude-plugin/marketplace.json"));
  const semver = /^\d+\.\d+\.\d+$/;
  assert.match(plugin.version, semver);
  assert.equal(plugin.version, marketplace.plugins[0].version);
  const [major, minor] = plugin.version.split(".").map(Number);
  assert.ok(major > 1 || (major === 1 && minor >= 85), `${plugin.version} regressed before 1.85.0`);
});
}

// ======== queue-1860-law ========
{
// The 1.86.0 queue: one operator ruling encoded whole — brief-is-the-lever-2026-09-20
// ("nothing that complex about frontend work that the right and accurate brief and
// information wouldn't be easy enough for cheaper models" + the refinement asking for
// "a review of the brief before it's finalised ... to interrogate a brief before it's
// picked up by an agent"). Brief interrogation: a fixed question set, run by a cheap
// read-only agent (or the parent inline for line) before any non-trivial
// dispatch, findings fix the brief, and model escalation after a failed lane requires
// the brief already passed interrogation. One test per surface row, asserting the
// rule's own sentence at its own home so a later edit that softens or drops one fails
// here.

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(repo, p), "utf8");
const flat = (text) => text.replace(/\s+/g, " ");
const carries = (file, sentence) =>
  assert.ok(
    flat(read(file)).includes(flat(sentence)),
    `${file} no longer carries: ${sentence}`,
  );

// --- the question set + template, offloaded --------------------------------

test("INTERROGATE.md exists and carries the fixed seven-question set and the template", () => {
  const path = "skills/dispatch-brief/references/INTERROGATE.md";
  assert.ok(existsSync(join(repo, path)), `${path} is missing`);
  const doc = flat(read(path));
  assert.match(doc, /## The fixed question set/);
  // Q1 covers both design and build contract items — a brief pointing at code
  // targets by glob (`nav-*.tsx`) is caught here too, not only Figma pointers.
  assert.match(doc, /Can every contract item — design[^—]*or build[^?]*\?/);
  assert.match(doc, /files\/components\/selectors touched, each named, never a glob/);
  for (const question of [
    /Which numbers lack a source or knob\?/,
    /Which mechanisms are unnamed\?/,
    /Where would the doer be forced to assume\?/,
    /Is done-when measurable at the operator's framing\?/,
    /Is there exactly one contract unit\?/,
    /Which named skills are missing for the domain\?/,
  ]) {
    assert.match(doc, question);
  }
  assert.match(doc, /a read-only `haiku` agent, findings only/i);
  assert.match(doc, /the parent, inline/i);
  assert.match(doc, /## Interrogated/);
});

// --- dispatch-brief: pointer, four-parts field, checklist -------------------

test("dispatch-brief points at INTERROGATE.md and requires the `## Interrogated` field", () => {
  const brief = flat(read("skills/dispatch-brief/SKILL.md"));
  assert.match(brief, /## Interrogate the brief/);
  assert.match(brief, /\[INTERROGATE\.md\]\(references\/INTERROGATE\.md\)/);
  assert.match(brief, /`## Interrogated`/);
  const raw = read("skills/dispatch-brief/SKILL.md");
  assert.match(raw, /^\[ \] Brief interrogated \(or inline, clear\); `## Interrogated` recorded$/m);
});

test("dispatch-brief's checklist is eighteen items (raised 16 -> 18 at 1.92.0, Change 1 additions)", () => {
  const brief = read("skills/dispatch-brief/SKILL.md");
  const list = brief.slice(brief.indexOf("## Before you dispatch"));
  const items = list.match(/^\[ \]/gm) || [];
  assert.equal(items.length, 18, `the list is ${items.length} items; the ratified count is 18`);
});

// --- model-routing: escalation precondition ---------------------------------

test("model-routing's escalation rule gains the brief-interrogated precondition", () => {
  const mr = flat(read("skills/model-routing/SKILL.md"));
  assert.match(
    mr,
    /Otherwise escalate only after a cheaper model \*\*demonstrably failed\*\* on this task \*\*and the brief passed the dispatch-brief interrogation\*\*/,
  );
  assert.match(mr, /A failed lane on an un-interrogated brief is a brief defect, not a model defect/);
  assert.doesNotMatch(
    mr,
    /Otherwise escalate only after a cheaper model \*\*demonstrably failed\*\* on this task\. Record it in the brief/,
  );
});

// --- routing: load order step 5 ---------------------------------------------

test("routing's load order names the interrogation step between the brief and Agent", () => {
  const routing = flat(read("skills/routing/SKILL.md"));
  assert.match(routing, /5\. \*\*Interrogate the brief\*\*/);
  assert.match(routing, /A dispatch made without all five loaded is malformed/);
  assert.doesNotMatch(routing, /A dispatch made without all four loaded is malformed/);
});

// --- output-styles/discipline.md: Announce by doing -------------------------

test("discipline.md's dispatch chain names the interrogation step", () => {
  carries(
    "output-styles/discipline.md",
    "Before any dispatch load `routing` → `model-routing` → `dispatch-brief` → **interrogate the brief**",
  );
});

// --- version bump ------------------------------------------------------------

test("plugin.json and marketplace.json carry one matching semver, at or past 1.86.0", () => {
  const plugin = JSON.parse(read(".claude-plugin/plugin.json"));
  const marketplace = JSON.parse(read(".claude-plugin/marketplace.json"));
  const semver = /^\d+\.\d+\.\d+$/;
  assert.match(plugin.version, semver);
  assert.equal(plugin.version, marketplace.plugins[0].version);
  const [major, minor] = plugin.version.split(".").map(Number);
  assert.ok(major > 1 || (major === 1 && minor >= 86), `${plugin.version} regressed before 1.86.0`);
});
}

// ======== queue-1870-law ========
{
// The 1.87.0 queue: two operator rulings encoded whole.
//
// (1) sonnet-default-ceiling (2026-09-21) — "if there are types of work generally that
// models perform best at and whether the right brief would mean sonnet should be
// absolutely fine for most of the type of work we are currently doing across all
// sessions and projects. should sonnet be the highest default?" -> "Yes". `sonnet` is
// the default for every dispatched doer; `haiku` for mechanical work. Superseded at
// 1.94.0 (row 130 item 9, operator 2026-09-24: "there shouldn't be a ceiling as such,
// it's more about having a default and using the right model for the job") — the old
// "opus only for two named cases" allowlist is replaced by "any tier may run as a
// child when the job shape calls for it, justified in `## Interrogated`."
//
// (2) doer read-back (2026-09-21) — "would it make sense to also introduce brief
// reading and playback with any question from the doer before commencing. I'm just
// conscious it's cheap to get the briefs clear, it's expensive to iterate or redo
// work." Every lane above line returns `## Read-back` and stops at
// `next: parent (go?)` before any edit; the parent's answer/go continues the same
// agent in the same context — the one non-red resume allowed.
//

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(repo, p), "utf8");
const flat = (text) => text.replace(/\s+/g, " ");
const carries = (file, sentence) =>
  assert.ok(
    flat(read(file)).includes(flat(sentence)),
    `${file} no longer carries: ${sentence}`,
  );
const lacks = (file, sentence) =>
  assert.ok(
    !flat(read(file)).includes(flat(sentence)),
    `${file} still carries the retired wording: ${sentence}`,
  );

// --- sonnet is the default, not a ceiling (1.94.0, row 130 item 9) ----------

test("model-routing's map states sonnet as a default, any tier justified by job shape", () => {
  const mr = flat(read("skills/model-routing/SKILL.md"));
  assert.match(mr, /`sonnet` is the default for every dispatched doer, of every job shape — a default, not a\s*ceiling/);
  assert.match(mr, /Any tier, including the top tier \(fable\/mythos\), may be dispatched as a child/);
  lacks(
    "skills/model-routing/SKILL.md",
    "opus` requires a written justification in the brief's",
  );
  lacks(
    "skills/model-routing/SKILL.md",
    "do **not** dispatch the top tier (fable/mythos) as a child",
  );
});

test("model-routing's escalation rule and checklist name sonnet as the start, justification by job shape", () => {
  const mr = flat(read("skills/model-routing/SKILL.md"));
  assert.match(mr, /Every cell \*\*starts at `sonnet`\*\*/);
  assert.match(mr, /sonnet is the default; if above sonnet: written justification/);
});

test("dispatch-brief's Persona + model section states sonnet as a default, not a ceiling", () => {
  carries(
    "skills/dispatch-brief/SKILL.md",
    "`sonnet` is the default, not a ceiling",
  );
});

test("INTERROGATE.md carries the eighth question naming the job-shape reason", () => {
  const doc = flat(read("skills/dispatch-brief/references/INTERROGATE.md"));
  assert.match(
    doc,
    /Model above sonnet: is the justification written, and does it name the job-shape/,
  );
});

test("agents/reviewer.md keeps its own default at sonnet, not a ceiling", () => {
  const raw = read("agents/reviewer.md");
  assert.match(raw, /^model: sonnet$/m);
  const rv = flat(raw);
  assert.match(rv, /`model: sonnet` above is the default, not a ceiling/);
});

test("output-styles/discipline.md still routes through model-routing before dispatch", () => {
  carries(
    "output-styles/discipline.md",
    "Before any dispatch load `routing` → `model-routing` → `dispatch-brief` → **interrogate the",
  );
});

// --- the doer read-back ------------------------------------------------------

test("doer-rules.md requires the read-back as the doer's first step", () => {
  const dr = flat(read("doer-rules.md"));
  assert.match(
    dr,
    /First step, above line: read back before building/,
  );
  assert.match(dr, /`## Read-back`/);
  assert.match(dr, /next: parent \(go\?\)/);
  assert.match(
    dr,
    /this continuation is the one non-red resume allowed/,
  );
});

test("each doer agent file names the read-back as its first step", () => {
  for (const file of ["agents/engineer.md", "agents/ux-designer.md", "agents/researcher.md"]) {
    const doc = flat(read(file));
    assert.match(
      doc,
      /First step, above line.*`## Read-back`/,
      `${file} missing the read-back first step`,
    );
    assert.match(doc, /next: parent \(go\?\)/, `${file} missing the stop condition`);
  }
});

test("dispatch-brief's done-when names the read-back precedes the build", () => {
  carries(
    "skills/dispatch-brief/SKILL.md",
    "**The read-back precedes the build**",
  );
});

test("routing names the read-back as the one non-fresh continuation besides a red resume", () => {
  const routing = flat(read("skills/routing/SKILL.md"));
  assert.match(
    routing,
    /Resume only to fix a red on the same sha, or to continue after a doer read-back/,
  );
  assert.match(routing, /\*\*Doer read-back returned\*\* \| \*\*Parent\*\* answers or says go/);
});

// --- version bump ------------------------------------------------------------

test("plugin.json and marketplace.json carry one matching semver, at or past 1.87.0", () => {
  const plugin = JSON.parse(read(".claude-plugin/plugin.json"));
  const marketplace = JSON.parse(read(".claude-plugin/marketplace.json"));
  const semver = /^\d+\.\d+\.\d+$/;
  assert.match(plugin.version, semver);
  assert.equal(plugin.version, marketplace.plugins[0].version);
  const [major, minor] = plugin.version.split(".").map(Number);
  assert.ok(major > 1 || (major === 1 && minor >= 87), `${plugin.version} regressed before 1.87.0`);
});
}

// ======== queue-1880-law ========
{
// The 1.88.0 queue: lane progress files (2026-09-21, `lane-progress-file`) and
// the release gate scoped to the rulings a release names.
//
// (1) lane-progress-file — "can we update discipline so progress isn't so
// blind?" -> "Yes". Every lane above trivial keeps a progress file at the
// path the brief names (default `<lane evidence dir>/progress.md`). The doer
// appends one timestamped line at each fixed milestone: read-back returned ·
// red test written · cause found · green · gates green · uploaded/pushed. The
// parent reads the file on any operator status ask. Time cap: no new
// milestone for 30 minutes -> the parent stops the lane and re-briefs a fresh
// agent from the last recorded milestone. Milestones never replace the
// evidence return.
//
// (2) release-gate scoping — hooks/scripts/lesson-ledger.mjs refused a
// version bump while ANY fleet/rulings/*.md in the vault was `queued`,
// including rulings from unrelated sessions. Scoped: a release commit is
// refused only if a ruling CHANGED.txt's top entry names (`[[stem]]` or a
// `fleet/rulings/<stem>.md` path) is still `queued`; other queued rulings are
// a warning, never a refusal. The ledger lint itself (lintLessonLedger) is
// unchanged in its unscoped default; the scoping is additive via
// `namedRulings`, wired in commit-gate.mjs.
//

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(repo, p), "utf8");
const flat = (text) => text.replace(/\s+/g, " ");
const carries = (file, sentence) =>
  assert.ok(
    flat(read(file)).includes(flat(sentence)),
    `${file} no longer carries: ${sentence}`,
  );

// --- lane progress files: fixed milestones, doer-rules.md ------------------

test("doer-rules.md § You are the doer states the progress file, default path, and the six milestones", () => {
  const dr = flat(read("doer-rules.md"));
  // 1.92.0 Change 4: "Progress is a file, not a stop" -> "Progress is a file, with a clock".
  assert.match(dr, /Progress is a file, with a clock/);
  assert.match(dr, /`<lane evidence dir>\/progress\.md`/);
  assert.match(dr, /read-back returned.*red test written.*cause found.*green.*gates green.*uploaded\/pushed/);
  assert.match(dr, /never replaces the fixed evidence return/);
});

test("doer-rules.md places the progress-file rule after the read-back step", () => {
  const dr = read("doer-rules.md");
  const readBackIdx = dr.indexOf("read back before building");
  const progressIdx = dr.indexOf("Progress is a file, with a clock");
  assert.ok(readBackIdx !== -1 && progressIdx !== -1, "both clauses present");
  assert.ok(progressIdx > readBackIdx, "progress-file rule must follow the read-back step");
});

test("doer-rules.md states the 30-minute no-milestone cap", () => {
  // 1.92.0 Change 4: sharpened into a two-stage clock (15-minute worktree
  // read, 30-minute stop); the 30-minute phrase now sits mid-sentence.
  carries("doer-rules.md", "no new milestone for 30 minutes");
  carries("doer-rules.md", "the parent stops the lane and re-briefs a fresh agent from the last recorded milestone");
});

// --- dispatch-brief: the ## Progress path field -----------------------------

test("dispatch-brief's four-part brief carries a ## Progress path field", () => {
  const db = flat(read("skills/dispatch-brief/SKILL.md"));
  assert.match(db, /\*\*`## Progress`\*\* — the progress-file path/);
  assert.match(db, /Default `<lane evidence dir>\/progress\.md`/);
});

test("dispatch-brief's checklist gains the ## Progress row", () => {
  carries("skills/dispatch-brief/SKILL.md", "[ ] `## Progress` path named (above line)");
});

// --- routing: the 30-minute cap and the stop + re-brief baton row ----------

test("routing's baton table carries the progress-file-silent stop + fresh re-brief row", () => {
  const routing = flat(read("skills/routing/SKILL.md"));
  assert.match(routing, /Progress file silent 30 minutes/);
  assert.match(routing, /Parent stops the lane/);
  assert.match(routing, /re-briefed from the last recorded milestone/);
});

// --- output-styles/discipline.md: "How are we looking?" reads the file -----

test("discipline.md's How are we looking answer reads the progress file", () => {
  carries(
    "output-styles/discipline.md",
    "reading the running lane's progress file",
  );
  carries("output-styles/discipline.md", "for its last milestone rather than guessing or");
});

// --- agent first-step lines carry the progress-file instruction ------------

test("every doer agent file's first-step lines name the progress file at ## Progress", () => {
  for (const file of [
    "agents/engineer.md",
    "agents/ux-designer.md",
    "agents/researcher.md",
    "agents/reviewer.md",
  ]) {
    const doc = flat(read(file));
    assert.match(
      doc,
      /keep the progress file\*{0,2} at (the brief's )?`## Progress`/i,
      `${file} missing the progress-file first-step line`,
    );
  }
});

// --- release gate: scoped to the rulings CHANGED.txt's top entry names -----

test("lintLessonLedger stays unscoped by default — every queued ruling still blocks a release", () => {
  const root = mkdtempSync(join(tmpdir(), "queue-1880-ledger-"));
  try {
    mkdirSync(join(root, "fleet", "rulings"), { recursive: true });
    writeFileSync(join(root, "fleet", "rulings", "unrelated.md"), "---\nname: fixture\nencoded: queued\n---\n\nbody\n");
    const result = lintLessonLedger(root, { release: "1.88.0" });
    assert.equal(result.ok, false, "the ledger lint's own contract is unchanged");
    assert.equal(result.queued.length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("gate scoping: a fixture vault with one queued unrelated ruling passes when it is not named", () => {
  const root = mkdtempSync(join(tmpdir(), "queue-1880-ledger-"));
  try {
    mkdirSync(join(root, "fleet", "rulings"), { recursive: true });
    writeFileSync(
      join(root, "fleet", "rulings", "2026-09-19-unrelated-topic.md"),
      "---\nname: fixture\nencoded: queued\n---\n\nbody\n",
    );
    const changedTop = "1.88.0 — ships [[2026-09-21-lane-progress-file]] only.";
    const named = namedRulingsFromChangedEntry(topChangedEntry(changedTop));
    const result = lintLessonLedger(root, { release: "1.88.0", namedRulings: named });
    assert.equal(result.ok, true, "an unrelated queued ruling is a warning, not a refusal");
    assert.equal(result.queued.length, 0);
    assert.equal(result.queuedWarning.length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("gate scoping: a fixture vault with one queued NAMED ruling fails", () => {
  const root = mkdtempSync(join(tmpdir(), "queue-1880-ledger-"));
  try {
    mkdirSync(join(root, "fleet", "rulings"), { recursive: true });
    writeFileSync(
      join(root, "fleet", "rulings", "2026-09-21-lane-progress-file.md"),
      "---\nname: fixture\nencoded: queued\n---\n\nbody\n",
    );
    const changedTop = "1.88.0 — ships [[2026-09-21-lane-progress-file]] only.";
    const named = namedRulingsFromChangedEntry(topChangedEntry(changedTop));
    const result = lintLessonLedger(root, { release: "1.88.0", namedRulings: named });
    assert.equal(result.ok, false, "the named ruling still blocks the release");
    assert.equal(result.queued.length, 1);
    assert.match(result.queued[0].file, /2026-09-21-lane-progress-file\.md$/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("commit-gate.mjs wires CHANGED.txt's top entry into the ledger gate via namedRulings", () => {
  const gate = flat(read("hooks/bin/commit-gate.mjs"));
  assert.match(gate, /namedRulingsFromChangedEntry/);
  assert.match(gate, /topChangedEntry/);
  assert.match(gate, /namedRulings/);
});

// --- version bump -------------------------------------------------------------

test("plugin.json and marketplace.json carry one matching semver, at or past 1.88.0", () => {
  const plugin = JSON.parse(read(".claude-plugin/plugin.json"));
  const marketplace = JSON.parse(read(".claude-plugin/marketplace.json"));
  const semver = /^\d+\.\d+\.\d+$/;
  assert.match(plugin.version, semver);
  assert.equal(plugin.version, marketplace.plugins[0].version);
  const [major, minor] = plugin.version.split(".").map(Number);
  assert.ok(major > 1 || (major === 1 && minor >= 88), `${plugin.version} regressed before 1.88.0`);
});
}

// ======== queue-1890-law ========
{
// The 1.89.0 queue: proportionality (2026-09-21, `proportionality`) — the brief
// names a size class (line / component / system) and the class fixes gates,
// skills, evidence, screenshots and preview policy — plus two riding ambers
// closed from the 1.88.0 review.
//
// (1) size class — operator: "i'm not sure a cap is really solving the
// problem... i just really don't understand why anything should be taking
// this amount of time" / on screenshots: "a quick confirmation at the size of
// the figma designs should be pretty quick to see any issues" -> "that sounds
// good". `doer-rules.md` § Size class fixes the process per class; CI runs
// the full suite/build once per PR, never inside a lane; a lane's
// verification is one deterministic repro plus three reps; no background
// runs inside a lane; a lane stops only its own pids.
//
// (2) riding ambers — the read-back exemption said "trivial/small-fix" while
// the progress-file exemption said "trivial"; both now read "line". The
// reviewer's progress-file line sat under fail-conditions; it is now the
// reviewer's own first-step bullet.
//

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(repo, p), "utf8");
const flat = (text) => text.replace(/\s+/g, " ");
const carries = (file, sentence) =>
  assert.ok(
    flat(read(file)).includes(flat(sentence)),
    `${file} no longer carries: ${sentence}`,
  );
const missing = (file, pattern) =>
  assert.doesNotMatch(flat(read(file)), pattern, `${file} still carries the old wording`);

// --- doer-rules.md § Size class ---------------------------------------------

test("doer-rules.md carries a Size class section naming all three classes", () => {
  const dr = flat(read("doer-rules.md"));
  assert.match(dr, /## Size class/);
  assert.match(dr, /\*\*line\*\*/);
  assert.match(dr, /\*\*component\*\*/);
  assert.match(dr, /\*\*system\*\*/);
});

test("doer-rules.md's component row names the Figma sample widths, one per width", () => {
  carries(
    "doer-rules.md",
    "one screenshot per Figma sample width (375 / 768 / 1280 / 1920), one per width, checked at a glance",
  );
  carries("doer-rules.md", "one upload per batch of lanes, not per lane");
});

test("doer-rules.md states the CI-once, lane-verification, no-background, and own-pids rules", () => {
  carries(
    "doer-rules.md",
    "Full test suite, production build and deploy checks run once per PR in CI**, never inside",
  );
  carries(
    "doer-rules.md",
    "Verification inside a lane is one deterministic repro plus three reps",
  );
  carries("doer-rules.md", "**No background runs inside a lane.**");
  carries("doer-rules.md", "**Lanes stop only their own pids**");
});

test("doer-rules.md's Size class section follows § You are the doer and precedes § Repo and safety", () => {
  const dr = read("doer-rules.md");
  const doerIdx = dr.indexOf("## You are the doer");
  const sizeIdx = dr.indexOf("## Size class");
  const repoIdx = dr.indexOf("## Repo and safety");
  assert.ok(doerIdx !== -1 && sizeIdx !== -1 && repoIdx !== -1, "all three headings present");
  assert.ok(doerIdx < sizeIdx && sizeIdx < repoIdx, "Size class must sit between You are the doer and Repo and safety");
});

// --- riding amber 1: unify the "line" exemption -----------------------------

test("the read-back and progress-file exemptions both read line, not trivial/small-fix", () => {
  carries("doer-rules.md", "First step, above line: read back before building.");
  carries("doer-rules.md", "line lanes fold the read-back into the evidence return without stopping");
  carries("doer-rules.md", "Progress is a file, with a clock.** Above line, keep a progress file");
  carries("doer-rules.md", "line lanes keep no progress file");
});

test("doer-rules.md's read-back and progress-file bullets no longer say trivial/small-fix", () => {
  missing(
    "doer-rules.md",
    /First step, above trivial\/small-fix: read back before building/,
  );
  missing("doer-rules.md", /Trivial\/small-fix lanes fold the read-back/);
});

// --- riding amber 2: reviewer's progress-file line moved to first step -----

test("agents/reviewer.md's progress-file line is a first-step bullet, not under fail-conditions", () => {
  const rv = read("agents/reviewer.md");
  const precondIdx = rv.indexOf("## Preconditions — check before reviewing anything");
  const progressIdx = rv.indexOf("First step: keep the progress file");
  assert.ok(precondIdx !== -1 && progressIdx !== -1, "both markers present");
  assert.ok(progressIdx < precondIdx, "progress-file first-step bullet must precede the Preconditions heading");
});

test("agents/reviewer.md's Preconditions block no longer opens with the progress-file line", () => {
  const rv = flat(read("agents/reviewer.md"));
  assert.doesNotMatch(
    rv,
    /Fail any and \*\*return immediately\*\*, naming it — a moving tree or a red build certifies nothing\. \*\*First:\*\* keep the progress file/,
  );
});

// --- dispatch-brief: Size field, checklist row, verification rule ----------

test("dispatch-brief's Constraints part names a Size field fixing gates/skills/evidence/screenshots/upload", () => {
  carries(
    "skills/dispatch-brief/SKILL.md",
    "**`Size:`** (`line | component | system`, `doer-rules.md` § Size class) fixing the gate set, skill count, evidence, screenshots and upload policy for the lane.",
  );
});

test("dispatch-brief's done-when states the one-repro-plus-three-reps verification rule", () => {
  carries(
    "skills/dispatch-brief/SKILL.md",
    "Verification inside a lane is one deterministic repro plus three reps",
  );
  carries("skills/dispatch-brief/SKILL.md", "a heavier sweep is its own lane, after the fix");
});

test("dispatch-brief's checklist gates the Size field", () => {
  const raw = read("skills/dispatch-brief/SKILL.md");
  assert.match(raw, /^\[ \] `Size:` named \(line \| component \| system\) and the process matches it$/m);
});

test("dispatch-brief's checklist is eighteen items as of 1.92.0", () => {
  const brief = read("skills/dispatch-brief/SKILL.md");
  const list = brief.slice(brief.indexOf("## Before you dispatch"));
  const items = list.match(/^\[ \]/gm) || [];
  assert.equal(items.length, 18, `the list is ${items.length} items; the ratified count is 18 as of 1.92.0`);
});

// Ceiling raised 1450 -> 1500 at 1.95.0 (`media-load-standard`); the test name
// keeps its 1.92.0 label since that's the queue that introduced the check.
test("dispatch-brief skill stays under its 1.92.0 1450-word ceiling", () => {
  const count = read("skills/dispatch-brief/SKILL.md").split(/\s+/).filter(Boolean).length;
  // Ceiling raised 1500 -> 1520 at 1.102.0 (see brief-shape-law.test.mjs).
  assert.ok(count <= 1520, `dispatch-brief is ${count} words; the ceiling is 1520 as of 1.102.0`);
});

// --- INTERROGATE.md: ninth question -----------------------------------------

test("INTERROGATE.md carries a ninth question naming the size class check", () => {
  carries(
    "skills/dispatch-brief/references/INTERROGATE.md",
    "Is the size class named (`line | component | system`, `doer-rules.md` § Size class),",
  );
  carries(
    "skills/dispatch-brief/references/INTERROGATE.md",
    "and is the process the brief specifies proportionate to it?",
  );
  carries(
    "skills/dispatch-brief/references/INTERROGATE.md",
    "Answer the nine\nquestions in `dispatch-brief/references/INTERROGATE.md` § The fixed question set.",
  );
});

// --- routing: CI-once, parent sweeps servers --------------------------------

test("routing states CI runs the full suite/build once per PR and the parent sweeps servers at lane end", () => {
  carries(
    "skills/routing/SKILL.md",
    "CI runs the full suite/build once per PR, never inside each lane",
  );
  carries(
    "skills/routing/SKILL.md",
    // Superseded at 1.90.0 (`lane-end-sweep`): the by-hand sweep is now
    // `lane-sweep.mjs`, run by the parent on every completion notification.
    "The parent runs `lane-sweep.mjs` on every completion notification",
  );
});

// --- present-for-review: pixel proof at Figma sample widths ----------------

test("present-for-review scopes pixel proof to one screenshot per Figma sample width for component class", () => {
  carries(
    "skills/present-for-review/SKILL.md",
    "**component** work's pixel proof is **one screenshot per Figma sample width (375 / 768 / 1280 / 1920), checked at a glance**",
  );
});

// --- qa-acceptance: ledger depth per class ----------------------------------

test("qa-acceptance states ledger depth follows size class and line is one row", () => {
  carries(
    "skills/qa-acceptance/SKILL.md",
    "Ledger depth follows size class",
  );
  carries("skills/qa-acceptance/SKILL.md", "**line** — one row, no ledger");
});

// --- R2 fix round: "trivial/small-fix" retired repo-wide -------------------

test("the retired term \"trivial/small-fix\" is absent from every live doc (CHANGED.txt history exempt)", () => {
  const files = [
    "doer-rules.md",
    "agents/engineer.md",
    "agents/researcher.md",
    "agents/ux-designer.md",
    "agents/reviewer.md",
    "skills/dispatch-brief/SKILL.md",
    "skills/dispatch-brief/references/INTERROGATE.md",
    "skills/routing/SKILL.md",
    "skills/present-for-review/SKILL.md",
    "skills/qa-acceptance/SKILL.md",
  ];
  for (const file of files) {
    assert.doesNotMatch(
      read(file),
      /trivial\/small-fix/,
      `${file} still carries the retired term "trivial/small-fix"`,
    );
  }
});

test("agents/engineer.md, researcher.md, ux-designer.md name line as the first-step threshold", () => {
  carries("agents/engineer.md", "First step, above line:** return `## Read-back`");
  carries("agents/researcher.md", "First step, above line:** return `## Read-back`");
  carries("agents/ux-designer.md", "First step, above line:** return `## Read-back`");
});

test("dispatch-brief and INTERROGATE.md name line, not trivial/small-fix, at the interrogation gate", () => {
  carries(
    "skills/dispatch-brief/SKILL.md",
    "Above line, the brief is read as the doer would and answered against a fixed",
  );
  carries(
    "skills/dispatch-brief/references/INTERROGATE.md",
    "Before any dispatch above line,",
  );
  carries(
    "skills/dispatch-brief/references/INTERROGATE.md",
    "**Above line:** a read-only `haiku` agent, findings only, never `Agent`s further.",
  );
});

// --- R2 fix round: component/system both keep read-back + progress file ----

test("doer-rules.md states component and system both keep the read-back stop and the progress file", () => {
  carries(
    "doer-rules.md",
    "**component and system both keep the read-back stop and\nthe progress file** — line is the only class exempt from either.",
  );
});

// --- R2 fix round: standalone component lane upload timing -----------------

test("doer-rules.md states a standalone component lane uploads at done, unless the brief names a batch", () => {
  carries(
    "doer-rules.md",
    "A standalone component lane uploads at done, unless the brief names a batch",
  );
});
}

// ======== queue-1900-law ========
{
// The 1.90.0 queue: lane-end sweep is a script; doers never poll (operator
// ruling 2026-09-21, `lane-end-sweep`) — on orphaned `until … sleep` loops
// from finished lanes: "can we do something to make sure they just [don't]
// stick around moving forward". (1) `doer-rules.md` § You are the doer gains
// a no-polling-loops / no-detached-shells rule, echoed one line in each doer
// agent file. (2) `hooks/scripts/lane-sweep.mjs`, run by the parent on every
// completion notification, stops next servers on ports >= 3220 (never
// 3210/3211), Playwright/headless Chromium, and any shell referencing the
// session's task-output directory. `routing`'s baton row and
// `output-styles/discipline.md`'s completion-notification step both name it,
// replacing the by-hand sweep sentence from 1.89.0's baton table.
//

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(repo, p), "utf8");
const flat = (text) => text.replace(/\s+/g, " ");
const carries = (file, sentence) =>
  assert.ok(
    flat(read(file)).includes(flat(sentence)),
    `${file} no longer carries: ${sentence}`,
  );

// --- doer-rules.md: no polling loops ----------------------------------------

test("doer-rules.md § You are the doer bans polling loops and detached shells", () => {
  const dr = flat(read("doer-rules.md"));
  assert.match(
    dr,
    /No `until`\/`while … sleep` polling loops and no detached shells inside a lane/,
  );
  assert.match(dr, /wait with a foreground command and a timeout/);
  const doerIdx = dr.indexOf("## You are the doer");
  const sizeIdx = dr.indexOf("## Size class");
  const ruleIdx = dr.indexOf("No `until`/`while … sleep` polling loops");
  assert.ok(
    ruleIdx > doerIdx && ruleIdx < sizeIdx,
    "the polling-loop rule must sit inside § You are the doer",
  );
});

test("each doer agent file points at the no-polling-loops rule", () => {
  for (const file of [
    "agents/engineer.md",
    "agents/ux-designer.md",
    "agents/researcher.md",
    "agents/reviewer.md",
  ]) {
    const doc = flat(read(file));
    assert.match(
      doc,
      /No polling loops or detached shells/,
      `${file} missing the no-polling-loops line`,
    );
  }
});

// --- routing baton row + output-styles --------------------------------------

test("routing's baton table names lane-sweep.mjs, replacing the by-hand sweep sentence", () => {
  const routing = flat(read("skills/routing/SKILL.md"));
  assert.match(routing, /lane-sweep\.mjs/);
  assert.doesNotMatch(
    routing,
    /Parent sweeps verification servers\*\* \(`:3220` and up\); the lane stopped only its own pids \(`doer-rules\.md` § Size class\)/,
  );
});

test("output-styles/discipline.md names the sweep on the completion notification", () => {
  carries("output-styles/discipline.md", "run `lane-sweep.mjs`");
});

// --- lane-sweep.mjs: the port fence, unit-tested with a fake process table -

test("a next server on port 3220+, old enough, is matched and swept", () => {
  const proc = { pid: 100, ppid: 900, etime: "01:00:00", argv: "node .../next-server" };
  const ports = new Map([[100, [3220]]]);
  const result = matchProcess(proc, ports, "/session/dir");
  assert.equal(result.match, true);
  assert.equal(result.port, 3220);
});

test("a next process on port 3210 is never swept", () => {
  const proc = { pid: 101, ppid: 1, etime: "00:10:00", argv: "next-server (v14)" };
  const ports = new Map([[101, [3210]]]);
  assert.equal(matchProcess(proc, ports, "/session/dir").match, false);
});

test("a next process on port 3211 is never swept", () => {
  const proc = { pid: 102, ppid: 1, etime: "00:10:00", argv: "node bin/next start" };
  const ports = new Map([[102, [3211]]]);
  assert.equal(matchProcess(proc, ports, "/session/dir").match, false);
});

test("a next process not listening on any port is never swept", () => {
  const proc = { pid: 103, ppid: 1, etime: "00:05:00", argv: "next dev" };
  const ports = new Map(); // no listening entry
  assert.equal(matchProcess(proc, ports, "/session/dir").match, false);
});

test("a next process listening on both 3210 and 3220+, orphaned, is swept for the sweepable port only", () => {
  const proc = { pid: 104, ppid: 1, etime: "00:05:00", argv: "next-server" };
  const ports = new Map([[104, [3210, 3221]]]);
  const result = matchProcess(proc, ports, "/session/dir");
  assert.equal(result.match, true);
  assert.equal(result.port, 3221);
});

test("a next server under 30 min old with a live parent is skipped — another lane's server", () => {
  const proc = { pid: 105, ppid: 900, etime: "00:05:00", argv: "node .../next-server" };
  const ports = new Map([[105, [3220]]]);
  const result = matchProcess(proc, ports, "/session/dir");
  assert.equal(result.match, false);
  assert.match(result.reason, /another lane/);
});

test("a next server orphaned (ppid 1) is matched even though it's young", () => {
  const proc = { pid: 106, ppid: 1, etime: "00:01:00", argv: "node .../next-server" };
  const ports = new Map([[106, [3220]]]);
  assert.equal(matchProcess(proc, ports, "/session/dir").match, true);
});

test("a next server with a live parent but 31 min old is matched", () => {
  const proc = { pid: 107, ppid: 900, etime: "00:31:00", argv: "node .../next-server" };
  const ports = new Map([[107, [3220]]]);
  assert.equal(matchProcess(proc, ports, "/session/dir").match, true);
});

test("headless chromium / playwright processes, old enough, are matched regardless of port", () => {
  const proc = {
    pid: 200,
    ppid: 900,
    etime: "01:00:00",
    argv: "/ms-playwright/chromium-1234/chrome-mac/chromium_headless_shell --headless",
  };
  assert.equal(matchProcess(proc, new Map(), "/session/dir").match, true);
});

test("a headless chromium under 30 min old with a live parent is skipped — another lane's browser", () => {
  const proc = {
    pid: 201,
    ppid: 900,
    etime: "00:00:01",
    argv: "/ms-playwright/chromium-1234/chrome-mac/chromium_headless_shell --headless",
  };
  const result = matchProcess(proc, new Map(), "/session/dir");
  assert.equal(result.match, false);
  assert.match(result.reason, /another lane/);
});

test("a headless chromium orphaned (ppid 1) is matched even though it's young", () => {
  const proc = {
    pid: 202,
    ppid: 1,
    etime: "00:00:01",
    argv: "/ms-playwright/chromium-1234/chrome-mac/chromium_headless_shell --headless",
  };
  assert.equal(matchProcess(proc, new Map(), "/session/dir").match, true);
});

test("a headless chromium with a live parent but 31 min old is matched", () => {
  const proc = {
    pid: 203,
    ppid: 900,
    etime: "00:31:00",
    argv: "/ms-playwright/chromium-1234/chrome-mac/chromium_headless_shell --headless",
  };
  assert.equal(matchProcess(proc, new Map(), "/session/dir").match, true);
});

test("a shell whose argv contains the session dir is matched", () => {
  const proc = { pid: 300, etime: "02:00:00", argv: "bash -c until ... /session/dir/task" };
  assert.equal(matchProcess(proc, new Map(), "/session/dir").match, true);
});

test("an unrelated process is never matched", () => {
  const proc = { pid: 400, etime: "10:00:00", argv: "/usr/sbin/cupsd" };
  assert.equal(matchProcess(proc, new Map(), "/session/dir").match, false);
});

test("lane-sweep.mjs exits 0 and prints one line per matched process", () => {
  const script = read("hooks/scripts/lane-sweep.mjs");
  assert.match(script, /process\.exit\(0\)/);
  assert.match(script, /Node built-ins only/);
});

// --- self / ancestor / age safety fences ------------------------------------
// (the dry run first caught these: the sweep's own pid and its launching
// shell both matched "shell referencing session dir" and would have been
// killed on a real run)

test("the sweep's own pid is excluded even though its argv matches the session dir", () => {
  const proc = { pid: 500, etime: "00:00", argv: "node lane-sweep.mjs --session-dir /session/dir" };
  const excludePids = new Set([500, 499, 1]);
  const result = matchProcess(proc, new Map(), "/session/dir", excludePids);
  assert.equal(result.match, false);
  assert.match(result.reason, /own pid or ancestor/);
});

test("an ancestor pid (the shell that launched the sweep) is excluded", () => {
  const proc = { pid: 499, etime: "00:00", argv: "/bin/zsh -c ... /session/dir" };
  const excludePids = new Set([500, 499, 1]);
  const result = matchProcess(proc, new Map(), "/session/dir", excludePids);
  assert.equal(result.match, false);
  assert.match(result.reason, /own pid or ancestor/);
});

test("a shell matching the session dir but younger than 60s is skipped", () => {
  const proc = { pid: 600, etime: "00:45", argv: "/bin/zsh -c ... /session/dir" };
  const result = matchProcess(proc, new Map(), "/session/dir", new Set());
  assert.equal(result.match, false);
  assert.match(result.reason, /younger than 60s/);
});

test("a shell matching the session dir at exactly 60s is matched (boundary)", () => {
  const proc = { pid: 601, etime: "01:00", argv: "/bin/zsh -c ... /session/dir" };
  const result = matchProcess(proc, new Map(), "/session/dir", new Set());
  assert.equal(result.match, true);
});

test("a five-hour-old snapshot shell referencing the session dir is still swept as a real leftover", () => {
  const proc = {
    pid: 700,
    etime: "05:02:08",
    argv: "/bin/zsh -c source /Users/x/.claude/shell-snapshots/snapshot-zsh-178 && /session/dir/task",
  };
  const result = matchProcess(proc, new Map(), "/session/dir", new Set());
  assert.equal(result.match, true);
});

test("parseEtimeSeconds handles mm:ss, hh:mm:ss, and dd-hh:mm:ss forms", () => {
  assert.equal(parseEtimeSeconds("00:45"), 45);
  assert.equal(parseEtimeSeconds("01:00"), 60);
  assert.equal(parseEtimeSeconds("05:02:08"), 5 * 3600 + 2 * 60 + 8);
  assert.equal(parseEtimeSeconds("1-05:02:08"), 86400 + 5 * 3600 + 2 * 60 + 8);
});

// --- reviewer round 2, S1: session-dir rule scoped to shells only -----------
// `lane-sweep.mjs:76` matched any process whose argv contained the session
// dir — an editor or `tail` on a session file would have been killed. Fixed:
// the rule applies only when the argv's leading executable, path-stripped,
// is `sh`, `bash`, or `zsh`.

test("vim opened on a file under the session dir, 5h old, is never matched", () => {
  const proc = {
    pid: 800,
    etime: "05:00:00",
    argv: "vim /session/dir/notes.md",
  };
  const result = matchProcess(proc, new Map(), "/session/dir", new Set());
  assert.equal(result.match, false);
  assert.match(result.reason, /not a shell/);
});

test("a real /bin/zsh -c shell referencing the session dir, 5h old, is still matched", () => {
  const proc = {
    pid: 801,
    etime: "05:00:00",
    argv: "/bin/zsh -c source /Users/x/.claude/shell-snapshots/snapshot-zsh-178 && /session/dir/task",
  };
  const result = matchProcess(proc, new Map(), "/session/dir", new Set());
  assert.equal(result.match, true);
  assert.equal(result.reason, "shell referencing session dir");
});

test("a node script running under the session dir is never matched", () => {
  const proc = {
    pid: 802,
    etime: "05:00:00",
    argv: "node /session/dir/scratchpad/script.mjs",
  };
  const result = matchProcess(proc, new Map(), "/session/dir", new Set());
  assert.equal(result.match, false);
  assert.match(result.reason, /not a shell/);
});

test("shellExecutableBasename strips path and login-shell leading dash", () => {
  assert.equal(shellExecutableBasename("bash -c foo"), "bash");
  assert.equal(shellExecutableBasename("/bin/zsh -c foo"), "zsh");
  assert.equal(shellExecutableBasename("-zsh"), "zsh");
  assert.equal(shellExecutableBasename("node script.mjs"), "node");
});
}

// ======== queue-1910-law ========
{
// The 1.91.0 queue: the coverage ledger has eight row classes; reviewer
// sampling is stratified across classes; worktree removal is fenced
// (operator ruling 2026-09-21, `eight-class-ledger`: "i'm trying to
// understand why so much stuff is getting missed or not updated" — "is
// there anything else we're missing?" -> "yes to both"; lesson
// `never-remove-a-worktree-by-pattern`: a pattern-matched `git worktree
// remove --force` deleted four `main` trees).
//

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(repo, p), "utf8");
const flat = (text) => text.replace(/\s+/g, " ");

const EIGHT_CLASSES = [
  "Geometry and placement",
  "Tokens",
  "Copy",
  "Links and targets",
  "States, variants and prototype flows",
  "Behaviour annotations",
  "Semantics and a11y hints",
  "Absence",
];

// --- qa-acceptance: eight classes + mode column -----------------------------

test("qa-acceptance/SKILL.md names all eight row classes", () => {
  const doc = flat(read("skills/qa-acceptance/SKILL.md"));
  for (const cls of EIGHT_CLASSES) {
    assert.ok(doc.includes(cls), `qa-acceptance/SKILL.md missing row class: ${cls}`);
  }
  assert.match(doc, /each present with its rows, or marked "none in scope\."/);
});

test("qa-acceptance/SKILL.md's ledger row shape carries a mode column", () => {
  const doc = read("skills/qa-acceptance/SKILL.md");
  assert.match(doc, /\| item \| source ref \| built at `file:line` \| measured value \| mode \| status \|/);
  assert.match(doc, /Tokens carry a `mode` column/);
});

// --- handoff-to-code overlay: each class specialised for an export ---------

test("handoff-to-code coverage-ledger.md specialises all eight classes for an export", () => {
  const doc = flat(read("skills/handoff-to-code/references/coverage-ledger.md"));
  for (const cls of EIGHT_CLASSES) {
    assert.ok(doc.includes(cls), `coverage-ledger.md missing row class: ${cls}`);
  }
  assert.match(doc, /block export \*\*and\*\*\s*its layout examples, export vs\s*built, \*\*per route\*\*/);
  assert.match(
    doc,
    /every node id present in the\s*prior export and \*\*absent\*\* in the new one, sourced from the changelog/,
  );
  assert.match(doc, /\*\*one row per Interaction\/Development note\*\*/);
});

// --- reviewer.md: stratified spot check -------------------------------------

test("agents/reviewer.md samples the coverage ledger across classes, not from one", () => {
  const doc = flat(read("agents/reviewer.md"));
  assert.match(doc, /stratified across the eight row classes, never sampled from one/);
  assert.match(doc, /Absence rows are re-proven by grep/);
});

// --- doer-rules.md + CLOSING-CHECKS.md: the worktree fence ------------------

test("doer-rules.md § Repo and safety carries the worktree fence", () => {
  const doc = flat(read("doer-rules.md"));
  assert.match(doc, /git worktree add worktrees\/<name> -b <branch>/);
  assert.match(doc, /never\*\* checks a branch out inside `main`/);
  assert.match(
    doc,
    /never a grep\/pattern over the list, and `main` \(or any path\s*not under `worktrees\/`\) is never a removal target/,
  );
  const repoIdx = doc.indexOf("## Repo and safety");
  const evidenceIdx = doc.indexOf("## Fixed evidence return");
  const fenceIdx = doc.indexOf("**Worktrees (bare-layout repos).**");
  assert.ok(
    fenceIdx > repoIdx && fenceIdx < evidenceIdx,
    "the worktree fence must sit inside § Repo and safety",
  );
});

test("wrap's CLOSING-CHECKS.md § Repo topology names the worktree fence", () => {
  const doc = flat(read("skills/wrap/references/CLOSING-CHECKS.md"));
  assert.match(doc, /The worktree fence/);
  assert.match(doc, /lane-sweep\.mjs --worktrees <repo>/);
  assert.match(doc, /`main` is never a removal target/);
  const topoIdx = doc.indexOf("## Repo topology at wrap");
  const versionIdx = doc.indexOf("## Version sync");
  const fenceIdx = doc.indexOf("**The worktree fence.**");
  assert.ok(
    fenceIdx > topoIdx && fenceIdx < versionIdx,
    "the worktree fence must sit inside § Repo topology",
  );
});

// --- lane-sweep.mjs --worktrees: unit-tested against a fake worktree list --

test("a worktree under worktrees/ with a merged branch is removed", () => {
  const worktrees = [
    { path: "/repo/main", branch: "main" },
    { path: "/repo/worktrees/fix-abc-topic", branch: "fix/abc-topic" },
  ];
  const merged = ["fix/abc-topic"];
  const result = worktreesToRemove("/repo", worktrees, merged);
  assert.equal(result.length, 1);
  assert.equal(result[0].path, "/repo/worktrees/fix-abc-topic");
});

test("main is never a removal target, even if its branch name matched merged", () => {
  const worktrees = [{ path: "/repo/main", branch: "main" }];
  const result = worktreesToRemove("/repo", worktrees, ["main"]);
  assert.equal(result.length, 0);
});

test("a path outside worktrees/ (release clone, mirror) is never a target", () => {
  const worktrees = [
    { path: "/repo/release-1.90.0", branch: "release/1.90.0" },
    { path: "/repo/conformance-hidden", branch: "feat/conformance-hidden" },
  ];
  const merged = ["release/1.90.0", "feat/conformance-hidden"];
  const result = worktreesToRemove("/repo", worktrees, merged);
  assert.equal(result.length, 0);
});

test("a worktree under worktrees/ with an unmerged branch is not removed", () => {
  const worktrees = [{ path: "/repo/worktrees/fix-abc-topic", branch: "fix/abc-topic" }];
  const result = worktreesToRemove("/repo", worktrees, []);
  assert.equal(result.length, 0);
});

test("a worktree with no resolved branch (detached HEAD) is never removed", () => {
  const worktrees = [{ path: "/repo/worktrees/detached-abc", branch: null }];
  const result = worktreesToRemove("/repo", worktrees, []);
  assert.equal(result.length, 0);
});

test("a grep-style pattern match on the list is not how targets are chosen — only exact path containment under worktrees/ counts", () => {
  // A path that merely starts with the string "worktrees" but isn't actually
  // under the repo's worktrees/ directory (e.g. a sibling dir with a similar
  // name) must never be swept.
  const worktrees = [{ path: "/repo/worktrees-archive/old-fix", branch: "fix/old" }];
  const result = worktreesToRemove("/repo", worktrees, ["fix/old"]);
  assert.equal(result.length, 0);
});

test("parseWorktreePorcelain reads path + branch pairs from git worktree list --porcelain", () => {
  const text = [
    "worktree /repo/main",
    "HEAD abc123",
    "branch refs/heads/main",
    "",
    "worktree /repo/worktrees/fix-abc-topic",
    "HEAD def456",
    "branch refs/heads/fix/abc-topic",
    "",
  ].join("\n");
  const entries = parseWorktreePorcelain(text);
  assert.deepEqual(entries, [
    { path: "/repo/main", branch: "main" },
    { path: "/repo/worktrees/fix-abc-topic", branch: "fix/abc-topic" },
  ]);
});

test("lane-sweep.mjs supports --worktrees on the CLI surface", () => {
  const script = read("hooks/scripts/lane-sweep.mjs");
  assert.match(script, /--worktrees/);
  assert.match(script, /worktreesToRemove/);
});
}

// ======== queue-1920-law ========
{
// The 1.92.0 queue: six plugin changes plus the Change 1 additions from
// `2026-09-22-lessons-for-1-92.md` (operator: "i'd like to actually discuss
// these and get them actioned" / "go", with three adjustments on the same
// day: the Source-contract lock-row gate also refuses backticked mechanism
// identifiers in the quote cell; the skills-named gate check applies to
// every persona, not build verbs only; the portfolio CLAUDE.md DS-path fix
// is already merged (PR 149), not deferred), PLUS the parent's ledger-block
// ruling: `fleet/lessons/hoverboard-rounds-14-15-lessons-2026-09-21.md`
// items 1, 3, 5 and 6 are answered in this release too (items 2 and 4 are
// hoverboard-rig-specific, noted in the lesson file's own `## Encoding`
// section, not encoded as a general plugin rule).
//

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(repo, p), "utf8");
const flat = (text) => text.replace(/\s+/g, " ");

// --- Change 1: Source-contract lock-row gate --------------------------------

test("dispatch-brief points at the Source-contract lock-row kinds, gate-enforced", () => {
  const doc = flat(read("skills/dispatch-brief/SKILL.md"));
  assert.match(doc, /SOURCE-CONTRACT-LOCKS\.md/);
});

test("the three legal lock-row kinds are documented with their meaning", () => {
  const doc = flat(read("skills/dispatch-brief/references/SOURCE-CONTRACT-LOCKS.md"));
  for (const kind of ["export-silent", "export-vs-ruling", "operator-round"]) {
    assert.ok(doc.includes(kind), `missing lock-row kind: ${kind}`);
  }
  assert.match(doc, /Banned, whatever the source/);
  assert.match(doc, /backticked mechanism identifier/);
});

test("gate: a Source-contract lock row is refused outside the three kinds", () => {
  assert.equal(checkSourceContractLockRows("## Source contract\n## Locked decisions\n| # | Operator said (verbatim) | Source |\n| - | --- | --- |\n| 1 | \"x\" | recommended |").item, "lock-rows");
});

test("gate: a Source-contract quote carrying a backticked mechanism identifier is refused", () => {
  const prompt =
    "## Source contract\n## Locked decisions\n| # | Operator said (verbatim) | Source |\n| - | --- | --- |\n" +
    '| 1 | "bind `--nav-gap-md` here" | operator-round |';
  assert.equal(checkSourceContractLockRows(prompt).item, "lock-rows");
});

// --- Change 1 additions: skills-named gate is every persona, not build verbs -

test("agent-dispatch-gate's skills check runs unconditionally on every subagent_type, not gated by a persona/verb allowlist", () => {
  const script = read("hooks/bin/agent-dispatch-gate.mjs");
  const callSite = script.slice(script.indexOf("const skillsVerdict"), script.indexOf("const skillsVerdict") + 120);
  assert.doesNotMatch(callSite, /subagentType|persona/i);
  assert.match(script, /checkSkillsNamed/);
});

test("gate: reviewer/researcher/releaseops dispatches with no Skills: line are refused, same as engineer", () => {
  for (const subagent_type of ["engineer", "ux-designer", "reviewer", "researcher", "releaseops"]) {
    const verdict = checkAgentDispatch({
      description: `cloud — ${subagent_type} (sonnet): do the thing`,
      model: "sonnet",
      subagent_type,
      prompt: "No skills line here at all.",
    });
    assert.equal(verdict.item, "skills", subagent_type);
  }
});

// --- Change 1 additions: fixed House rules block ----------------------------

test("dispatch-brief points at the fixed House rules block", () => {
  const doc = flat(read("skills/dispatch-brief/SKILL.md"));
  assert.match(doc, /HOUSE-RULES\.md/);
});

test("the House rules block names the real paths and every named area", () => {
  const doc = flat(read("skills/dispatch-brief/references/HOUSE-RULES.md"));
  assert.match(doc, /~\/JHD\/jhd-design-system\/main/);
  assert.match(doc, /~\/JHD\/jhd-design-system\/main\/motion-law\.md/);
  assert.match(doc, /fleet\/rulings\/token-rulings\.md/);
  for (const area of [
    "Design system",
    "Motion law",
    "Markup standard",
    "Layout policy",
    "Component law",
    "Contract order",
    "Pointers",
  ]) {
    assert.ok(doc.includes(area), `House rules block missing area: ${area}`);
  }
});

// --- Change 2: frame-first proof --------------------------------------------

test("handoff-to-code's coverage-ledger.md carries frame-first proof before any link", () => {
  const doc = flat(read("skills/handoff-to-code/references/coverage-ledger.md"));
  assert.match(doc, /Before any link goes out, the return carries a side-by-side/);
  assert.match(doc, /reviewer checks the ledger against the export JSON's node list/);
});

test("agents/reviewer.md checks the ledger against the export JSON's node list", () => {
  const doc = flat(read("agents/reviewer.md"));
  assert.match(doc, /Under a Source contract, the ledger is checked against the export JSON's node list/);
});

// --- Change 3: runtime proof for State claims -------------------------------

test("dispatch-brief's State section requires reproduction on the running build", () => {
  const doc = flat(read("skills/dispatch-brief/SKILL.md"));
  assert.match(doc, /reproduces each\s*claim \*\*on the running build\*\*, never by reading the code/);
});

test("doer-rules.md carries the runtime-proof-over-code-read rule", () => {
  const doc = flat(read("doer-rules.md"));
  assert.match(doc, /reproduced on the running build, never verified by reading the\s*code/);
});

// --- Change 4: lane clock + stall visibility --------------------------------

test("doer-rules.md's progress-file rule stamps the dispatch time and quotes it for an ETA", () => {
  const doc = flat(read("doer-rules.md"));
  assert.match(doc, /Its first line\s*stamps the dispatch time/);
  assert.match(doc, /quoting the dispatch time against the last milestone/);
  assert.match(doc, /No new\s*milestone for 15 minutes/);
});

test("routing's baton table has a 15-minute row alongside the 30-minute row", () => {
  const doc = flat(read("skills/routing/SKILL.md"));
  assert.match(doc, /Progress file silent 15 minutes/);
  assert.match(doc, /Progress file silent 30 minutes/);
});

// --- Change 5: motion proof --------------------------------------------------

test("motion's REVIEW.md requires a sampled property-over-time trace for enter/exit", () => {
  const doc = flat(read("skills/motion/references/REVIEW.md"));
  assert.match(doc, /Sampled proof for enter\/exit/);
  assert.match(doc, /is a note, not proof/);
});

// --- Change 6: queue write helper + deploy mechanics ------------------------

test("vault-write names the queue-write-check helper and the greps-the-row-back rule", () => {
  const doc = flat(read("skills/vault-write/SKILL.md"));
  assert.match(doc, /queue-write-check\.mjs/);
  assert.match(doc, /re-read the file and grep the written row back/);
});

test("release-deploy bans deploy verbs from briefs and names the standalone promote", () => {
  const doc = flat(read("skills/release-deploy/SKILL.md"));
  assert.match(doc, /runs as its own standalone Bash call from the parent/);
  assert.match(doc, /never named as a verb inside a dispatch brief/);
});

test("present-for-review points at the same standalone-deploy rule", () => {
  const doc = flat(read("skills/present-for-review/SKILL.md"));
  assert.match(doc, /Deploy commands stand alone/);
});

test("queue-write-check: rowWritten finds an exact row, whitespace-normalised", () => {
  const file = "| 81 | done | x |\n| 82 |  in progress | y |";
  assert.equal(rowWritten(file, "| 82 | in progress | y |"), true);
  assert.equal(rowWritten(file, "| 83 | missing | z |"), false);
});

test("queue-write-check CLI: exits 0 when the row is present, 1 and names it when absent", () => {
  const script = join(repo, "hooks", "scripts", "queue-write-check.mjs");
  const dir = mkdtempSync(join(tmpdir(), "queue-write-check-"));
  const file = join(dir, "queue.md");
  writeFileSync(file, "| 1 | banked row | ok |\n");

  const present = spawnSync(process.execPath, [script, file, "| 1 | banked row | ok |"], { encoding: "utf8" });
  assert.equal(present.status, 0);

  const absent = spawnSync(process.execPath, [script, file, "| 2 | never written | ok |"], { encoding: "utf8" });
  assert.equal(absent.status, 1);
  assert.match(absent.stderr, /row not found/);
  assert.match(absent.stderr, /never written/);
});

// --- hoverboard rounds 14-15 lesson: items 1, 3, 5, 6 -----------------------

test("item 1: doer-rules.md's evidence section requires the deployed link + operator device", () => {
  const doc = flat(read("doer-rules.md"));
  assert.match(doc, /A load\/timing number counts only on\s*the deployed link and the operator's device/);
  assert.match(doc, /unproven until the operator's own device readout says/);
});

test("item 3: doer-rules.md and routing require a gate-run lane for a full suite, never the parent shell", () => {
  const dr = flat(read("doer-rules.md"));
  assert.match(dr, /runs in a gate-run lane, never the parent\s*shell/);
  assert.match(dr, /run_in_background.*and.*nohup … & disown.*both die with the tool shell/);

  const routing = flat(read("skills/routing/SKILL.md"));
  assert.match(routing, /is its own gate-run\s*lane, dispatched and polled — never run from the parent shell/);
});

test("item 5: dispatch-brief's read-back line states which object a dimension sizes", () => {
  const doc = flat(read("skills/dispatch-brief/SKILL.md"));
  assert.match(doc, /The read-back states which object a dimension sizes/);
  assert.match(doc, /board, canvas, instance/);
});

test("item 6: vault-write folds the queue-row-in-same-tool-call rule into Change 6", () => {
  const doc = flat(read("skills/vault-write/SKILL.md"));
  assert.match(doc, /A queue row named in chat is written to the file in the same tool call/);
});

test("CHANGED.txt links the hoverboard-rounds-14-15 lesson file", () => {
  const doc = read("CHANGED.txt");
  assert.match(doc, /\[\[hoverboard-rounds-14-15-lessons-2026-09-21\]\]/);
});

// --- Additions-c: portfolio CLAUDE.md DS-path fix already merged ------------

test("the lessons-for-1-92 decision file exists and names the DS-path fix", () => {
  // This law test lives with the plugin repo, so it asserts the plugin-side
  // encoding only; the portfolio-repo fix itself (PR 149) is out of this
  // repo's tree and is not re-asserted here.
  assert.match(
    flat(read("skills/dispatch-brief/references/HOUSE-RULES.md")),
    /~\/JHD\/jhd-design-system\/main/,
  );
});
}

// ======== queue-1921-law ========
{
// The 1.92.1 queue: `2026-09-22-spend-levers.md` rules 1-3 (operator: "spend is
// getting a bit high"; rule 4 — model choice per orchestration session — is the
// operator's own call, not encoded).
//
// Rule 1: read-back only above `line`; the dispatch gate refuses a `line`
// brief that asks for one.
// Rule 2: the evidence return is the coverage ledger plus gate tails only;
// narrative, reproduction logs and per-frame readings go to the progress
// file, linked by path.
// Rule 3: the parent's reply to a read-back is one line — `go`, or one
// correction — never a restatement.
//

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(repo, p), "utf8");
const flat = (text) => text.replace(/\s+/g, " ");

// --- Rule 1: read-back only above line --------------------------------------

test("doer-rules: a line brief never asks for a read-back; the gate refuses one that does", () => {
  const doc = flat(read("doer-rules.md"));
  assert.match(doc, /A `line` brief never\s*asks for a read-back stop; the dispatch gate refuses one that does/);
});

test("dispatch-brief: names the line-lane read-back exemption and gate refusal", () => {
  const doc = flat(read("skills/dispatch-brief/SKILL.md"));
  assert.match(doc, /never on `line`, gate-refused/);
});

test("gate: checkLineNoReadBack is null for a line brief with no read-back ask", () => {
  assert.equal(checkLineNoReadBack("Size: line\nFix the guard on this file."), null);
});

test("gate: checkLineNoReadBack refuses a line brief instructing a ## Read-back return", () => {
  const verdict = checkLineNoReadBack("Size: line\nReturn `## Read-back` before any edit.");
  assert.equal(verdict.item, "line-readback");
});

test("gate: checkLineNoReadBack refuses a line brief instructing a next: parent (go?) stop", () => {
  const verdict = checkLineNoReadBack("Size: line\nStop with next: parent (go?) before editing.");
  assert.equal(verdict.item, "line-readback");
});

test("gate: checkLineNoReadBack does not fire on a component/system brief with a read-back ask", () => {
  assert.equal(checkLineNoReadBack("Size: component\nReturn `## Read-back` before any edit."), null);
});

test("gate: checkAgentDispatch refuses a full line-sized Agent dispatch that asks for a read-back", () => {
  const verdict = checkAgentDispatch({
    description: "cloud — engineer (sonnet): fix the guard",
    model: "sonnet",
    subagent_type: "engineer",
    prompt: "Size: line\nSkills: quality\nReturn `## Read-back` before any edit.",
  });
  assert.equal(verdict.item, "line-readback");
});

test("gate: checkAgentDispatch allows a line-sized dispatch with no read-back ask", () => {
  const verdict = checkAgentDispatch({
    description: "cloud — engineer (sonnet): fix the guard",
    model: "sonnet",
    subagent_type: "engineer",
    prompt: "Size: line\nSkills: quality\nFix the guard on this one file and commit.",
  });
  assert.equal(verdict.ok, true);
});

// --- Rule 2: evidence returns are the ledger + gate tails -------------------

test("doer-rules: the evidence return is the ledger plus gate tails; narrative goes to the progress file", () => {
  const doc = flat(read("doer-rules.md"));
  assert.match(doc, /the ledger plus gate tails, full stop.*narrative, reproduction logs and\s*per-frame readings live in the progress file/);
});

test("dispatch-brief: repeats the ledger-plus-gate-tails evidence rule", () => {
  const doc = flat(read("skills/dispatch-brief/SKILL.md"));
  assert.match(doc, /Evidence is the ledger plus gate tails only, narrative to the progress file/);
});

test("doer-rules: the 250-word evidence budget still stands (rule 2 does not loosen it)", () => {
  const doc = flat(read("doer-rules.md"));
  assert.match(doc, /≤ 250 words/);
});

// --- Rule 3: parent replies to a read-back are one line ---------------------

test("doer-rules: the parent's read-back reply is one line, never a restatement", () => {
  const doc = flat(read("doer-rules.md"));
  assert.match(doc, /The parent's reply is one line — `go`, or one\s*correction — never a\s*restatement/);
});

test("dispatch-brief: repeats the one-line read-back reply rule", () => {
  const doc = flat(read("skills/dispatch-brief/SKILL.md"));
  assert.match(doc, /the parent's reply is one line/);
});

// --- Rule 5: lane-end.mjs is one deterministic parent call ------------------


test("lane-end: findRow locates a row scoped to its own section", () => {
  const queue = "## Discipline\n9. a row\n";
  assert.ok(findRow(queue, "9", "Discipline"));
});

test("lane-end: replaceRow refuses a row absent from the named section", () => {
  assert.equal(replaceRow("## Discipline\n1. x\n", "9", "9. y", "Discipline").ok, false);
});

test("lane-end: replaceRow requires --section — no whole-file fallback", () => {
  assert.equal(replaceRow("## Discipline\n9. x\n", "9", "9. z").ok, false);
});

test("lane-end: row 9 in two sections — the named section's row 9 is neither falsely refused nor cross-written (round 2 fix)", () => {
  const queue = "## Portfolio\n9. portfolio row\n## Discipline\n9. discipline row\n";
  const result = replaceRow(queue, "9", "9. discipline row, replaced", "Discipline");
  assert.equal(result.ok, true, result.reason);
  assert.match(result.text, /portfolio row/); // untouched
  assert.match(result.text, /discipline row, replaced/);
});

test("routing: the baton table names lane-end.mjs as the lane-landed parent call", () => {
  const doc = flat(read("skills/routing/SKILL.md"));
  assert.match(doc, /Parent runs\*\* `node <plugin>\/hooks\/scripts\/lane-end\.mjs`/);
});

// --- Ledger: rule 4 withdrawn, rule 5 encoded -------------------------------

test("the 1.92.1 CHANGED entry names rules 1-3 and 5, and rule 4's withdrawal", () => {
  // Retro-tolerant (same pattern as queue-1830-law.test.mjs's version pin):
  // finds 1.92.1's own entry by its leading version stamp rather than
  // assuming it is still CHANGED.txt's top block, which a later release
  // supersedes.
  const changed = read("CHANGED.txt");
  const entryMatch = /^1\.92\.1 —[\s\S]*?(?=\n\n\d+\.\d+\.\d+ —|$)/m.exec(changed);
  assert.ok(entryMatch, "1.92.1's own CHANGED entry must still exist");
  const entry = entryMatch[0];
  assert.match(entry, /spend-levers/);
  assert.match(entry, /rule 4/);
  assert.match(entry, /rule 5|lane-end/);
});
}

// ======== queue-1930-law ========
{
// The 1.93.0 queue: `2026-09-22-scripts-not-agents.md` — four mechanical
// lane shapes become deterministic plugin scripts (operator: "is there
// anything else we use agents for that could just be a script?" → "let's do
// it") plus the same-day mechanical-first addition (operator: "i have
// preference for … ways to do things that takes the need away from using ai
// … where we can go mechanical or use things like scripts that a
// preference").

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(repo, p), "utf8");
const flat = (text) => text.replace(/\s+/g, " ");

const SCRIPTS = ["release-build.mjs", "rulebook-sync.mjs", "ds-regen.mjs", "merge-after-review.mjs"];

// --- the four scripts exist, accept --dry-run, and carry a law test --------

for (const script of SCRIPTS) {
  test(`${script} exists under hooks/scripts/`, () => {
    assert.ok(existsSync(join(repo, "hooks", "scripts", script)), `hooks/scripts/${script} must exist`);
  });

  test(`${script} accepts --dry-run`, () => {
    const src = read(`hooks/scripts/${script}`);
    assert.match(src, /--dry-run/);
  });

  const testFile = script.replace(/\.mjs$/, ".test.mjs");
  test(`${script} has a companion law test (${testFile})`, () => {
    assert.ok(existsSync(join(repo, "hooks", "scripts", testFile)), `hooks/scripts/${testFile} must exist`);
  });

  test(`${testFile} exercises a scratch git repo, never a real remote`, () => {
    const src = read(`hooks/scripts/${testFile}`);
    assert.match(src, /git.*init/s, `${testFile} must set up a scratch git repo`);
    assert.doesNotMatch(src, /github\.com\/MrJarrad|\bgit@github\.com/, `${testFile} must never point at a real remote`);
  });
}

// --- lane-end.mjs's --then-merge/--then-build chain -------------------------

test("lane-end.mjs supports --then-merge chaining to merge-after-review.mjs", () => {
  const src = read("hooks/scripts/lane-end.mjs");
  assert.match(src, /then-merge/);
  assert.match(src, /merge-after-review\.mjs/);
});

test("lane-end.mjs's --then-merge chain also supports --then-build", () => {
  const src = read("hooks/scripts/lane-end.mjs");
  assert.match(src, /then-build/);
});

// --- routing names the four scripts (offloaded to a reference) -------------

test("routing's baton table points at the mechanical scripts reference", () => {
  const doc = flat(read("skills/routing/SKILL.md"));
  assert.match(doc, /MECHANICAL-SCRIPTS\.md/);
});

test("routing's MECHANICAL-SCRIPTS.md names all four scripts", () => {
  const doc = read("skills/routing/references/MECHANICAL-SCRIPTS.md");
  for (const script of SCRIPTS) {
    assert.match(doc, new RegExp(script.replace(".", "\\.")));
  }
});

// --- mechanical-first principle, three sites --------------------------------

test("doer-rules.md states mechanical-first at the top of § You are the doer", () => {
  const doc = flat(read("doer-rules.md"));
  assert.match(doc, /\*\*Mechanical first\.\*\* When shaping any solution, a deterministic mechanism/);
});

test("quality/SKILL.md states mechanical-first as a non-negotiable", () => {
  const doc = flat(read("skills/quality/SKILL.md"));
  assert.match(doc, /\*\*Mechanical first\.\*\* A deterministic mechanism/);
});

test("code-minimalism/SKILL.md's ladder names mechanical-first as the rung before authoring new code", () => {
  const doc = flat(read("skills/code-minimalism/SKILL.md"));
  assert.match(doc, /\*\*Mechanical first\?\*\*/);
  assert.match(doc, /\*\*Only then:\*\* write the \*minimum working code\*/);
  // Mechanical-first must be the rung immediately before "Only then: write the
  // minimum working code" — never after it.
  const mechanicalIdx = doc.indexOf("**Mechanical first?**");
  const onlyThenIdx = doc.indexOf("**Only then:** write the *minimum working code*");
  assert.ok(mechanicalIdx > -1 && onlyThenIdx > -1 && mechanicalIdx < onlyThenIdx);
});

// --- Boundaries paragraph in the ruling file --------------------------------

test("the vault ruling's Boundaries paragraph is present with the four-script contract", () => {
  // The vault lives outside this repo checkout in CI; this test only runs
  // where the vault path is reachable (local dev / the release lane).
  const vaultPath = join(
    process.env.HOME || "",
    "JHD/vault/main/projects/jhd-discipline/decisions/2026-09-22-scripts-not-agents.md",
  );
  if (!existsSync(vaultPath)) return; // skip outside the dev machine
  const doc = readFileSync(vaultPath, "utf8");
  assert.match(doc, /encoded: 1\.93\.0/);
  assert.match(doc, /## Principle/);
  assert.match(doc, /Mechanical first/);
});

// --- CHANGED.txt / version -------------------------------------------------
// Converted on touch (1.93.2, gates-assert-mechanism-not-values-2026-09-19):
// pinning "top CHANGED entry is exactly 1.93.0" / "plugin.json is exactly
// 1.93.0" re-anchors on every later release — the same pinning-gate shape
// the other queue law tests avoid via "at or past". The mechanism asserted
// here is that CHANGED.txt carries a 1.93.0 entry naming scripts-not-agents
// and the mechanical-first principle somewhere in the file (not necessarily
// at the top), and that plugin.json's version is at or past 1.93.0.

test("CHANGED.txt carries a 1.93.0 entry naming scripts-not-agents and the mechanical-first principle", () => {
  const changed = read("CHANGED.txt");
  const entries = changed.split(/\n\n/);
  const entry = entries.find((e) => /^1\.93\.0\b/.test(e));
  assert.ok(entry, "no 1.93.0 entry found in CHANGED.txt");
  assert.match(entry, /scripts-not-agents/);
  assert.match(entry, /[Mm]echanical/);
});

test("the plugin.json version is at or past 1.93.0", () => {
  const pkg = JSON.parse(read(".claude-plugin/plugin.json"));
  const semver = /^\d+\.\d+\.\d+$/;
  assert.match(pkg.version, semver);
  const [major, minor] = pkg.version.split(".").map(Number);
  assert.ok(major > 1 || (major === 1 && minor >= 93), `${pkg.version} regressed before 1.93.0`);
});
}

// ======== queue-1950-law ========
{
// The 1.95.0 queue: `lanes-survive-interruption` (2026-09-25) — a portfolio
// lane's session ended mid-task and left ~295 uncommitted lines across six
// files, an untracked probe script, no commits, no progress file; the brief
// omitted `## Progress` though the lane was above line and nothing refused
// it. Plus the same-day `media-load-standard` ruling: media on screen is
// never blank or half-painted, made a standing skill with a mechanical probe.
//
// (1) `hooks/bin/agent-dispatch-gate.mjs` refuses a `Size: component`/
// `Size: system` dispatch whose prompt has no `## Progress` path.
// (2) `doer-rules.md` § You are the doer: a milestone is a progress line AND
// a local WIP commit (explicit paths, never `-A`/`-a`/stash) on the lane
// branch; the progress line names the WIP sha.
// (3) `routing`'s baton table + § Resume vs fresh: a stopped/interrupted
// lane is never resumed — parent reads the worktree diff + progress file,
// dispatches fresh, first step commits leftover WIP and re-verifies it.
// (4) new `media-loading` skill + `hooks/scripts/media-load-probe.mjs` (+lib)
// — every visible media element shows at least its still/poster from first
// paint through every motion; done-when is the probe's empty-visible-media
// count at 0, deployed build, Chromium+WebKit; pointers from design-craft
// (Law 11), quality, agents/reviewer.md, dispatch-brief, routing.
// (5) `output-styles/discipline.md` + `vault-write`: a `## Needed from you`
// row is only what the operator can act on right now — a step still in
// flight ("wait for my next message", "once X is in") is status prose above
// the heading, never a queue row (operator: "needed from me shouldn't
// include things that aren't actually ready").
//

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(repo, p), "utf8");
const flat = (text) => text.replace(/\s+/g, " ");

// --- (1) dispatch gate: component/system briefs name a progress path -------

test("gate: checkComponentSystemProgress is null when a ## Progress path is present", () => {
  assert.equal(checkComponentSystemProgress("Size: component\n\n## Progress\n/vault/evidence/progress.md\n"), null);
});

test("gate: checkComponentSystemProgress refuses a component brief with no ## Progress heading", () => {
  const verdict = checkComponentSystemProgress("Size: component\nBuild the thing.");
  assert.equal(verdict.item, "progress-path");
});

test("gate: checkComponentSystemProgress refuses a system brief with no ## Progress heading", () => {
  assert.equal(checkComponentSystemProgress("Size: system\nBuild the thing.").item, "progress-path");
});

test("gate: checkComponentSystemProgress does not fire on a line brief", () => {
  assert.equal(checkComponentSystemProgress("Size: line\nFix the guard."), null);
});

test("gate: checkAgentDispatch refuses a full component-sized Agent dispatch with no progress path", () => {
  const verdict = checkAgentDispatch({
    description: "cloud — engineer (sonnet): rebind the nav",
    model: "sonnet",
    subagent_type: "engineer",
    prompt: "Size: component\nSkills: quality\nBuild the nav row.",
  });
  assert.equal(verdict.item, "progress-path");
});

// --- (2) doer-rules: milestone = progress line + explicit-path WIP commit --

test("doer-rules: a milestone is a progress-file line AND a local WIP commit", () => {
  const doc = flat(read("doer-rules.md"));
  assert.match(doc, /A milestone is a progress line AND a local WIP commit/);
});

test("doer-rules: WIP commits stage explicit paths, never -A or -a", () => {
  const doc = flat(read("doer-rules.md"));
  assert.match(doc, /never `git add -A` \/ `commit -a`/);
});

test("doer-rules: git stash is forbidden for WIP, not just discouraged", () => {
  const doc = flat(read("doer-rules.md"));
  assert.match(doc, /\*\*Never `git stash`\*\*/);
});

// --- (3) routing: stopped/interrupted lanes are always fresh ---------------

test("routing: Resume vs fresh names the stopped/interrupted case as always-fresh", () => {
  const doc = flat(read("skills/routing/SKILL.md"));
  assert.match(doc, /A lane found stopped or interrupted[\s\S]*?is never resumed/);
});

test("routing: the baton table carries a stopped/interrupted row pointing at a fresh Agent", () => {
  const doc = flat(read("skills/routing/SKILL.md"));
  assert.match(doc, /\*\*Lane stopped\/interrupted\*\*/);
});

// --- (4) media-loading skill + probe ----------------------------------------

test("media-loading skill exists with the bar and the probe named", () => {
  assert.ok(existsSync(join(repo, "skills", "media-loading", "SKILL.md")));
  const doc = flat(read("skills/media-loading/SKILL.md"));
  assert.match(doc, /never a blank or half-painted tile/);
  assert.match(doc, /media-load-probe\.mjs/);
});

test("media-load-probe.mjs + its pure lib + both test files exist", () => {
  for (const rel of [
    "hooks/scripts/media-load-probe.mjs",
    "hooks/scripts/media-load-probe.test.mjs",
    "hooks/scripts/lib/media-load-lib.mjs",
    "hooks/scripts/lib/media-load-lib.test.mjs",
  ]) {
    assert.ok(existsSync(join(repo, rel)), `${rel} must exist`);
  }
});

test("media-load-probe.mjs drives both Chromium and WebKit", () => {
  const src = read("hooks/scripts/media-load-probe.mjs");
  assert.match(src, /chromium/);
  assert.match(src, /webkit/);
});

test("design-craft: Law 11 names the media-load-probe acceptance criterion", () => {
  const doc = flat(read("skills/design-craft/references/TECHNICAL-DESIGN.md"));
  assert.match(doc, /Law 11 — Media never loads blank or half-painted/);
  assert.match(doc, /media-load-probe\.mjs/);
});

test("quality: Standing tech checks and the checklist both gate on the media probe", () => {
  const doc = flat(read("skills/quality/SKILL.md"));
  assert.match(doc, /Media diffs — never blank or half-painted/);
  assert.match(doc, /\[ \] Media diff: media-load-probe\.mjs count = 0/);
});

test("agents/reviewer.md: re-runs the media probe rather than reading a claimed 0", () => {
  const doc = flat(read("agents/reviewer.md"));
  assert.match(doc, /A media-touching diff's done-when is re-run, not read/);
});

test("dispatch-brief: done-when names the media-load-probe count for media-touching lanes", () => {
  const doc = flat(read("skills/dispatch-brief/SKILL.md"));
  assert.match(doc, /media-load-probe\.mjs.*count.*at 0/);
});

test("routing: work-type and domain-library tables both require media-loading when media is on screen", () => {
  const skill = flat(read("skills/routing/SKILL.md"));
  assert.match(skill, /Images\/video on screen \| `media-loading`/);
  const libraries = flat(read("skills/routing/references/LIBRARIES.md"));
  assert.match(libraries, /media-loading/);
});

// --- (5) Needed-from-you rows are only what's actually ready ---------------

test("output-styles/discipline.md: a Needed-from-you row is only what's ready right now", () => {
  const doc = flat(read("output-styles/discipline.md"));
  assert.match(doc, /A `## Needed from you` row is only what he can act on right now\./);
  assert.match(doc, /never a queue row/);
});

test("vault-write: a queue row is written only once it is actually ready", () => {
  const doc = flat(read("skills/vault-write/SKILL.md"));
  assert.match(doc, /A row is only written once it is actually\s*ready/);
});
}

// ======== queue-1951-law ========
{
// The 1.95.1 queue: `2026-09-25-fix-asks-problem-solution.md` — operator: "something
// else i would find helpful when we're fixing things, is a really short simple
// explanation as to what was causing the problem and what fixed it (problem and
// solution). This could be included with the ready for review text in needed from me."
//
// Rule: when a **fix** is ready for the operator's look, its message carries a
// one-line **Problem:** (what caused it, plain words) and a one-line **Solution:**
// (what fixed it), before the link; a new feature needs no Problem line.
//

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(repo, p), "utf8");
const flat = (text) => text.replace(/\s+/g, " ");

// --- output-styles/discipline.md: the rule itself ---------------------------

test("discipline.md: a fix ready for review carries Problem/Solution before the link", () => {
  const doc = flat(read("output-styles/discipline.md"));
  assert.match(doc, /A \*\*fix\*\* ready for his look carries one-line \*\*Problem:\*\*/);
  assert.match(doc, /\*\*Solution:\*\* \(what fixed it\) before the link/);
  assert.match(doc, /a new feature needs no Problem line/);
});

test("discipline.md: the Problem/Solution rule quotes the operator's own words", () => {
  const doc = flat(read("output-styles/discipline.md"));
  assert.match(doc, /a really short simple explanation as to what was causing the problem and what fixed it/);
});

test("discipline.md still fits its 132-line phone-read budget", () => {
  const lines = read("output-styles/discipline.md").trimEnd().split("\n").length;
  assert.ok(lines <= 132, `style is ${lines} lines; budget is 132`);
});

// --- present-for-review: the operator message example -----------------------

test("present-for-review: states the fix-carries-Problem/Solution, feature-doesn't rule", () => {
  const doc = flat(read("skills/present-for-review/SKILL.md"));
  assert.match(doc, /A fix carries Problem\/Solution; a feature doesn't/);
  assert.match(doc, /leads with one-line \*\*Problem:\*\*.*and \*\*Solution:\*\*.*before the link/);
});

test("present-for-review: a fix example shows both Problem: and Solution: lines", () => {
  const doc = flat(read("skills/present-for-review/SKILL.md"));
  assert.match(doc, /Example \(fix, native\): \*Problem: .*Solution: .*Ready to look/);
  assert.match(doc, /Example \(fix, web\): \*Problem: .*Solution: .*Ready to look.*jarrad\.design/);
});

test("present-for-review: a feature example carries no Problem: line", () => {
  const doc = read("skills/present-for-review/SKILL.md");
  const line = doc.split("\n").find((l) => l.startsWith("Example (feature"));
  assert.ok(line, "a feature example must exist");
  assert.doesNotMatch(line, /Problem:/);
});

// --- CHANGED.txt + version bump ---------------------------------------------

test("the 1.95.1 CHANGED entry names the ruling and the Problem/Solution rule", () => {
  const changed = read("CHANGED.txt");
  const entryMatch = /^1\.95\.1 —[\s\S]*?(?=\n\n\d+\.\d+\.\d+ —|$)/m.exec(changed);
  assert.ok(entryMatch, "1.95.1's own CHANGED entry must exist");
  const entry = entryMatch[0];
  assert.match(entry, /fix-asks-problem-solution|Problem\/Solution|Problem:.*Solution:/);
});

// Fixed 1.96.0 (surfaced by that release's own version bump): this test
// originally pinned the exact string "1.95.1" — the pinning-gate shape every
// other queue law test avoids via "at or past" (named explicitly in the
// 1.93.2 CHANGED entry), so it broke on the very next release. Rewritten to
// the same "at or past" shape as the other version-match checks; the
// same-version agreement between the two files is still checked exactly.
test("plugin.json and marketplace.json agree, at or past 1.95.1", () => {
  const plugin = JSON.parse(read(".claude-plugin/plugin.json"));
  const marketplace = JSON.parse(read(".claude-plugin/marketplace.json"));
  const atOrPast1951 = (v) => {
    const [maj, min, patch] = v.split(".").map(Number);
    return maj > 1 || (maj === 1 && min > 95) || (maj === 1 && min === 95 && patch >= 1);
  };
  assert.ok(atOrPast1951(plugin.version), `plugin.json is at ${plugin.version}, want at or past 1.95.1`);
  assert.equal(plugin.version, marketplace.plugins[0].version, "plugin.json and marketplace.json must agree");
});
}

// ======== queue-1960-law ========
{
// The 1.96.0 queue: `2026-09-26-media-loading-method` — operator, once the
// holding-page media fixes landed and were approved ("gaps are gone and fade
// looks good"): "do we need to add the skill update to the list as well" →
// yes, now. The 1.95.0 `media-loading` skill is rewritten with the method
// that actually worked (holding-page rounds 5-18, grid-media-scroll, the
// media audit) — outcomes/patterns, not the earlier method-in-principle.
//
// (1) `skills/media-loading/SKILL.md` grows to 12 method items covering the
// production fixes: uncancellable entrance fade, video-poster-until-playing,
// fetchPriority-has-no-effect-on-video, warm-and-hold the unique pool,
// windowed-mount + flushSync, sizes-matches-the-real-slot, phone checks
// target mobile's own view. New `references/PATTERNS.md` (source citations)
// and `references/PROBE.md` (flag reference).
// (2) `hooks/scripts/media-load-probe.mjs` + `lib/media-load-lib.mjs`: the
// primary paint signal is real composited pixels, not `.complete`/DOM
// presence; a new column-gap scan catches a visible region with no covering
// DOM element at all; `--channel`/`--headed` (a real installed browser),
// `--duration`/`--settle` (a long realistic fling/drag session + settle
// dwell), `--reps` (every rep reported) are new flags; a headless/default
// run prints a floor-not-proof note.
//
// Fix round 1 (live-fixture review, same 1.96.0): the first cut of the paint
// signal drew each element into an offscreen canvas (`drawImage` +
// `getImageData`) and read that back — the element's own SOURCE bitmap, not
// what's composited, so it still read PASS behind an `overflow:hidden` clip,
// an opaque covering sibling, `visibility:hidden`, or `opacity:0`. Replaced
// with a per-frame `page.screenshot()`, decoded by a new dependency-free PNG
// decoder (`lib/png-lib.mjs`, Node's own `zlib` only), cropped per slot to
// its rect intersected with the viewport and every clipping ancestor, and
// classified against the page background plus any named
// `--placeholder-colors`. `drawImage` is fully removed from the file.
//

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(repo, p), "utf8");
const flat = (text) => text.replace(/\s+/g, " ");

// --- (1) SKILL.md: the new production-found method items --------------------

test("SKILL.md: an entrance fade can never be cancelled mid-wait (round 17 fade-race)", () => {
  const doc = flat(read("skills/media-loading/SKILL.md"));
  assert.match(doc, /can never be cancelled mid-wait/);
});

test("SKILL.md: a video's poster stays painted until it is actually playing, not just until src is set", () => {
  const doc = flat(read("skills/media-loading/SKILL.md"));
  assert.match(doc, /stays painted until the video is actually playing/);
  assert.match(doc, /WebKit drops the native `poster` attribute/);
});

test("SKILL.md: fetchPriority has no effect on <video>", () => {
  const doc = flat(read("skills/media-loading/SKILL.md"));
  assert.match(doc, /`fetchPriority` has \*\*no effect on `<video>`\*\*/);
});

test("SKILL.md: a repeating layout warms and holds the unique pool, nearest-first, paused while panning", () => {
  const doc = flat(read("skills/media-loading/SKILL.md"));
  assert.match(doc, /warms and holds every unique tile once the first screen settles/);
  assert.match(doc, /paused outright while the reader is actively panning/);
});

test("SKILL.md: windowed mounting commits every mounted-set change before the next paint", () => {
  const doc = flat(read("skills/media-loading/SKILL.md"));
  assert.match(doc, /every mounted-set change commits before the next paint/);
  assert.match(doc, /latest.*state eventually renders, not every intermediate one/);
});

test("SKILL.md: sizes replays the slot's real rendered-width formula, not an estimate", () => {
  const doc = flat(read("skills/media-loading/SKILL.md"));
  assert.match(doc, /`sizes` replays the slot's real rendered-width formula/);
});

test("SKILL.md: phone checks target the view mobile actually shows", () => {
  const doc = flat(read("skills/media-loading/SKILL.md"));
  assert.match(doc, /Phone checks target the view mobile actually shows/);
});

test("SKILL.md: done-when names both the paint signal (composited pixels, not .complete) and the gap scan", () => {
  const doc = flat(read("skills/media-loading/SKILL.md"));
  assert.match(doc, /actual composited pixels/);
  assert.match(doc, /never `\.complete`\/DOM presence/);
  assert.match(doc, /no covering DOM element at all/);
});

test("SKILL.md: a headless/default run is named a floor, not proof", () => {
  const doc = flat(read("skills/media-loading/SKILL.md"));
  assert.match(doc, /floor, not proof/);
});

test("SKILL.md points at both new references files, and both exist", () => {
  const doc = read("skills/media-loading/SKILL.md");
  assert.match(doc, /references\/PATTERNS\.md/);
  assert.match(doc, /references\/PROBE\.md/);
  assert.ok(existsSync(join(repo, "skills", "media-loading", "references", "PATTERNS.md")));
  assert.ok(existsSync(join(repo, "skills", "media-loading", "references", "PROBE.md")));
});

// --- (2) probe + lib: pixel-paint primary signal, gap scan, new CLI flags --

test("media-load-lib.mjs: the screenshot-crop paint classification functions exist (fix round 1)", () => {
  const src = read("hooks/scripts/lib/media-load-lib.mjs");
  assert.match(src, /export function isRegionPainted/);
  assert.match(src, /export function regionPaintedFraction/);
  assert.match(src, /export function clippedVisibleRect/);
  assert.match(src, /export function isSlotPainted/);
  assert.match(src, /export function isVisibilityHidden/);
  assert.match(src, /export function parseCssColor/);
});

test("media-load-lib.mjs never carries the removed canvas-sampling paint functions", () => {
  const src = read("hooks/scripts/lib/media-load-lib.mjs");
  assert.doesNotMatch(src, /export function isPixelPainted/);
  assert.doesNotMatch(src, /export function isTransparentPaint/);
  assert.doesNotMatch(src, /export function isStuckOpacityZero/);
  assert.doesNotMatch(src, /export function isPaintedFromDomState/);
});

test("media-load-lib.mjs: the column-gap scan functions exist (fix round 2: per-column, not a cross-column horizontal-line merge — see PATTERNS.md)", () => {
  const src = read("hooks/scripts/lib/media-load-lib.mjs");
  assert.match(src, /export function groupRectsIntoColumns/);
  assert.match(src, /export function columnInternalGaps/);
  assert.match(src, /export function scanFrameForColumnGaps/);
  assert.match(src, /export function totalColumnGapsAcrossFrames/);
});

test("media-load-probe.mjs: paint signal is a decoded, cropped screenshot — never drawImage (fix round 1)", () => {
  const src = read("hooks/scripts/media-load-probe.mjs");
  assert.doesNotMatch(src, /drawImage/, "drawImage samples the SOURCE bitmap, not what's composited");
  assert.match(src, /decodePng/);
  assert.match(src, /cropRegionPixels/);
  assert.match(src, /clippedVisibleRect/);
});

test("media-load-probe.mjs: supports --channel (real installed browser), --headed, --duration, --settle, --reps", () => {
  const src = read("hooks/scripts/media-load-probe.mjs");
  assert.match(src, /channel/);
  assert.match(src, /headed/);
  assert.match(src, /driveFlingSession/);
  assert.match(src, /durationMs/);
  assert.match(src, /settleMs/);
  assert.match(src, /reps/);
});

test("media-load-probe.mjs: a headless/synthetic run prints a floor-not-proof note", () => {
  const src = read("hooks/scripts/media-load-probe.mjs");
  assert.match(src, /FLOOR, not proof/);
});

test("media-load-probe.mjs + libs all still carry their law-test pair", () => {
  for (const rel of [
    "hooks/scripts/media-load-probe.mjs",
    "hooks/scripts/media-load-probe.test.mjs",
    "hooks/scripts/lib/media-load-lib.mjs",
    "hooks/scripts/lib/media-load-lib.test.mjs",
    "hooks/scripts/lib/png-lib.mjs",
    "hooks/scripts/lib/png-lib.test.mjs",
  ]) {
    assert.ok(existsSync(join(repo, rel)), `${rel} must exist`);
  }
});

// --- Fix round 3 (review round 2): arrival window, motion-bound sliver, -----
// structure-edge bound, default fling session --------------------------------

test("media-load-lib.mjs: the round-3 cross-frame classifier replaces the round-2 single-frame aggregate — one implementation, not two", () => {
  const src = read("hooks/scripts/lib/media-load-lib.mjs");
  assert.match(src, /export function classifyEmptyAcrossFrames/);
  assert.match(src, /export function totalEmptyMediaAcrossFrames/);
  assert.match(src, /export const DEFAULT_ARRIVAL_WINDOW_MS/);
  assert.match(src, /export function isTrivialSliver/);
  assert.match(src, /export function mediaIdentity/);
  assert.doesNotMatch(src, /export function emptyVisibleMedia\b/, "superseded by classifyEmptyAcrossFrames — never two implementations of the same aggregate");
  assert.doesNotMatch(src, /export function countEmptyVisibleMedia\b/);
  assert.doesNotMatch(src, /export function totalEmptyVisibleMediaAcrossFrames\b/);
});

test("media-load-lib.mjs: the stddev rescue is now bounded by a real edge, not spread alone", () => {
  const src = read("hooks/scripts/lib/media-load-lib.mjs");
  assert.match(src, /export function regionMaxLumaJump/);
  assert.match(src, /export const MIN_STRUCTURE_EDGE_JUMP/);
  assert.match(src, /minStructureEdgeJump/);
});

test("media-load-probe.mjs: scroll/drag default to the realistic fling session; --paced is opt-in only", () => {
  const src = read("hooks/scripts/media-load-probe.mjs");
  assert.match(src, /export function resolveDriveMode/);
  assert.match(src, /export const DEFAULT_FLING_DURATION_MS/);
  assert.match(src, /--paced/);
  assert.match(src, /not proof of fast-motion behaviour/);
});

test("media-load-probe.mjs: supports --arrival-window-ms and --min-structure-edge", () => {
  const src = read("hooks/scripts/media-load-probe.mjs");
  assert.match(src, /arrival-window-ms/);
  assert.match(src, /min-structure-edge/);
});

test("the fixture proves both the gradient-skeleton and shimmer-sweep cases stay empty", () => {
  const html = read("hooks/scripts/lib/fixtures/media-load-probe-fixture.html");
  assert.match(html, /gradient skeleton/);
  assert.match(html, /shimmer sweep/);
});

// --- CHANGED.txt + version bump ---------------------------------------------

test("the 1.96.0 CHANGED entry names the ruling and the method rewrite", () => {
  const changed = read("CHANGED.txt");
  const entryMatch = /^1\.96\.0 —[\s\S]*?(?=\n\n\d+\.\d+\.\d+ —|$)/m.exec(changed);
  assert.ok(entryMatch, "1.96.0's own CHANGED entry must exist");
  const entry = entryMatch[0];
  assert.match(entry, /media-loading-method/);
  assert.match(entry, /composited pixels/i);
  assert.match(entry, /fix round 1/i, "the same 1.96.0 entry must carry the fix round's correction, not a separate version");
});

test("plugin.json and marketplace.json agree at or past 1.96.0", () => {
  const plugin = JSON.parse(read(".claude-plugin/plugin.json"));
  const marketplace = JSON.parse(read(".claude-plugin/marketplace.json"));
  const atOrPast = (v) => {
    const [maj, min, patch] = v.split(".").map(Number);
    return maj > 1 || (maj === 1 && min > 96) || (maj === 1 && min === 96 && patch >= 0);
  };
  assert.ok(atOrPast(plugin.version), `plugin.json is at ${plugin.version}, want at or past 1.96.0`);
  assert.equal(plugin.version, marketplace.plugins[0].version, "plugin.json and marketplace.json must agree");
});
}

// ======== queue-1970-law ========
{
// The 1.106.0 queue: `2026-10-03-codify` — operator (queue 340): "do all this now".
// Discipline items 6-10 of fleet/lessons/codify-candidates-2026-10-03.md:
// (6) motion is proven on painted frames, never computed style; (7) proof names
// the deployed preview or states the gap; (8) the painted script asserts on-screen
// order; (9) operator-queue row numbers are unique per table (named grandfather
// allowlist for the historic double-numbered struck rows); (10) phone-layout check,
// banked-ruling grep before an operator ask, one confirming question for a
// likely-typo word.
//

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(repo, p), "utf8");

const table = (section, ...nums) =>
  `## ${section}\n\n| # | Needed |\n| --- | --- |\n` + nums.map((n) => `| ${n} | row ${n} |`).join("\n") + "\n\n";

// Item 9 — queue lint
test("duplicateRowNumbers: a repeated number in one table is named", () => {
  const dups = duplicateRowNumbers(table("Portfolio", 5, 6, 6, 7));
  assert.deepEqual(dups, [{ section: "Portfolio", number: "6" }]);
});

test("duplicateRowNumbers: the same number in two different tables is not a duplicate", () => {
  assert.deepEqual(duplicateRowNumbers(table("A", 1, 2) + table("B", 1, 2)), []);
});

test("duplicateRowNumbers: a grandfathered historic duplicate passes, any other fails", () => {
  const [section, nums] = Object.entries(GRANDFATHERED)[0];
  const n = nums[0];
  assert.deepEqual(duplicateRowNumbers(table(section, n, n)), [], "allowlisted duplicate must pass");
  const fresh = Math.max(...Object.values(GRANDFATHERED).flat().map(Number)) + 1000;
  assert.deepEqual(duplicateRowNumbers(table(section, fresh, fresh)), [{ section, number: String(fresh) }]);
});

test("queue-write-check --lint: exit 0 clean, exit 1 naming the duplicate", () => {
  const script = join(repo, "hooks", "scripts", "queue-write-check.mjs");
  const dir = mkdtempSync(join(tmpdir(), "queue-lint-"));
  const ok = join(dir, "ok.md"), bad = join(dir, "bad.md");
  writeFileSync(ok, table("P", 1, 2));
  writeFileSync(bad, table("P", 1, 1));
  assert.equal(spawnSync("node", [script, "--lint", ok]).status, 0);
  const r = spawnSync("node", [script, "--lint", bad], { encoding: "utf8" });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /duplicate row number 1 in "P"/);
});

test("lane-end runs the queue lint after the row write; vault-write names it", () => {
  assert.match(read("hooks/scripts/lane-end.mjs"), /--lint/);
  assert.match(read("skills/vault-write/SKILL.md"), /queue-write-check\.mjs --lint/);
});

// Items 6-8 — motion proof
test("motion: computed style is never proof; painted frames across the whole transition", () => {
  const m = read("skills/motion/SKILL.md");
  assert.match(m, /Computed-not-painted/);
  assert.match(m, /painted frames/);
  assert.match(read("skills/motion/references/REVIEW.md"), /Computed-not-painted/);
  assert.match(read("skills/webapp-testing/SKILL.md"), /painted frames/);
});

test("motion done-when: deployed preview named or gap stated; on-screen order asserted", () => {
  const b = read("skills/motion/references/BUILD.md");
  assert.match(b, /deployed preview/);
  assert.match(b, /on-screen order/);
  assert.match(read("skills/motion/references/REVIEW.md"), /on-screen order/);
});

// Item 10
test("phone layout: check for the surface's own phone layout before a phone question", () => {
  assert.match(read("doer-rules.md"), /own phone layout/);
  assert.match(read("skills/vault-recall/SKILL.md"), /own phone layout/);
});

test("banked ruling grep before any operator ask for a Figma change", () => {
  assert.match(read("skills/vault-recall/SKILL.md"), /Before any queue row asks the operator[^]*grep `fleet\/rulings`/);
  assert.match(read("skills/dispatch-brief/references/BRIEF-CRAFT.md"), /greps `fleet\/rulings`/);
});

test("grilling: a likely-typo word gets one confirming question, not a written-down reading", () => {
  const g = read("skills/grilling/SKILL.md");
  assert.match(g, /likely typo/);
  assert.match(g, /Writing the reading down is not confirming it/);
});
}
