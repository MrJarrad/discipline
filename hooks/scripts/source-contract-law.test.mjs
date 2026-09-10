// Tests for the 1.73.0 law text carried by the shipped skills and agents:
// the source contract (A1), mechanism named + crop check (A2), the reviewer's
// Structure check (A3), the State section / fresh-means-fresh / fences / ports
// (A4), and the lesson ledger (A5).
//
// Same principle as dispatch-law.test.mjs and review-loop.test.mjs: the law's
// WORDS are its interface — an orchestrator only obeys what the file says — so
// every operator-ratified sentence is asserted verbatim here rather than
// trusted to review.
// Run: node --test scripts/source-contract-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(repo, p), "utf8");

const dispatchBrief = read("skills/dispatch-brief/SKILL.md");
const engineer = read("agents/engineer.md");
const reviewer = read("agents/reviewer.md");
const issueTriage = read("skills/issue-triage/SKILL.md");
const grilling = read("skills/grilling/SKILL.md");
const captureFigma = read("skills/capture-figma/SKILL.md");
const auditBuild = read("skills/audit-build/SKILL.md");
const modelRouting = read("skills/model-routing/SKILL.md");
const routing = read("skills/routing/SKILL.md");
const webappTesting = read("skills/webapp-testing/SKILL.md");
const wrap = read("skills/wrap/SKILL.md");
const vaultWrite = read("skills/vault-write/SKILL.md");
const skillAuthoring = read("skills/skill-authoring/SKILL.md");
const disciplineStyle = read("output-styles/discipline.md");

// Every agent-consumed doc the plugin ships — used for the stale-law sweep.
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
  "README.md",
];

// A doc's sentences survive line wrapping, so every verbatim assertion is made
// against the whole file with single-spaced newlines — the same
// newline-tolerance review-loop.test.mjs uses.
const flat = (text) => text.replace(/\s+/g, " ");
const carries = (text, sentence, why) =>
  assert.ok(flat(text).includes(flat(sentence)), why || `missing verbatim: ${sentence.slice(0, 70)}…`);

// --- A1: the source contract ---------------------------------------------

test("dispatch-brief carries the source-contract rule verbatim", () => {
  carries(dispatchBrief, "When a Design Handoff export exists, the export is the contract — whole.");
  carries(dispatchBrief, "The brief names the export path, the node ids it covers, and the companion export's schema + generated stamp");
  carries(dispatchBrief, "build every node, token, copy string and annotation in the file; list every deviation as a defect.");
  carries(dispatchBrief, "The brief never re-describes the file.");
  carries(dispatchBrief, "Lock rows carry only what the file cannot: blend, behaviour, links, copy overrides.");
  carries(dispatchBrief, "A brief that paraphrases the export instead of pointing at it is malformed — do not `Agent`.");
});

test("dispatch-brief ships the Source contract brief-template field", () => {
  carries(dispatchBrief, "- Export: <abs path> · nodes: <#id, #id> · companion: <schema N, generated <stamp>>");
  carries(dispatchBrief, "- AC-S: every node, token, copy string and annotation in the export is built; deviations listed as defects");
});

test("the source contract sits above the lock table, which becomes rulings on top", () => {
  assert.ok(
    dispatchBrief.indexOf("## Source contract (Design Handoff export)") <
      dispatchBrief.indexOf("## Locked decisions (session"),
    "the Source contract section precedes Locked decisions",
  );
  carries(dispatchBrief, "Under a Source contract the export is the spec and the lock table is the operator's rulings on top; both are copied whole.");
});

test("AC-S is one AC, never expanded per node", () => {
  carries(dispatchBrief, "plus **AC-S** when a Source contract exists — never expanded into per-node ACs");
  const checklist = dispatchBrief.slice(dispatchBrief.indexOf("## Checklist before dispatch"));
  assert.match(checklist, /Source contract/);
  assert.match(checklist, /AC-S/);
});

test("the engineer returns a deviation table under a Source contract", () => {
  carries(dispatchBrief, "the engineer also returns a **deviation table** (`export path · built value · reason`)");
  carries(engineer, "`export path · built value · reason`, one row per deviation from the export, plus one row per lock row");
});

test("capture-figma's rung 0 names the Design Handoff export", () => {
  carries(captureFigma, "0. **A Design Handoff export (Layer Brief), when one exists for the target");
});

test("the output style glosses the export-is-the-contract rule", () => {
  carries(disciplineStyle, "when a Design Handoff export exists, the export is the contract, whole — the brief points at it, the engineer returns deviations, the reviewer checks node by node.");
});

// --- A2: mechanism named + crop check ------------------------------------

test("dispatch-brief carries the mechanism-named rule verbatim", () => {
  carries(dispatchBrief, "A brief states how each locked value is produced, not only what it measures.");
  carries(dispatchBrief, "a grid — `display: grid` container and children placed by `grid-column`, never col-span arithmetic");
  carries(dispatchBrief, "frame dimensions — the sizing token, never a literal");
  carries(dispatchBrief, "a repeated part — the component instance, never inline markup");
  carries(dispatchBrief, "blend — which node carries `mix-blend-mode` and whether it is absolute or fixed");
  carries(dispatchBrief, '"On the grid" without the container is a steer to arithmetic (portfolio nav, 2026-09-10).');
});

test("the mechanism rule ships with a DO/DON'T pair and a checklist line", () => {
  const mech = dispatchBrief.slice(dispatchBrief.indexOf("**Mechanism named.**"));
  assert.match(mech, /\*\*DO:\*\*/);
  assert.match(mech, /\*\*DON'T:\*\*/);
  const checklist = dispatchBrief.slice(dispatchBrief.indexOf("## Checklist before dispatch"));
  assert.match(checklist, /Mechanism named/);
});

test("issue-triage reproduces the operator's framing before a lane opens", () => {
  carries(issueTriage, "Before a feedback row opens a lane, reproduce the operator's framing — crop, viewport, lighting mode — and name the part visible in it.");
  carries(issueTriage, "When an ask can move two mechanisms with different costs, the row names both and the operator picks.");
  assert.match(issueTriage, /One ask may be two levers/);
});

test("grilling's assumption gate covers direction and mechanism", () => {
  const gate = grilling.slice(grilling.indexOf("## Assumption gate"));
  carries(gate, "the direction of a change, the mechanism that produces a value");
});

// --- A3: the reviewer's Structure check ----------------------------------

test("reviewer carries the Structure check rule verbatim", () => {
  carries(reviewer, "**Structure check — how the value is produced.** Pixel-identical is necessary, not sufficient.");
  carries(reviewer, "For each locked value and each export node: grid container vs arithmetic, token vs literal, component instance vs inline, blend node placement, and names against the export.");
  carries(reviewer, 'A right number by the wrong mechanism is a red finding — **"mechanism mismatch"**.');
  carries(reviewer, "Under a Source contract, walk the export node by node against the built page; the engineer's deviation table is input, never the walk.");
});

test("the Structure check lives inside the Spec axis", () => {
  const spec = reviewer.slice(reviewer.indexOf("### Spec axis"));
  assert.ok(spec.includes("### Structure check"), "Structure check is a Spec-axis section");
});

test("reviewer reproduces the operator's framing before grading a visual complaint", () => {
  carries(reviewer, "**Before grading any visual complaint, reproduce the operator's framing** and add a row that is red at that framing before the fix; rows that pass elsewhere graded the wrong surface.");
});

test("look stays the operator's while file parity is the reviewer's", () => {
  assert.match(reviewer, /## Look is the operator's; parity is yours/);
  assert.match(reviewer, /never evaluates? look/i, "the reviewer still never evaluates look");
  carries(reviewer, "Copy strings, node presence, token names and annotations are read off the source and compared character by character");
  carries(reviewer, "a mismatch is **red-able**");
  carries(dispatchBrief, "**File parity (copy, nodes, tokens, mechanism) is the reviewer's Structure check, not ux-designer's**");
});

test("the reviewer proves pre-existing against main and never shares the build's constant", () => {
  carries(reviewer, '**"Pre-existing" is proven against `main`**, never against a branch ancestor');
  carries(reviewer, "**A probe never shares the build's constant.**");
});

test("audit-build is on the reviewer's stack and its mechanism section is the Structure check", () => {
  assert.match(reviewer, /Skills to invoke for this work:[^\n]*`audit-build` when UI is touched/);
  assert.match(dispatchBrief, /\| Review \|[^\n]*`audit-build`/);
  carries(auditBuild, '**The reviewer runs this section and "Names are audited too" on every UI review**');
});

test("copy is no longer the engineer's taste carve-out", () => {
  assert.doesNotMatch(engineer, /visual taste \(copy/, "copy is a file check, not taste");
  carries(engineer, "copy is a file check against the source, not taste");
});

// --- A4: State section, sizing, fresh means fresh, fences, ports ---------

test("dispatch-brief carries the State-section rule verbatim", () => {
  carries(dispatchBrief, "**Every continuation or slice brief carries `## State (untrusted draft; verify)`.**");
  carries(dispatchBrief, "It lists what prior slices claim landed — sha, mechanism, values — marked as claims.");
  carries(dispatchBrief, "Prior-slice implementation choices are never passed forward as fact: the doer re-verifies each against the Source contract and lock before building on it; a wrong mechanism inherited from slice 1 is slice 2's red finding, not its baseline.");
  const checklist = dispatchBrief.slice(dispatchBrief.indexOf("## Checklist before dispatch"));
  assert.match(checklist, /State \(untrusted draft; verify\)/);
});

test("one component per sonnet dispatch, in both the brief skill and model-routing", () => {
  carries(dispatchBrief, "**One component per sonnet dispatch.**");
  carries(modelRouting, "**one component per brief**; a whole-surface brief goes to `opus`, justified");
  const checklist = dispatchBrief.slice(dispatchBrief.indexOf("## Checklist before dispatch"));
  assert.match(checklist, /One component per sonnet dispatch/);
});

test("fresh means fresh: a clean rebuild names the export and the wiring loci only", () => {
  carries(issueTriage, "built fresh from the Design Handoff export + read sequence");
  carries(issueTriage, "**Fresh means fresh:** the brief names the export and the wiring loci only; it never names the existing component as the file to start from, and a rebuild that edits that file in place is not a rebuild.");
});

test("the scope fence carries the fixture/golden-path repoint exception", () => {
  carries(dispatchBrief, '**"Never edit tests" carries one exception: repointing a fixture or golden path** the change deliberately moves.');
  carries(dispatchBrief, "Weakening, deleting, or skipping an assertion is never the exception.");
});

test("doer ports are :3220 and up, with both reserved ports named", () => {
  carries(dispatchBrief, "Doers run verification servers on `:3220` and up.");
  carries(dispatchBrief, "**`:3210` the operator's live dev server** and **`:3211` the hoverboard viewer**");
  const checklist = dispatchBrief.slice(dispatchBrief.indexOf("## Checklist before dispatch"));
  assert.match(checklist, /:3220\+/);
  assert.match(checklist, /:3211 hoverboard viewer/);
  assert.match(routing, /own build on `:3220`\+ is \*\*not\*\* machine-bound/);
  assert.match(webappTesting, /:3220\+/);
});

test("no shipped doc still sends a doer to :3211", () => {
  // :3211 may only appear as a RESERVED port now — never as the doer range.
  for (const rel of shippedDocs()) {
    const text = read(rel);
    assert.doesNotMatch(text, /:3211\s*\+|:3211 and up/, `${rel} still points doers at :3211`);
  }
});

// --- A5: the lesson ledger ----------------------------------------------

test("wrap carries lessons-ship-or-say-why-not and the release checklist", () => {
  carries(wrap, "**Lessons ship or say why not.**");
  carries(wrap, "Every file in `fleet/lessons/` and `fleet/rulings/` carries `encoded: <semver> | pre-1.73.0 | queued | skipped(<reason>)`.");
  carries(wrap, "a lesson with no `encoded:` field is a wrap failure");
  carries(wrap, "the commit gate refuses a `plugin.json` bump while any lesson or ruling is still `queued`, and `CHANGED.txt` names the lessons this version encoded.");
});

test("vault-write's frontmatter template carries the encoded field and the index exemption", () => {
  carries(vaultWrite, "**`fleet/lessons/` and `fleet/rulings/` carry one more mandatory key: `encoded:`**");
  carries(vaultWrite, "Index files (`index.md`, `README.md`) are exempt.");
  assert.match(vaultWrite, /encoded: 1\.73\.0/);
});

test("skill-authoring's Lesson intake names all five items in one commit", () => {
  const intake = skillAuthoring.slice(
    skillAuthoring.indexOf("## Lesson intake"),
    skillAuthoring.indexOf("## Checklist before shipping a skill"),
  );
  assert.ok(intake.length > 0, "skill-authoring must carry a Lesson intake section");
  carries(intake, "the rule ≤ 80 words placed at the acting moment");
  carries(intake, "a DO/DON'T pair");
  assert.match(intake, /\*-law\.test\.mjs/);
  assert.match(intake, /CHANGED\.txt/);
  assert.match(intake, /`encoded: <ver>`/);
  assert.match(intake, /\*\*DO:\*\*/);
  assert.match(intake, /\*\*DON'T:\*\*/);
  assert.match(skillAuthoring.slice(skillAuthoring.indexOf("## Checklist before shipping a skill")), /Lesson intake/);
});

// --- Rule length: the plan's ratified texts, verbatim --------------------

// The house bar is a rule short enough to read at the acting moment. Two of
// the 1.73.0 texts are longer than 80 words as the operator ratified them
// (source contract 87, mechanism named 101) — verbatim wins over the word
// count, so length is asserted as "no longer than ratified" rather than as a
// hard 80: a later edit that pads a rule fails here.
test("the ratified rule texts have not grown past their ratified length", () => {
  const paragraph = (text, anchor) =>
    text.split(/\n\s*\n/).find((para) => flat(para).includes(flat(anchor)));
  const bars = [
    ["source contract", dispatchBrief, "When a Design Handoff export exists", 87],
    ["mechanism named", dispatchBrief, "A brief states how each locked value is produced", 108],
    ["structure check", reviewer, "Pixel-identical is necessary, not sufficient", 80],
    ["crop before lane", issueTriage, "Before a feedback row opens a lane", 50],
  ];
  for (const [name, text, anchor, bar] of bars) {
    const para = paragraph(text, anchor);
    assert.ok(para, `${name}: paragraph not found`);
    const count = flat(para).split(" ").filter(Boolean).length;
    assert.ok(count <= bar, `${name} rule is ${count} words — ratified length is ${bar}`);
  }
});
