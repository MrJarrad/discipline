#!/usr/bin/env node
/* rulebook-sync — replaces the five-repo `doer-rules.md` sync lane
   (`scripts-not-agents`, 2026-09-22). Per target repo: copy this plugin's
   `doer-rules.md` into `.cursor/rules/doer-rules.mdc` via `sync-doer-rules.mjs`'s
   `syncInto`, skip a repo whose copy is already byte-identical, otherwise
   branch `chore/doer-rules-<ver>`, commit, push, open a PR, wait for CI,
   squash-merge, fast-forward the repo's own main, and remove the worktree.
   Prints one table row per repo. Never edits product source outside
   `.cursor/rules/doer-rules.mdc`.

   Pure logic exported for testing: `isUpToDate()` (byte-identical check),
   `branchName()`, `formatRow()`. The CLI's git/gh calls run against real
   scratch git repos and a stubbed `gh` binary in the law test — no real
   remote.

   Usage:
     node rulebook-sync.mjs --source <discipline main> --repos <path,path,...> [--dry-run]
   Exit 0 all repos synced or already up to date · 1 any repo failed,
   naming which step and which repo.                                      */
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { existsSync, mkdirSync, readFileSync as readFile, writeFileSync } from "node:fs";
import { buildRuleFile } from "./sync-doer-rules.mjs";
import { laneWorktreePath, mainWorktreeOf, normalizeRepoRoot } from "./repo-layout.mjs";

/* Writes `sourceText` (read from `--source`'s own doer-rules.md, never this
   plugin's own copy of itself) into `targetRepoPath`'s
   `.cursor/rules/doer-rules.mdc` — the `--source`-parameterised sibling of
   `sync-doer-rules.mjs`'s `syncInto`, which always reads its own repo root. */
export function writeSyncedFile(targetRepoPath, sourceText) {
  const rulesDir = join(targetRepoPath, ".cursor", "rules");
  if (!existsSync(rulesDir)) mkdirSync(rulesDir, { recursive: true });
  const outPath = join(rulesDir, "doer-rules.mdc");
  writeFileSync(outPath, buildRuleFile(sourceText));
  return outPath;
}

export function parseArgs(argv) {
  const out = { dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") out.dryRun = true;
    else if (a === "--source") out.source = argv[++i];
    else if (a === "--repos") out.repos = argv[++i].split(",").map((s) => s.trim()).filter(Boolean);
  }
  if (out.source) out.source = resolve(out.source);
  // A `--repos` entry naming the `main` worktree itself (bare layout) folds
  // to the repo root, so every git call below has one fixed root.
  if (out.repos) out.repos = out.repos.map((r) => normalizeRepoRoot(r));
  return out;
}

/* True when the target repo's `.cursor/rules/doer-rules.mdc` already carries
   this plugin's `doer-rules.md` verbatim as its body — a byte-identical copy
   is skipped rather than re-committed. */
export function isUpToDate(targetRepoPath, sourceText) {
  const outPath = join(targetRepoPath, ".cursor", "rules", "doer-rules.mdc");
  if (!existsSync(outPath)) return false;
  const written = readFile(outPath, "utf8");
  return written === buildRuleFile(sourceText);
}

export function branchName(version) {
  return `chore/doer-rules-${version}`;
}

export function formatRow(repo, status) {
  return `${repo}\t${status}`;
}

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: "utf8", ...opts });
}

function syncOneRepo(repo, sourceText, version, dryRun) {
  const gitDir = mainWorktreeOf(repo);
  if (isUpToDate(gitDir, sourceText)) {
    return formatRow(repo, "skipped (already up to date)");
  }
  const branch = branchName(version);
  if (dryRun) {
    return formatRow(repo, `would sync -> branch ${branch} in a sibling worktree -> PR -> squash-merge -> ff main`);
  }
  // Own sibling worktree off `main` — never a `checkout -b` inside
  // `<repo>/main` itself, which every other lane and the operator's own
  // dev server may depend on staying on `main` (`2026-09-22-scripts-not-agents`
  // § Layout).
  const worktreePath = laneWorktreePath(repo, branch.replace(/\//g, "-"));
  try {
    run("git", ["-C", gitDir, "worktree", "add", worktreePath, "-b", branch, "main"]);
  } catch (err) {
    return formatRow(repo, `FAILED: worktree-add: ${err.message}`);
  }
  try {
    writeSyncedFile(worktreePath, sourceText);
    run("git", ["-C", worktreePath, "add", ".cursor/rules/doer-rules.mdc"]);
    run("git", ["-C", worktreePath, "commit", "-m", `chore: sync doer-rules.md (discipline ${version})`]);
    run("git", ["-C", worktreePath, "push", "-u", "origin", branch]);
    const prOut = run("gh", ["pr", "create", "--repo", gitDir, "--head", branch, "--title", `chore: sync doer-rules.md (${version})`, "--body", "Automated rulebook sync."]);
    const prUrl = prOut.trim();
    // Poll CI once, synchronously — the law test stubs `gh` to return a
    // settled rollup immediately; a real run relies on `gh pr checks --watch`
    // blocking until the checks settle.
    run("gh", ["pr", "checks", branch, "--repo", gitDir, "--watch"]);
    run("gh", ["pr", "merge", branch, "--repo", gitDir, "--squash", "--delete-branch"]);
    run("git", ["-C", gitDir, "pull", "--ff-only"]);
    run("git", ["-C", gitDir, "worktree", "remove", "--force", worktreePath]);
    run("git", ["-C", gitDir, "worktree", "prune"]);
    return formatRow(repo, `synced, merged: ${prUrl}`);
  } catch (err) {
    try {
      run("git", ["-C", gitDir, "worktree", "remove", "--force", worktreePath]);
      run("git", ["-C", gitDir, "worktree", "prune"]);
    } catch {
      // best-effort cleanup — the worktree may not exist yet
    }
    return formatRow(repo, `FAILED: ${err.message}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.source || !args.repos || args.repos.length === 0) {
    console.error("Usage: node rulebook-sync.mjs --source <discipline main> --repos <path,path,...> [--dry-run]");
    process.exit(1);
  }
  const pluginJsonPath = join(args.source, ".claude-plugin", "plugin.json");
  const version = JSON.parse(readFile(pluginJsonPath, "utf8")).version;
  const sourceText = readFile(join(args.source, "doer-rules.md"), "utf8");

  const rows = [];
  let anyFailed = false;
  for (const repo of args.repos) {
    const row = syncOneRepo(repo, sourceText, version, args.dryRun);
    rows.push(row);
    if (row.includes("FAILED")) anyFailed = true;
  }
  console.log(rows.join("\n"));
  process.exit(anyFailed ? 1 : 0);
}

if (process.argv[1] && process.argv[1].endsWith("rulebook-sync.mjs")) main();
