// 1.161.0: DISC-221 — session 43 parent lessons 1, 3–7 (vault
// fleet/lessons/2026-10-31-s43-parent-lessons.md). Each rule's text is asserted
// verbatim at its one home; the checks themselves are tested beside their scripts.
// Run: node --test hooks/scripts/session50-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const flat = (p) => read(p).replace(/\s+/g, " ");

test("L1: an ask that cites rows is checked first — HARD-RULES 14 names the row-add refusal", () => {
  const s = flat("skills/routing/references/HARD-RULES.md");
  assert.ok(s.includes("**An ask that cites rows is checked first**"));
  assert.ok(s.includes("`row-add.mjs --to queue` refuses a row naming its project's IDs unless each is open and `list-drift-check.mjs` ran in the last 15 minutes."));
});
