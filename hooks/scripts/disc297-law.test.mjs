// DISC-297 (operator s80, verbatim): "these 2 items are the kind of thing that should just be review together. Generally we may be getting a bit granular with reviews."
// and "i'm getting a bit confused with what i should be looking at"; Status dropdown "yes" (rulings 2026-11-12-s80-fewer-granular-reviews).
// The mechanism is queue-page-sync.mjs (its own test); this pins the prose that tells the parent how to use it.
// Run: node --test hooks/scripts/disc297-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const flat = (p) => readFileSync(join(root, p), "utf8").replace(/\s+/g, " ");

test("DISC-297: the pinned-doc rule lives once in HARD-RULES and names all four parts", () => {
  const h = flat("skills/routing/references/HARD-RULES.md");
  for (const s of [
    "**One look row per lane, and every item shows its Status** (DISC-297",
    "a new round of the same lane REPLACES that row's text and link, never appends",
    "related asks on one lane or screen are presented together for one review",
    "an answered item leaves \"Waiting on you\" in the same turn",
    "every item carries the Status chip: Ready for you / You're on it / Claude's on it / Done",
    "`queue-page-sync.mjs` flags `noStatus`, `appended`, `sameLane` and `leaveWaiting`",
  ]) assert.ok(h.includes(s), s);
});

test("DISC-297: the always-on style and wrap point at the rule, they do not restate it", () => {
  assert.ok(flat("output-styles/discipline.md").includes("(DISC-297, `routing` HARD-RULES)"));
  assert.ok(flat("skills/wrap/references/SECTIONS.md").includes("`leaveWaiting`"));
});
