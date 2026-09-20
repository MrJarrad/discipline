// The 1.85.0 queue: one operator ruling encoded whole —
// accuracy-before-the-link-2026-09-20 ("What we want is accuracy in build" +
// two addenda). Four changes: (a) the coverage ledger replaces the deviation
// table and generalises to every contract, (b) one contract unit per lane at
// any model, (c) layout examples become a page x state x device table before
// build, (d) pixel proof at the operator's framing, never computed style.
// One test per surface row, asserting the rule's own sentence at its own home
// so a later edit that softens or drops one fails here.
// Run: node --test hooks/scripts/queue-1850-law.test.mjs
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

// --- (a) the coverage ledger, home + specialisations -------------------------

test("qa-acceptance is the ledger's one home: row shape, missing row red, variance never collapsed", () => {
  const qa = flat(read("skills/qa-acceptance/SKILL.md"));
  assert.match(qa, /## The coverage ledger — one row per contract item/);
  assert.match(qa, /\| item \| source ref \| built at `file:line` \| measured value \| status \|/);
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
});

test("model-routing sends a wide brief to a slice, never to a bigger model", () => {
  const routing = flat(read("skills/model-routing/SKILL.md"));
  assert.match(routing, /\*\*one contract unit per lane, always\*\*/i);
  assert.match(routing, /\*\*malformed at any model\*\*, never a reason to escalate to `opus`/);
  assert.match(routing, /\*\*A wide brief is never an escalation\.\*\*/);
  assert.doesNotMatch(routing, /a whole-surface brief goes to `opus`/);
});

// --- (d) pixel proof at the operator's framing --------------------------------

test("present-for-review gates the parent on pixel proof and a complete ledger, never the link's speed", () => {
  const present = flat(read("skills/present-for-review/SKILL.md"));
  assert.match(present, /## Before the link goes out/);
  assert.match(
    present,
    /headed screenshot at the operator's viewport and at each breakpoint family, with a pixel assertion on the region built/,
  );
  assert.match(present, /A `getComputedStyle` read is not proof that anything painted/);
  assert.match(present, /they gate the parent, not the link's speed/);
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
