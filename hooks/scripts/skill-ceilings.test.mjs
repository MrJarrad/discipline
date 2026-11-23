// Word budgets. Every rule a session reads costs attention on every turn it is loaded, and a long file is read as a
// summary of itself. So each budgeted file only shrinks: a new rule fits under its file's number by retiring or
// shortening another (skill-authoring § Lesson intake). Raising a number is a scope call, recorded as one line beside it
// with the rule it carries; the history of earlier numbers is git log, never a comment here.
//
// Bodies are measured without YAML frontmatter: the frontmatter is the trigger surface and is pinned separately below.
// A skill under a ceiling must have a references/ directory holding what left the body (offload, never deletion).
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
// `skill` is a folder under skills/, or an agent charter as `agents/<name>.md`.
// Agents ceiling the same way and offload into agents/references/.
const pathsFor = (skill) =>
  skill.startsWith("agents/")
    ? { doc: skill, references: join(repo, "agents", "references"), link: /\]\((references\/[A-Za-z0-9._-]+\.md)\)/g, resolve: (rel) => join(repo, "agents", rel) }
    : { doc: `skills/${skill}/SKILL.md`, references: join(repo, "skills", skill, "references"), link: /\]\((references\/[A-Za-z0-9._-]+\.md)\)/g, resolve: (rel) => join(repo, "skills", skill, rel) };

const CEILINGS = [
  { skill: "capture-figma", ceiling: 1324, before: 9578, frontmatterWords: 123 },
  { skill: "routing", ceiling: 1916, before: 3254, frontmatterWords: 90 }, // target 1,500 (DISC-351)
  { skill: "motion", ceiling: 1040, before: 5552, frontmatterWords: 58 },
  { skill: "wrap", ceiling: 1031, before: 3115, frontmatterWords: 85 },
  { skill: "agents/reviewer.md", ceiling: 1814, before: 2017, frontmatterWords: 72 },
  { skill: "markup-standard", ceiling: 1200, before: 2778, frontmatterWords: 68 },
  { skill: "vault-write", ceiling: 1236, before: 2394, frontmatterWords: 38 },
  { skill: "banana", ceiling: 1200, before: 2273, frontmatterWords: 62 },
  { skill: "nextjs", ceiling: 1200, before: 2082, frontmatterWords: 75 },
  { skill: "prompt-craft", ceiling: 1200, before: 1811, frontmatterWords: 56 },
  { skill: "issue-triage", ceiling: 1200, before: 1693, frontmatterWords: 65 },
];

for (const { skill, ceiling, before } of CEILINGS) {
  const { doc, references, link, resolve } = pathsFor(skill);

  test(`${skill} stays under its ${ceiling}-word body ceiling`, () => {
    const count = bodyWords(read(doc));
    assert.ok(count <= ceiling, `${doc} body is ${count} words; the ceiling is ${ceiling}`);
  });

  test(`${skill} offloaded rather than deleted — it has references to point at`, () => {
    assert.ok(existsSync(references), `${references} must exist — a ceiling is met by offload, not deletion`);
    const files = readdirSync(references).filter((f) => f.endsWith(".md"));
    assert.ok(files.length > 0, `${references} carries no markdown`);
    // The material that left the body has to be somewhere. For a skill the whole
    // references/ dir belongs to it; agents share one dir, so only the files this
    // charter actually links count toward its offload.
    const text = read(doc);
    const mine = skill.startsWith("agents/")
      ? files.filter((f) => text.includes(`references/${f}`))
      : files;
    const referenceWords = mine.reduce((sum, f) => sum + bodyWords(readFileSync(join(references, f), "utf8")), 0);
    assert.ok(
      referenceWords > ceiling / 2,
      `${references} holds only ${referenceWords} words for ${skill} — the ${before}-word original did not land here`,
    );
  });

  test(`every references/ link ${skill} names resolves`, () => {
    const dead = [...read(doc).matchAll(link)].map((m) => m[1]).filter((rel) => !existsSync(resolve(rel)));
    assert.deepEqual(dead, [], `${skill} points at missing references: ${dead.join(", ")}`);
  });
}

// Ratchet ceilings: bodies over 1,500 words that never offloaded, held at their measured size (target 1,500, DISC-351).
const RATCHETS = [
  { skill: "handoff-to-code", ceiling: 4122 }, // byte copy of handoff-css; it is trimmed there, never here
  { skill: "capture-website", ceiling: 1737 },
  { skill: "media-loading", ceiling: 1640 },
  { skill: "model-routing", ceiling: 1751 },
  { skill: "present-for-review", ceiling: 1188 },
  { skill: "release-deploy", ceiling: 1755 },
  { skill: "qa-acceptance", ceiling: 1770 },
  { skill: "cloud-dispatch", ceiling: 1865 },
];

for (const { skill, ceiling } of RATCHETS) {
  test(`${skill} stays under its ${ceiling}-word ratchet ceiling`, () => {
    const doc = `skills/${skill}/SKILL.md`;
    const count = bodyWords(read(doc));
    assert.ok(count <= ceiling, `${doc} body is ${count} words; the ratchet ceiling is ${ceiling} — fit a new rule by retiring one`);
  });
}

// The description is the trigger surface: shorten it and the skill stops firing,
// which is a worse failure than a long body. `frontmatterWords` is each file's count
// as it stood before the slim, so a later trim that buys body room out of the trigger
// fails here instead of passing the ceiling quietly.
test("the frontmatter description is never squeezed to buy body room", () => {
  for (const { skill, frontmatterWords } of CEILINGS) {
    const text = read(pathsFor(skill).doc);
    const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(text);
    assert.ok(match, `${skill} has no frontmatter`);
    assert.match(match[1], /description:/, `${skill} frontmatter carries no description`);
    const count = match[1].split(/\s+/).filter(Boolean).length;
    assert.ok(
      count >= frontmatterWords,
      `${skill} frontmatter is ${count} words, was ${frontmatterWords} — the ceiling is on the body, not the trigger`,
    );
  }
});

// Always-read files: loaded whole by every session (the style), every orchestrator turn (routing's references) or every
// doer (doer-rules, the house rules every brief carries). Held at measured size; `target` is the DISC-351 target shape.
export const BUDGETS = [
  { file: "output-styles/discipline.md", words: 800, target: 800 },
  { file: "skills/routing/references/HARD-RULES.md", words: 6099, target: 2500 },
  { file: "skills/routing/references/OPERATOR-REPLIES.md", words: 2255, lines: 132, target: 1500 },
  { file: "doer-rules.md", words: 3885, lines: 334, target: 2500 },
  { file: "skills/dispatch-brief/references/HOUSE-RULES.md", words: 734, target: 400 },
  // Intake step 1: a file with no budget row earns one at measured size. This clause earned its own file this row.
  { file: "skills/skill-authoring/SKILL.md", words: 1011, target: 1011 },
];

for (const { file, words, lines } of BUDGETS) {
  test(`${file} stays within its ${words}-word budget`, () => {
    const text = read(file);
    const count = bodyWords(text);
    assert.ok(count <= words, `${file} is ${count} words; its budget is ${words}. Retire or shorten a rule to make room (skill-authoring § Lesson intake)`);
    if (lines) assert.ok(text.trimEnd().split("\n").length <= lines, `${file} is over its ${lines}-line budget`);
  });
}
