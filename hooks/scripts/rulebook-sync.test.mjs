// rulebook-sync — the five-repo doer-rules.md sync lane
// (`scripts-not-agents`, 2026-09-22). Pure-logic tests plus one full run
// against scratch git repos (a bare "remote" + a clone) with a fake `gh`
// stub on PATH — never a real GitHub call, never a real remote.
// Run: node --test hooks/scripts/rulebook-sync.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { isUpToDate, branchName, formatRow, parseArgs, writeSyncedFile } from "./rulebook-sync.mjs";

const scriptPath = fileURLToPath(new URL("./rulebook-sync.mjs", import.meta.url));

test("parseArgs splits --repos on commas and trims", () => {
  const args = parseArgs(["--source", "/src", "--repos", "/a, /b,/c", "--dry-run"]);
  assert.equal(args.source, "/src");
  assert.deepEqual(args.repos, ["/a", "/b", "/c"]);
  assert.equal(args.dryRun, true);
});

test("branchName is chore/doer-rules-<version>", () => {
  assert.equal(branchName("1.93.0"), "chore/doer-rules-1.93.0");
});

test("formatRow is a tab-separated repo/status line", () => {
  assert.equal(formatRow("/x", "skipped"), "/x\tskipped");
});

test("isUpToDate is false when no .cursor/rules/doer-rules.mdc exists yet", () => {
  const dir = mkdtempSync(join(tmpdir(), "rulebook-sync-target-"));
  try {
    assert.equal(isUpToDate(dir, "some source text\n"), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("isUpToDate is true after writeSyncedFile writes the same source text", () => {
  const dir = mkdtempSync(join(tmpdir(), "rulebook-sync-target-"));
  try {
    const sourceText = "# Doer rules\n\nsome law\n";
    writeSyncedFile(dir, sourceText);
    assert.equal(isUpToDate(dir, sourceText), true);
    assert.equal(isUpToDate(dir, "different text\n"), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- full run: scratch bare remote + clone, fake gh on PATH -----------------

function makeBareRemoteAndClone(nameHint) {
  const remoteDir = mkdtempSync(join(tmpdir(), `rulebook-sync-remote-${nameHint}-`));
  execFileSync("git", ["init", "-q", "--bare", remoteDir]);
  const cloneDir = mkdtempSync(join(tmpdir(), `rulebook-sync-clone-${nameHint}-`));
  execFileSync("git", ["clone", "-q", remoteDir, cloneDir]);
  execFileSync("git", ["-C", cloneDir, "config", "user.email", "test@example.com"]);
  execFileSync("git", ["-C", cloneDir, "config", "user.name", "test"]);
  execFileSync("git", ["-C", cloneDir, "checkout", "-q", "-b", "main"]);
  writeFileSync(join(cloneDir, "README.md"), "hello\n");
  execFileSync("git", ["-C", cloneDir, "add", "."]);
  execFileSync("git", ["-C", cloneDir, "commit", "-q", "-m", "init"]);
  execFileSync("git", ["-C", cloneDir, "push", "-u", "origin", "main"]);
  return { remoteDir, cloneDir };
}

function makeSourceDir(version) {
  const src = mkdtempSync(join(tmpdir(), "rulebook-sync-source-"));
  writeFileSync(join(src, "doer-rules.md"), `# Doer rules\n\nversion ${version} law\n`);
  mkdirSync(join(src, ".claude-plugin"), { recursive: true });
  writeFileSync(join(src, ".claude-plugin", "plugin.json"), JSON.stringify({ name: "discipline", version }));
  return src;
}

// A fake `gh` that performs a real local squash-merge against the scratch
// remote so the script's post-merge `git pull --ff-only` has something real
// to pull — this is scratch-repo mechanics standing in for GitHub, never a
// real network call.
// `--repo` must be `[HOST/]OWNER/REPO`, exactly like the real `gh` CLI
// rejects a filesystem path (`2026-09-22-scripts-not-agents` § gh
// invocation) — this stub enforces the same shape, so a script regressing
// to `--repo <path>` fails the test the same way it would fail for real.
// When no `--repo` is passed, `gh` reads the repo off `cwd`'s own git
// remote — the stub uses `.` (its actual working directory) in that case.
function makeFakeGhBin(binDir) {
  const ghPath = join(binDir, "gh");
  writeFileSync(
    ghPath,
    `#!/usr/bin/env bash
set -e
sub="$1"; shift
case "$sub" in
  pr)
    action="$1"; shift
    repo=""
    args=()
    while [ $# -gt 0 ]; do
      if [ "$1" = "--repo" ]; then
        repo="$2"
        if ! [[ "$repo" =~ ^([A-Za-z0-9.-]+/)?[^/]+/[^/]+$ ]]; then
          echo 'expected the "[HOST/]OWNER/REPO" format' >&2
          exit 1
        fi
        shift 2
        continue
      fi
      args+=("$1")
      shift
    done
    case "$action" in
      create)
        echo "https://github.com/example/repo/pull/1"
        ;;
      checks)
        exit 0
        ;;
      list)
        echo "[]"
        ;;
      merge)
        branch="\${args[0]}"
        target="."
        git -C "$target" checkout -q main
        git -C "$target" merge -q --squash "$branch"
        git -C "$target" commit -q -m "squash merge $branch"
        git -C "$target" push -q origin main
        git -C "$target" push -q origin --delete "$branch" || true
        ;;
    esac
    ;;
esac
exit 0
`,
  );
  chmodSync(ghPath, 0o755);
}

test("--dry-run prints a would-sync row per repo, no branch/commit made", () => {
  const { cloneDir } = makeBareRemoteAndClone("dry");
  const src = makeSourceDir("1.93.0");
  try {
    const out = execFileSync("node", [scriptPath, "--source", src, "--repos", cloneDir, "--dry-run"], {
      encoding: "utf8",
    });
    assert.match(out, /would sync -> branch chore\/doer-rules-1\.93\.0/);
    const branches = execFileSync("git", ["-C", cloneDir, "branch"], { encoding: "utf8" });
    assert.doesNotMatch(branches, /chore\/doer-rules/);
  } finally {
    rmSync(cloneDir, { recursive: true, force: true });
    rmSync(src, { recursive: true, force: true });
  }
});

test("a repo already up to date is skipped, not re-synced", () => {
  const { cloneDir } = makeBareRemoteAndClone("uptodate");
  const src = makeSourceDir("1.93.0");
  try {
    const sourceText = readFileSync(join(src, "doer-rules.md"), "utf8");
    writeSyncedFile(cloneDir, sourceText);
    const out = execFileSync("node", [scriptPath, "--source", src, "--repos", cloneDir], { encoding: "utf8" });
    assert.match(out, /skipped \(already up to date\)/);
  } finally {
    rmSync(cloneDir, { recursive: true, force: true });
    rmSync(src, { recursive: true, force: true });
  }
});

test("full run: syncs, branches, commits, pushes, PRs, merges via stubbed gh, and ff-pulls main", () => {
  const { cloneDir } = makeBareRemoteAndClone("full");
  const src = makeSourceDir("1.93.0");
  const binDir = mkdtempSync(join(tmpdir(), "rulebook-sync-bin-"));
  makeFakeGhBin(binDir);
  try {
    const out = execFileSync("node", [scriptPath, "--source", src, "--repos", cloneDir], {
      encoding: "utf8",
      env: { ...process.env, PATH: `${binDir}:${process.env.PATH}` },
    });
    assert.match(out, /synced, merged: https:\/\/github\.com\/example\/repo\/pull\/1/);
    const written = readFileSync(join(cloneDir, ".cursor", "rules", "doer-rules.mdc"), "utf8");
    assert.match(written, /version 1\.93\.0 law/);
    const currentBranch = execFileSync("git", ["-C", cloneDir, "branch", "--show-current"], {
      encoding: "utf8",
    }).trim();
    assert.equal(currentBranch, "main");
  } finally {
    rmSync(cloneDir, { recursive: true, force: true });
    rmSync(src, { recursive: true, force: true });
    rmSync(binDir, { recursive: true, force: true });
  }
});

test("idempotent re-run: a branch already pushed to origin (prior run died before merge) is reused, not re-created", () => {
  const { remoteDir, cloneDir } = makeBareRemoteAndClone("resume");
  const src = makeSourceDir("1.93.0");
  const binDir = mkdtempSync(join(tmpdir(), "rulebook-sync-bin-"));
  makeFakeGhBin(binDir);
  try {
    // Simulate a first run that pushed the branch + commit to the real
    // remote but died before opening a PR — cloned from `remoteDir` (the
    // scratch "origin"), never from `cloneDir` itself, so the branch lands
    // only on origin, exactly like a real prior run's push would.
    const sourceText = readFileSync(join(src, "doer-rules.md"), "utf8");
    const priorWorktree = mkdtempSync(join(tmpdir(), "rulebook-sync-priorwt-"));
    execFileSync("git", ["clone", "-q", remoteDir, priorWorktree]);
    execFileSync("git", ["-C", priorWorktree, "config", "user.email", "test@example.com"]);
    execFileSync("git", ["-C", priorWorktree, "config", "user.name", "test"]);
    execFileSync("git", ["-C", priorWorktree, "checkout", "-q", "-b", "chore/doer-rules-1.93.0"]);
    writeSyncedFile(priorWorktree, sourceText);
    execFileSync("git", ["-C", priorWorktree, "add", ".cursor/rules/doer-rules.mdc"]);
    execFileSync("git", ["-C", priorWorktree, "commit", "-q", "-m", "chore: sync doer-rules.md (discipline 1.93.0)"]);
    execFileSync("git", ["-C", priorWorktree, "push", "-q", "-u", "origin", "chore/doer-rules-1.93.0"]);
    rmSync(priorWorktree, { recursive: true, force: true });

    const out = execFileSync("node", [scriptPath, "--source", src, "--repos", cloneDir], {
      encoding: "utf8",
      env: { ...process.env, PATH: `${binDir}:${process.env.PATH}` },
    });
    assert.match(out, /synced, merged: https:\/\/github\.com\/example\/repo\/pull\/1/);
    const currentBranch = execFileSync("git", ["-C", cloneDir, "branch", "--show-current"], {
      encoding: "utf8",
    }).trim();
    assert.equal(currentBranch, "main");
    const branches = execFileSync("git", ["-C", cloneDir, "worktree", "list"], { encoding: "utf8" });
    assert.equal(branches.trim().split("\n").length, 1, "the resumed worktree must be cleaned up too");
  } finally {
    rmSync(cloneDir, { recursive: true, force: true });
    rmSync(src, { recursive: true, force: true });
    rmSync(binDir, { recursive: true, force: true });
  }
});

// --- law: bare + worktrees layout (2026-09-22-scripts-not-agents § Layout) -

function makeBareLayoutRepoWithRemote(nameHint) {
  const remoteDir = mkdtempSync(join(tmpdir(), `rulebook-sync-blremote-${nameHint}-`));
  execFileSync("git", ["init", "-q", "--bare", remoteDir]);
  const root = mkdtempSync(join(tmpdir(), `rulebook-sync-blroot-${nameHint}-`));
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
  return { root, mainDir, remoteDir };
}

test("law: bare-layout repo — the lane branches in a sibling worktree, never inside <repo>/main, and removes it after", () => {
  const { root, mainDir } = makeBareLayoutRepoWithRemote("full");
  const src = makeSourceDir("1.93.0");
  const binDir = mkdtempSync(join(tmpdir(), "rulebook-sync-bin-"));
  makeFakeGhBin(binDir);
  try {
    const out = execFileSync("node", [scriptPath, "--source", src, "--repos", root], {
      encoding: "utf8",
      env: { ...process.env, PATH: `${binDir}:${process.env.PATH}` },
    });
    assert.match(out, /synced, merged: https:\/\/github\.com\/example\/repo\/pull\/1/);

    // main worktree stayed on main throughout, and finished up to date.
    const currentBranch = execFileSync("git", ["-C", mainDir, "branch", "--show-current"], {
      encoding: "utf8",
    }).trim();
    assert.equal(currentBranch, "main");
    const written = readFileSync(join(mainDir, ".cursor", "rules", "doer-rules.mdc"), "utf8");
    assert.match(written, /version 1\.93\.0 law/);

    // the lane worktree was removed — only the .bare + main entries remain.
    const worktrees = execFileSync("git", ["-C", mainDir, "worktree", "list"], { encoding: "utf8" });
    assert.equal(worktrees.trim().split("\n").length, 2, "the lane worktree must be removed after landing");
    assert.doesNotMatch(worktrees, /chore-doer-rules/);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(src, { recursive: true, force: true });
    rmSync(binDir, { recursive: true, force: true });
  }
});

test("law: bare-layout repo — a --repos entry ending in /main normalises to the repo root", () => {
  const { root, mainDir } = makeBareLayoutRepoWithRemote("normalise");
  const src = makeSourceDir("1.93.0");
  const binDir = mkdtempSync(join(tmpdir(), "rulebook-sync-bin-"));
  makeFakeGhBin(binDir);
  try {
    const out = execFileSync("node", [scriptPath, "--source", src, "--repos", mainDir], {
      encoding: "utf8",
      env: { ...process.env, PATH: `${binDir}:${process.env.PATH}` },
    });
    assert.match(out, /synced, merged: https:\/\/github\.com\/example\/repo\/pull\/1/);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(src, { recursive: true, force: true });
    rmSync(binDir, { recursive: true, force: true });
  }
});

test("law: bare-layout repo — a mid-run failure still removes the lane worktree and leaves main untouched", () => {
  const { root, mainDir } = makeBareLayoutRepoWithRemote("failure");
  const src = makeSourceDir("1.93.0");
  const binDir = mkdtempSync(join(tmpdir(), "rulebook-sync-failbin-"));
  // A `gh` stub whose `pr create` fails outright — proves the worktree is
  // still cleaned up when a later step in the try block throws.
  writeFileSync(join(binDir, "gh"), "#!/usr/bin/env bash\nexit 1\n");
  chmodSync(join(binDir, "gh"), 0o755);
  try {
    let threw = false;
    try {
      execFileSync("node", [scriptPath, "--source", src, "--repos", root], {
        encoding: "utf8",
        env: { ...process.env, PATH: `${binDir}:${process.env.PATH}` },
      });
    } catch {
      threw = true;
    }
    assert.equal(threw, true, "a failed gh step must exit non-zero");

    const currentBranch = execFileSync("git", ["-C", mainDir, "branch", "--show-current"], {
      encoding: "utf8",
    }).trim();
    assert.equal(currentBranch, "main", "main must never be switched off its own branch");
    const worktrees = execFileSync("git", ["-C", mainDir, "worktree", "list"], { encoding: "utf8" });
    assert.equal(worktrees.trim().split("\n").length, 2, "the lane worktree must be removed even on failure");
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(src, { recursive: true, force: true });
    rmSync(binDir, { recursive: true, force: true });
  }
});
