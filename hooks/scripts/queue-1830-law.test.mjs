// The 1.83.0 queue: one operator ruling banked 2026-09-16 (dated 2026-09-19) —
// gates-assert-mechanism-not-values — encoded whole across every surface the
// ruling names. One test per surface row, asserting the rule's own sentence at
// its own home so a later edit that softens or drops one fails here.
// Run: node --test hooks/scripts/queue-1830-law.test.mjs
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
