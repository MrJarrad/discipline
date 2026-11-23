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
  { skill: "capture-figma", ceiling: 1324, before: 9578 },
  { skill: "routing", ceiling: 1492, before: 3254 },
  { skill: "motion", ceiling: 1040, before: 5552 },
  { skill: "wrap", ceiling: 1031, before: 3115 },
  { skill: "agents/reviewer.md", ceiling: 1814, before: 2017 },
  { skill: "markup-standard", ceiling: 1200, before: 2778 },
  { skill: "vault-write", ceiling: 1236, before: 2394 },
  { skill: "banana", ceiling: 1200, before: 2273 },
  { skill: "nextjs", ceiling: 1200, before: 2082 },
  { skill: "prompt-craft", ceiling: 1200, before: 1811 },
  { skill: "issue-triage", ceiling: 1200, before: 1693 },
  { skill: "handoff-to-code", ceiling: 1500, before: 4122 }, // byte copy of handoff-css: trimmed there, re-vendored here
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

// Ratchet ceilings: every body held at its measured size, none over 1,500 words (DISC-351 s8 moved the
// branch-only sections into each skill's references/). A new rule fits by retiring one.
const RATCHETS = [
  { skill: "capture-website", ceiling: 1455 },
  { skill: "media-loading", ceiling: 1392 },
  { skill: "model-routing", ceiling: 1448 },
  { skill: "present-for-review", ceiling: 1188 },
  { skill: "release-deploy", ceiling: 1456 },
  { skill: "qa-acceptance", ceiling: 1441 },
  { skill: "cloud-dispatch", ceiling: 1315 },
  { skill: "grilling", ceiling: 1420 },
  { skill: "webapp-testing", ceiling: 1337 },
  { skill: "dispatch-brief", ceiling: 1372 },
  { skill: "diagnosing-bugs", ceiling: 1320 },
  { skill: "brand-voice", ceiling: 1412 },
];

for (const { skill, ceiling } of RATCHETS) {
  test(`${skill} stays under its ${ceiling}-word ratchet ceiling`, () => {
    const doc = `skills/${skill}/SKILL.md`;
    const count = bodyWords(read(doc));
    assert.ok(count <= ceiling, `${doc} body is ${count} words; the ratchet ceiling is ${ceiling} — fit a new rule by retiring one`);
  });
}

// The description is the trigger surface. Claude Code lists skills in a character budget of 1% of the
// context window and, when the list overflows, "drops descriptions starting with the skills you invoke
// least" (https://code.claude.com/docs/en/skills; DISC-351 finding 6), so a dropped skill has no trigger
// words in context at all. The budget is shared with every other installed plugin, so no number here can
// promise nothing is dropped: these checks hold this plugin's share small and keep the words that make
// each skill fire, so length is never bought out of the trigger.
export const DESCRIPTION_CHARS = 300;
// This plugin's listing lines (`- discipline:<name>: <description>`), held at measured size: only shrinks.
export const LISTING_CHARS = 11787;

// skill (or agents/<name>.md) -> phrases that must survive in its description, case-insensitive.
export const TRIGGER_PHRASES = {
  "agent-ops": ["skill", "agent charter", "eval gate"],
  "architect-systems": ["services, packages or modules", "dependency cycle"],
  "audit-build": ["the blocks are off", "visual sign-off", "diagnosing-bugs"],
  "banana": ["generate an image", "design a logo"],
  "brand-voice": ["page titles", "microcopy", "error messages"],
  "capture-figma": ["match the figma", "figma.com"],
  "capture-motion-source": ["Jitter", "Lottie", "animation"],
  "capture-website": ["look at this site", "design reference", "capture-figma"],
  "cloud-dispatch": ["Claude cloud", "helper session"],
  "code-minimalism": ["abstraction", "more code than the task needs"],
  "define-terms": ["two words name one idea", "just to be clear", "which part do you mean", "feedback row naming a part"],
  "design-craft": ["make it look right", "polish this UI"],
  "design-modules": ["how should we structure this", "where does this logic live", "interface"],
  "design-review": ["review the experience", "user-test this"],
  "design-system": ["JHD web UI", "tokens"],
  "diagnosing-bugs": ["still broken", "intermittent", "flickers", "audit-build"],
  "discover-scope": ["new concept", "I'd like to explore"],
  "dispatch-brief": ["dispatch prompt"],
  "doc-formats": ["SCOPE", "DOCUMENTATION"],
  "grilling": ["grill this", "acceptance criteria"],
  "handoff-to-code": ["design-system-handoff.json", "Figma link to export", "consume or build from the handoff", "export says", "brownfield"],
  "issue-triage": ["there are discrepancies", "I noticed some issues"],
  "markup-standard": ["HTML", "alt text"],
  "media-loading": ["images or video", "blank"],
  "model-routing": ["model", "effort"],
  "motion": ["animation feels off", "easing"],
  "new-product": ["new app in the fleet"],
  "nextjs": ["Next.js", "App Router"],
  "ops-inbox": ["what's on my plate", "draft my standup"],
  "pause-resume": ["pause", "pick up where we left off"],
  "present-for-review": ["preview link", "send him the link", "present it"],
  "prompt-craft": ["task prompt", "brief"],
  "prototype": ["quick concept", "throwaway"],
  "qa-acceptance": ["acceptance criterion", "ready to ship"],
  "quality": ["done", "good enough to ship"],
  "release-deploy": ["deploying", "rollback"],
  "research-synthesis": ["research", "compare A vs B"],
  "routing": ["session start", "who handles it"],
  "shape-stress": ["is the plan ready", "stress-testing"],
  "skill-authoring": ["editing a skill", "fails to fire"],
  "skill-review": ["adopt", "worth installing"],
  "summarise-meeting": ["meeting transcript"],
  "test-first": ["TDD", "failing test"],
  "vault-recall": ["vault", "earlier decisions"],
  "vault-write": ["vault", "decision", "ruling"],
  "verify-finding": ["does X exist", "what calls Y"],
  "webapp-testing": ["Playwright", "screenshot"],
  "wrap": ["ending an orchestration session", "hand over"],
  "agents/reviewer.md": ["ready to merge", "check before shipping"],
  "agents/ux-designer.md": ["match the figma", "discrepancies", "animation feels off"],
};

// The frontmatter `description:` value, plain, quoted or folded, as one line of text.
export const descriptionOf = (text) => {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(text);
  if (!fm) return null;
  const lines = fm[1].split(/\r?\n/);
  const i = lines.findIndex((l) => /^description:/.test(l));
  if (i === -1) return null;
  let value = lines[i].replace(/^description:\s*/, "");
  if (/^[>|][-+]?$/.test(value)) {
    const block = [];
    for (const l of lines.slice(i + 1)) {
      if (!/^\s+\S/.test(l)) break;
      block.push(l.trim());
    }
    value = block.join(" ");
  } else if (value.startsWith('"')) {
    value = JSON.parse(value);
  } else if (value.startsWith("'")) {
    value = value.slice(1, -1).replace(/''/g, "'");
  }
  return value.replace(/\s+/g, " ").trim();
};

const skillDocs = () =>
  readdirSync(join(repo, "skills"))
    .filter((n) => existsSync(join(repo, "skills", n, "SKILL.md")))
    .map((n) => ({ key: n, doc: `skills/${n}/SKILL.md` }));
const agentDocs = () =>
  readdirSync(join(repo, "agents"))
    .filter((f) => f.endsWith(".md"))
    .map((f) => ({ key: `agents/${f}`, doc: `agents/${f}` }));

test(`every skill and agent description fits in ${DESCRIPTION_CHARS} characters`, () => {
  const over = [...skillDocs(), ...agentDocs()]
    .map(({ key, doc }) => ({ key, length: (descriptionOf(read(doc)) ?? "").length }))
    .filter(({ length }) => length > DESCRIPTION_CHARS);
  assert.deepEqual(over, [], `descriptions over ${DESCRIPTION_CHARS} characters`);
});

test(`the plugin's skill listing stays within ${LISTING_CHARS} characters`, () => {
  // One listing line per skill, as Claude Code prints it: prefix, name, description, newline.
  const total = skillDocs().reduce((sum, { key, doc }) => sum + `- discipline:${key}: ${descriptionOf(read(doc)) ?? ""}`.length + 1, 0);
  assert.ok(total <= LISTING_CHARS, `the plugin's listing lines total ${total} characters; its share is ${LISTING_CHARS}`);
});

test("every skill and agent keeps its pinned trigger phrases", () => {
  const docs = [...skillDocs(), ...agentDocs()];
  const unpinned = docs.filter(({ key }) => !TRIGGER_PHRASES[key] && !["agents/engineer.md", "agents/researcher.md", "agents/releaseops.md", "agents/project-manager.md"].includes(key)).map(({ key }) => key);
  assert.deepEqual(unpinned, [], "every skill and the two routing-contested agents carry a trigger-phrase pin");
  const lost = [];
  for (const { key, doc } of docs) {
    const description = (descriptionOf(read(doc)) ?? "").toLowerCase();
    for (const phrase of TRIGGER_PHRASES[key] ?? []) {
      if (!description.includes(phrase.toLowerCase())) lost.push(`${key}: "${phrase}"`);
    }
  }
  assert.deepEqual(lost, [], "trigger phrases missing from their descriptions");
});

// Built-in CLI commands (/compact, /context, …) are not skills and the model cannot run them,
// so an always-read instruction to run one is dead text.
test("no always-read file instructs a built-in slash command", () => {
  const builtins = /(^|[\s(`'"])\/(compact|context|rewind|usage|memory|todos|tasks|subtask|plan|clear)\b/m;
  const files = ["output-styles/discipline.md", "doer-rules.md", "skills/routing/SKILL.md", ...agentDocs().map(({ doc }) => doc)];
  const hits = files.filter((f) => builtins.test(read(f)));
  assert.deepEqual(hits, [], "always-read files naming a built-in command");
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

// Finding 7 (DISC-351): after a context summary each skill is re-attached with only its first 5,000 tokens,
// so no body may outgrow that. 1,500 words is about 2,000 tokens, leaving room for the frontmatter.
test("no skill body is over 1,500 words", () => {
  const over = readdirSync(join(repo, "skills"))
    .filter((n) => existsSync(join(repo, "skills", n, "SKILL.md")))
    .map((n) => ({ skill: n, words: bodyWords(read(`skills/${n}/SKILL.md`)) }))
    .filter(({ words }) => words > 1500);
  assert.deepEqual(over, [], "skill bodies over 1,500 words");
});
