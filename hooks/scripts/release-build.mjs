#!/usr/bin/env node
/* release-build — replaces the haiku "build main to a preview version" lane
   (`scripts-not-agents`, 2026-09-22). A worktree from a repo's main (or a
   named sha) is installed, typechecked, built, and uploaded to a preview
   version; the version id + preview URL are printed; the worktree and its
   branch are removed. Never touches product source itself — it only runs
   the repo's own `pnpm` scripts.

   Mechanical first (`scripts-not-agents` principle, 2026-09-22): this
   replaces a model call with a deterministic step sequence — same five
   commands, every time, no drift.

   Pure logic is exported so the tests drive it without touching disk, git,
   pnpm or a real network: `buildSteps()` returns the ordered command list;
   `parseUploadOutput()` extracts the version id + preview URL from the
   upload command's stdout.

   Usage:
     node release-build.mjs --repo <path> [--sha <sha>] [--dry-run]
   Exit 0 on success (or a clean --dry-run print) · 1 any step failed,
   naming the step that did not complete.                                  */
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { laneWorktreePath, mainWorktreeOf, normalizeRepoRoot } from "./repo-layout.mjs";

export function parseArgs(argv) {
  const out = { dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") out.dryRun = true;
    else if (a === "--repo") out.repo = argv[++i];
    else if (a === "--sha") out.sha = argv[++i];
  }
  if (out.repo) out.repo = normalizeRepoRoot(out.repo);
  return out;
}

/* The fixed step sequence, in order. `worktreePath` is where the throwaway
   worktree lives; `ref` is the sha to build (or "main" when none is given).
   Each step is { name, cmd, args, cwd } — pure data, no execution here. */
export function buildSteps(repo, worktreePath, ref) {
  return [
    { name: "worktree-add", cmd: "git", args: ["-C", repo, "worktree", "add", "--detach", worktreePath, ref], cwd: repo },
    { name: "install", cmd: "pnpm", args: ["install"], cwd: worktreePath },
    { name: "typecheck", cmd: "pnpm", args: ["typecheck"], cwd: worktreePath },
    { name: "build", cmd: "pnpm", args: ["build"], cwd: worktreePath },
    { name: "upload", cmd: "pnpm", args: ["upload"], cwd: worktreePath },
  ];
}

/* Extracts a version id and preview URL from `pnpm upload`'s stdout. Wrangler
   versions upload prints a "Version ID: <uuid>" line and a preview URL
   (`https://<hash>-<name>.<subdomain>.workers.dev`-shaped, or any https URL
   on its own line near the version id) — matched loosely so the exact
   wording of a future wrangler release doesn't silently break this. Returns
   { versionId, previewUrl } with either field null if not found. */
export function parseUploadOutput(stdout) {
  const versionMatch = stdout.match(/Version ID:\s*([a-f0-9-]{8,})/i);
  const urlMatch = stdout.match(/https:\/\/\S+/);
  return {
    versionId: versionMatch ? versionMatch[1] : null,
    previewUrl: urlMatch ? urlMatch[0] : null,
  };
}

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: "utf8", ...opts });
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.repo) {
    console.error("Usage: node release-build.mjs --repo <path> [--sha <sha>] [--dry-run]");
    process.exit(1);
  }
  const ref = args.sha || "main";
  // A sibling worktree off `<repo>/main` (or the repo root, for a plain
  // checkout) — never nested inside `main`, so it never disturbs the
  // shared checkout (`2026-09-22-scripts-not-agents` § Layout).
  const gitDir = mainWorktreeOf(args.repo);
  const worktreePath = laneWorktreePath(args.repo, `release-build-${randomBytes(4).toString("hex")}`);
  const steps = buildSteps(gitDir, worktreePath, ref);

  if (args.dryRun) {
    console.log(`release-build --dry-run: would run, in order:`);
    for (const s of steps) console.log(`  [${s.name}] ${s.cmd} ${s.args.join(" ")} (cwd=${s.cwd})`);
    console.log(`  [cleanup] git -C ${gitDir} worktree remove ${worktreePath}`);
    process.exit(0);
  }

  let uploadOutput = "";
  for (const step of steps) {
    try {
      const out = run(step.cmd, step.args, { cwd: step.cwd });
      if (step.name === "upload") uploadOutput = out;
    } catch (err) {
      console.error(`release-build: did not complete "${step.name}" — ${err.message}`);
      // Best-effort cleanup even on failure, never leaving a stray worktree.
      try {
        run("git", ["-C", gitDir, "worktree", "remove", "--force", worktreePath]);
      } catch {
        // ignore — the worktree may not exist yet if worktree-add itself failed
      }
      process.exit(1);
    }
  }

  const { versionId, previewUrl } = parseUploadOutput(uploadOutput);
  console.log(`version id: ${versionId || "(not found in upload output)"}`);
  console.log(`preview url: ${previewUrl || "(not found in upload output)"}`);

  try {
    run("git", ["-C", gitDir, "worktree", "remove", worktreePath]);
  } catch (err) {
    console.error(`release-build: build succeeded but did not remove the worktree — ${err.message}`);
    process.exit(1);
  }
  process.exit(0);
}

if (process.argv[1] && process.argv[1].endsWith("release-build.mjs")) main();
