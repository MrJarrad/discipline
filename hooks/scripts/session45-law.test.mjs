// 1.156.0: DISC-213/214/215 — house voice amendments (ruling 2026-10-27-house-voice-warmth, 2026-10-28/29); DISC-217 helper Stop hook follow-ups.
// Run: node --test hooks/scripts/session45-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const flat = (p) => read(p).replace(/\s+/g, " ");
const HV = "skills/brand-voice/references/HOUSE-VOICE.md";

test("DISC-213: list and glossary lines may open on a verb; rule 6 governs sets", () => {
  const t = flat(HV);
  assert.match(t, /list and glossary lines may open on a verb/i);
  assert.ok(t.includes("variety wins; a verb opening is allowed but not required"));
  assert.ok(t.includes("Rule 6 of Warmth over mechanics governs sets"));
  assert.ok(!t.includes("open directly with a strong present-participle verb"), "rule 1 still requires the verb opening");
});

test("DISC-214: real terminology stays in all published copy; plain words for the connecting words only", () => {
  const t = flat(HV);
  assert.ok(t.includes("## Real terminology stays"));
  assert.ok(t.includes('"I think this is a tov wide thing to correct."'));
  assert.ok(t.includes("Replacing a term with a plain description of it is a defect."));
  assert.ok(t.includes('("integrating" → "combining")'));
  assert.ok(t.includes("never the terms themselves"));
});

test("DISC-215: no colons, semicolons or punctuation dashes in published copy", () => {
  const t = flat(HV);
  assert.ok(t.includes("## No colons, semicolons or dashes"));
  assert.ok(t.includes(`"i'd prefer not use colons or semi colons or dashes in written content generally, particularly in longer form copy like this"`));
  assert.ok(t.includes("Hyphens inside words (end-to-end, user-centred) stay."));
  assert.ok(t.includes("A colon may introduce an actual list."));
  assert.ok(t.includes("write sentences that do not need the punctuation"));
});

test("release: 1.156.0 has its CHANGED.txt entry with the encoded line", () => {
  const entry = read("CHANGED.txt").split("\n\n").find((e) => e.startsWith("1.156.0 — "));
  assert.ok(entry);
  assert.ok(entry.includes("encoded: 1.156.0 — backlog DISC-213, DISC-214, DISC-215, DISC-217"));
});
