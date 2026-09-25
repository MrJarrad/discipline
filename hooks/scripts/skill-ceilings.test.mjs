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
// `skill` is a folder under skills/, or an agent charter as `agents/<name>.md`.
// Agents ceiling the same way and offload into agents/references/.
const pathsFor = (skill) =>
  skill.startsWith("agents/")
    ? { doc: skill, references: join(repo, "agents", "references"), link: /\]\((references\/[A-Za-z0-9._-]+\.md)\)/g, resolve: (rel) => join(repo, "agents", rel) }
    : { doc: `skills/${skill}/SKILL.md`, references: join(repo, "skills", skill, "references"), link: /\]\((references\/[A-Za-z0-9._-]+\.md)\)/g, resolve: (rel) => join(repo, "skills", skill, rel) };

const CEILINGS = [
  // Ceiling raised 1200 -> 1250 at 1.85.0: the coverage-ledger pointer
  // (`accuracy-before-the-link`) added one rule paragraph; the rule itself lives
  // in qa-acceptance, only the pointer is here.
  { skill: "capture-figma", ceiling: 1250, before: 9578, frontmatterWords: 123 },
  // Ceiling raised 1150 -> 1200 at 1.86.0: load-order step 5 (`brief-is-the-lever`)
  // added one line naming the interrogation step; the rule itself lives in
  // dispatch-brief, only the load-order pointer is here.
  // Ceiling raised 1200 -> 1250 at 1.87.0: the doer read-back added the
  // Resume-vs-fresh exception and a baton-table row (`sonnet-default-ceiling` queue).
  // Ceiling raised 1250 -> 1350 at 1.89.0: `proportionality` added the
  // CI-once/parent-sweep hard rule and a baton-table row.
  // Ceiling raised 1350 -> 1400 at 1.92.0: `lane-progress-file` sharpened
  // (Change 4) added a 15-minute baton-table row alongside the existing
  // 30-minute one.
  // Ceiling raised 1400 -> 1450 at 1.93.0: `scripts-not-agents` added a
  // baton-table row pointing at the four mechanical scripts, offloaded to
  // references/MECHANICAL-SCRIPTS.md.
  // Ceiling raised 1450 -> 1560 at 1.95.0: `lanes-survive-interruption` added
  // a Resume-vs-fresh paragraph plus a baton-table row (stopped/interrupted
  // lanes are always fresh, never resumed) and one work-type-table row
  // pointing at the new `media-loading` skill.
  { skill: "routing", ceiling: 1560, before: 3254, frontmatterWords: 90 },
  { skill: "motion", ceiling: 1000, before: 5552, frontmatterWords: 58 },
  { skill: "wrap", ceiling: 900, before: 3115, frontmatterWords: 85 },
  // Ceiling raised 1200 -> 1250 at 1.84.0: two operator rulings each added a
  // precondition/flag line, offloaded to references/ for the elaboration.
  // Ceiling raised 1250 -> 1300 at 1.87.0: the model-ceiling justification line
  // added real content, not restated elsewhere.
  // Ceiling raised 1300 -> 1350 at 1.89.0: the progress-file line moved to its
  // own first-step bullet (`proportionality`, riding amber).
  // Ceiling raised 1350 -> 1400 at 1.91.0: the stratified-spot-check-across-
  // classes rule and the absence-rows-re-proven-by-grep line (`eight-class-ledger`).
  // Ceiling raised 1400 -> 1450 at 1.92.0: Change 2 added the ledger-vs-export-
  // JSON-node-list check line.
  // Ceiling raised 1450 -> 1500 at 1.95.0: `lanes-survive-interruption` added
  // the media-load-probe re-run evidence line (`media-loading`).
  { skill: "agents/reviewer.md", ceiling: 1500, before: 2017, frontmatterWords: 72 },
  { skill: "markup-standard", ceiling: 1200, before: 2778, frontmatterWords: 68 },
  { skill: "vault-write", ceiling: 1200, before: 2394, frontmatterWords: 38 },
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
