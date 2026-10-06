#!/usr/bin/env node
/* mac-job-check — lints a queue/mac/pending/<job>.md file BEFORE it is filed.
   Mirrors the runner's refusals (vault estate/mac-queue/run.sh): a missing,
   empty or non-$HOME `repo:` frontmatter line is exit 97, an empty brief is
   exit 98 (backlog 81: a job failed exit 97 without `repo:`, 2026-10-05).

   Interface: macJobProblems(fileText) -> string[] (empty = clean).
   CLI: node mac-job-check.mjs <job file> — exit 0 clean · 1 problem (named on
   stderr) · 2 usage error or unreadable file.                              */
import { existsSync, readFileSync } from "node:fs";

export function macJobProblems(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(String(text));
  if (!m) return ["no frontmatter block (a job opens with --- … --- carrying repo:)"];
  const line = /^repo:[ \t]*(.*)$/m.exec(m[1]);
  const repo = line ? line[1].replace(/["']/g, "").trim() : "";
  const problems = [];
  if (!repo) problems.push("repo: line missing or empty (runner exit 97)");
  else if (!(repo.startsWith("~") || repo.startsWith("/Users/") || repo.startsWith("/home/")))
    problems.push(`repo: '${repo}' is not under $HOME (runner exit 97)`);
  if (!m[2].trim()) problems.push("empty brief (runner exit 98)");
  return problems;
}

function main() {
  const file = process.argv[2];
  if (!file || !existsSync(file)) {
    console.error(`mac-job-check: cannot read ${file}`);
    process.exit(2);
  }
  const problems = macJobProblems(readFileSync(file, "utf8"));
  for (const p of problems) console.error(`mac-job-check: ${file}: ${p}`);
  process.exit(problems.length ? 1 : 0);
}

if (process.argv[1] && process.argv[1].endsWith("mac-job-check.mjs")) main();
