// repo-layout — house bare-repo layout detection shared by the mechanical
// scripts (2026-09-22-scripts-not-agents § Layout).
// Run: node --test hooks/scripts/repo-layout.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  isBareLayout,
  laneWorktreePath,
  mainWorktreeOf,
  normalizeRepoRoot,
  ownerRepoFromOrigin,
  ownerRepoFromUrl,
} from "./repo-layout.mjs";

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

// --- ownerRepoFromUrl / ownerRepoFromOrigin (2026-09-22-scripts-not-agents
// § gh invocation) — `gh --repo` only ever accepts `[HOST/]OWNER/REPO`,
// never a filesystem path. ------------------------------------------------

test("ownerRepoFromUrl reads owner/repo from an https github.com remote", () => {
  assert.equal(ownerRepoFromUrl("https://github.com/jhd/discipline.git"), "jhd/discipline");
  assert.equal(ownerRepoFromUrl("https://github.com/jhd/discipline"), "jhd/discipline");
});

test("ownerRepoFromUrl reads owner/repo from an ssh github.com remote", () => {
  assert.equal(ownerRepoFromUrl("git@github.com:jhd/discipline.git"), "jhd/discipline");
  assert.equal(ownerRepoFromUrl("git@github.com:jhd/discipline"), "jhd/discipline");
});

test("ownerRepoFromUrl is null for a non-github.com remote", () => {
  assert.equal(ownerRepoFromUrl("/Users/jarrad.harvey/JHD/jhd-design-system/main"), null);
  assert.equal(ownerRepoFromUrl("https://gitlab.com/jhd/discipline.git"), null);
});

test("ownerRepoFromOrigin reads owner/repo off a checkout's own origin remote", () => {
  const root = makePlainCheckoutRepo();
  try {
    execFileSync("git", ["-C", root, "remote", "add", "origin", "https://github.com/jhd/discipline.git"]);
    assert.equal(ownerRepoFromOrigin(root), "jhd/discipline");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("ownerRepoFromOrigin is null when origin is a filesystem path, not a github.com remote", () => {
  const root = makePlainCheckoutRepo();
  const otherRoot = makePlainCheckoutRepo();
  try {
    execFileSync("git", ["-C", root, "remote", "add", "origin", otherRoot]);
    assert.equal(ownerRepoFromOrigin(root), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(otherRoot, { recursive: true, force: true });
  }
});

test("ownerRepoFromOrigin is null when there is no origin remote at all", () => {
  const root = makePlainCheckoutRepo();
  try {
    assert.equal(ownerRepoFromOrigin(root), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
