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
