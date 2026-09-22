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
    case "$action" in
      create)
        echo "https://github.com/example/repo/pull/1"
        ;;
      checks)
        exit 0
        ;;
      merge)
        branch="$1"; shift
        repo=""
        while [ $# -gt 0 ]; do
          if [ "$1" = "--repo" ]; then repo="$2"; fi
          shift
        done
        git -C "$repo" checkout -q main
        git -C "$repo" merge -q --squash "$branch"
        git -C "$repo" commit -q -m "squash merge $branch"
        git -C "$repo" push -q origin main
        git -C "$repo" push -q origin --delete "$branch" || true
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
