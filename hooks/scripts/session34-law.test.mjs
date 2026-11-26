// 1.150.0: DISC-193 (the 1.148.0 merge-gate follow-ups N5, N6, N7, N1 from review #108 round 2),
// lesson 2026-10-18-text-wrap-reproduce-the-real-gesture (four skills) and DISC-195 (one helper-session recipe).
// Run: node --test hooks/scripts/session34-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readLoaded } from "./skill-text.mjs"; // a SKILL.md path reads as the loaded skill: body + linked references

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const flat = (p) => readLoaded(root, p).replace(/\s+/g, " ");
const has = (p, s) => assert.ok(flat(p).includes(s), `${p} is missing: ${s}`);
const mar = await import("./merge-after-review.mjs");
const HEAD = "c137007fc1159f87d0fc58e885fc8b71b0362275";
const S7 = HEAD.slice(0, 7);
const c = (body, at) => ({ body, author: { login: "MrJarrad" }, at });
const yes = `## Review — head ${S7}\n\n**merge: yes.**`;
const no = `## Review — head ${S7}\n\n**merge: no.**`;


test("(N7) the verdict sort is transitive when a timestamp is missing: untimed posts rank oldest", () => {
  const items = [c(no, "2026-10-18T17:00:00Z"), c(yes, undefined), c(yes, "2026-10-18T16:00:00Z")];
  const perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
  for (const p of perms) assert.equal(mar.reviewVerdict(p.map((i) => items[i]), HEAD, ["MrJarrad"])?.verdict, "no", p.join());
  assert.equal(mar.reviewVerdict([c(yes, "2026-10-18T16:00:00Z"), c(no, undefined)], HEAD, ["MrJarrad"])?.verdict, "yes");
});

const LESSON = "2026-10-18-text-wrap-reproduce-the-real-gesture";
test("(lesson 4) grilling: any motion feature starts by asking for the reference behaviour", () => {
  has("skills/grilling/SKILL.md", "On any motion feature the first question asks for the reference behaviour itself");
  has("skills/grilling/SKILL.md", LESSON);
});

test("(lesson 5) test-first: a gate's threshold comes from the specified mechanism and is agreed before building", () => {
  has("skills/test-first/SKILL.md", "**A gate's threshold is one the specified behaviour can pass**");
  has("skills/test-first/SKILL.md", "get it agreed before building to it");
  has("skills/test-first/SKILL.md", LESSON);
});
