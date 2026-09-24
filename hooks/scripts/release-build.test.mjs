// release-build — the "build main to a preview version" script
// (`scripts-not-agents`, 2026-09-22). Pure-logic tests plus one full run
// against a scratch git repo with a fake `pnpm` stub on PATH — never a real
// remote, never a real pnpm/network call.
// Run: node --test hooks/scripts/release-build.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, buildSteps, parseUploadOutput } from "./release-build.mjs";

const scriptPath = fileURLToPath(new URL("./release-build.mjs", import.meta.url));

test("parseArgs reads --repo, --sha and --dry-run", () => {
  const args = parseArgs(["--repo", "/x", "--sha", "abc123", "--dry-run"]);
  assert.equal(args.repo, "/x");
  assert.equal(args.sha, "abc123");
  assert.equal(args.dryRun, true);
});

test("buildSteps is the fixed five-step sequence in order", () => {
  const steps = buildSteps("/repo", "/repo/worktrees/x", "main");
  assert.deepEqual(
    steps.map((s) => s.name),
    ["worktree-add", "install", "typecheck", "build", "upload"],
  );
  assert.deepEqual(steps[0].args, ["-C", "/repo", "worktree", "add", "--detach", "/repo/worktrees/x", "main"]);
});

test("buildSteps builds a named sha, not main, when one is given", () => {
  const steps = buildSteps("/repo", "/repo/worktrees/x", "deadbeef");
  assert.deepEqual(steps[0].args, ["-C", "/repo", "worktree", "add", "--detach", "/repo/worktrees/x", "deadbeef"]);
});

test("parseUploadOutput extracts a version id and preview url", () => {
  const stdout = "Uploading...\nVersion ID: 1a2b3c4d-5e6f\nhttps://abc123-app.example.workers.dev\nDone.";
  const parsed = parseUploadOutput(stdout);
  assert.equal(parsed.versionId, "1a2b3c4d-5e6f");
  assert.equal(parsed.previewUrl, "https://abc123-app.example.workers.dev");
});

test("parseUploadOutput returns nulls when neither is present", () => {
  const parsed = parseUploadOutput("nothing here");
  assert.equal(parsed.versionId, null);
  assert.equal(parsed.previewUrl, null);
});

test("parseUploadOutput skips an unrelated https:// doc link (eslint step) and finds the real preview url", () => {
  const stdout = [
    "> eslint .",
    "Warning: React Hook useEffect has a missing dependency.",
    "See: https://nextjs.org/docs/app/api-reference/config/eslint#disabling-rules",
    "Uploading...",
    "Version ID: 1a2b3c4d-5e6f",
    "https://abc123-app.jhd-preview.jh-229.workers.dev",
    "Done.",
  ].join("\n");
  const parsed = parseUploadOutput(stdout);
  assert.equal(parsed.versionId, "1a2b3c4d-5e6f");
  assert.equal(parsed.previewUrl, "https://abc123-app.jhd-preview.jh-229.workers.dev");
});

test("parseUploadOutput rejects a lookalike host that merely starts with workers.dev (host is anchored)", () => {
  const stdout = "Version ID: 1a2b3c4d-5e6f\nhttps://abc123-app.workers.devious.example.com/phish";
  const parsed = parseUploadOutput(stdout);
  assert.equal(parsed.previewUrl, null);
});

test("parseUploadOutput accepts a .workers.dev host with a trailing path", () => {
  const stdout = "Version ID: 1a2b3c4d-5e6f\nhttps://abc123-app.workers.dev/some/path";
  const parsed = parseUploadOutput(stdout);
  assert.equal(parsed.previewUrl, "https://abc123-app.workers.dev/some/path");
});

// --- full run against a scratch git repo, fake pnpm on PATH -----------------

function makeScratchRepo() {
  const dir = mkdtempSync(join(tmpdir(), "release-build-repo-"));
  execFileSync("git", ["init", "-q", "-b", "main", dir]);
  execFileSync("git", ["-C", dir, "config", "user.email", "test@example.com"]);
  execFileSync("git", ["-C", dir, "config", "user.name", "test"]);
  writeFileSync(join(dir, "package.json"), "{}\n");
  execFileSync("git", ["-C", dir, "add", "."]);
  execFileSync("git", ["-C", dir, "commit", "-q", "-m", "init"]);
  return dir;
}

function makeFakePnpmBin(binDir) {
  const pnpmPath = join(binDir, "pnpm");
  writeFileSync(
    pnpmPath,
    "#!/usr/bin/env bash\n" +
      'echo "fake pnpm: $1"\n' +
      'if [ "$1" = "upload" ]; then\n' +
      '  echo "Version ID: cafe1234-0000"\n' +
      '  echo "https://cafe1234-fakeapp.example.workers.dev"\n' +
      "fi\n" +
      "exit 0\n",
  );
  chmodSync(pnpmPath, 0o755);
}

test("--dry-run prints the step sequence and touches nothing (no worktree created)", () => {
  const repo = makeScratchRepo();
  const binDir = mkdtempSync(join(tmpdir(), "release-build-bin-"));
  makeFakePnpmBin(binDir);
  try {
    const out = execFileSync("node", [scriptPath, "--repo", repo, "--dry-run"], {
      encoding: "utf8",
      env: { ...process.env, PATH: `${binDir}:${process.env.PATH}` },
    });
    assert.match(out, /would run, in order/);
    assert.match(out, /worktree-add/);
    assert.match(out, /upload/);
    const worktrees = execFileSync("git", ["-C", repo, "worktree", "list"], { encoding: "utf8" });
    assert.equal(worktrees.trim().split("\n").length, 1, "dry-run must not create a worktree");
  } finally {
    rmSync(repo, { recursive: true, force: true });
    rmSync(binDir, { recursive: true, force: true });
  }
});

test("full run against a scratch repo installs/builds/uploads via the fake pnpm and cleans up the worktree", () => {
  const repo = makeScratchRepo();
  const binDir = mkdtempSync(join(tmpdir(), "release-build-bin-"));
  makeFakePnpmBin(binDir);
  try {
    const out = execFileSync("node", [scriptPath, "--repo", repo], {
      encoding: "utf8",
      env: { ...process.env, PATH: `${binDir}:${process.env.PATH}` },
    });
    assert.match(out, /version id: cafe1234-0000/);
    assert.match(out, /preview url: https:\/\/cafe1234-fakeapp\.example\.workers\.dev/);
    const worktrees = execFileSync("git", ["-C", repo, "worktree", "list"], { encoding: "utf8" });
    assert.equal(worktrees.trim().split("\n").length, 1, "the worktree must be removed after a successful build");
  } finally {
    rmSync(repo, { recursive: true, force: true });
    rmSync(binDir, { recursive: true, force: true });
  }
});

// --- law: bare + worktrees layout (2026-09-22-scripts-not-agents § Layout) -

function makeBareLayoutRepo() {
  const root = mkdtempSync(join(tmpdir(), "release-build-blroot-"));
  execFileSync("git", ["init", "-q", "--bare", join(root, ".bare")]);
  execFileSync("git", ["--git-dir", join(root, ".bare"), "worktree", "add", "-b", "main", join(root, "main")]);
  const mainDir = join(root, "main");
  execFileSync("git", ["-C", mainDir, "config", "user.email", "test@example.com"]);
  execFileSync("git", ["-C", mainDir, "config", "user.name", "test"]);
  writeFileSync(join(mainDir, "package.json"), "{}\n");
  execFileSync("git", ["-C", mainDir, "add", "."]);
  execFileSync("git", ["-C", mainDir, "commit", "-q", "-m", "init"]);
  return { root, mainDir };
}

test("law: bare-layout repo — builds via a sibling worktree beside main, never inside it, and removes it after", () => {
  const { root, mainDir } = makeBareLayoutRepo();
  const binDir = mkdtempSync(join(tmpdir(), "release-build-blbin-"));
  makeFakePnpmBin(binDir);
  try {
    const out = execFileSync("node", [scriptPath, "--repo", root], {
      encoding: "utf8",
      env: { ...process.env, PATH: `${binDir}:${process.env.PATH}` },
    });
    assert.match(out, /version id: cafe1234-0000/);

    const currentBranch = execFileSync("git", ["-C", mainDir, "branch", "--show-current"], {
      encoding: "utf8",
    }).trim();
    assert.equal(currentBranch, "main", "main worktree must never be switched off main");

    const worktrees = execFileSync("git", ["-C", mainDir, "worktree", "list"], { encoding: "utf8" });
    assert.equal(worktrees.trim().split("\n").length, 2, "the lane worktree must be removed after a successful build");
    assert.ok(
      worktrees.split("\n").every((line) => !/\brelease-build-[0-9a-f]{8}\b/.test(line)),
      "no lane worktree entry should remain",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(binDir, { recursive: true, force: true });
  }
});

test("law: bare-layout repo — a --repo entry ending in /main normalises to the repo root", () => {
  const { root, mainDir } = makeBareLayoutRepo();
  const binDir = mkdtempSync(join(tmpdir(), "release-build-blbin2-"));
  makeFakePnpmBin(binDir);
  try {
    const out = execFileSync("node", [scriptPath, "--repo", mainDir], {
      encoding: "utf8",
      env: { ...process.env, PATH: `${binDir}:${process.env.PATH}` },
    });
    assert.match(out, /version id: cafe1234-0000/);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(binDir, { recursive: true, force: true });
  }
});

test("law: bare-layout repo — a failing step still removes the sibling worktree and leaves main untouched", () => {
  const { root, mainDir } = makeBareLayoutRepo();
  const binDir = mkdtempSync(join(tmpdir(), "release-build-blbin3-"));
  const pnpmPath = join(binDir, "pnpm");
  writeFileSync(pnpmPath, "#!/usr/bin/env bash\necho 'fake pnpm: fails' 1>&2\nexit 1\n");
  chmodSync(pnpmPath, 0o755);
  try {
    assert.throws(() => {
      execFileSync("node", [scriptPath, "--repo", root], {
        encoding: "utf8",
        env: { ...process.env, PATH: `${binDir}:${process.env.PATH}` },
      });
    });
    const currentBranch = execFileSync("git", ["-C", mainDir, "branch", "--show-current"], {
      encoding: "utf8",
    }).trim();
    assert.equal(currentBranch, "main");
    const worktrees = execFileSync("git", ["-C", mainDir, "worktree", "list"], { encoding: "utf8" });
    assert.equal(worktrees.trim().split("\n").length, 2, "a failed build must still clean up its sibling worktree");
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(binDir, { recursive: true, force: true });
  }
});

test("a failing step exits non-zero and removes the worktree it created", () => {
  const repo = makeScratchRepo();
  const binDir = mkdtempSync(join(tmpdir(), "release-build-bin-"));
  const pnpmPath = join(binDir, "pnpm");
  writeFileSync(pnpmPath, "#!/usr/bin/env bash\necho 'fake pnpm: fails' 1>&2\nexit 1\n");
  chmodSync(pnpmPath, 0o755);
  try {
    assert.throws(() => {
      execFileSync("node", [scriptPath, "--repo", repo], {
        encoding: "utf8",
        env: { ...process.env, PATH: `${binDir}:${process.env.PATH}` },
      });
    });
    const worktrees = execFileSync("git", ["-C", repo, "worktree", "list"], { encoding: "utf8" });
    assert.equal(worktrees.trim().split("\n").length, 1, "a failed build must still clean up its worktree");
  } finally {
    rmSync(repo, { recursive: true, force: true });
    rmSync(binDir, { recursive: true, force: true });
  }
});
