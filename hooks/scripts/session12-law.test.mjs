// The 1.113.0 items: one assertion per encoded rule at the file that owns it.
// Run: node --test hooks/scripts/session12-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(repo, p), "utf8");

test("one-shot-defect-rounds: doer-rules gates the look link on the doer's own repro, not a review round", () => {
  const d = read("doer-rules.md");
  assert.match(d, /one-shot-defect-rounds-2026-10-07/);
  assert.match(d, /production build\*\* or the deployed preview, never only the dev server/);
  assert.match(d, /pixel proof at rest\*\* at the operator's framing/);
  assert.match(d, /live INSIDE the\s+build lane as the doer's own repro/);
  assert.match(d, /never a new review round, review still trails the yes/);
  assert.match(d, /real GPU via a Mac job only for visual\s+3D/);
});

test("one-shot-defect-rounds: the parent views evidence before the link; unverified is sent back", () => {
  const p = read("skills/present-for-review/SKILL.md");
  assert.match(p, /The parent views the evidence before the link/);
  assert.match(p, /sent back, not relayed/);
});

test("one-shot-defect-rounds: top-tier trial on judgment-heavy look lanes, defect rounds tracked", () => {
  const m = read("skills/model-routing/SKILL.md");
  assert.match(m, /Top-tier trial on judgment-heavy look lanes and hard diagnosis/);
  assert.match(m, /tracks defect rounds and usage per lane/);
});

test("queue wakes item 3: a new ask re-checks the open row's readiness", () => {
  assert.match(read("output-styles/discipline.md"), /When a new ask changes an open row, re-check that row's readiness in the same turn/);
});

test("queue wakes item 4: the Bash gate blocks pkill/killall and doer-rules says so", () => {
  assert.match(read("hooks/bin/agent-dispatch-gate.mjs"), /checkBashKillByName\(input\.tool_input\)/);
  assert.match(read("doer-rules.md"), /blocks a `pkill`\/`killall` command/);
});

test("backlog 99: cloud previews come from the preview/* Workers Builds alias", () => {
  const alias = /preview-<branch>-jhd-preview-staging\.jh-229\.workers\.dev/;
  assert.match(read("skills/present-for-review/SKILL.md"), alias);
  assert.match(read("skills/cloud-dispatch/SKILL.md"), /cloud cannot `upload` portfolio versions/);
});

test("backlog 105: Mac job briefs say no background tasks, no subagents", () => {
  assert.match(read("skills/cloud-dispatch/SKILL.md"), /Every job brief says "no background tasks, no subagents"/);
  assert.match(read("hooks/scripts/mac-job-check.mjs"), /NO_BACKGROUND/);
});

test("backlog 97 A3/A4: the unsourced aspect line is gone; cloud-dispatch carries no re-probe diary", () => {
  assert.doesNotMatch(read("skills/handoff-to-code/references/schema-v9-hints.md"), /ledger row binds `aspect-ratio`/);
  assert.doesNotMatch(read("skills/cloud-dispatch/SKILL.md"), /Re-probed 2026-08-28/);
});
