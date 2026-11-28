// 2026-11-28: goal-led coordination, the no-visible-effect merge extension, and the look exception to release-follows-merge.
// Run: node --test hooks/scripts/goal-led-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const flat = (p) => readFileSync(join(root, p), "utf8").replace(/\s+/g, " ");

test("HARD-RULES 25: goals have a measurable target, laptop jobs a time cap, asks are cards, numbers are charts", () => {
  const r = flat("skills/routing/references/HARD-RULES.md");
  const rule = r.slice(r.indexOf("25. **Goal-led coordination**"));
  for (const s of [
    "written, measurable target",
    "limited to looks, laptop time and releases",
    "every laptop job carries a time cap and always reports back",
    "reaches the project chat as a card, never as text inside a progress update",
    "anything with numbers is shown as a chart",
    "one line of context",
  ]) assert.ok(rule.includes(s), s);
  assert.ok(flat("skills/routing/SKILL.md").includes("(HARD-RULES 25)"));
});

test("BATON: a no-visible-effect change merges on merge: yes, and a look, laptop run or release still needs his go", () => {
  const b = flat("skills/routing/references/BATON.md");
  assert.ok(b.includes("any change with no visible effect (fixes, tests, plugin, vault), merges without a merge card"));
  assert.ok(b.includes("right after the reviewer's `merge: yes` on the pinned head"));
  assert.ok(b.includes("A look, a laptop run or a release still needs his go."));
});

test("RELEASE-PATH: a look or behaviour change keeps the preview card as the ask", () => {
  const p = flat("skills/release-deploy/references/RELEASE-PATH.md");
  assert.ok(p.includes("except a change that alters what a visitor sees or does"));
  assert.ok(p.includes("His tap is the go for `pnpm release:promote`; no tap, no promote."));
  assert.ok(p.includes("Dependency, build and copy-free refactor releases stay ask-free."));
});
