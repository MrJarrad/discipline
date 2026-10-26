// 1.153.1: DISC-204 — house voice: end-to-end unbanned, Gil register reference, plain-words rule, British spelling.
// Run: node --test hooks/scripts/session41-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const flat = (p) => read(p).replace(/\s+/g, " ");
const HV = "skills/brand-voice/references/HOUSE-VOICE.md";

test("end-to-end is not on the banned list", () => {
  const banned = flat(HV).match(/NEVER use: ([^.]*)\./)[1];
  assert.ok(!banned.includes("end-to-end"));
  assert.equal(banned.split(",").length, 13);
});

test("Gil is the register reference, with his three overlay lines", () => {
  const t = flat(HV);
  assert.ok(t.includes("gilhuybrecht.com/profile"));
  for (const l of ["Laying out information on different pages and fine tuning the funnels tailored to the project's business goals", "Web design in Figma for desktop and mobile screens.", "micro interactions like button hovers to big animations like a page transition"]) assert.ok(t.includes(l), l);
});

test("no strings of three or more abstract nouns; say it across the table", () => {
  const t = flat(HV);
  assert.ok(t.includes("no string of three or more abstract nouns"));
  assert.ok(t.includes("explain it to someone across the table"));
});

test("action-first stays for list and glossary definitions; long-form reads as sentences", () => {
  assert.ok(flat(HV).includes("Action-first openings stay for list and glossary definitions. Long-form copy (case studies) reads as normal sentences."));
});

test("house spelling is British English", () => {
  const t = flat(HV);
  assert.ok(t.includes("British English") && t.includes("Colour, organising, modelling"));
  assert.ok(!/\bcolor\b/i.test(t.replace(/colour/gi, "")));
});

test("release: 1.153.1 in both manifests and CHANGED.txt, with the encoded line", () => {
  for (const p of [".claude-plugin/plugin.json", ".claude-plugin/marketplace.json"]) assert.ok(read(p).includes('"version": "1.153.1"'), p);
  const top = read("CHANGED.txt");
  assert.ok(top.startsWith("1.153.1 — "));
  assert.match(top.split("\n\n")[0], /\nencoded: 1\.153\.1 — /);
});
