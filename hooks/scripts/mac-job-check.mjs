#!/usr/bin/env node
/* mac-job-check — lints a queue/mac/pending/<job>.md file BEFORE it is filed.
   Mirrors the runner's refusals (vault estate/mac-queue/run.sh): a missing,
   empty or non-$HOME `repo:` frontmatter line is exit 97, an empty brief is
   exit 98 (backlog 81: a job failed exit 97 without `repo:`, 2026-10-05).

   Interface: macJobProblems(fileText) -> string[] (empty = clean).
   CLI: node mac-job-check.mjs <job file> — exit 0 clean · 1 problem (named on
   stderr) · 2 usage error or unreadable file.                              */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

// The Mac user's home — run.sh requires `repo:` under $HOME; an absolute path is
// accepted only below this (override with JHD_MAC_HOME), as is `~/…`; the bare home is refused.
const MAC_HOME = (process.env.JHD_MAC_HOME || "/Users/jarrad.harvey").replace(/\/+$/, "");
export const NO_BACKGROUND = /no background tasks,? no subagents/i;

export function macJobProblems(text) {
  const t = String(text);
  // run.sh parses with awk `/^---$/` — a CRLF file has no frontmatter to it (exit 97).
  if (t.includes("\r")) return ["CRLF line endings: the runner reads no frontmatter (exit 97); save with LF"];
  const lines = t.split("\n");
  const fences = [];
  lines.forEach((l, i) => { if (l === "---") fences.push(i); });
  if (lines[0] !== "---" || fences.length < 2)
    return ["no frontmatter block (a job opens with --- … --- carrying repo:)"];
  // run.sh: first `repo:` line between the first and second fence, `repo:` + spaces only (a tab is kept).
  const head = lines.slice(1, fences[1]);
  const line = head.find((l) => l.startsWith("repo:"));
  const repo = line === undefined ? "" : line.replace(/^repo:[ ]*/, "").replace(/["']/g, "");
  const problems = [];
  if (!repo.trim()) problems.push("repo: line missing or empty (runner exit 97)");
  // run.sh expands a leading `~` to $HOME, then requires `$HOME/*`: the bare home itself is refused.
  else if (!(repo.startsWith("~/") || repo.startsWith(MAC_HOME + "/")))
    problems.push(`repo: '${repo}' is not under $HOME (a path below ~/ or ${MAC_HOME}/, not the home itself; runner exit 97)`);
  // run.sh brief: every line after the first fence pair, minus any `---` line.
  const body = lines.slice(fences[1] + 1).filter((l) => l !== "---").join("\n");
  if (!body.trim()) problems.push("empty brief (runner exit 98)");
  else if (!NO_BACKGROUND.test(body))
    problems.push('brief lacks "no background tasks, no subagents" (a headless job that backgrounds work is killed at the 600 s ceiling)');
  return problems;
}

/* DISC-233: the runner claims `queue/mac/pending/` on origin/main AND every origin/claude/* branch, so a
   job filed to pending/ from a review branch runs before its review PR merges. On any checkout that is
   not main, a job belongs in `queue/mac/review/` until the PR merges (MAC-JOBS.md). */
export function macJobPathProblems(file, branch) {
  // Absolute first: a relative `queue/mac/pending/j.md` has no leading slash and used to be skipped (DISC-258).
  const abs = resolve(String(file)).replace(/\\/g, "/");
  if (!/\/queue\/mac\/pending\/[^/]+$/.test(abs)) return [];
  if (branch === "main") return [];
  // Only a readable main passes: a detached HEAD or an unreadable checkout counts as not-main.
  const where = !branch || branch === "HEAD" ? "a checkout whose branch is unreadable (detached HEAD or not a git checkout)" : `branch '${branch}'`;
  return [`filed in queue/mac/pending/ on ${where}: the runner claims it before its review PR merges; file it in queue/mac/review/ until the merge moves it to pending/ (DISC-233)`];
}

function branchOf(file) {
  try { return execFileSync("git", ["-C", dirname(file), "symbolic-ref", "--short", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return ""; }
}

function main() {
  const file = process.argv[2];
  if (!file || !existsSync(file)) {
    console.error(`mac-job-check: cannot read ${file}`);
    process.exit(2);
  }
  const problems = [...macJobProblems(readFileSync(file, "utf8")), ...macJobPathProblems(file, branchOf(file))];
  for (const p of problems) console.error(`mac-job-check: ${file}: ${p}`);
  process.exit(problems.length ? 1 : 0);
}

if (process.argv[1] && process.argv[1].endsWith("mac-job-check.mjs")) main();
