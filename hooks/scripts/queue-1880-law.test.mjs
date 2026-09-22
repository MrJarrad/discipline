// The 1.88.0 queue: lane progress files (2026-09-21, `lane-progress-file`) and
// the release gate scoped to the rulings a release names.
//
// (1) lane-progress-file — "can we update discipline so progress isn't so
// blind?" -> "Yes". Every lane above trivial keeps a progress file at the
// path the brief names (default `<lane evidence dir>/progress.md`). The doer
// appends one timestamped line at each fixed milestone: read-back returned ·
// red test written · cause found · green · gates green · uploaded/pushed. The
// parent reads the file on any operator status ask. Time cap: no new
// milestone for 30 minutes -> the parent stops the lane and re-briefs a fresh
// agent from the last recorded milestone. Milestones never replace the
// evidence return.
//
// (2) release-gate scoping — hooks/scripts/lesson-ledger.mjs refused a
// version bump while ANY fleet/rulings/*.md in the vault was `queued`,
// including rulings from unrelated sessions. Scoped: a release commit is
// refused only if a ruling CHANGED.txt's top entry names (`[[stem]]` or a
// `fleet/rulings/<stem>.md` path) is still `queued`; other queued rulings are
// a warning, never a refusal. The ledger lint itself (lintLessonLedger) is
// unchanged in its unscoped default; the scoping is additive via
// `namedRulings`, wired in commit-gate.mjs.
//
// Run: node --test hooks/scripts/queue-1880-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { lintLessonLedger, namedRulingsFromChangedEntry, topChangedEntry } from "./lesson-ledger.mjs";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(repo, p), "utf8");
const flat = (text) => text.replace(/\s+/g, " ");
const carries = (file, sentence) =>
  assert.ok(
    flat(read(file)).includes(flat(sentence)),
    `${file} no longer carries: ${sentence}`,
  );

// --- lane progress files: fixed milestones, doer-rules.md ------------------

test("doer-rules.md § You are the doer states the progress file, default path, and the six milestones", () => {
  const dr = flat(read("doer-rules.md"));
  // 1.92.0 Change 4: "Progress is a file, not a stop" -> "Progress is a file, with a clock".
  assert.match(dr, /Progress is a file, with a clock/);
  assert.match(dr, /`<lane evidence dir>\/progress\.md`/);
  assert.match(dr, /read-back returned.*red test written.*cause found.*green.*gates green.*uploaded\/pushed/);
  assert.match(dr, /never replaces the fixed evidence return/);
});

test("doer-rules.md places the progress-file rule after the read-back step", () => {
  const dr = read("doer-rules.md");
  const readBackIdx = dr.indexOf("read back before building");
  const progressIdx = dr.indexOf("Progress is a file, with a clock");
  assert.ok(readBackIdx !== -1 && progressIdx !== -1, "both clauses present");
  assert.ok(progressIdx > readBackIdx, "progress-file rule must follow the read-back step");
});

test("doer-rules.md states the 30-minute no-milestone cap", () => {
  // 1.92.0 Change 4: sharpened into a two-stage clock (15-minute worktree
  // read, 30-minute stop); the 30-minute phrase now sits mid-sentence.
  carries("doer-rules.md", "no new milestone for 30 minutes");
  carries("doer-rules.md", "the parent stops the lane and re-briefs a fresh agent from the last recorded milestone");
});

// --- dispatch-brief: the ## Progress path field -----------------------------

test("dispatch-brief's four-part brief carries a ## Progress path field", () => {
  const db = flat(read("skills/dispatch-brief/SKILL.md"));
  assert.match(db, /\*\*`## Progress`\*\* — the progress-file path/);
  assert.match(db, /Default `<lane evidence dir>\/progress\.md`/);
});

test("dispatch-brief's checklist gains the ## Progress row", () => {
  carries("skills/dispatch-brief/SKILL.md", "[ ] `## Progress` path named (above line)");
});

// --- routing: the 30-minute cap and the stop + re-brief baton row ----------

test("routing's baton table carries the progress-file-silent stop + fresh re-brief row", () => {
  const routing = flat(read("skills/routing/SKILL.md"));
  assert.match(routing, /Progress file silent 30 minutes/);
  assert.match(routing, /Parent stops the lane/);
  assert.match(routing, /re-briefed from the last recorded milestone/);
});

// --- output-styles/discipline.md: "How are we looking?" reads the file -----

test("discipline.md's How are we looking answer reads the progress file", () => {
  carries(
    "output-styles/discipline.md",
    "reading the running lane's progress file",
  );
  carries("output-styles/discipline.md", "for its last milestone rather than guessing or");
});

// --- agent first-step lines carry the progress-file instruction ------------

test("every doer agent file's first-step lines name the progress file at ## Progress", () => {
  for (const file of [
    "agents/engineer.md",
    "agents/ux-designer.md",
    "agents/researcher.md",
    "agents/reviewer.md",
  ]) {
    const doc = flat(read(file));
    assert.match(
      doc,
      /keep the progress file\*{0,2} at (the brief's )?`## Progress`/i,
      `${file} missing the progress-file first-step line`,
    );
  }
});

// --- release gate: scoped to the rulings CHANGED.txt's top entry names -----

test("lintLessonLedger stays unscoped by default — every queued ruling still blocks a release", () => {
  const root = mkdtempSync(join(tmpdir(), "queue-1880-ledger-"));
  try {
    mkdirSync(join(root, "fleet", "rulings"), { recursive: true });
    writeFileSync(join(root, "fleet", "rulings", "unrelated.md"), "---\nname: fixture\nencoded: queued\n---\n\nbody\n");
    const result = lintLessonLedger(root, { release: "1.88.0" });
    assert.equal(result.ok, false, "the ledger lint's own contract is unchanged");
    assert.equal(result.queued.length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("gate scoping: a fixture vault with one queued unrelated ruling passes when it is not named", () => {
  const root = mkdtempSync(join(tmpdir(), "queue-1880-ledger-"));
  try {
    mkdirSync(join(root, "fleet", "rulings"), { recursive: true });
    writeFileSync(
      join(root, "fleet", "rulings", "2026-09-19-unrelated-topic.md"),
      "---\nname: fixture\nencoded: queued\n---\n\nbody\n",
    );
    const changedTop = "1.88.0 — ships [[2026-09-21-lane-progress-file]] only.";
    const named = namedRulingsFromChangedEntry(topChangedEntry(changedTop));
    const result = lintLessonLedger(root, { release: "1.88.0", namedRulings: named });
    assert.equal(result.ok, true, "an unrelated queued ruling is a warning, not a refusal");
    assert.equal(result.queued.length, 0);
    assert.equal(result.queuedWarning.length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("gate scoping: a fixture vault with one queued NAMED ruling fails", () => {
  const root = mkdtempSync(join(tmpdir(), "queue-1880-ledger-"));
  try {
    mkdirSync(join(root, "fleet", "rulings"), { recursive: true });
    writeFileSync(
      join(root, "fleet", "rulings", "2026-09-21-lane-progress-file.md"),
      "---\nname: fixture\nencoded: queued\n---\n\nbody\n",
    );
    const changedTop = "1.88.0 — ships [[2026-09-21-lane-progress-file]] only.";
    const named = namedRulingsFromChangedEntry(topChangedEntry(changedTop));
    const result = lintLessonLedger(root, { release: "1.88.0", namedRulings: named });
    assert.equal(result.ok, false, "the named ruling still blocks the release");
    assert.equal(result.queued.length, 1);
    assert.match(result.queued[0].file, /2026-09-21-lane-progress-file\.md$/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("commit-gate.mjs wires CHANGED.txt's top entry into the ledger gate via namedRulings", () => {
  const gate = flat(read("hooks/bin/commit-gate.mjs"));
  assert.match(gate, /namedRulingsFromChangedEntry/);
  assert.match(gate, /topChangedEntry/);
  assert.match(gate, /namedRulings/);
});

// --- version bump -------------------------------------------------------------

test("plugin.json and marketplace.json carry one matching semver, at or past 1.88.0", () => {
  const plugin = JSON.parse(read(".claude-plugin/plugin.json"));
  const marketplace = JSON.parse(read(".claude-plugin/marketplace.json"));
  const semver = /^\d+\.\d+\.\d+$/;
  assert.match(plugin.version, semver);
  assert.equal(plugin.version, marketplace.plugins[0].version);
  const [major, minor] = plugin.version.split(".").map(Number);
  assert.ok(major > 1 || (major === 1 && minor >= 88), `${plugin.version} regressed before 1.88.0`);
});
