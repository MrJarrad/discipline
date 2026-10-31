#!/usr/bin/env node
/* vault-pr-files — a vault PR's changed paths at its head, from local git (DISC-224).
   A notes-only vault merge needs proof that every changed file is a note
   (`2026-10-18-orchestrator-merges-own-vault-notes`). `pull_request_read get_files`
   proves it by putting every patch in context (s44: 43.8k chars for three PRs before
   the first status reply); this proves it with names only, and binds them to a sha.

     node vault-pr-files.mjs --vault <vault clone> --pr <n> [--head <40-hex sha>]

   Fetches `refs/pull/<n>/head` and `refs/pull/<n>/merge` from the clone's origin. The
   merge ref is GitHub's merge of the head into the PR's own base, so its first parent
   is that base's tip whatever the base is; `files` is the diff from that parent to the
   merge, which is what the merge would change. Prints one JSON line:
     {"vaultPrFiles":{"pr":n,"head":"<sha>","files":[...],"complete":true,"origin":"<url>"}}
   `complete` is false, with a `reason`, when a fetch fails (no merge ref: a conflicted
   or closed PR), the merge ref was built on another head, or `--head` names another
   commit. merge-review-gate checks `origin` is MrJarrad/jhd-vault and reads this line
   from the Bash result in the session transcript.                                     */
import { spawnSync } from "node:child_process";

export function prFiles({ vault, pr, head }) {
  const git = (...a) => {
    const r = spawnSync("git", ["-C", vault, ...a], { encoding: "utf8", timeout: 120000, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
    return { ok: r.status === 0, out: (r.stdout || "").trim(), err: (r.stderr || r.error?.message || "").trim().split("\n")[0] };
  };
  const o = git("remote", "get-url", "origin");
  const origin = o.ok ? o.out : null;
  const fail = (reason, extra = {}) => ({ pr, head: null, files: [], complete: false, origin, reason, ...extra });
  const ref = (k) => `refs/vault-pr-files/${pr}/${k}`;
  const f = git("fetch", "-q", "--depth=2", "origin", `+refs/pull/${pr}/head:${ref("head")}`, `+refs/pull/${pr}/merge:${ref("merge")}`);
  if (!f.ok) return fail(`fetch failed (no merge ref means a conflicted or closed PR): ${f.err}`);
  const h = git("rev-parse", ref("head"));
  if (!h.ok) return fail("no head after fetch");
  if (head && head !== h.out) return fail(`head is ${h.out}, not ${head}`, { head: h.out });
  const parents = git("rev-parse", `${ref("merge")}^1`, `${ref("merge")}^2`);
  if (!parents.ok) return fail(`merge ref has no two parents: ${parents.err}`, { head: h.out });
  const [base, merged] = parents.out.split("\n");
  if (merged !== h.out) return fail(`merge ref was built on ${merged}, not the head ${h.out}; re-run once GitHub rebuilds it`, { head: h.out });
  const d = git("diff", "--name-only", "--no-renames", base, ref("merge"));
  if (!d.ok) return fail(`diff failed: ${d.err}`, { head: h.out });
  return { pr, head: h.out, files: d.out ? d.out.split("\n") : [], complete: true, origin };
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
