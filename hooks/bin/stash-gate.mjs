#!/usr/bin/env node
/* PreToolUse (Bash) — refuses `git stash` in a lane worktree. The stash stack lives in the repo's common
   git dir, so one lane's stash is visible to, and poppable by, every other worktree of the same repo
   (doer-rules.md, "Never `git stash`"). A lane worktree is a linked worktree (its git dir differs from
   the common dir); the primary clone is not gated. `stash list` and `stash show` only read, so they pass.
   A test-first brief that needs the red state shown uses a scratch copy of the tree instead. */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { gitTarget } from "../scripts/lib/git-command-target.mjs";

let input = {};
try { input = JSON.parse(readFileSync(0, "utf8") || "{}"); } catch { /* no input: allow */ }
const command = input.tool_input?.command || "";
const cwd = gitTarget(command, input.cwd || process.cwd(), (w, k) => w[k] === "stash" && !["list", "show"].includes(w[k + 1]));
if (cwd === null) process.exit(0);

const dirs = spawnSync("git", ["-C", cwd, "rev-parse", "--path-format=absolute", "--git-dir", "--git-common-dir"], { encoding: "utf8" });
const [gitDir, commonDir] = dirs.status === 0 ? dirs.stdout.trim().split("\n") : [];
if (!gitDir || gitDir === commonDir) process.exit(0);

console.log(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "deny",
    permissionDecisionReason:
      "Stash gate: `git stash` is refused in a lane worktree, because the stash stack is shared by every worktree of this repo. " +
      "Commit the work as a WIP commit staged by path, or, to show a test red, run it against a scratch copy of the tree (`git worktree add <scratch dir> <base sha>`, or `cp -r`), never a stash.",
  },
}));
