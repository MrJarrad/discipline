// Offline gate on the eval case file itself: deterministic, no model calls.
// The cases are scored live by skill-eval.mjs; this test keeps the file honest
// (valid shape, real skills and personas, no case naming its own answer, the
// s107 slips present) so a bad case never wastes a live run.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadCases, lintCaseFixtures, normalizeSkillName } from "./skill-eval.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const casesPath = join(root, "meta", "skill-eval", "cases.json");
const cases = loadCases(casesPath);
const skills = readdirSync(join(root, "skills")).filter((n) => existsSync(join(root, "skills", n, "SKILL.md")));
const personas = readdirSync(join(root, "agents")).filter((n) => n.endsWith(".md")).map((n) => n.slice(0, -3));

// Every case costs a live run of 3-9 probes per arm, so the file stays small: a new case retires an old one past 40.
test("the case file holds 18 to 40 cases with unique ids and a known type", () => {
  assert.ok(cases.length >= 18 && cases.length <= 40, `got ${cases.length}`);
  assert.equal(new Set(cases.map((c) => c.id)).size, cases.length);
  for (const c of cases) assert.ok(["route", "trigger", "fence", "behavior"].includes(c.type), c.id);
});

test("route, trigger and fence are all covered", () => {
  for (const t of ["route", "trigger", "fence"]) assert.ok(cases.some((c) => c.type === t), t);
});

test("every case has a prompt, provenance and samples, and none names a skill", () => {
  for (const c of cases) assert.ok(c.prompt && c.samples >= 1, c.id);
  const lint = lintCaseFixtures(cases, skills);
  assert.deepEqual(lint.violations, []);
});

test("every skill and persona a case expects or forbids exists in the repo", () => {
  for (const c of cases) {
    for (const s of [...(c.expectSkills ?? []), ...(c.forbidSkills ?? [])]) {
      assert.ok(skills.includes(normalizeSkillName(s)), `${c.id}: no skill ${s}`);
    }
    if (c.expectPersona) assert.ok(personas.includes(c.expectPersona), `${c.id}: no persona ${c.expectPersona}`);
  }
});

test("every case can fail: it expects or forbids something", () => {
  for (const c of cases) {
    const n = (c.expectSkills?.length ?? 0) + (c.forbidSkills?.length ?? 0) + (c.expectText?.length ?? 0) + (c.forbidText?.length ?? 0) + (c.expectPersona ? 1 : 0);
    assert.ok(n > 0, c.id);
  }
});

test("text patterns are valid regular expressions", () => {
  for (const c of cases) for (const p of [...(c.expectText ?? []), ...(c.forbidText ?? [])]) assert.doesNotThrow(() => new RegExp(p, "i"), `${c.id}: ${p}`);
});

test("each s107 slip has its own case", () => {
  for (const id of ["s107-preview-wrong-build", "s107-tryout-kept-as-switches", "s107-status-doc-stale", "s107-chat-reply-to-automated-wake"]) {
    assert.ok(cases.some((c) => c.id === id), id);
  }
  assert.equal(cases.filter((c) => c.id.startsWith("s107-")).length, 4);
});

test("agent-ops names the case file and runner paths that exist", () => {
  const body = readFileSync(join(root, "skills", "agent-ops", "SKILL.md"), "utf8");
  for (const m of body.matchAll(/`((?:meta|scripts|hooks)\/[\w./-]+\.(?:json|mjs))`/g)) {
    assert.ok(existsSync(join(root, m[1])), `agent-ops names ${m[1]}`);
  }
});
