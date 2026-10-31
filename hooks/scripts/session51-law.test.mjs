// 1.162.0: DISC-223 (four skill updates, s43 operator answers) and DISC-224
// (lighter session start). Each rule's text is asserted verbatim at its one home;
// the scripts are tested beside themselves.
// Run: node --test hooks/scripts/session51-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const flat = (p) => read(p).replace(/\s+/g, " ");

test("DISC-223.1: equal items go in one list — HOUSE-VOICE rule 8, with its DO/DON'T", () => {
  const s = flat("skills/brand-voice/references/HOUSE-VOICE.md");
  assert.ok(s.includes("8. **Equal items go in one list.**"));
  assert.ok(s.includes("Things the copy means as equals sit side by side in one list, never one of them in a clause trailing after the rest."));
  const d = flat("skills/brand-voice/references/DOS-AND-DONTS.md");
  assert.ok(d.includes("| Hang one of a set of equals off the end in a trailing clause | Rule 8: it reads as an afterthought |"));
});

test("DISC-223.2: feel questions use the operator's own references — grilling § Feel questions", () => {
  const s = flat("skills/grilling/SKILL.md");
  assert.ok(s.includes("**The references are the operator's own**: a capture, site, Figma frame or recording he gave or named, never an analogy the parent invents"));
  assert.ok(s.includes("(*\"like the paper curve on Gil's profile page, or the React Bits Flying Posters?\"*)"));
  assert.ok(!s.includes("stone dropped in a pond"), "the invented-analogy example is gone");
  assert.ok(s.includes("HB-287 r1, 2026-10-31: \"a trampoline isn't the right reference for this\""));
});

test("DISC-223.3: Figma spec text goes through figma.spec only — one home in LANES-AND-TOOLS", () => {
  const l = flat("skills/capture-figma/references/LANES-AND-TOOLS.md");
  assert.ok(l.includes("| Spec text | `use_figma` with `figma.spec.getContent` to read, `figma.spec.editContent` to write (each call all-or-none; re-read after a write) | everything: REST and the other MCP reads do not return spec text |"));
  assert.ok(flat("skills/capture-figma/SKILL.md").includes("Mechanics: [LANES-AND-TOOLS.md](references/LANES-AND-TOOLS.md) § No-export lanes."), "SKILL points at the one home");
});
