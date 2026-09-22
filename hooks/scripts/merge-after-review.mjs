#!/usr/bin/env node
/* merge-after-review — replaces the parent's manual merge chain and the
   lesson-14 helper (`scripts-not-agents`, 2026-09-22). Refuses to touch
   anything unless the named PR's `statusCheckRollup` is all SUCCESS and
   `mergeable` is true; otherwise squash-merges, deletes the branch,
   fast-forwards the repo's own main, and prunes worktrees. `--then-build`
   chains `release-build.mjs --repo <repo>` after a successful merge.

   Pure logic exported: `canMerge()` — the refusal gate, given a PR status
   object shaped like `gh pr view --json statusCheckRollup,mergeable`'s
   output; never merges on a caller's say-so alone.

   Usage:
     node merge-after-review.mjs --pr <owner/repo#n> --repo <path>
       [--dry-run] [--then-build]
   Exit 0 merged (and, with --then-build, built) · 1 refused or any step
   failed, naming which.                                                   */
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { mainWorktreeOf, normalizeRepoRoot } from "./repo-layout.mjs";

export function parseArgs(argv) {
  const out = { dryRun: false, thenBuild: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") out.dryRun = true;
    else if (a === "--then-build") out.thenBuild = true;
    else if (a === "--pr") out.pr = argv[++i];
    else if (a === "--repo") out.repo = argv[++i];
  }
  if (out.repo) out.repo = normalizeRepoRoot(out.repo);
  return out;
}

/* `status` is `{ statusCheckRollup: [{conclusion}, ...], mergeable: "MERGEABLE"|"CONFLICTING"|"UNKNOWN" }`
   (the shape of `gh pr view --json statusCheckRollup,mergeable`). Returns
   `{ ok: true }` or `{ ok: false, reason }` — never merges on anything but
   every check SUCCESS and an explicit MERGEABLE. An empty rollup (no
   checks configured) is refused too — nothing to prove green against. */
export function canMerge(status) {
  const rollup = status.statusCheckRollup || [];
  if (rollup.length === 0) {
    return { ok: false, reason: "no status checks reported — nothing to prove green against" };
  }
  const notSuccess = rollup.filter((c) => c.conclusion !== "SUCCESS");
  if (notSuccess.length > 0) {
    return {
      ok: false,
      reason: `${notSuccess.length} check(s) not SUCCESS: ${notSuccess.map((c) => c.conclusion).join(", ")}`,
    };
  }
  if (status.mergeable !== "MERGEABLE") {
    return { ok: false, reason: `mergeable=${status.mergeable}, not MERGEABLE` };
  }
  return { ok: true };
}

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: "utf8", ...opts });
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.pr || !args.repo) {
    console.error("Usage: node merge-after-review.mjs --pr <owner/repo#n> --repo <path> [--dry-run] [--then-build]");
    process.exit(1);
  }
  const [ownerRepo, prNumber] = String(args.pr).split("#");

  let status;
  try {
    const out = run("gh", ["pr", "view", prNumber, "--repo", ownerRepo, "--json", "statusCheckRollup,mergeable"]);
    status = JSON.parse(out);
  } catch (err) {
    console.error(`merge-after-review: did not read PR status — ${err.message}`);
    process.exit(1);
  }

  const verdict = canMerge(status);
  if (!verdict.ok) {
    console.error(`merge-after-review: refused — ${verdict.reason}`);
    process.exit(1);
  }

  if (args.dryRun) {
    console.log(`merge-after-review --dry-run: would squash-merge ${args.pr}, delete branch, ff main, prune worktrees`);
    if (args.thenBuild) console.log(`  would then run release-build.mjs --repo ${args.repo}`);
    process.exit(0);
  }

  // Always the `main` worktree for a bare-layout repo, the repo root for a
  // plain checkout — never a `checkout` inside `main`, whose own branch
  // never moves off `main` (`2026-09-22-scripts-not-agents` § Layout); only
  // a fast-forward pull.
  const gitDir = mainWorktreeOf(args.repo);
  try {
    run("gh", ["pr", "merge", prNumber, "--repo", ownerRepo, "--squash", "--delete-branch"]);
    run("git", ["-C", gitDir, "pull", "--ff-only"]);
    run("git", ["-C", gitDir, "worktree", "prune"]);
  } catch (err) {
    console.error(`merge-after-review: did not complete the merge — ${err.message}`);
    process.exit(1);
  }
  console.log(`merged ${args.pr}, main fast-forwarded, worktrees pruned`);

  if (args.thenBuild) {
    const releaseBuildPath = join(new URL(".", import.meta.url).pathname, "release-build.mjs");
    try {
      const out = run("node", [releaseBuildPath, "--repo", args.repo]);
      console.log(out);
    } catch (err) {
      console.error(`merge-after-review: merge succeeded but --then-build failed — ${err.message}`);
      process.exit(1);
    }
  }
  process.exit(0);
}

if (process.argv[1] && process.argv[1].endsWith("merge-after-review.mjs")) main();
