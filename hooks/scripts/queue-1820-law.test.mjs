// The 1.82.0 queue: two operator rulings banked 2026-09-16 — fresh-context-per-task and
// cheapest-artefact-first — encoded whole across every surface each ruling names. One test
// per surface row, asserting the rule's own sentence at its own home so a later edit that
// softens or drops one fails here.
// Run: node --test hooks/scripts/queue-1820-law.test.mjs
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
