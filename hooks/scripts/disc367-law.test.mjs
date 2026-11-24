// DISC-367 slice 2: the ask rule has one owner (doer-rules.md) and pointers elsewhere; the card gate is wired at the merge call.
// Run: node --test hooks/scripts/disc367-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (f) => readFileSync(join(root, f), "utf8");

test("doer-rules.md owns the ruled-question rule and names its two enforcers", () => {
  const t = read("doer-rules.md");
  assert.match(t, /ode is never evidence of what was approved/);
  assert.match(t, /--rulings/);
  assert.match(t, /card-gate\.mjs/);
});

test("the owner is stated once: the pointers do not restate the rule", () => {
  for (const f of ["skills/routing/references/OPERATOR-REPLIES.md", "skills/dispatch-brief/references/BRIEF-CRAFT.md"]) {
    assert.doesNotMatch(read(f), /never evidence of what was approved/i, f);
  }
});

test("each pointer reaches the owner", () => {
  assert.match(read("skills/routing/references/OPERATOR-REPLIES.md"), /`--rulings`/);
  assert.match(read("skills/dispatch-brief/references/BRIEF-CRAFT.md"), /docs\/site\/cards/);
});

test("the card gate runs on the merge call, beside the review gate", () => {
  const h = JSON.parse(read("hooks/hooks.json")).hooks.PreToolUse.find((e) => e.matcher === "mcp__github__merge_pull_request");
  const cmds = h.hooks.map((x) => x.command).join(" ");
  assert.match(cmds, /merge-review-gate\.mjs/);
  assert.match(cmds, /card-gate-merge\.mjs/);
});
