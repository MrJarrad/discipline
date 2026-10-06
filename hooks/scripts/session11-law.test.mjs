// The 1.112.0 items: one verbatim assertion per rule at the file that owns it.
// Run: node --test hooks/scripts/session11-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(repo, p), "utf8");

test("merge-each-approved-round: a round ends at its merge; stacking is malformed", () => {
  assert.match(read("skills/routing/references/HARD-RULES.md"), /A round ends at its merge\*\* \(`merge-each-approved-round-2026-10-06`/);
  assert.match(read("skills/dispatch-brief/references/BRIEF-CRAFT.md"), /stacks a new round onto an unmerged branch is malformed/);
});

test("figma-aspect-lock-is-ratio: a locked aspectRatio builds the ratio, never the height", () => {
  assert.match(read("skills/handoff-to-code/SKILL.md"), /locked `aspectRatio` builds the ratio, never the fixed height/);
  assert.match(read("skills/handoff-to-code/references/schema-v9-hints.md"), /figma-aspect-lock-is-ratio-2026-10-06[\s\S]*never the literal height/);
});

test("backlog 80: cloud-dispatch claims from origin/main only, agreeing with routing rule 9", () => {
  const c = read("skills/cloud-dispatch/SKILL.md");
  assert.match(c, /on origin\/main is claimed/);
  assert.doesNotMatch(c, /or any\s+`claude\/\*` branch is claimed/);
  assert.match(read("skills/routing/references/HARD-RULES.md"), /the runner claims only\s+from main/);
});

test("backlog 81: cloud-dispatch names the Mac-job repo: check", () => {
  assert.match(read("skills/cloud-dispatch/SKILL.md"), /hooks\/scripts\/mac-job-check\.mjs <file>/);
});
