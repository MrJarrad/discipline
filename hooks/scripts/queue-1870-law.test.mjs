// The 1.87.0 queue: two operator rulings encoded whole.
//
// (1) sonnet-default-ceiling (2026-09-21) — "if there are types of work generally that
// models perform best at and whether the right brief would mean sonnet should be
// absolutely fine for most of the type of work we are currently doing across all
// sessions and projects. should sonnet be the highest default?" -> "Yes". `sonnet` is
// the default ceiling for every dispatched doer; `haiku` for mechanical work; `opus`
// only with a written justification in the brief's `## Interrogated` block naming one
// of two named cases: adversarial review of a change with fleet-wide blast radius, or
// novel architecture with no contract to point at. The old "Design/UX taste -> opus"
// and "Hard architecture -> opus -- justify" wording is replaced everywhere by those
// two named cases.
//
// (2) doer read-back (2026-09-21) — "would it make sense to also introduce brief
// reading and playback with any question from the doer before commencing. I'm just
// conscious it's cheap to get the briefs clear, it's expensive to iterate or redo
// work." Every lane above trivial/small-fix returns `## Read-back` and stops at
// `next: parent (go?)` before any edit; the parent's answer/go continues the same
// agent in the same context — the one non-red resume allowed.
//
// Run: node --test hooks/scripts/queue-1870-law.test.mjs
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
const lacks = (file, sentence) =>
  assert.ok(
    !flat(read(file)).includes(flat(sentence)),
    `${file} still carries the retired wording: ${sentence}`,
  );

// --- sonnet is the default ceiling ------------------------------------------

test("model-routing's map replaces the old opus cells with the two named cases", () => {
  const mr = flat(read("skills/model-routing/SKILL.md"));
  assert.match(mr, /`sonnet` is the default ceiling for every dispatched doer/);
  assert.match(mr, /adversarial review of a change with fleet-wide blast radius/);
  assert.match(mr, /novel architecture with no contract to point at/);
  assert.match(mr, /written justification in the brief's `## Interrogated` block/);
  lacks(
    "skills/model-routing/SKILL.md",
    "| Design/UX **taste / visual judgment** (no locked answer) | `opus` — justify |",
  );
  lacks(
    "skills/model-routing/SKILL.md",
    "| Hard architecture / high blast radius | `opus` — justify |",
  );
});

test("model-routing's escalation rule and checklist gate opus behind the two cases", () => {
  const mr = flat(read("skills/model-routing/SKILL.md"));
  assert.match(
    mr,
    /`opus` is used \*\*from the start\*\* only for the \*\*two named cases\*\*/,
  );
  assert.match(mr, /sonnet is the default ceiling; if above sonnet: written justification/);
});

test("dispatch-brief's Persona + model section states the sonnet ceiling", () => {
  carries(
    "skills/dispatch-brief/SKILL.md",
    "`sonnet` is the default ceiling for every dispatched doer",
  );
  const db = flat(read("skills/dispatch-brief/SKILL.md"));
  assert.match(db, /novel architecture with no contract to point at/);
});

test("INTERROGATE.md carries the eighth question naming the model check", () => {
  const doc = flat(read("skills/dispatch-brief/references/INTERROGATE.md"));
  assert.match(
    doc,
    /Model above sonnet: is the justification written, and does it name one of the two/,
  );
  assert.match(doc, /adversarial review of a change with fleet-wide blast radius/);
  assert.match(doc, /novel architecture with no contract to point at/);
});

test("agents/reviewer.md keeps its own default at sonnet and gates opus by the ruling", () => {
  const raw = read("agents/reviewer.md");
  assert.match(raw, /^model: sonnet$/m);
  const rv = flat(raw);
  assert.match(
    rv,
    /`opus` overrides it only for adversarial review of a change with fleet-wide blast radius/,
  );
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
      /First step, above trivial\/small-fix.*`## Read-back`/,
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
