/* repo-layout — shared house-layout detection for the mechanical scripts
   (`2026-09-22-scripts-not-agents` § Layout). The house repo shape is a bare
   repo at `<repo>/.bare` with a `<repo>/main` worktree beside it; a plain
   checkout (a single `.git` dir at the repo root) is accepted too. Every
   script that opens a branch does it in its OWN sibling worktree
   (`<repo>/<lane-name>`) created off `main` — never a `checkout -b` (or a
   bare `checkout <branch>`) run inside `<repo>/main` itself, which would
   switch the shared checkout every other lane and the operator's own dev
   server depend on.

   Pure filesystem checks only — no git calls, so callers can use these
   before deciding which git commands to run. */
import { existsSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

/* A `--repo`/`--repos` entry may name the container (`<repo>`) or the
   `main` worktree itself (`<repo>/main`) — both are accepted and folded to
   the container root, so every script's git calls have one fixed root to
   reason about. Folds only when the parent actually carries a `.bare` dir
   (a plain checkout's directory named literally "main" is left alone). */
export function normalizeRepoRoot(repoPath) {
  const resolved = resolve(repoPath);
  const parent = dirname(resolved);
  if (basename(resolved) === "main" && existsSync(join(parent, ".bare"))) {
    return parent;
  }
  return resolved;
}

/* True when `repoRoot` is a bare-layout repo: `.bare` plus a `main`
   worktree beside it (house layout). False for a plain checkout. */
export function isBareLayout(repoRoot) {
  return existsSync(join(repoRoot, ".bare")) && existsSync(join(repoRoot, "main"));
}

/* The git working tree every git command that reads/writes `main` should
   run against — `<repoRoot>/main` for a bare-layout repo, `repoRoot` itself
   for a plain checkout. This is the `-C` target for `worktree add`,
   `pull --ff-only`, `worktree remove`, `worktree prune`. */
export function mainWorktreeOf(repoRoot) {
  return isBareLayout(repoRoot) ? join(repoRoot, "main") : repoRoot;
}

/* Where a lane's own sibling worktree lives — always a direct child of
   `repoRoot`, alongside `main` and `.bare` (never nested, never inside
   `main`), so `git worktree list` shows it as its own top-level entry. */
export function laneWorktreePath(repoRoot, laneName) {
  return join(repoRoot, laneName);
}
