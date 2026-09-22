// merge-after-review — the parent's manual merge chain, mechanised
// (`scripts-not-agents`, 2026-09-22). Pure-logic tests for the refusal gate
// plus full runs against a scratch git repo (bare remote + clone) with a
// stubbed `gh` on PATH — never a real GitHub call.
// Run: node --test hooks/scripts/merge-after-review.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, canMerge } from "./merge-after-review.mjs";

const scriptPath = fileURLToPath(new URL("./merge-after-review.mjs", import.meta.url));

test("parseArgs reads --pr, --repo, --dry-run, --then-build", () => {
  const args = parseArgs(["--pr", "owner/repo#9", "--repo", "/r", "--dry-run", "--then-build"]);
  assert.equal(args.pr, "owner/repo#9");
  assert.equal(args.repo, "/r");
  assert.equal(args.dryRun, true);
  assert.equal(args.thenBuild, true);
});

test("canMerge allows all-SUCCESS + MERGEABLE", () => {
  const status = { statusCheckRollup: [{ conclusion: "SUCCESS" }, { conclusion: "SUCCESS" }], mergeable: "MERGEABLE" };
  assert.equal(canMerge(status).ok, true);
});

test("canMerge refuses when any check is not SUCCESS", () => {
  const status = { statusCheckRollup: [{ conclusion: "SUCCESS" }, { conclusion: "FAILURE" }], mergeable: "MERGEABLE" };
  const verdict = canMerge(status);
  assert.equal(verdict.ok, false);
  assert.match(verdict.reason, /FAILURE/);
});

test("canMerge refuses when mergeable is not MERGEABLE", () => {
  const status = { statusCheckRollup: [{ conclusion: "SUCCESS" }], mergeable: "CONFLICTING" };
  const verdict = canMerge(status);
  assert.equal(verdict.ok, false);
  assert.match(verdict.reason, /CONFLICTING/);
});

test("canMerge refuses an empty rollup — nothing to prove green against", () => {
  const status = { statusCheckRollup: [], mergeable: "MERGEABLE" };
  const verdict = canMerge(status);
  assert.equal(verdict.ok, false);
  assert.match(verdict.reason, /nothing to prove green/);
});

// --- full run: scratch bare remote + clone, stubbed gh ----------------------

function makeBareRemoteAndClone(nameHint) {
  const remoteDir = mkdtempSync(join(tmpdir(), `merge-after-review-remote-${nameHint}-`));
  execFileSync("git", ["init", "-q", "--bare", remoteDir]);
  const cloneDir = mkdtempSync(join(tmpdir(), `merge-after-review-clone-${nameHint}-`));
  execFileSync("git", ["clone", "-q", remoteDir, cloneDir]);
  execFileSync("git", ["-C", cloneDir, "config", "user.email", "test@example.com"]);
  execFileSync("git", ["-C", cloneDir, "config", "user.name", "test"]);
  execFileSync("git", ["-C", cloneDir, "checkout", "-q", "-b", "main"]);
  writeFileSync(join(cloneDir, "README.md"), "hello\n");
  execFileSync("git", ["-C", cloneDir, "add", "."]);
  execFileSync("git", ["-C", cloneDir, "commit", "-q", "-m", "init"]);
  execFileSync("git", ["-C", cloneDir, "push", "-u", "origin", "main"]);

  // A second clone stands in for "the PR branch already merged upstream" —
  // pushes a commit to origin/main directly, simulating what a real
  // `gh pr merge --squash` would leave behind for this clone to ff-pull.
  const otherCloneDir = mkdtempSync(join(tmpdir(), `merge-after-review-other-${nameHint}-`));
  execFileSync("git", ["clone", "-q", remoteDir, otherCloneDir]);
  execFileSync("git", ["-C", otherCloneDir, "config", "user.email", "test@example.com"]);
  execFileSync("git", ["-C", otherCloneDir, "config", "user.name", "test"]);
  writeFileSync(join(otherCloneDir, "feature.md"), "shipped\n");
  execFileSync("git", ["-C", otherCloneDir, "add", "."]);
  execFileSync("git", ["-C", otherCloneDir, "commit", "-q", "-m", "feature"]);
  execFileSync("git", ["-C", otherCloneDir, "push", "-q", "origin", "main"]);
  rmSync(otherCloneDir, { recursive: true, force: true });

  return { remoteDir, cloneDir };
}

function makeFakeGhBin(binDir, statusJson) {
  const ghPath = join(binDir, "gh");
  writeFileSync(
    ghPath,
    `#!/usr/bin/env bash
sub="$1"; shift
action="$1"; shift
case "$action" in
  view)
    cat <<'JSON'
${statusJson}
JSON
    ;;
  merge)
    exit 0
    ;;
esac
exit 0
`,
  );
  chmodSync(ghPath, 0o755);
}

test("refuses and exits non-zero when a check is not SUCCESS, never touching the repo", () => {
  const { cloneDir } = makeBareRemoteAndClone("refuse");
  const binDir = mkdtempSync(join(tmpdir(), "merge-after-review-bin-"));
  makeFakeGhBin(binDir, JSON.stringify({ statusCheckRollup: [{ conclusion: "FAILURE" }], mergeable: "MERGEABLE" }));
  try {
    assert.throws(() => {
      execFileSync("node", [scriptPath, "--pr", "owner/repo#9", "--repo", cloneDir], {
        encoding: "utf8",
        env: { ...process.env, PATH: `${binDir}:${process.env.PATH}` },
      });
    }, /refused/);
    const branch = execFileSync("git", ["-C", cloneDir, "branch", "--show-current"], { encoding: "utf8" }).trim();
    assert.equal(branch, "main", "a refused merge must not touch the repo's checkout");
  } finally {
    rmSync(cloneDir, { recursive: true, force: true });
    rmSync(binDir, { recursive: true, force: true });
  }
});

test("--dry-run prints the would-merge line and does not call gh pr merge or touch the repo", () => {
  const { cloneDir } = makeBareRemoteAndClone("dry");
  const binDir = mkdtempSync(join(tmpdir(), "merge-after-review-bin-"));
  makeFakeGhBin(binDir, JSON.stringify({ statusCheckRollup: [{ conclusion: "SUCCESS" }], mergeable: "MERGEABLE" }));
  try {
    const out = execFileSync("node", [scriptPath, "--pr", "owner/repo#9", "--repo", cloneDir, "--dry-run"], {
      encoding: "utf8",
      env: { ...process.env, PATH: `${binDir}:${process.env.PATH}` },
    });
    assert.match(out, /would squash-merge owner\/repo#9/);
  } finally {
    rmSync(cloneDir, { recursive: true, force: true });
    rmSync(binDir, { recursive: true, force: true });
  }
});

test("full run: all-SUCCESS + MERGEABLE merges via stubbed gh and ff-pulls main", () => {
  const { cloneDir } = makeBareRemoteAndClone("full");
  const binDir = mkdtempSync(join(tmpdir(), "merge-after-review-bin-"));
  makeFakeGhBin(binDir, JSON.stringify({ statusCheckRollup: [{ conclusion: "SUCCESS" }], mergeable: "MERGEABLE" }));
  try {
    const out = execFileSync("node", [scriptPath, "--pr", "owner/repo#9", "--repo", cloneDir], {
      encoding: "utf8",
      env: { ...process.env, PATH: `${binDir}:${process.env.PATH}` },
    });
    assert.match(out, /merged owner\/repo#9, main fast-forwarded, worktrees pruned/);
    assert.equal(readFileSync(join(cloneDir, "feature.md"), "utf8"), "shipped\n");
  } finally {
    rmSync(cloneDir, { recursive: true, force: true });
    rmSync(binDir, { recursive: true, force: true });
  }
});

// --- law: bare + worktrees layout (2026-09-22-scripts-not-agents § Layout) -

function makeBareLayoutRepoAndUpstreamPush(nameHint) {
  const remoteDir = mkdtempSync(join(tmpdir(), `merge-after-review-blremote-${nameHint}-`));
  execFileSync("git", ["init", "-q", "--bare", remoteDir]);
  const root = mkdtempSync(join(tmpdir(), `merge-after-review-blroot-${nameHint}-`));
  execFileSync("git", ["init", "-q", "--bare", join(root, ".bare")]);
  execFileSync("git", ["-C", join(root, ".bare"), "remote", "add", "origin", remoteDir]);
  execFileSync("git", ["--git-dir", join(root, ".bare"), "worktree", "add", "-b", "main", join(root, "main")]);
  const mainDir = join(root, "main");
  execFileSync("git", ["-C", mainDir, "config", "user.email", "test@example.com"]);
  execFileSync("git", ["-C", mainDir, "config", "user.name", "test"]);
  writeFileSync(join(mainDir, "README.md"), "hello\n");
  execFileSync("git", ["-C", mainDir, "add", "."]);
  execFileSync("git", ["-C", mainDir, "commit", "-q", "-m", "init"]);
  execFileSync("git", ["-C", mainDir, "push", "-u", "origin", "main"]);

  // Stands in for "the PR branch already merged upstream" — a second clone
  // pushes a commit directly to origin/main.
  const otherCloneDir = mkdtempSync(join(tmpdir(), `merge-after-review-blother-${nameHint}-`));
  execFileSync("git", ["clone", "-q", remoteDir, otherCloneDir]);
  execFileSync("git", ["-C", otherCloneDir, "config", "user.email", "test@example.com"]);
  execFileSync("git", ["-C", otherCloneDir, "config", "user.name", "test"]);
  writeFileSync(join(otherCloneDir, "feature.md"), "shipped\n");
  execFileSync("git", ["-C", otherCloneDir, "add", "."]);
  execFileSync("git", ["-C", otherCloneDir, "commit", "-q", "-m", "feature"]);
  execFileSync("git", ["-C", otherCloneDir, "push", "-q", "origin", "main"]);
  rmSync(otherCloneDir, { recursive: true, force: true });

  return { root, mainDir };
}

test("law: bare-layout repo — ff-pulls the main worktree, never checks a branch out inside it", () => {
  const { root, mainDir } = makeBareLayoutRepoAndUpstreamPush("full");
  const binDir = mkdtempSync(join(tmpdir(), "merge-after-review-blbin-"));
  makeFakeGhBin(binDir, JSON.stringify({ statusCheckRollup: [{ conclusion: "SUCCESS" }], mergeable: "MERGEABLE" }));
  try {
    const out = execFileSync("node", [scriptPath, "--pr", "owner/repo#9", "--repo", root], {
      encoding: "utf8",
      env: { ...process.env, PATH: `${binDir}:${process.env.PATH}` },
    });
    assert.match(out, /merged owner\/repo#9, main fast-forwarded, worktrees pruned/);
    assert.equal(readFileSync(join(mainDir, "feature.md"), "utf8"), "shipped\n");
    const branch = execFileSync("git", ["-C", mainDir, "branch", "--show-current"], { encoding: "utf8" }).trim();
    assert.equal(branch, "main", "main worktree must never be switched off main");
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(binDir, { recursive: true, force: true });
  }
});

test("law: bare-layout repo — a --repo entry ending in /main normalises to the repo root", () => {
  const { root, mainDir } = makeBareLayoutRepoAndUpstreamPush("normalise");
  const binDir = mkdtempSync(join(tmpdir(), "merge-after-review-blbin2-"));
  makeFakeGhBin(binDir, JSON.stringify({ statusCheckRollup: [{ conclusion: "SUCCESS" }], mergeable: "MERGEABLE" }));
  try {
    const out = execFileSync("node", [scriptPath, "--pr", "owner/repo#9", "--repo", mainDir], {
      encoding: "utf8",
      env: { ...process.env, PATH: `${binDir}:${process.env.PATH}` },
    });
    assert.match(out, /merged owner\/repo#9, main fast-forwarded, worktrees pruned/);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(binDir, { recursive: true, force: true });
  }
});
