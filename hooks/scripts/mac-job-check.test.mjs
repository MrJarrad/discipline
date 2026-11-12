// Run: node --test hooks/scripts/mac-job-check.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { macJobProblems } from "./mac-job-check.mjs";

const job = (fm, body = "You ARE the job. No background tasks, no subagents.\n") => `---\n${fm}\n---\n${body}`;

test("a job with a repo: line under /Users or ~ is clean", () => {
  assert.deepEqual(macJobProblems(job("repo: /Users/jarrad.harvey/JHD/hoverboard/main")), []);
  assert.deepEqual(macJobProblems(job("from: x\nrepo: ~/JHD/vault/main")), []);
  assert.deepEqual(macJobProblems(job('repo: "~/a/b"')), []);
});

test("a missing, empty or non-home repo: is named (runner exit 97)", () => {
  assert.match(macJobProblems(job("from: x"))[0], /repo:/);
  assert.match(macJobProblems(job("repo:"))[0], /repo:/);
  assert.match(macJobProblems(job("repo: /tmp/x"))[0], /under \$HOME/);
  assert.match(macJobProblems("no frontmatter at all")[0], /frontmatter/);
});

test("an empty brief is named (runner exit 98)", () => {
  assert.match(macJobProblems(job("repo: ~/x", "  \n"))[0], /empty brief/);
});

test("repo: is held to run.sh's rule: ~ or the Mac home only; CRLF and tab are named", () => {
  assert.match(macJobProblems(job("repo: /home/user/x"))[0], /under \$HOME/);
  assert.match(macJobProblems(job("repo: /Users/other/x"))[0], /under \$HOME/);
  assert.match(macJobProblems(job("repo:\t~/x"))[0], /under \$HOME/);
  assert.match(macJobProblems(job("repo: ~/x").replace(/\n/g, "\r\n"))[0], /CRLF/);
});

test("a body of only --- is an empty brief (run.sh drops --- lines)", () => {
  assert.match(macJobProblems(job("repo: ~/x", "---\n"))[0], /empty brief/);
});

test("a brief must say no background tasks, no subagents (600 s ceiling)", () => {
  assert.match(macJobProblems(job("repo: ~/x", "You ARE the job.\n"))[0], /no background tasks/);
});

test("DISC-279: xcodebuild or softwareupdate in a job is named unless the job is purpose: xcode", () => {
  const body = "No background tasks, no subagents.\nRun `xcodebuild -version` and report.\n";
  assert.match(macJobProblems(job("repo: ~/x", body))[0], /xcodebuild.*DISC-279/);
  assert.match(macJobProblems(job("repo: ~/x", "No background tasks, no subagents.\nsudo softwareupdate -l\n"))[0], /softwareupdate/);
  assert.deepEqual(macJobProblems(job("repo: ~/x\npurpose: xcode", body)), []);
});

test("DISC-279: a read-only version read is clean", () => {
  const body = "No background tasks, no subagents.\nplutil -extract CFBundleShortVersionString raw /Applications/Xcode.app/Contents/Info.plist\nxcrun simctl list runtimes\n";
  assert.deepEqual(macJobProblems(job("repo: ~/x", body)), []);
});

test("CLI exits 0 clean, 1 on a missing repo:, 2 on an unreadable file", () => {
  const script = join(dirname(fileURLToPath(import.meta.url)), "mac-job-check.mjs");
  const d = mkdtempSync(join(tmpdir(), "macjob-"));
  const ok = join(d, "ok.md"), bad = join(d, "bad.md");
  writeFileSync(ok, job("repo: ~/JHD/x"));
  writeFileSync(bad, job("from: x"));
  assert.equal(spawnSync("node", [script, ok]).status, 0);
  assert.equal(spawnSync("node", [script, bad]).status, 1);
  assert.equal(spawnSync("node", [script, join(d, "nope.md")]).status, 2);
});

// DISC-233: the runner claims pending/ on origin/main AND every claude/* branch, so a job filed to
// pending/ from a review branch runs before its review PR merges. A job under a review branch's
// checkout belongs in queue/mac/review/ until the PR merges.
import { macJobPathProblems } from "./mac-job-check.mjs";

test("DISC-233: a pending/ job on a checkout that is not main is refused; on main, or in review/, it is clean", () => {
  const p = "/v/queue/mac/pending/job.md";
  assert.match(macJobPathProblems(p, "claude/foo")[0], /queue\/mac\/review\//);
  assert.deepEqual(macJobPathProblems(p, "main"), []);
  assert.deepEqual(macJobPathProblems("/v/queue/mac/review/job.md", "claude/foo"), []);
  assert.deepEqual(macJobPathProblems("/elsewhere/job.md", "claude/foo"), []);
});

test("DISC-233: the CLI applies the path check using the file's git branch", () => {
  const execFileSync = execFileSyncImpl;
  const dir = mkdtempSync(join(tmpdir(), "macjob-"));
  execFileSync("git", ["init", "-q", "-b", "claude/review-x", dir]);
  const pending = join(dir, "queue/mac/pending");
  execFileSync("mkdir", ["-p", pending]);
  const f = join(pending, "j.md");
  writeFileSync(f, job("repo: ~/a/b"));
  const r = spawnSync(process.execPath, [fileURLToPath(new URL("./mac-job-check.mjs", import.meta.url)), f], { encoding: "utf8" });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /review\//);
});
import { execFileSync as execFileSyncImpl } from "node:child_process";

// DISC-258 amber 1 (review of #138): the path check skipped a relative path (no leading slash) and
// let an unreadable branch (detached HEAD, no git) through. Both are refused now; only a readable main passes.
test("DISC-258: a relative pending/ path is checked, and a detached or unreadable branch is refused", () => {
  assert.match(macJobPathProblems("queue/mac/pending/j.md", "claude/foo")[0], /review\//, "relative path");
  assert.match(macJobPathProblems("/v/queue/mac/pending/j.md", "")[0], /unreadable|detached/i, "unknown branch");
  assert.match(macJobPathProblems("/v/queue/mac/pending/j.md", "HEAD")[0], /unreadable|detached/i, "detached HEAD");
  assert.deepEqual(macJobPathProblems("queue/mac/pending/j.md", "main"), []);
  assert.deepEqual(macJobPathProblems("queue/mac/review/j.md", ""), [], "review/ is always fine");
});

test("DISC-258: the CLI refuses a pending/ job in a detached-HEAD checkout", () => {
  const dir = mkdtempSync(join(tmpdir(), "macjob-det-"));
  execFileSyncImpl("git", ["init", "-q", "-b", "main", dir]);
  execFileSyncImpl("git", ["-C", dir, "-c", "user.email=t@e.com", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "i"]);
  execFileSyncImpl("git", ["-C", dir, "checkout", "-q", "--detach"]);
  execFileSyncImpl("mkdir", ["-p", join(dir, "queue/mac/pending")]);
  const f = join(dir, "queue/mac/pending/j.md");
  writeFileSync(f, job("repo: ~/a/b"));
  const r = spawnSync(process.execPath, [fileURLToPath(new URL("./mac-job-check.mjs", import.meta.url)), f], { encoding: "utf8" });
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /detached|unreadable/i);
});

// s83 lesson 2: the runner reads review/ on main within minutes of the merge; nothing moves a job to pending/. The refusal must
// not promise a move, and must say that merging is the go.
test("s83 2: the pending/-on-a-branch refusal names merging as the go and promises no move to pending/", () => {
  const msg = macJobPathProblems("/v/queue/mac/pending/j.md", "claude/foo")[0];
  assert.match(msg, /queue\/mac\/review\//);
  assert.doesNotMatch(msg, /moves it to pending|git mv/);
  assert.match(msg, /merging its PR is the go/);
});
