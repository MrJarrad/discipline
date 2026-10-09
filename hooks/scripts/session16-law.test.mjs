// The 1.122.0 items (link-first-look-rounds, 2026-10-09). Run: node --test hooks/scripts/session16-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(repo, p), "utf8");
const flat = (p) => read(p).replace(/\s+/g, " ");

test("link-first: doer-rules look-lane done-when is the preview opening; proof, audits, sweeps follow the yes", () => {
  const d = flat("doer-rules.md");
  assert.match(d, /A look lane's done-when is the preview built, published and opening/);
  assert.match(d, /loads hydrated with no error — then the link goes to the operator/);
  assert.match(d, /run \*\*after his yes\*\*/);
  assert.match(d, /\*\*Pixel proof follows the yes\.\*\*/);
  assert.doesNotMatch(d, /link goes out only after the doer's own repro/);
});

test("link-first: gates sized to the diff, one heavy job per cloud container", () => {
  const d = flat("doer-rules.md");
  assert.match(d, /Gates are sized to the diff/);
  assert.match(d, /docs, workflow or config-only change skips the suite/);
  assert.match(d, /One heavy job at a time per cloud container/);
  assert.match(flat("skills/quality/SKILL.md"), /Gates are sized to the diff/);
});

test("link-first: dispatch-brief done-when, present-for-review, routing baton, qa-acceptance, output style, engineer agree", () => {
  assert.match(flat("skills/dispatch-brief/SKILL.md"), /the preview built, published, opening hydrated, no error, link sent/);
  assert.match(flat("skills/dispatch-brief/references/ACCURACY.md"), /run \*\*after the operator's yes\*\*/);
  assert.match(flat("skills/routing/SKILL.md"), /link when preview opens \(`link-first-look-rounds`\); proof, merge on yes/);
  assert.match(flat("skills/qa-acceptance/SKILL.md"), /pixel proof run after the operator's yes/);
  assert.match(flat("output-styles/discipline.md"), /never waits on review or pixel proof/);
  assert.match(flat("agents/engineer.md"), /that proof runs after the operator's yes/);
  assert.match(flat("skills/routing/references/GATE-AND-HOOKS.md"), /never waits on review or proof/);
});

test("link-first: reviewer-after-yes is unchanged", () => {
  assert.match(flat("output-styles/discipline.md"), /on a look-lane, the operator's yes precedes the review/);
  assert.match(flat("doer-rules.md"), /review still trails the yes/);
});

test("link-first: version 1.122.0 with a CHANGED entry", () => {
  assert.match(read(".claude-plugin/plugin.json"), /"version": "1.122.0"/);
  assert.match(read(".claude-plugin/marketplace.json"), /"version": "1.122.0"/);
  assert.match(read("CHANGED.txt"), /^1\.122\.0 — .*link-first/m);
});
