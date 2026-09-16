// The 1.81.0 queue: every ruling and lesson banked on 2026-09-13 and 2026-09-16
// has to live as a RULE in the file it named, not as a changelog line. This file
// is the ledger's enforcement arm — one test per queue row, asserting the rule's
// own sentence at its own home. A later edit that softens or deletes one fails
// here rather than being discovered the next time a lane gets it wrong.
//
// Round-cap wording is asserted in review-loop.test.mjs; single-home ownership in
// law-single-source.test.mjs. This file covers the rows those two do not.
// Run: node --test hooks/scripts/queue-1810-law.test.mjs
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
