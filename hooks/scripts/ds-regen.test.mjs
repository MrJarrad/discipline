// ds-regen — the design-system regen lane (`scripts-not-agents`, 2026-09-22,
// the #68 commit shape). Pure-logic tests plus one full run against a
// scratch git repo (as the DS repo) with a fake export dir and a stubbed
// `pnpm`/`gh` on PATH — never a real remote, never a real network call.
// Run: node --test hooks/scripts/ds-regen.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, nextVersionDir, parseChangesBlock, readGeneratedAt, readGeneratedAtFromExport, checkFreshness, branchName } from "./ds-regen.mjs";

const scriptPath = fileURLToPath(new URL("./ds-regen.mjs", import.meta.url));

test("parseArgs reads --export, --repo, --dry-run", () => {
  const args = parseArgs(["--export", "/e", "--repo", "/r", "--dry-run"]);
  assert.equal(args.export, "/e");
  assert.equal(args.repo, "/r");
  assert.equal(args.dryRun, true);
});

test("nextVersionDir starts at v1 when the handoff dir is empty", () => {
  assert.equal(nextVersionDir([], "2026-09-22"), "v1-2026-09-22");
});

test("nextVersionDir increments past the highest existing v<N>", () => {
  assert.equal(nextVersionDir(["v67-2026-08-01", "v68-2026-09-01", "latest"], "2026-09-22"), "v69-2026-09-22");
});

test("nextVersionDir ignores non-v-prefixed entries (latest, README)", () => {
  assert.equal(nextVersionDir(["latest", "README.md", "v3-2026-01-01"], "2026-09-22"), "v4-2026-09-22");
});

test("parseChangesBlock extracts a ## Changes heading through the next heading", () => {
  const text = "# Export\n\n## Changes\n- token A renamed\n- VALUE-DRIFT: spacing-4 changed\n\n## Other\nnothing";
  const { block, valueDriftCount } = parseChangesBlock(text);
  assert.match(block, /token A renamed/);
  assert.doesNotMatch(block, /Other/);
  assert.equal(valueDriftCount, 1);
});

test("parseChangesBlock counts multiple VALUE-DRIFT lines", () => {
  const text = "## Changes\nVALUE-DRIFT: a\nVALUE-DRIFT: b\nVALUE-DRIFT: c\n";
  assert.equal(parseChangesBlock(text).valueDriftCount, 3);
});

test("parseChangesBlock returns an empty block and zero count when no Changes heading exists", () => {
  const { block, valueDriftCount } = parseChangesBlock("# Export\nnothing to see\n");
  assert.equal(block, "");
  assert.equal(valueDriftCount, 0);
});

// --- generatedAt freshness (AC added 2026-09-22, parent, at review) --------

test("readGeneratedAt returns null when the dir has no design-system-handoff.json", () => {
  const dir = mkdtempSync(join(tmpdir(), "ds-regen-gen-"));
  try {
    writeFileSync(join(dir, "tokens.json"), "{}\n");
    assert.equal(readGeneratedAt(dir), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("readGeneratedAt returns null for a missing dir", () => {
  assert.equal(readGeneratedAt(join(tmpdir(), "ds-regen-nope-does-not-exist")), null);
});

test("readGeneratedAt reads the stamp from a *design-system-handoff.json file", () => {
  const dir = mkdtempSync(join(tmpdir(), "ds-regen-gen-"));
  try {
    writeFileSync(
      join(dir, "jhd-spec-design-system-handoff.json"),
      JSON.stringify({ schema: "design-system-handoff", generatedAt: "2026-09-20T00:00:00.000Z" }),
    );
    assert.equal(readGeneratedAt(dir), "2026-09-20T00:00:00.000Z");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("checkFreshness proceeds when design/handoff/latest does not exist yet (first regen)", () => {
  const repo = mkdtempSync(join(tmpdir(), "ds-regen-fresh-repo-"));
  const exportDir = mkdtempSync(join(tmpdir(), "ds-regen-fresh-export-"));
  try {
    assert.equal(checkFreshness(exportDir, repo).ok, true);
  } finally {
    rmSync(repo, { recursive: true, force: true });
    rmSync(exportDir, { recursive: true, force: true });
  }
});

// --- full run: scratch DS repo, fake export dir, stubbed pnpm/gh ------------

function makeScratchDsRepo() {
  const remoteDir = mkdtempSync(join(tmpdir(), "ds-regen-remote-"));
  execFileSync("git", ["init", "-q", "--bare", remoteDir]);
  const dir = mkdtempSync(join(tmpdir(), "ds-regen-repo-"));
  execFileSync("git", ["clone", "-q", remoteDir, dir]);
  execFileSync("git", ["-C", dir, "config", "user.email", "test@example.com"]);
  execFileSync("git", ["-C", dir, "config", "user.name", "test"]);
  execFileSync("git", ["-C", dir, "checkout", "-q", "-b", "main"]);
  writeFileSync(join(dir, "package.json"), "{}\n");
  execFileSync("git", ["-C", dir, "add", "."]);
  execFileSync("git", ["-C", dir, "commit", "-q", "-m", "init"]);
  execFileSync("git", ["-C", dir, "push", "-u", "origin", "main"]);
  return dir;
}

function makeFakeExportDir(generatedAt) {
  const dir = mkdtempSync(join(tmpdir(), "ds-regen-export-"));
  writeFileSync(
    join(dir, "design-handoff.md"),
    "# Export\n\n## Changes\n- spacing-4: 8px -> 10px\n- VALUE-DRIFT: spacing-4 changed\n",
  );
  writeFileSync(join(dir, "tokens.json"), "{}\n");
  if (generatedAt) {
    writeFileSync(
      join(dir, "jhd-spec-design-system-handoff.json"),
      JSON.stringify({ schema: "design-system-handoff", generatedAt }),
    );
  }
  return dir;
}

/* Seeds `design/handoff/v0-.../` + a `latest` symlink to it in a scratch DS
   repo, carrying `generatedAt`, so a law test can drive ds-regen against a
   repo that already has a stamped `latest`. */
function seedLatest(repo, generatedAt) {
  const handoffDir = join(repo, "design", "handoff");
  const versionDir = join(handoffDir, "v0-2026-01-01");
  mkdirSync(versionDir, { recursive: true });
  writeFileSync(
    join(versionDir, "jhd-spec-design-system-handoff.json"),
    JSON.stringify({ schema: "design-system-handoff", generatedAt }),
  );
  symlinkSync("v0-2026-01-01", join(handoffDir, "latest"));
}

function makeFakeBin(binDir) {
  const pnpmPath = join(binDir, "pnpm");
  writeFileSync(pnpmPath, "#!/usr/bin/env bash\necho \"fake pnpm: $*\"\nexit 0\n");
  chmodSync(pnpmPath, 0o755);
  const ghPath = join(binDir, "gh");
  writeFileSync(ghPath, "#!/usr/bin/env bash\necho 'https://github.com/example/ds/pull/2'\nexit 0\n");
  chmodSync(ghPath, 0o755);
}

test("--dry-run prints the sibling-worktree plan and step sequence, touching nothing", () => {
  const repo = makeScratchDsRepo();
  const exportDir = makeFakeExportDir();
  try {
    const out = execFileSync("node", [scriptPath, "--export", exportDir, "--repo", repo, "--dry-run"], {
      encoding: "utf8",
    });
    assert.match(out, /would create sibling worktree/);
    assert.match(out, /would vendor/);
    assert.match(out, /v1-\d{4}-\d{2}-\d{2}/);
    assert.match(out, /would run: pnpm run tokens/);
    assert.equal(existsSync(join(repo, "design", "handoff")), false, "dry-run must not create design/handoff");
    const worktrees = execFileSync("git", ["-C", repo, "worktree", "list"], { encoding: "utf8" });
    assert.equal(worktrees.trim().split("\n").length, 1, "dry-run must not create a worktree");
  } finally {
    rmSync(repo, { recursive: true, force: true });
    rmSync(exportDir, { recursive: true, force: true });
  }
});

test("full run vendors on its own branch in a sibling worktree, never committing on main directly, runs the four pnpm steps, prints changes + VALUE-DRIFT count, pushes, PRs, and removes the worktree", () => {
  const repo = makeScratchDsRepo();
  const exportDir = makeFakeExportDir();
  const binDir = mkdtempSync(join(tmpdir(), "ds-regen-bin-"));
  makeFakeBin(binDir);
  try {
    const out = execFileSync("node", [scriptPath, "--export", exportDir, "--repo", repo], {
      encoding: "utf8",
      env: { ...process.env, PATH: `${binDir}:${process.env.PATH}` },
    });
    assert.match(out, /spacing-4: 8px -> 10px/);
    assert.match(out, /VALUE-DRIFT count: 1/);
    assert.match(out, /https:\/\/github\.com\/example\/ds\/pull\/2/);

    const today = new Date().toISOString().slice(0, 10);
    const expectedVersionDir = `v1-${today}`;
    const expectedBranch = branchName(expectedVersionDir);
    assert.match(out, new RegExp(`branch: ${expectedBranch.replace(/\//g, "\\/")}`));

    // main's own working tree is untouched — the change lives only on the
    // lane branch, which is left open for review, same as the other
    // mechanical scripts.
    assert.equal(existsSync(join(repo, "design", "handoff")), false, "main must not carry the change directly");

    const log = execFileSync("git", ["-C", repo, "log", "-1", "--format=%s", expectedBranch], { encoding: "utf8" });
    assert.match(log, /design: regen tokens \(v1-/);
    const latestTarget = execFileSync("git", ["-C", repo, "show", `${expectedBranch}:design/handoff/latest`], {
      encoding: "utf8",
    }).trim();
    assert.match(latestTarget, /^v1-/);

    const branchesOut = execFileSync("git", ["-C", repo, "branch", "-r"], { encoding: "utf8" });
    assert.match(branchesOut, new RegExp(`origin/${expectedBranch.replace(/\//g, "\\/")}`));

    const currentBranch = execFileSync("git", ["-C", repo, "branch", "--show-current"], { encoding: "utf8" }).trim();
    assert.equal(currentBranch, "main", "main worktree must never be switched off main");

    const worktrees = execFileSync("git", ["-C", repo, "worktree", "list"], { encoding: "utf8" });
    assert.equal(worktrees.trim().split("\n").length, 1, "the lane worktree must be removed once the PR is open");
  } finally {
    rmSync(repo, { recursive: true, force: true });
    rmSync(exportDir, { recursive: true, force: true });
    rmSync(binDir, { recursive: true, force: true });
  }
});

// --- law test: older refused, equal refused, newer proceeds ---------------

test("law: an export whose generatedAt is OLDER than latest's is refused, nothing written, no --force", () => {
  const repo = makeScratchDsRepo();
  seedLatest(repo, "2026-09-20T00:00:00.000Z");
  execFileSync("git", ["-C", repo, "add", "design/handoff"]);
  execFileSync("git", ["-C", repo, "commit", "-q", "-m", "seed latest"]);
  const exportDir = makeFakeExportDir("2026-09-01T00:00:00.000Z");
  const binDir = mkdtempSync(join(tmpdir(), "ds-regen-bin-"));
  makeFakeBin(binDir);
  try {
    let stderr = "";
    let threw = false;
    try {
      execFileSync("node", [scriptPath, "--export", exportDir, "--repo", repo], {
        encoding: "utf8",
        env: { ...process.env, PATH: `${binDir}:${process.env.PATH}` },
      });
    } catch (err) {
      threw = true;
      stderr = err.stderr || "";
    }
    assert.equal(threw, true, "older generatedAt must refuse");
    assert.match(stderr, /2026-09-01T00:00:00\.000Z/);
    assert.match(stderr, /2026-09-20T00:00:00\.000Z/);
    assert.doesNotMatch(stderr, /--force/);

    const versionDirs = execFileSync("ls", [join(repo, "design", "handoff")], { encoding: "utf8" }).trim().split("\n");
    assert.deepEqual(versionDirs.sort(), ["latest", "v0-2026-01-01"]);
    const log = execFileSync("git", ["-C", repo, "log", "-1", "--format=%s"], { encoding: "utf8" });
    assert.match(log, /seed latest/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
    rmSync(exportDir, { recursive: true, force: true });
    rmSync(binDir, { recursive: true, force: true });
  }
});

test("law: an export whose generatedAt EQUALS latest's is refused, nothing written", () => {
  const repo = makeScratchDsRepo();
  seedLatest(repo, "2026-09-20T00:00:00.000Z");
  execFileSync("git", ["-C", repo, "add", "design/handoff"]);
  execFileSync("git", ["-C", repo, "commit", "-q", "-m", "seed latest"]);
  const exportDir = makeFakeExportDir("2026-09-20T00:00:00.000Z");
  const binDir = mkdtempSync(join(tmpdir(), "ds-regen-bin-"));
  makeFakeBin(binDir);
  try {
    let stderr = "";
    let threw = false;
    try {
      execFileSync("node", [scriptPath, "--export", exportDir, "--repo", repo], {
        encoding: "utf8",
        env: { ...process.env, PATH: `${binDir}:${process.env.PATH}` },
      });
    } catch (err) {
      threw = true;
      stderr = err.stderr || "";
    }
    assert.equal(threw, true, "equal generatedAt must refuse");
    assert.match(stderr, /not newer/);
    const versionDirs = execFileSync("ls", [join(repo, "design", "handoff")], { encoding: "utf8" }).trim().split("\n");
    assert.deepEqual(versionDirs.sort(), ["latest", "v0-2026-01-01"]);
  } finally {
    rmSync(repo, { recursive: true, force: true });
    rmSync(exportDir, { recursive: true, force: true });
    rmSync(binDir, { recursive: true, force: true });
  }
});

test("law: an export whose generatedAt is NEWER than latest's proceeds and vendors normally on its own branch", () => {
  const repo = makeScratchDsRepo();
  seedLatest(repo, "2026-09-20T00:00:00.000Z");
  execFileSync("git", ["-C", repo, "add", "design/handoff"]);
  execFileSync("git", ["-C", repo, "commit", "-q", "-m", "seed latest"]);
  const exportDir = makeFakeExportDir("2026-09-22T00:00:00.000Z");
  const binDir = mkdtempSync(join(tmpdir(), "ds-regen-bin-"));
  makeFakeBin(binDir);
  try {
    const out = execFileSync("node", [scriptPath, "--export", exportDir, "--repo", repo], {
      encoding: "utf8",
      env: { ...process.env, PATH: `${binDir}:${process.env.PATH}` },
    });
    assert.match(out, /VALUE-DRIFT count: 1/);
    const today = new Date().toISOString().slice(0, 10);
    const expectedBranch = branchName(`v1-${today}`);
    const latestTarget = execFileSync("git", ["-C", repo, "show", `${expectedBranch}:design/handoff/latest`], {
      encoding: "utf8",
    }).trim();
    assert.match(latestTarget, /^v1-/);
    // main's own baseline (seeded v0) is untouched.
    const versionDirs = execFileSync("ls", [join(repo, "design", "handoff")], { encoding: "utf8" }).trim().split("\n");
    assert.deepEqual(versionDirs.sort(), ["latest", "v0-2026-01-01"]);
  } finally {
    rmSync(repo, { recursive: true, force: true });
    rmSync(exportDir, { recursive: true, force: true });
    rmSync(binDir, { recursive: true, force: true });
  }
});

// --- law: bare + worktrees layout (2026-09-22-scripts-not-agents § Layout) -

function makeBareLayoutDsRepo() {
  const remoteDir = mkdtempSync(join(tmpdir(), "ds-regen-blremote-"));
  execFileSync("git", ["init", "-q", "--bare", remoteDir]);
  const root = mkdtempSync(join(tmpdir(), "ds-regen-blroot-"));
  execFileSync("git", ["init", "-q", "--bare", join(root, ".bare")]);
  execFileSync("git", ["-C", join(root, ".bare"), "remote", "add", "origin", remoteDir]);
  execFileSync("git", ["--git-dir", join(root, ".bare"), "worktree", "add", "-b", "main", join(root, "main")]);
  const mainDir = join(root, "main");
  execFileSync("git", ["-C", mainDir, "config", "user.email", "test@example.com"]);
  execFileSync("git", ["-C", mainDir, "config", "user.name", "test"]);
  writeFileSync(join(mainDir, "package.json"), "{}\n");
  execFileSync("git", ["-C", mainDir, "add", "."]);
  execFileSync("git", ["-C", mainDir, "commit", "-q", "-m", "init"]);
  execFileSync("git", ["-C", mainDir, "push", "-u", "origin", "main"]);
  return { root, mainDir };
}

test("law: bare-layout repo — vendors on its own branch in a sibling worktree beside main, never inside it, and removes it after", () => {
  const { root, mainDir } = makeBareLayoutDsRepo();
  const exportDir = makeFakeExportDir();
  const binDir = mkdtempSync(join(tmpdir(), "ds-regen-blbin-"));
  makeFakeBin(binDir);
  try {
    const out = execFileSync("node", [scriptPath, "--export", exportDir, "--repo", root], {
      encoding: "utf8",
      env: { ...process.env, PATH: `${binDir}:${process.env.PATH}` },
    });
    assert.match(out, /VALUE-DRIFT count: 1/);

    const today = new Date().toISOString().slice(0, 10);
    const expectedBranch = branchName(`v1-${today}`);
    assert.match(out, new RegExp(`branch: ${expectedBranch.replace(/\//g, "\\/")}`));

    const currentBranch = execFileSync("git", ["-C", mainDir, "branch", "--show-current"], {
      encoding: "utf8",
    }).trim();
    assert.equal(currentBranch, "main", "main worktree must never be switched off main");
    assert.equal(existsSync(join(mainDir, "design", "handoff")), false, "main must not carry the change directly");

    const log = execFileSync("git", ["-C", mainDir, "log", "-1", "--format=%s", expectedBranch], { encoding: "utf8" });
    assert.match(log, /design: regen tokens \(v1-/);

    const worktrees = execFileSync("git", ["-C", mainDir, "worktree", "list"], { encoding: "utf8" });
    assert.equal(worktrees.trim().split("\n").length, 2, "the lane worktree must be removed once the PR is open");
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(exportDir, { recursive: true, force: true });
    rmSync(binDir, { recursive: true, force: true });
  }
});

test("law: bare-layout repo — a --repo entry ending in /main normalises to the repo root", () => {
  const { root, mainDir } = makeBareLayoutDsRepo();
  const exportDir = makeFakeExportDir();
  const binDir = mkdtempSync(join(tmpdir(), "ds-regen-blbin2-"));
  makeFakeBin(binDir);
  try {
    const out = execFileSync("node", [scriptPath, "--export", exportDir, "--repo", mainDir], {
      encoding: "utf8",
      env: { ...process.env, PATH: `${binDir}:${process.env.PATH}` },
    });
    assert.match(out, /VALUE-DRIFT count: 1/);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(exportDir, { recursive: true, force: true });
    rmSync(binDir, { recursive: true, force: true });
  }
});

test("law: bare-layout repo — a failing pnpm step still removes the sibling worktree and leaves main untouched", () => {
  const { root, mainDir } = makeBareLayoutDsRepo();
  const exportDir = makeFakeExportDir();
  const binDir = mkdtempSync(join(tmpdir(), "ds-regen-blbin3-"));
  const pnpmPath = join(binDir, "pnpm");
  writeFileSync(pnpmPath, "#!/usr/bin/env bash\necho 'fake pnpm: fails' 1>&2\nexit 1\n");
  chmodSync(pnpmPath, 0o755);
  const ghPath = join(binDir, "gh");
  writeFileSync(ghPath, "#!/usr/bin/env bash\necho 'https://github.com/example/ds/pull/2'\nexit 0\n");
  chmodSync(ghPath, 0o755);
  try {
    assert.throws(() => {
      execFileSync("node", [scriptPath, "--export", exportDir, "--repo", root], {
        encoding: "utf8",
        env: { ...process.env, PATH: `${binDir}:${process.env.PATH}` },
      });
    });
    const currentBranch = execFileSync("git", ["-C", mainDir, "branch", "--show-current"], {
      encoding: "utf8",
    }).trim();
    assert.equal(currentBranch, "main");
    const worktrees = execFileSync("git", ["-C", mainDir, "worktree", "list"], { encoding: "utf8" });
    assert.equal(worktrees.trim().split("\n").length, 2, "a failed run must still clean up its sibling worktree");
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(exportDir, { recursive: true, force: true });
    rmSync(binDir, { recursive: true, force: true });
  }
});
