// Parent lessons s76 (vault fleet/lessons/2026-11-10-s76-parent-lessons.md), one assertion per encoded rule.
// Lessons 3 and 4 are tool changes with red-first tests in row-add.test.mjs and agent-dispatch-gate.test.mjs;
// lesson 5 (DISC-284) is archive-guard.test.mjs; lesson 6 lives in the portfolio repo, not here.
// Run: node --test hooks/scripts/session76-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const flat = (p) => readFileSync(join(root, p), "utf8").replace(/\s+/g, " ");
const has = (p, s) => assert.ok(flat(p).includes(s), `${p} lacks: ${s}`);

test("s76 1: a Mac job names how the Mac reaches the host and which sign-in it relies on", () => {
  has("skills/cloud-dispatch/references/MAC-JOBS.md", "grep `queue/mac/done` and the project queue for the host, and write into the job which sign-in it relies on");
  has("skills/cloud-dispatch/references/MAC-JOBS.md", "DON'T: describe a host as public and queue the job unchecked");
  has("skills/dispatch-brief/SKILL.md", "a Mac-job review also names the access question: which sign-in reaches each host");
});
test("s76 2: a merged lane's worktree is removed in the same step; df is read before every heavy dispatch", () => {
  has("skills/routing/references/HARD-RULES.md", "When a lane's PR merges the parent removes its worktree in the same step (`git worktree remove <path>`");
  has("skills/routing/references/HARD-RULES.md", "Before every heavy dispatch the parent reads `df` as well as load");
  has("skills/routing/references/HARD-RULES.md", "DON'T: leave finished worktrees for the wrap");
});
test("s76 3: row-add names both list files to stage", () => {
  has("skills/routing/references/MECHANICAL-SCRIPTS.md", "`row-add: stage <both list files>`");
});
test("s76 4: the brief cap excludes the House rules block", () => {
  has("hooks/bin/agent-dispatch-gate.mjs", "the House rules block, matched against HOUSE-RULES.md, already excluded");
  has("skills/dispatch-brief/SKILL.md", "lock table and House rules block excluded");
});
test("s76 7: the reviewer brief carries the invoke-for-real wording", () => {
  has("skills/dispatch-brief/SKILL.md", "invoke each skill with the Skill tool, for real");
});
test("DISC-284: wrap names the guard fix and the auto-mode allow rule with its location", () => {
  const w = "skills/wrap/references/CLOSING-CHECKS.md";
  has(w, "the plugin guard, which counts reads made by this session's subagents");
  has(w, '`{"permissions": {"allow": ["mcp__claude-code-remote__archive_session"]}}`');
  has(w, "the vault's `.claude/settings.json`");
  has(w, "DON'T: leave landed helpers in the sidebar for the operator to clear");
  has("hooks/bin/archive-guard.mjs", "reads made by a subagent of this same session count");
});
