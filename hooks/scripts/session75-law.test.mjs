// Parent lessons s75 (vault fleet/lessons/2026-11-10-s75-parent-lessons.md), one assertion per encoded rule.
// Run: node --test hooks/scripts/session75-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const flat = (p) => readFileSync(join(root, p), "utf8").replace(/\s+/g, " ");
const has = (p, s) => assert.ok(flat(p).includes(s), `${p} lacks: ${s}`);
const HARD = "skills/routing/references/HARD-RULES.md";

test("s75 1: a reviewed PR branch takes no more pushes until it merges", () => {
  has(HARD, "once a reviewer is dispatched on a PR, push nothing more to that branch until it merges");
  has(HARD, "DON'T: push a note commit onto a branch a reviewer has a verdict on");
});
test("s75 2: a hand flip moves the row to the Done archive in the same edit", () => {
  has("skills/vault-write/references/WRITING.md", "A hand flip moves the row to `## Done archive` in the same edit, then `list-drift-check.mjs --new-vs` before the push");
});
test("s75 3: a Figma-contract review goes to a vehicle with Figma tools", () => {
  has(HARD, "a brief that says \"read the Figma live\" goes only to a vehicle that has the Figma tools (a helper session)");
  has("skills/dispatch-brief/references/ACCURACY.md", "Figma-contract reviewer: helper session only; check the persona's tool list first");
});
test("s75 4: the /reload-plugins ask is a queue row in the first status reply", () => {
  has("hooks/scripts/session-resume.mjs", "carry the /reload-plugins ask as a queue row in the first status reply, before any lane opens");
});
test("s75 5: at the first load warning the next heavy lane goes to a helper session", () => {
  has(HARD, "at the first load warning the next heavy lane (suite, build, browser) goes to a helper session; reviewers that only read git stay in-session");
});
test("s75 6: grep a hand-edited list row back before committing", () => {
  has("skills/vault-write/references/WRITING.md", "After any hand edit to a list, grep the new text back with `queue-write-check.mjs` before committing, and describe only what the check shows");
});
test("s75 7: the notes-only proof command runs plain", () => {
  has(HARD, "run the proof command plain, exactly as the gate prints it, never piped through `cut`, `head` or `grep`");
  has("hooks/bin/merge-review-gate.mjs", "run plain, exactly as printed: no pipe, no redirect");
});
test("DISC-282: session74-law holds 6 tests and says so for the next release entry", () => {
  const t = readFileSync(join(root, "hooks/scripts/session74-law.test.mjs"), "utf8");
  assert.equal((t.match(/^test\(/gm) || []).length, 6);
  assert.ok(t.includes("this file holds 6 tests; the 1.193.0 line says \"(4)\""));
});
