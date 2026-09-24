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
