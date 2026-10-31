#!/usr/bin/env node
/* vault-pr-files — a vault PR's changed paths at its head, from local git (DISC-224).
   A notes-only vault merge needs proof that every changed file is a note
   (`2026-10-18-orchestrator-merges-own-vault-notes`). `pull_request_read get_files`
   proves it by putting every patch in context (s44: 43.8k chars for three PRs before
   the first status reply); this proves it with names only, and binds them to a sha.

     node vault-pr-files.mjs --vault <vault clone> --pr <n> [--head <40-hex sha>]

   Fetches `main` and `refs/pull/<n>/head` from origin (bounded depth: clones are
   shallow), and prints one JSON line:
     {"vaultPrFiles":{"pr":n,"head":"<sha>","files":[...],"complete":true}}
   `files` is the diff from the merge base to the head, as GitHub lists a PR's files.
   `complete` is false, with a `reason`, when the fetch fails, no merge base is found,
   or `--head` names another commit; merge-review-gate then refuses the stamp.
   The gate reads this line from the Bash result in the session transcript. */
import { spawnSync } from "node:child_process";

const DEPTH = "200";

export function prFiles({ vault, pr, head }) {
  const git = (...a) => {
    const r = spawnSync("git", ["-C", vault, ...a], { encoding: "utf8", timeout: 120000, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
    return { ok: r.status === 0, out: (r.stdout || "").trim(), err: (r.stderr || r.error?.message || "").trim().split("\n")[0] };
  };
  const fail = (reason, extra = {}) => ({ pr, head: null, files: [], complete: false, reason, ...extra });
  const f = git("fetch", "-q", `--depth=${DEPTH}`, "origin", "+main:refs/vault-pr-files/main", `+refs/pull/${pr}/head:refs/vault-pr-files/${pr}`);
  if (!f.ok) return fail(`fetch failed: ${f.err}`);
  const h = git("rev-parse", `refs/vault-pr-files/${pr}`);
  if (!h.ok) return fail("no head after fetch");
  if (head && head !== h.out) return fail(`head is ${h.out}, not ${head}`, { head: h.out });
  const base = git("merge-base", "refs/vault-pr-files/main", h.out);
  if (!base.ok) return fail(`no merge base within ${DEPTH} commits`, { head: h.out });
  const d = git("diff", "--name-only", "--no-renames", base.out, h.out);
  if (!d.ok) return fail(`diff failed: ${d.err}`, { head: h.out });
  return { pr, head: h.out, files: d.out ? d.out.split("\n") : [], complete: true };
}

if (process.argv[1] && process.argv[1].endsWith("vault-pr-files.mjs")) {
  const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
  const vault = arg("--vault"), pr = Number(arg("--pr")), head = arg("--head");
  if (!vault || !Number.isInteger(pr) || pr <= 0) {
    console.error("usage: node vault-pr-files.mjs --vault <vault clone> --pr <n> [--head <sha>]");
    process.exit(2);
  }
  console.log(JSON.stringify({ vaultPrFiles: prFiles({ vault, pr, head }) }));
}
