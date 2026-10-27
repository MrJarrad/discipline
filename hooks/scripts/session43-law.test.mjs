// 1.154.0: DISC-210 — house voice: warmth over mechanics (ruling 2026-10-27-house-voice-warmth).
// Run: node --test hooks/scripts/session43-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const flat = (p) => read(p).replace(/\s+/g, " ");
const HV = "skills/brand-voice/references/HOUSE-VOICE.md";
const SK = "skills/brand-voice/SKILL.md";
const DD = "skills/brand-voice/references/DOS-AND-DONTS.md";

test("the five rules live in HOUSE-VOICE.md", () => {
  const t = flat(HV);
  for (const r of [
    "Open with what the person loves and makes",
    "Let sentences run and join, and vary their length.** No lists of three verbs.",
    "Allow a few honest feeling words** (considered, quiet, crafted, exceptional) where they are true",
    "One idea per paragraph",
    "Drop workplace words:** align, iterate, steer, production, deliver",
  ]) assert.ok(t.includes(r), r);
});

test("the approved paragraphs and the draft-3 paragraphs form the tone-target pair", () => {
  const t = flat(HV);
  for (const s of [
    "My work is quiet and considered, built on strong typography, clear structure and images that let a brand speak for itself.",
    "Every brand should feel like itself, never like a template.",
    "I'm drawn to restraint, the kind you find in modernism and in Dieter Rams's work: fewer things, each one done well.",
    "I set the direction, keep the team aligned on it and steer the work to production without losing what made it good.",
    "so the whole team can understand it, align and iterate.",
  ]) assert.ok(t.includes(s), s);
});

test("the banned list is unchanged and holds no feeling word", () => {
  const banned = flat(HV).match(/NEVER use: ([^.]*)\./)[1];
  assert.equal(banned.split(",").length, 13);
  for (const w of ["considered", "quiet", "crafted", "exceptional"]) assert.ok(!banned.includes(w), w);
});

test("rules that pushed mechanical copy are loosened", () => {
  assert.ok(!flat(HV).includes("fewest characters"));
  assert.ok(!flat(HV).includes('"Aligning,"'));
  assert.ok(!flat(SK).includes("One idea per sentence"));
  assert.ok(flat(SK).includes("One idea per paragraph"));
  assert.ok(flat(SK).includes("is not a vibe word"));
});

test("SKILL.md and DOS-AND-DONTS.md point at the rules and do not restate the paragraphs", () => {
  assert.ok(flat(SK).includes("Warmth over mechanics"));
  assert.ok(flat(DD).includes("[HOUSE-VOICE.md](HOUSE-VOICE.md)"));
  for (const p of [SK, DD]) assert.ok(!flat(p).includes("quiet and considered, built on"), p);
});

test("release: 1.154.0 in both manifests and CHANGED.txt, with the encoded line", () => {
  for (const p of [".claude-plugin/plugin.json", ".claude-plugin/marketplace.json"]) assert.ok(read(p).includes('"version": "1.154.0"'), p);
  const top = read("CHANGED.txt");
  assert.ok(top.startsWith("1.154.0 — "));
  assert.match(top.split("\n\n")[0], /\nencoded: 1\.154\.0 — /);
});
