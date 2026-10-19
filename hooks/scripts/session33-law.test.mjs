// 1.149.0: decision 2026-10-18-discipline-1149 (DISC-194) — lesson
// 2026-10-18-notes-view-nineteen-rounds and ruling 2026-10-18-pressed-vs-activated.
// (1) a behaviour spec, sized to the job, before the first build of an interactive or scrolling view;
// (2) components only in their defined states, folded into the design-system build standard.
// Run: node --test hooks/scripts/session33-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const flat = (p) => readFileSync(join(root, p), "utf8").replace(/\s+/g, " ");
const has = (p, s) => assert.ok(flat(p).includes(s), `${p} is missing: ${s}`);

test("(1) grilling: behaviour spec before the first build of an interactive or scrolling view, sized to the job", () => {
  has("skills/grilling/SKILL.md", "## Behaviour spec (interactive or scrolling views)");
  has("skills/grilling/SKILL.md", "Before the first build of any interactive or scrolling view, write down how it behaves, as short as the view allows");
  has("skills/grilling/SKILL.md", "Confirm it with the operator once; rounds after that are about feel");
  assert.ok(!/one-page (behaviour|interaction) spec/i.test(flat("skills/grilling/SKILL.md")), "the spec is sized to the job, never a fixed page");
  has("skills/grilling/references/DOS-AND-DONTS.md", "### Behaviour spec");
});

test("(2) design-system: components only in their defined states; an undefined look or state is flagged, never kept or added silently", () => {
  has("skills/design-system/SKILL.md", "**Components only in their defined states.**");
  has("skills/design-system/SKILL.md", "never kept or added silently");
  has("skills/design-system/SKILL.md", "**activated** is a persistent on/selected state; **pressed** is momentary feedback while held");
  has("skills/design-system/references/DOS-AND-DONTS.md", "### When a component needs a state the system does not define");
  has("skills/dispatch-brief/references/HOUSE-RULES.md", "components only in their defined states (`design-system` § Components)");
});

test("(2) folded into the build standard, not a button-specific rule", () => {
  assert.ok(!/buttons? match/i.test(flat("skills/design-system/SKILL.md")));
  assert.ok(!/buttons? match/i.test(flat("skills/dispatch-brief/references/HOUSE-RULES.md")));
});
