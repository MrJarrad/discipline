// The 1.86.0 queue: one operator ruling encoded whole — brief-is-the-lever-2026-09-20
// ("nothing that complex about frontend work that the right and accurate brief and
// information wouldn't be easy enough for cheaper models" + the refinement asking for
// "a review of the brief before it's finalised ... to interrogate a brief before it's
// picked up by an agent"). Brief interrogation: a fixed question set, run by a cheap
// read-only agent (or the parent inline for trivial/small-fix) before any non-trivial
// dispatch, findings fix the brief, and model escalation after a failed lane requires
// the brief already passed interrogation. One test per surface row, asserting the
// rule's own sentence at its own home so a later edit that softens or drops one fails
// here.
// Run: node --test hooks/scripts/queue-1860-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
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

test("dispatch-brief's checklist is fourteen items", () => {
  const brief = read("skills/dispatch-brief/SKILL.md");
  const list = brief.slice(brief.indexOf("## Before you dispatch"));
  const items = list.match(/^\[ \]/gm) || [];
  assert.equal(items.length, 14, `the list is ${items.length} items; the ratified count is 14`);
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
