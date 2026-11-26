// stash-gate.mjs: `git stash` is refused in a linked worktree (a lane's), where the stash stack is
// shared with every other worktree of the repo (doer-rules.md, "Never `git stash`").
// Run: node --test hooks/bin/stash-gate.test.mjs
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const gatePath = join(here, "stash-gate.mjs");
let root, main, lane;

const git = (cwd, ...args) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" });

before(() => {
  root = mkdtempSync(join(tmpdir(), "stash-gate-"));
  main = join(root, "main");
  lane = join(root, "lane");
  execFileSync("git", ["init", "-q", main]);
  git(main, "-c", "user.email=a@b", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "init");
  git(main, "worktree", "add", "-q", "-b", "lane", lane);
});
after(() => rmSync(root, { recursive: true, force: true }));

function run(cwd, command) {
  const out = execFileSync(process.execPath, [gatePath], { input: JSON.stringify({ cwd, tool_input: { command } }), encoding: "utf8" });
  return out ? JSON.parse(out).hookSpecificOutput : null;
}

test("git stash in a lane worktree is denied, and the reason names the scratch-copy alternative", () => {
  for (const c of ["git stash", "git stash push -m x", "git stash pop", "git stash save wip", "git -C " + lane + " stash", "cd " + lane + " && git stash apply"]) {
    const r = run(c.includes("-C") || c.includes("cd ") ? main : lane, c);
    assert.equal(r?.permissionDecision, "deny", c);
    assert.match(r.permissionDecisionReason, /scratch copy/);
  }
});

test("read-only stash subcommands and other git commands pass in a lane", () => {
  for (const c of ["git stash list", "git stash show", "git status", "git commit -m stash", "grep 'git stash' doer-rules.md"]) {
    assert.equal(run(lane, c), null, c);
  }
});

test("the primary clone is not a lane worktree: git stash passes there", () => {
  assert.equal(run(main, "git stash"), null);
});

test("hooks.json runs the gate on Bash", () => {
  const hooks = JSON.parse(readFileSync(join(here, "..", "hooks.json"), "utf8")).hooks.PreToolUse;
  assert.ok(hooks.some((h) => h.matcher.split("|").includes("Bash") && h.hooks.some((x) => x.command.includes("stash-gate.mjs"))));
});
