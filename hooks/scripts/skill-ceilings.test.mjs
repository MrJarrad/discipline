// Word ceilings on the skills that had grown past reading. Proven twice in
// 1.77.0-1.79.0: when a SKILL.md gets long enough, the doer stops reading the
// source file and works from a summary of it — dispatch-brief went 4,612 → 847
// words and the behaviour changed. The cure is offload, never deletion: the
// SKILL.md keeps the trigger, the one rule per section, the decision points and
// the pointers; procedure, worked examples and history move whole into
// `references/*.md` the skill names.
//
// The ceiling is on the BODY — the file minus its YAML frontmatter — because the
// frontmatter is the trigger surface and is pinned separately (routing and the
// frontmatter check own it), so it must never be squeezed to buy body room.
//
// A skill at a ceiling must also HAVE a references/ directory: passing by
// deletion is the failure this test exists to catch, so the offload target has to
// exist. Whether a given sentence survived the move is the law tests' job.
// Run: node --test hooks/scripts/skill-ceilings.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(repo, p), "utf8");

// Body = everything after the closing `---` of the YAML frontmatter. Word count
// matches `wc -w`: whitespace-delimited runs.
export const bodyWords = (text) => {
  const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n/.exec(text);
  const body = match ? text.slice(match[0].length) : text;
  return body.split(/\s+/).filter(Boolean).length;
};

// One row per ceilinged skill. 1.79.0 dispatch 2 sets the first two; the rest of
// W4 item 3 appends here rather than starting a second list.
const CEILINGS = [
  { skill: "capture-figma", ceiling: 1200, before: 9703 },
  { skill: "motion", ceiling: 1000, before: 5552 },
  { skill: "wrap", ceiling: 900, before: 3115 },
];

for (const { skill, ceiling, before } of CEILINGS) {
  test(`${skill} stays under its ${ceiling}-word body ceiling`, () => {
    const count = bodyWords(read(`skills/${skill}/SKILL.md`));
    assert.ok(count <= ceiling, `skills/${skill}/SKILL.md body is ${count} words; the ceiling is ${ceiling}`);
  });

  test(`${skill} offloaded rather than deleted — it has references to point at`, () => {
    const dir = join(repo, "skills", skill, "references");
    assert.ok(existsSync(dir), `skills/${skill}/references/ must exist — a ceiling is met by offload, not deletion`);
    const files = readdirSync(dir).filter((f) => f.endsWith(".md"));
    assert.ok(files.length > 0, `skills/${skill}/references/ carries no markdown`);
    // The material that left the body has to be somewhere: references must hold
    // more words than the body that now points at them.
    const referenceWords = files.reduce((sum, f) => sum + bodyWords(read(`skills/${skill}/references/${f}`)), 0);
    assert.ok(
      referenceWords > ceiling,
      `skills/${skill}/references/ holds only ${referenceWords} words — the ${before}-word original did not land here`,
    );
  });

  test(`every references/ link ${skill} names resolves`, () => {
    const text = read(`skills/${skill}/SKILL.md`);
    const dead = [...text.matchAll(/\]\((references\/[A-Za-z0-9._-]+\.md)\)/g)]
      .map((m) => m[1])
      .filter((rel) => !existsSync(join(repo, "skills", skill, rel)));
    assert.deepEqual(dead, [], `${skill} points at missing references: ${dead.join(", ")}`);
  });
}

test("the frontmatter description is never squeezed to buy body room", () => {
  // Trigger surface, pinned by routing and the frontmatter check. Recorded here
  // so a future trim of a ceilinged skill cannot quietly shorten it instead.
  for (const { skill } of CEILINGS) {
    const text = read(`skills/${skill}/SKILL.md`);
    const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(text);
    assert.ok(match, `skills/${skill}/SKILL.md has no frontmatter`);
    assert.match(match[1], /description:/, `skills/${skill}/SKILL.md frontmatter carries no description`);
    assert.ok(
      match[1].split(/\s+/).filter(Boolean).length > 40,
      `skills/${skill}/SKILL.md description looks truncated — the ceiling is on the body, not the trigger`,
    );
  }
});
