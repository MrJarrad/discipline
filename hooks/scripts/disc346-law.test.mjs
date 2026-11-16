// DISC-346: the rule lives once in HARD-RULES; the mechanism is hooks/bin/needed-from-you-stop.mjs (own tests).
// Run: node --test hooks/scripts/disc346-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
test("DISC-346: every update rewrites its Status doc item the same turn", () => {
  const h = readFileSync(join(root, "skills/routing/references/HARD-RULES.md"), "utf8").replace(/\s+/g, " ");
  for (const s of ["**Every update rewrites its Status doc item, the same turn** (DISC-346",
    "can we make sure this just keeps happening with every update or change. so it's always easy to read and understand",
    "A reply in a comment thread never stands in for rewriting the item.",
    "the item leaves Ready for you",
    "The Stop hook counts a comment-only doc write as no write"]) assert.ok(h.includes(s), s);
});
