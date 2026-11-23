#!/usr/bin/env node
// preview-sha-check — the gate before a preview link goes to the operator:
// origin's branch head must equal the sha the lane claims, and (with --checks)
// the check runs for that exact sha must have passed. A 200 from the preview
// proves nothing about which build it serves.
//   node preview-sha-check.mjs --branch <b> --sha <claimed> [--repo <dir>] [--checks <owner/repo>]
// Exit 0 send the link · 1 head differs or branch absent · 2 checks not passed · 3 could not read.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { realpathSync } from "node:fs";

export const EXIT = { OK: 0, HEAD_MISMATCH: 1, CHECKS_NOT_PASSED: 2, UNREADABLE: 3 };

const short = (s) => String(s).slice(0, 7);

export function checkPreviewSha({ branch, sha, lsRemote, checkRuns }) {
  const head = headCheck({ branch, sha, lsRemote });
  if (head.code !== EXIT.OK || !checkRuns) return head;
  const cr = checkRuns(sha);
  if (!cr.ok) return { code: EXIT.UNREADABLE, message: `could not read check runs for ${short(sha)}: ${cr.stderr || "no detail"}` };
  if (!cr.runs.length) return { code: EXIT.CHECKS_NOT_PASSED, message: `no check run for ${short(sha)} yet: wait, then re-run` };
  const notPassed = cr.runs.filter((r) => r.status !== "completed" || !["success", "neutral", "skipped"].includes(r.conclusion));
  if (notPassed.length) {
    const list = notPassed.map((r) => `${r.name} (${r.conclusion ?? r.status})`).join(", ");
    return { code: EXIT.CHECKS_NOT_PASSED, message: `checks for ${short(sha)} not passed: ${list}` };
  }
  return { code: EXIT.OK, message: `${head.message}; ${cr.runs.length} check run(s) passed` };
}

function headCheck({ branch, sha, lsRemote }) {
  const ls = lsRemote(branch);
  if (!ls.ok) return { code: EXIT.UNREADABLE, message: `could not read origin ${branch}: ${ls.stderr || "no detail"}` };
  const head = ls.stdout.trim().split(/\s+/)[0];
  if (!head) return { code: EXIT.HEAD_MISMATCH, message: `${branch} is not on origin: do not send the link` };
  if (head !== sha) {
    return { code: EXIT.HEAD_MISMATCH, message: `origin ${branch} is at ${short(head)}, the lane claims ${short(sha)}: do not send the link` };
  }
  return { code: EXIT.OK, message: `origin ${branch} is at ${short(sha)}` };
}

const exec = (cmd, args) => {
  const r = spawnSync(cmd, args, { encoding: "utf8" });
  return { ok: r.status === 0, stdout: r.stdout ?? "", stderr: (r.stderr ?? "").trim() };
};

function main(args) {
  const get = (f) => { const i = args.indexOf(f); return i === -1 ? undefined : args[i + 1]; };
  const branch = get("--branch"), sha = get("--sha"), repo = get("--repo") ?? ".", slug = get("--checks");
  if (args.includes("--help") || !branch || !sha) {
    console.error("Usage: node preview-sha-check.mjs --branch <b> --sha <claimed sha> [--repo <dir>] [--checks <owner/repo>]\nExit 0 send the link · 1 head differs or branch absent · 2 checks not passed · 3 could not read.");
    process.exit(args.includes("--help") ? 0 : EXIT.UNREADABLE);
  }
  const lsRemote = (b) => exec("git", ["-C", repo, "ls-remote", "origin", `refs/heads/${b}`]);
  const checkRuns = slug && ((s) => {
    const r = exec("gh", ["api", `repos/${slug}/commits/${s}/check-runs?per_page=100`]);
    if (!r.ok) return r;
    try { return { ok: true, runs: JSON.parse(r.stdout).check_runs ?? [] }; } catch { return { ok: false, stderr: "unparseable check-runs reply" }; }
  });
  const res = checkPreviewSha({ branch, sha, lsRemote, checkRuns });
  (res.code === EXIT.OK ? console.log : console.error)(res.message);
  process.exit(res.code);
}

const invoked = process.argv[1] && realpathSync(process.argv[1]);
if (invoked && invoked === realpathSync(fileURLToPath(import.meta.url))) main(process.argv.slice(2));
