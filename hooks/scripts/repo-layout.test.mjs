// repo-layout — house bare-repo layout detection shared by the mechanical
// scripts (2026-09-22-scripts-not-agents § Layout).
// Run: node --test hooks/scripts/repo-layout.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isBareLayout, laneWorktreePath, mainWorktreeOf, normalizeRepoRoot } from "./repo-layout.mjs";

function makeBareLayoutRepo() {
  const root = mkdtempSync(join(tmpdir(), "repo-layout-bare-"));
  execFileSync("git", ["init", "-q", "--bare", join(root, ".bare")]);
  execFileSync("git", [
    "--git-dir",
    join(root, ".bare"),
    "worktree",
    "add",
    "-b",
    "main",
    join(root, "main"),
  ]);
  execFileSync("git", ["-C", join(root, "main"), "config", "user.email", "test@example.com"]);
  execFileSync("git", ["-C", join(root, "main"), "config", "user.name", "test"]);
  return root;
}

function makePlainCheckoutRepo() {
  const root = mkdtempSync(join(tmpdir(), "repo-layout-plain-"));
  execFileSync("git", ["init", "-q", "-b", "main", root]);
  execFileSync("git", ["-C", root, "config", "user.email", "test@example.com"]);
  execFileSync("git", ["-C", root, "config", "user.name", "test"]);
  return root;
}

test("isBareLayout is true for a .bare + main worktree layout", () => {
  const root = makeBareLayoutRepo();
  try {
    assert.equal(isBareLayout(root), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("isBareLayout is false for a plain checkout", () => {
  const root = makePlainCheckoutRepo();
  try {
    assert.equal(isBareLayout(root), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("isBareLayout is false for a plain checkout that happens to contain a dir named main", () => {
  const root = makePlainCheckoutRepo();
  mkdirSync(join(root, "main"));
  try {
    assert.equal(isBareLayout(root), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("mainWorktreeOf points at <root>/main for bare layout, at root itself for plain checkout", () => {
  const bareRoot = makeBareLayoutRepo();
  const plainRoot = makePlainCheckoutRepo();
  try {
    assert.equal(mainWorktreeOf(bareRoot), join(bareRoot, "main"));
    assert.equal(mainWorktreeOf(plainRoot), plainRoot);
  } finally {
    rmSync(bareRoot, { recursive: true, force: true });
    rmSync(plainRoot, { recursive: true, force: true });
  }
});

test("normalizeRepoRoot folds a <repo>/main entry back to the container when .bare sits beside it", () => {
  const root = makeBareLayoutRepo();
  try {
    assert.equal(normalizeRepoRoot(join(root, "main")), root);
    assert.equal(normalizeRepoRoot(root), root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("normalizeRepoRoot leaves a plain checkout's own path alone, even one named main", () => {
  const parent = mkdtempSync(join(tmpdir(), "repo-layout-parent-"));
  const root = join(parent, "main");
  execFileSync("git", ["init", "-q", "-b", "main", root]);
  try {
    assert.equal(normalizeRepoRoot(root), root);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test("laneWorktreePath is a direct child of the repo root, never nested", () => {
  assert.equal(laneWorktreePath("/repo", "chore-doer-rules-1.93.1"), "/repo/chore-doer-rules-1.93.1");
});
