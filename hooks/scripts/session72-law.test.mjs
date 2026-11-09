// Parent lessons s72 (vault fleet/lessons/2026-11-09-s72-parent-lessons.md), one assertion per encoded rule.
// Run: node --test hooks/scripts/session72-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const flat = (p) => readFileSync(join(root, p), "utf8").replace(/\s+/g, " ");
const has = (p, s) => assert.ok(flat(p).includes(s), `${p} lacks: ${s}`);

test("s72 1: a refused add_repo stops the helper and the parent runs the lane locally", () => {
  has("skills/cloud-dispatch/references/HELPER-SESSIONS.md", "**The auto-mode check refuses `add_repo` intermittently**");
  has("skills/cloud-dispatch/references/HELPER-SESSIONS.md", "the parent runs that lane as a local engineer in its own session");
});

test("s72 2: session-resume tells the parent to ask for /reload-plugins at session start", () => {
  has("hooks/scripts/session-resume.mjs", "ask the operator for /reload-plugins now, not at the first org-repo merge");
  has("hooks/scripts/session-resume.mjs", "Ask the operator for /reload-plugins now, at session start");
});

test("s72 3: a reviewer brief spells reviewer: session_<id> in full", () => {
  has("skills/dispatch-brief/SKILL.md", "`reviewer: session_<id>` verbatim");
});

test("s72 4: a feel or regression report is restated and confirmed before diagnosis", () => {
  has("skills/grilling/SKILL.md", "**A feel or regression report is restated first**");
});

test("s72 5: a regression's known-good is the last tuning window from the vault", () => {
  has("skills/diagnosing-bugs/SKILL.md", "**A regression's known-good is the last tuning window, not the last merge.**");
});
