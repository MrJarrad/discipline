// 1.153.0: DISC-200 — the operator's tone of voice is the house voice, carried once in brand-voice.
// Run: node --test hooks/scripts/session40-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const flat = (p) => readFileSync(join(root, p), "utf8").replace(/\s+/g, " ");
const has = (p, text) => assert.ok(flat(p).includes(text), `${p} is missing: ${text}`);
const HV = "skills/brand-voice/references/HOUSE-VOICE.md";
const SK = "skills/brand-voice/SKILL.md";

test("HOUSE-VOICE.md carries every rule of the brief", () => {
  assert.ok(existsSync(join(root, HV)));
  has(HV, "Grounded Editorial Minimalist");
  has(HV, "comprehensive, end-to-end, holistic, robust, seamless, overarching, strategic, integrated, synergy, hyper-realistic, best-in-class, premium, frictionless, distinctive");
  has(HV, "\"This means that...\"");
  has(HV, "\"Our focus is to ensure...\"");
  for (const w of ["Action-first", "Radical economy", "Conversational but serious", "Business-aware"]) has(HV, w);
  has(HV, "Crafting comprehensive and holistic brand identity systems across an integrated blueprint to ensure a best-in-class, seamless user experience.");
  has(HV, "Building flexible typographic systems, color palettes, and core visual assets that translate natively between physical spaces and digital interfaces.");
});

test("the Gemini role-play framing is dropped", () => {
  const t = flat(HV);
  assert.ok(!/expert copywriter/i.test(t));
  assert.ok(!/2-sentence confirmation/i.test(t));
});

test("brand-voice loads the house voice first and stays one source", () => {
  has(SK, "references/HOUSE-VOICE.md");
  has(SK, "adds only project specifics");
  has(SK, "never restates it");
  has(SK, "Start from the house voice");
  has(SK, "published copy");
  has(SK, "Operator-facing chat and agent output styles");
});

test("the banned list lives only in HOUSE-VOICE.md", () => {
  for (const p of ["skills/brand-voice/SKILL.md", "skills/brand-voice/references/DOS-AND-DONTS.md"])
    assert.ok(!flat(p).includes("end-to-end, holistic"), p);
});

test("every references/ link brand-voice names resolves", () => {
  for (const m of readFileSync(join(root, SK), "utf8").matchAll(/\]\((references\/[A-Za-z0-9._-]+\.md)\)/g))
    assert.ok(existsSync(join(root, "skills/brand-voice", m[1])), m[1]);
});

test("output styles are untouched by the house voice", () => {
  assert.ok(!flat("output-styles/discipline.md").includes("Grounded Editorial Minimalist"));
});

test("release: 1.153.0 in both manifests and CHANGED.txt, with the encoded line", () => {
  for (const p of [".claude-plugin/plugin.json", ".claude-plugin/marketplace.json"]) assert.ok(readFileSync(join(root, p), "utf8").includes('"version": "1.153.0"'), p);
  const top = readFileSync(join(root, "CHANGED.txt"), "utf8");
  assert.ok(top.startsWith("1.153.0 — "));
  assert.match(top.split("\n\n")[0], /\nencoded: 1\.153\.0 — /);
});
