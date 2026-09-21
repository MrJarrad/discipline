// The 1.91.0 queue: the coverage ledger has eight row classes; reviewer
// sampling is stratified across classes; worktree removal is fenced
// (operator ruling 2026-09-21, `eight-class-ledger`: "i'm trying to
// understand why so much stuff is getting missed or not updated" — "is
// there anything else we're missing?" -> "yes to both"; lesson
// `never-remove-a-worktree-by-pattern`: a pattern-matched `git worktree
// remove --force` deleted four `main` trees).
//
// Run: node --test hooks/scripts/queue-1910-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { worktreesToRemove, parseWorktreePorcelain } from "./lane-sweep.mjs";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(repo, p), "utf8");
const flat = (text) => text.replace(/\s+/g, " ");

const EIGHT_CLASSES = [
  "Geometry and placement",
  "Tokens",
  "Copy",
  "Links and targets",
  "States, variants and prototype flows",
  "Behaviour annotations",
  "Semantics and a11y hints",
  "Absence",
];

// --- qa-acceptance: eight classes + mode column -----------------------------

test("qa-acceptance/SKILL.md names all eight row classes", () => {
  const doc = flat(read("skills/qa-acceptance/SKILL.md"));
  for (const cls of EIGHT_CLASSES) {
    assert.ok(doc.includes(cls), `qa-acceptance/SKILL.md missing row class: ${cls}`);
  }
  assert.match(doc, /each present with its rows, or marked "none in scope\."/);
});

test("qa-acceptance/SKILL.md's ledger row shape carries a mode column", () => {
  const doc = read("skills/qa-acceptance/SKILL.md");
  assert.match(doc, /\| item \| source ref \| built at `file:line` \| measured value \| mode \| status \|/);
  assert.match(doc, /Tokens carry a `mode` column/);
});

// --- handoff-to-code overlay: each class specialised for an export ---------

test("handoff-to-code coverage-ledger.md specialises all eight classes for an export", () => {
  const doc = flat(read("skills/handoff-to-code/references/coverage-ledger.md"));
  for (const cls of EIGHT_CLASSES) {
    assert.ok(doc.includes(cls), `coverage-ledger.md missing row class: ${cls}`);
  }
  assert.match(doc, /block export \*\*and\*\*\s*its layout examples, export vs\s*built, \*\*per route\*\*/);
  assert.match(
    doc,
    /every node id present in the\s*prior export and \*\*absent\*\* in the new one, sourced from the changelog/,
  );
  assert.match(doc, /\*\*one row per Interaction\/Development note\*\*/);
});

// --- reviewer.md: stratified spot check -------------------------------------

test("agents/reviewer.md samples the coverage ledger across classes, not from one", () => {
  const doc = flat(read("agents/reviewer.md"));
  assert.match(doc, /stratified across the eight row classes, never sampled from one/);
  assert.match(doc, /Absence rows are re-proven by grep/);
});

// --- doer-rules.md + CLOSING-CHECKS.md: the worktree fence ------------------

test("doer-rules.md § Repo and safety carries the worktree fence", () => {
  const doc = flat(read("doer-rules.md"));
  assert.match(doc, /git worktree add worktrees\/<name> -b <branch>/);
  assert.match(doc, /never\*\* checks a branch out inside `main`/);
  assert.match(
    doc,
    /never a grep\/pattern over the list, and `main` \(or any path\s*not under `worktrees\/`\) is never a removal target/,
  );
  const repoIdx = doc.indexOf("## Repo and safety");
  const evidenceIdx = doc.indexOf("## Fixed evidence return");
  const fenceIdx = doc.indexOf("**Worktrees (bare-layout repos).**");
  assert.ok(
    fenceIdx > repoIdx && fenceIdx < evidenceIdx,
    "the worktree fence must sit inside § Repo and safety",
  );
});

test("wrap's CLOSING-CHECKS.md § Repo topology names the worktree fence", () => {
  const doc = flat(read("skills/wrap/references/CLOSING-CHECKS.md"));
  assert.match(doc, /The worktree fence/);
  assert.match(doc, /lane-sweep\.mjs --worktrees <repo>/);
  assert.match(doc, /`main` is never a removal target/);
  const topoIdx = doc.indexOf("## Repo topology at wrap");
  const versionIdx = doc.indexOf("## Version sync");
  const fenceIdx = doc.indexOf("**The worktree fence.**");
  assert.ok(
    fenceIdx > topoIdx && fenceIdx < versionIdx,
    "the worktree fence must sit inside § Repo topology",
  );
});

// --- lane-sweep.mjs --worktrees: unit-tested against a fake worktree list --

test("a worktree under worktrees/ with a merged branch is removed", () => {
  const worktrees = [
    { path: "/repo/main", branch: "main" },
    { path: "/repo/worktrees/fix-abc-topic", branch: "fix/abc-topic" },
  ];
  const merged = ["fix/abc-topic"];
  const result = worktreesToRemove("/repo", worktrees, merged);
  assert.equal(result.length, 1);
  assert.equal(result[0].path, "/repo/worktrees/fix-abc-topic");
});

test("main is never a removal target, even if its branch name matched merged", () => {
  const worktrees = [{ path: "/repo/main", branch: "main" }];
  const result = worktreesToRemove("/repo", worktrees, ["main"]);
  assert.equal(result.length, 0);
});

test("a path outside worktrees/ (release clone, mirror) is never a target", () => {
  const worktrees = [
    { path: "/repo/release-1.90.0", branch: "release/1.90.0" },
    { path: "/repo/conformance-hidden", branch: "feat/conformance-hidden" },
  ];
  const merged = ["release/1.90.0", "feat/conformance-hidden"];
  const result = worktreesToRemove("/repo", worktrees, merged);
  assert.equal(result.length, 0);
});

test("a worktree under worktrees/ with an unmerged branch is not removed", () => {
  const worktrees = [{ path: "/repo/worktrees/fix-abc-topic", branch: "fix/abc-topic" }];
  const result = worktreesToRemove("/repo", worktrees, []);
  assert.equal(result.length, 0);
});

test("a worktree with no resolved branch (detached HEAD) is never removed", () => {
  const worktrees = [{ path: "/repo/worktrees/detached-abc", branch: null }];
  const result = worktreesToRemove("/repo", worktrees, []);
  assert.equal(result.length, 0);
});

test("a grep-style pattern match on the list is not how targets are chosen — only exact path containment under worktrees/ counts", () => {
  // A path that merely starts with the string "worktrees" but isn't actually
  // under the repo's worktrees/ directory (e.g. a sibling dir with a similar
  // name) must never be swept.
  const worktrees = [{ path: "/repo/worktrees-archive/old-fix", branch: "fix/old" }];
  const result = worktreesToRemove("/repo", worktrees, ["fix/old"]);
  assert.equal(result.length, 0);
});

test("parseWorktreePorcelain reads path + branch pairs from git worktree list --porcelain", () => {
  const text = [
    "worktree /repo/main",
    "HEAD abc123",
    "branch refs/heads/main",
    "",
    "worktree /repo/worktrees/fix-abc-topic",
    "HEAD def456",
    "branch refs/heads/fix/abc-topic",
    "",
  ].join("\n");
  const entries = parseWorktreePorcelain(text);
  assert.deepEqual(entries, [
    { path: "/repo/main", branch: "main" },
    { path: "/repo/worktrees/fix-abc-topic", branch: "fix/abc-topic" },
  ]);
});

test("lane-sweep.mjs supports --worktrees on the CLI surface", () => {
  const script = read("hooks/scripts/lane-sweep.mjs");
  assert.match(script, /--worktrees/);
  assert.match(script, /worktreesToRemove/);
});
