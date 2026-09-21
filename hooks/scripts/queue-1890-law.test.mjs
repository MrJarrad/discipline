// The 1.89.0 queue: proportionality (2026-09-21, `proportionality`) — the brief
// names a size class (line / component / system) and the class fixes gates,
// skills, evidence, screenshots and preview policy — plus two riding ambers
// closed from the 1.88.0 review.
//
// (1) size class — operator: "i'm not sure a cap is really solving the
// problem... i just really don't understand why anything should be taking
// this amount of time" / on screenshots: "a quick confirmation at the size of
// the figma designs should be pretty quick to see any issues" -> "that sounds
// good". `doer-rules.md` § Size class fixes the process per class; CI runs
// the full suite/build once per PR, never inside a lane; a lane's
// verification is one deterministic repro plus three reps; no background
// runs inside a lane; a lane stops only its own pids.
//
// (2) riding ambers — the read-back exemption said "trivial/small-fix" while
// the progress-file exemption said "trivial"; both now read "line". The
// reviewer's progress-file line sat under fail-conditions; it is now the
// reviewer's own first-step bullet.
//
// Run: node --test hooks/scripts/queue-1890-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(repo, p), "utf8");
const flat = (text) => text.replace(/\s+/g, " ");
const carries = (file, sentence) =>
  assert.ok(
    flat(read(file)).includes(flat(sentence)),
    `${file} no longer carries: ${sentence}`,
  );
const missing = (file, pattern) =>
  assert.doesNotMatch(flat(read(file)), pattern, `${file} still carries the old wording`);

// --- doer-rules.md § Size class ---------------------------------------------

test("doer-rules.md carries a Size class section naming all three classes", () => {
  const dr = flat(read("doer-rules.md"));
  assert.match(dr, /## Size class/);
  assert.match(dr, /\*\*line\*\*/);
  assert.match(dr, /\*\*component\*\*/);
  assert.match(dr, /\*\*system\*\*/);
});

test("doer-rules.md's component row names the Figma sample widths, one per width", () => {
  carries(
    "doer-rules.md",
    "one screenshot per Figma sample width (375 / 768 / 1280 / 1920), one per width, checked at a glance",
  );
  carries("doer-rules.md", "one upload per batch of lanes, not per lane");
});

test("doer-rules.md states the CI-once, lane-verification, no-background, and own-pids rules", () => {
  carries(
    "doer-rules.md",
    "Full test suite, production build and deploy checks run once per PR in CI**, never inside",
  );
  carries(
    "doer-rules.md",
    "Verification inside a lane is one deterministic repro plus three reps",
  );
  carries("doer-rules.md", "**No background runs inside a lane.**");
  carries("doer-rules.md", "**Lanes stop only their own pids**");
});

test("doer-rules.md's Size class section follows § You are the doer and precedes § Repo and safety", () => {
  const dr = read("doer-rules.md");
  const doerIdx = dr.indexOf("## You are the doer");
  const sizeIdx = dr.indexOf("## Size class");
  const repoIdx = dr.indexOf("## Repo and safety");
  assert.ok(doerIdx !== -1 && sizeIdx !== -1 && repoIdx !== -1, "all three headings present");
  assert.ok(doerIdx < sizeIdx && sizeIdx < repoIdx, "Size class must sit between You are the doer and Repo and safety");
});

// --- riding amber 1: unify the "line" exemption -----------------------------

test("the read-back and progress-file exemptions both read line, not trivial/small-fix", () => {
  carries("doer-rules.md", "First step, above line: read back before building.");
  carries("doer-rules.md", "line lanes fold the read-back into the evidence return without stopping");
  carries("doer-rules.md", "Progress is a file, not a stop.** Above line, keep a progress file");
  carries("doer-rules.md", "line lanes keep no progress file");
});

test("doer-rules.md's read-back and progress-file bullets no longer say trivial/small-fix", () => {
  missing(
    "doer-rules.md",
    /First step, above trivial\/small-fix: read back before building/,
  );
  missing("doer-rules.md", /Trivial\/small-fix lanes fold the read-back/);
});

// --- riding amber 2: reviewer's progress-file line moved to first step -----

test("agents/reviewer.md's progress-file line is a first-step bullet, not under fail-conditions", () => {
  const rv = read("agents/reviewer.md");
  const precondIdx = rv.indexOf("## Preconditions — check before reviewing anything");
  const progressIdx = rv.indexOf("First step: keep the progress file");
  assert.ok(precondIdx !== -1 && progressIdx !== -1, "both markers present");
  assert.ok(progressIdx < precondIdx, "progress-file first-step bullet must precede the Preconditions heading");
});

test("agents/reviewer.md's Preconditions block no longer opens with the progress-file line", () => {
  const rv = flat(read("agents/reviewer.md"));
  assert.doesNotMatch(
    rv,
    /Fail any and \*\*return immediately\*\*, naming it — a moving tree or a red build certifies nothing\. \*\*First:\*\* keep the progress file/,
  );
});

// --- dispatch-brief: Size field, checklist row, verification rule ----------

test("dispatch-brief's Constraints part names a Size field fixing gates/skills/evidence/screenshots/upload", () => {
  carries(
    "skills/dispatch-brief/SKILL.md",
    "**`Size:`** (`line | component | system`, `doer-rules.md` § Size class) fixing the gate set, skill count, evidence, screenshots and upload policy for the lane.",
  );
});

test("dispatch-brief's done-when states the one-repro-plus-three-reps verification rule", () => {
  carries(
    "skills/dispatch-brief/SKILL.md",
    "Verification inside a lane is one deterministic repro plus three reps",
  );
  carries("skills/dispatch-brief/SKILL.md", "a heavier sweep is its own lane, after the fix");
});

test("dispatch-brief's checklist gates the Size field", () => {
  const raw = read("skills/dispatch-brief/SKILL.md");
  assert.match(raw, /^\[ \] `Size:` named \(line \| component \| system\) and the process matches it$/m);
});

test("dispatch-brief's checklist is sixteen items", () => {
  const brief = read("skills/dispatch-brief/SKILL.md");
  const list = brief.slice(brief.indexOf("## Before you dispatch"));
  const items = list.match(/^\[ \]/gm) || [];
  assert.equal(items.length, 16, `the list is ${items.length} items; the ratified count is 16`);
});

test("dispatch-brief skill stays under its 1350-word ceiling", () => {
  const count = read("skills/dispatch-brief/SKILL.md").split(/\s+/).filter(Boolean).length;
  assert.ok(count <= 1350, `dispatch-brief is ${count} words; the ceiling is 1350`);
});

// --- INTERROGATE.md: ninth question -----------------------------------------

test("INTERROGATE.md carries a ninth question naming the size class check", () => {
  carries(
    "skills/dispatch-brief/references/INTERROGATE.md",
    "Is the size class named (`line | component | system`, `doer-rules.md` § Size class),",
  );
  carries(
    "skills/dispatch-brief/references/INTERROGATE.md",
    "and is the process the brief specifies proportionate to it?",
  );
  carries(
    "skills/dispatch-brief/references/INTERROGATE.md",
    "Answer the nine\nquestions in `dispatch-brief/references/INTERROGATE.md` § The fixed question set.",
  );
});

// --- routing: CI-once, parent sweeps servers --------------------------------

test("routing states CI runs the full suite/build once per PR and the parent sweeps servers at lane end", () => {
  carries(
    "skills/routing/SKILL.md",
    "CI runs the full suite/build once per PR, never inside each lane",
  );
  carries(
    "skills/routing/SKILL.md",
    "The parent sweeps verification servers at every lane end",
  );
});

// --- present-for-review: pixel proof at Figma sample widths ----------------

test("present-for-review scopes pixel proof to one screenshot per Figma sample width for component class", () => {
  carries(
    "skills/present-for-review/SKILL.md",
    "**component** work's pixel proof is **one screenshot per Figma sample width (375 / 768 / 1280 / 1920), checked at a glance**",
  );
});

// --- qa-acceptance: ledger depth per class ----------------------------------

test("qa-acceptance states ledger depth follows size class and line is one row", () => {
  carries(
    "skills/qa-acceptance/SKILL.md",
    "Ledger depth follows size class",
  );
  carries("skills/qa-acceptance/SKILL.md", "**line** — one row, no ledger");
});

// --- R2 fix round: "trivial/small-fix" retired repo-wide -------------------

test("the retired term \"trivial/small-fix\" is absent from every live doc (CHANGED.txt history exempt)", () => {
  const files = [
    "doer-rules.md",
    "agents/engineer.md",
    "agents/researcher.md",
    "agents/ux-designer.md",
    "agents/reviewer.md",
    "skills/dispatch-brief/SKILL.md",
    "skills/dispatch-brief/references/INTERROGATE.md",
    "skills/routing/SKILL.md",
    "skills/present-for-review/SKILL.md",
    "skills/qa-acceptance/SKILL.md",
    "hooks/scripts/queue-1860-law.test.mjs",
    "hooks/scripts/queue-1870-law.test.mjs",
  ];
  for (const file of files) {
    assert.doesNotMatch(
      read(file),
      /trivial\/small-fix/,
      `${file} still carries the retired term "trivial/small-fix"`,
    );
  }
});

test("agents/engineer.md, researcher.md, ux-designer.md name line as the first-step threshold", () => {
  carries("agents/engineer.md", "First step, above line:** return `## Read-back`");
  carries("agents/researcher.md", "First step, above line:** return `## Read-back`");
  carries("agents/ux-designer.md", "First step, above line:** return `## Read-back`");
});

test("dispatch-brief and INTERROGATE.md name line, not trivial/small-fix, at the interrogation gate", () => {
  carries(
    "skills/dispatch-brief/SKILL.md",
    "Above line, the brief is read as the doer would and answered against a fixed",
  );
  carries(
    "skills/dispatch-brief/references/INTERROGATE.md",
    "Before any dispatch above line,",
  );
  carries(
    "skills/dispatch-brief/references/INTERROGATE.md",
    "**Above line:** a read-only `haiku` agent, findings only, never `Agent`s further.",
  );
});

// --- R2 fix round: component/system both keep read-back + progress file ----

test("doer-rules.md states component and system both keep the read-back stop and the progress file", () => {
  carries(
    "doer-rules.md",
    "**component and system both keep the read-back stop and\nthe progress file** — line is the only class exempt from either.",
  );
});

// --- R2 fix round: standalone component lane upload timing -----------------

test("doer-rules.md states a standalone component lane uploads at done, unless the brief names a batch", () => {
  carries(
    "doer-rules.md",
    "A standalone component lane uploads at done, unless the brief names a batch",
  );
});
