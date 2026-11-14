// DISC-324 + DISC-309 (operator s87: "i need to you ensure the status doc is always up to date and need this to go across sessions"; s82: "why is this still apearing?").
// Mechanism: hooks/bin/needed-from-you-stop.mjs + hooks/scripts/lib/doc-sync-check.mjs (own tests); this pins the prose, which lives once in HARD-RULES.
// Run: node --test hooks/scripts/disc324-309-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const flat = (p) => readFileSync(join(root, p), "utf8").replace(/\s+/g, " ");

test("DISC-324/309: the doc-current and no-reprint rules live once in HARD-RULES, beside the layout", () => {
  const h = flat("skills/routing/references/HARD-RULES.md");
  for (const s of ["**The Status doc stays current, in every session** (DISC-324",
    "i need to you ensure the status doc is always up to date and need this to go across sessions",
    "a turn that adds, answers or strikes a row, edits a queue or backlog file, or merges a PR (a vault notes PR included) also writes the Status doc in that turn",
    "the Stop hook refuses the turn otherwise, a textless wake included, and its reason asks for the doc write and never for chat text",
    "(DISC-309",
    "why is this still apearing?",
    "a reply prints only rows added this turn; a row that existed before it is updated on the doc and never reprinted, and the Stop hook refuses a printed row ID with no row-add marker this turn"]) assert.ok(h.includes(s), s);
});
