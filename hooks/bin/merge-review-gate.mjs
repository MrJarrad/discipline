#!/usr/bin/env node
/* PreToolUse (mcp__github__merge_pull_request) — makes "every merge has a
   reviewer verdict first" (`2026-10-09-every-merge-reviewed`) mechanical for
   cloud parents, which merge through the GitHub MCP rather than
   merge-after-review.mjs (#361 merged with no verdict, lesson
   `2026-10-18-helper-waits-for-go`). The hook has no GitHub access of its own,
   so it reads the PR from this session's transcript: `pull_request_read` /
   `issue_read` `get_comments` and `get_reviews` results for the same PR (a
   persisted-output stub is read from its saved file). The merge must pin
   `expectedHeadSha`, and a verdict on that head in the shape `agents/reviewer.md`
   § Verdict defines must say `merge: yes` (`reviewVerdict`).
   Notes-only MrJarrad/jhd-vault PRs are the coordinator's own merge
   (`2026-10-18-coordinator-merges-own-vault-notes`), proven by a `get_files`
   read in the session (`notesOnly`) that listed every page, page 1 through a
   short one (a full page may hide more files), and the merge still pins
   `expectedHeadSha`. Limit: a `get_files` result carries no sha, so the pin
   proves the merge lands the head named, not that the files were read at it.
   Lighter proof (DISC-224): a Bash run of this plugin's own `hooks/scripts/vault-pr-files.mjs`
   (absolute path, one plain command) for this PR whose JSON line is complete, names the
   pinned head, a MrJarrad/jhd-vault origin and only notes; it lists names from GitHub's
   merge ref for the PR, bound to that sha, instead of every patch.
   DISC-395: a vault merge also needs a list-drift-check stamp in the session (a plain Bash run of this plugin's own
   list-drift-check.mjs with --vault and --new-vs) naming the pinned head, a clean tree and no failing finding added
   over its base. It replaces DISC-360's required `get_check_runs` read: the vault runs no PR-triggered Actions
   (`2026-11-26-no-pr-triggered-actions`), so there are no runs to require. A session that did read check runs is still
   refused on a red, unfinished, other-head or unreadable result (R15 stays, nothing loosened).
   DISC-296: when the session never read get_me, the authenticated gh user counts too (gh unavailable -> owner only).
   DISC-277: trusted means the repo owner and the login in this session's own \`get_me\` result (an
   org-owned repo's owner never posts); a commenter cannot write a tool result. Limits: every fleet agent posts as that
   login, so the gate proves a verdict-shaped comment exists, not who wrote it.
   A subagent's own reads are not in the parent's transcript.
   Fails closed: unreadable input, any crash, or a failure to load
   merge-after-review.mjs (imported inside the try) denies the merge, naming why. */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

/* vault-pr-files.mjs as installed beside this gate; a copy anywhere else is not proof (r1 red 1). */
const OWN_SCRIPT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "scripts", "vault-pr-files.mjs");
/* list-drift-check.mjs beside this gate: the vault merge's drift proof (DISC-395). */
const OWN_LIST_CHECK = resolve(dirname(fileURLToPath(import.meta.url)), "..", "scripts", "list-drift-check.mjs");
/* The clone the stamp came from must fetch from MrJarrad/jhd-vault (r1 amber 1). */
const VAULT_ORIGIN = /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)mrjarrad\/jhd-vault(?:\.git)?\/?$/i;

function deny(reason) {
  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason,
    },
  }));
  process.exit(0);
}

/* The PR's reads in the transcript: `{ items, files, truncated }`. `items` are
   comments and reviews shaped `{ body, author: { login }, at }`, oldest first;
   `files` are changed paths from `get_files`, or null when never read, and
   `filesComplete` is true only when pages 1..k of `get_files` were all read and
   page k came back short, every page read at the same size (`perPage`, default
   30, at most 100 as GitHub caps it; pages of different sizes cover different
   rows), so no file can be missing;
   `truncated` is set when a result was a persisted-output stub whose file
   could not be read. */
export function prReads(lines, { owner, repo, pullNumber }, transcriptPath) {
  const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
  const calls = new Map(), bash = new Map(), meCalls = new Set();
  const saves = transcriptPath ? join(dirname(transcriptPath), basename(transcriptPath, ".jsonl"), "tool-results") + sep : "";
  const out = { items: [], files: null, filesComplete: true, truncated: false, stamps: [], driftStamps: [], me: [], checks: null, checksBad: false };
  const pages = new Map();
  for (const line of lines) {
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    const content = Array.isArray(e?.message?.content) ? e.message.content : [];
    for (const part of content) {
      if (part?.type === "tool_use" && /__(pull_request_read|issue_read)$/.test(part.name || "")) calls.set(part.id, part.input || {});
      if (part?.type === "tool_use" && /^mcp__github__get_me$/.test(part.name || "")) meCalls.add(part.id);
      if (part?.type === "tool_use" && part.name === "Bash") bash.set(part.id, String(part.input?.command || ""));
      if (part?.type !== "tool_result") continue;
      if (meCalls.has(part.tool_use_id)) {
        /* DISC-277: the session's own authenticated login, from the result of its own get_me call. */
        const t = Array.isArray(part.content) ? part.content.map((p) => p?.text || "").join("") : String(part.content || "");
        try { const l = JSON.parse(t).login; if (typeof l === "string" && l) out.me.push(l); } catch {}
        continue;
      }
      if (bash.has(part.tool_use_id)) {
        /* vault-pr-files.mjs (DISC-224): its one JSON line, from a command that runs the script for
           this PR. A stamp echoed by hand or printed for another PR is not proof. */
        const cmd = bash.get(part.tool_use_id);
        /* The whole command is one plain run of the script: no other command can print after it. */
        const run = cmd.match(/^[ \t]*node[ \t]+([^\s;&|`$<>()\\'"]+)((?:[ \t]+[^\s;&|`$<>()\\'"]+)*)[ \t]*$/);
        if (!run || resolve(run[1]) !== run[1] || (run[1] !== OWN_SCRIPT && run[1] !== OWN_LIST_CHECK)) continue; // the gate's own sibling copies only
        if (run[1] === OWN_LIST_CHECK) {
          /* DISC-395: only a plain --new-vs check counts: --vault, --new-vs and --repo with a value each; --fix, --stale and the rest are other runs. */
          const w = run[2].trim().split(/[ \t]+/);
          const flags = w.filter((x) => x.startsWith("-"));
          if (w.length % 2 || !flags.every((x) => ["--vault", "--new-vs", "--repo"].includes(x)) || flags.length !== w.length / 2 || !flags.includes("--vault") || !flags.includes("--new-vs")) continue;
          const t = Array.isArray(part.content) ? part.content.map((p) => p?.text || "").join("") : String(part.content || "");
          let d;
          try { d = JSON.parse(t.trim().split("\n").pop()).listDriftCheck; } catch { continue; }
          if (d && VAULT_ORIGIN.test(String(d.origin || ""))) out.driftStamps.push(d);
          continue;
        }
        const m = run[2].match(/[ \t]--pr[ \t]+(\d+)(?:[ \t]|$)/);
        if (!m || Number(m[1]) !== Number(pullNumber)) continue;
        const text = Array.isArray(part.content) ? part.content.map((p) => p?.text || "").join("") : String(part.content || "");
        let v;
        try { v = JSON.parse(text.trim().split("\n").pop()).vaultPrFiles; } catch { continue; }
        if (v && Number(v.pr) === Number(pullNumber) && VAULT_ORIGIN.test(String(v.origin || ""))) out.stamps.push(v);
        continue;
      }
      const i = calls.get(part.tool_use_id);
      if (!i || !same(i.owner, owner) || !same(i.repo, repo) || Number(i.pullNumber ?? i.issue_number) !== Number(pullNumber)) continue;
      if (!["get_comments", "get_reviews", "get_files", "get_check_runs"].includes(i.method)) continue;
      let text = Array.isArray(part.content) ? part.content.map((p) => p?.text || "").join("") : String(part.content || "");
      /* Over the tool-result limit the harness saves a result to disk and replaces it with one of
         two exact shapes, anchored at the start of the result: a `<persisted-output>` block
         ("...saved to: <path>"), or the error "result (N characters) exceeds maximum allowed
         tokens. Output has been saved to <path>". A phrase anywhere else (a filename, a comment
         body) is data, not a harness stub. The path must resolve inside this session's own
         `<transcript dir>/<transcript name>/tool-results/`.
         The file's text may be the rows or a content-block wrapper around them
         (`[{ "type": "text", "text": "[...]" }]`). */
      const stub = text.match(/^<persisted-output>[^]*?\bsaved to:? (\S+)/) || text.match(/^(?:Error: )?result(?: \([^)]*\))? exceeds maximum allowed tokens\. Output has been saved to (\S+?)\.?(?:\s|$)/);
      if (stub) {
        const path = resolve(stub[1]);
        if (!transcriptPath || !path.startsWith(saves)) { out.truncated = true; continue; }
        try { text = readFileSync(path, "utf8"); } catch { out.truncated = true; continue; }
      }
      let rows;
      try { rows = JSON.parse(text); } catch { if (i.method === "get_check_runs") out.checksBad = true; continue; }
      if (Array.isArray(rows) && rows.length && rows.every((r) => r?.type === "text" && typeof r.text === "string")) {
        try { rows = JSON.parse(rows.map((r) => r.text).join("")); } catch { continue; }
      }
      if (i.method === "get_check_runs") {
        /* DISC-360 R15: the latest read wins; the result is `{ check_runs: [...] }` or the bare array. */
        const runs = Array.isArray(rows) ? rows : rows?.check_runs;
        if (Array.isArray(runs)) { out.checks = runs; out.checksBad = false; } else out.checksBad = true;
        continue;
      }
      if (!Array.isArray(rows)) continue;
      if (i.method === "get_files") {
        out.files = [...(out.files || []), ...rows.map((f) => f.filename)];
        pages.set(Number(i.page || 1), { n: rows.length, size: Math.min(Number(i.perPage || 30), 100) });
      }
      else for (const c of rows) out.items.push({ body: c.body, author: { login: c.user?.login }, at: c.submitted_at ?? c.created_at });
    }
  }
  if (out.files) {
    out.filesComplete = false;
    const first = pages.get(1)?.size;
    for (let p = 1; pages.has(p); p++) {
      const { n, size } = pages.get(p);
      if (size !== first) break;
      if (n < size) { out.filesComplete = true; break; }
    }
  }
  return out;
}

/* The authenticated gh user's login (DISCIPLINE_GH overrides the binary for tests), or [] when gh is unavailable. */
function ghLogin() {
  try {
    const login = execFileSync(process.env.DISCIPLINE_GH || "gh", ["api", "user", "--jq", ".login"], { encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "ignore"] }).trim();
    return login ? [login] : [];
  } catch { return []; }
}

const RED_CONCLUSIONS = new Set(["failure", "cancelled", "timed_out", "action_required", "startup_failure", "stale"]);

/* DISC-360 R15 (lesson 2026-11-06-s59 #1): null when the latest get_check_runs read in the session shows no red
   check on the pinned head, else the reason. A run with no head_sha or no status fails closed;
   an empty list is a PR with no checks. */
export function checkRunsProblem(runs, head, unreadable = false) {
  const how = "read the PR's check runs with pull_request_read get_check_runs, and merge only when none is red";
  if (unreadable && !runs) return `the get_check_runs result could not be read: it must be the raw tool result, JSON that is either \`{ "check_runs": [...] }\` or the bare array of runs (not a summary or an edited copy). Call pull_request_read get_check_runs again and pass nothing through a pipe or a rewrite`;
  if (!runs) return `no check-runs read in this session: ${how}`;
  const bare = runs.filter((r) => !r?.head_sha || !r?.status);
  if (bare.length) return `check run ${bare.map((r) => r?.name || "(unnamed)").join(", ")} carries no head_sha or no status, so it cannot be tied to the pinned head ${String(head).slice(0, 7)} as finished: re-read it with pull_request_read get_check_runs; the merge needs every run to name its head and be completed`;
  const other = runs.filter((r) => r?.head_sha && String(r.head_sha).toLowerCase() !== String(head).toLowerCase());
  if (other.length) return `the check runs read are for another head (${String(other[0].head_sha).slice(0, 7)}), not ${String(head).slice(0, 7)}: re-read them at the pinned head`;
  const red = runs.filter((r) => RED_CONCLUSIONS.has(String(r?.conclusion || "").toLowerCase()));
  if (red.length) return `check run ${red.map((r) => `${r.name} (${r.conclusion})`).join(", ")} is red: fix it, never merge over it`;
  const open = runs.filter((r) => r?.status && r.status !== "completed");
  if (open.length) return `check run ${open.map((r) => r.name).join(", ")} has not finished: wait, re-read, then merge`;
  return null;
}

/* DISC-395: null when a list-drift-check stamp in the session names the pinned head, a clean tree and no failing finding
   added over its base, else the reason. Limit: the stamp's base is whatever worktree the run named; the gate cannot tell
   it is current origin/main, so the command in the reason says to build it from a fresh fetch. */
export function driftProblem(stamps, head) {
  const how = `run \`node ${OWN_LIST_CHECK} --vault <worktree of the PR head> --new-vs <worktree of a fresh origin/main>\` (that absolute path, run plain: no pipe, no redirect, no --fix) and merge only when it adds no failing finding`;
  if (!stamps.length) return `no list-drift-check result in this session: ${how}`;
  const mine = stamps.filter((d) => String(d.head || "").toLowerCase() === String(head).toLowerCase());
  if (!mine.length) return `the list-drift-check results in this session are for another head (${String(stamps.at(-1).head || "?").slice(0, 7)}), not ${String(head).slice(0, 7)}: ${how}`;
  const based = mine.filter((d) => /^[0-9a-f]{40}$/i.test(String(d.base || "")) && String(d.base).toLowerCase() !== String(head).toLowerCase());
  if (!based.length) return `the list-drift-check result names no base different from head ${String(head).slice(0, 7)}, so it compared the PR with itself: ${how}`;
  const ok = based.filter((d) => d.clean === true && d.added === 0);
  if (ok.length) return null;
  const d = based.at(-1);
  return d.clean !== true ? `the list-drift-check ran on a tree with uncommitted changes, so it does not describe head ${String(head).slice(0, 7)}: commit or clean the worktree and re-run` : `list-drift-check adds ${d.added} failing finding(s) over its base: fix them, then re-run`;
}

/* The vault merge's gates (DISC-395): the drift stamp is required; DISC-360 R15's check-run refusal stays when the session read
   check runs (the vault has no PR-triggered Actions, ruling 2026-11-26-no-pr-triggered-actions, so most sessions read none). */
function vaultProblem(reads, head) {
  return driftProblem(reads.driftStamps, head) || (reads.checks || reads.checksBad ? checkRunsProblem(reads.checks, head, reads.checksBad) : null);
}

function check(input, { notesOnly, reviewVerdict }) {
  const t = input.tool_input || {};
  const pr = `${t.owner}/${t.repo}#${t.pullNumber}`;
  let lines = [];
  try { lines = readFileSync(input.transcript_path, "utf8").split("\n"); } catch {}
  const reads = prReads(lines, t, input.transcript_path);
  const pinned = /^[0-9a-f]{40}$/.test(String(t.expectedHeadSha || ""));
  const isVault = /^mrjarrad$/i.test(String(t.owner)) && /^jhd-vault$/i.test(String(t.repo));
  if (isVault) {
    /* DISC-395: every way a vault merge clears (notes-only or a reviewer's yes) also needs the drift stamp on the pinned head. */
    const clear = () => {
      const problem = vaultProblem(reads, t.expectedHeadSha);
      if (problem) deny(`merge-review-gate: ${pr} — ${problem}.`);
      process.exit(0);
    };
    /* Reads can fail to prove notes-only (a page over the size limit and unreadable, a gap), but
       a reviewer's merge: yes on the pinned head clears the merge on its own (DISC-205). */
    const cleared = pinned && reviewVerdict(reads.items, t.expectedHeadSha, [t.owner])?.verdict === "yes";
    if (cleared && (!reads.files || !reads.filesComplete)) clear();
    /* A vault-pr-files result on the pinned head proves notes-only without get_files (DISC-224). */
    if (pinned && reads.stamps.some((v) => v.complete === true && v.head === t.expectedHeadSha && Array.isArray(v.files) && notesOnly(v.files))) clear();
    if (!reads.files) deny(`merge-review-gate: ${pr} — a vault merge skips review only when notes-only; prove it with \`node ${OWN_SCRIPT} --vault <vault> --pr ${t.pullNumber}\` (that absolute path, run plain, exactly as printed: no pipe, no redirect; names only, at the head you pin), or read its files with pull_request_read get_files, or get a reviewer verdict.`);
    if (!reads.filesComplete) deny(`merge-review-gate: ${pr} — the get_files reads do not cover every page (page 1 through a page shorter than perPage, which GitHub caps at 100, every page at the same perPage), so a file may be missing; read the pages in order before merging.`);
    if (notesOnly(reads.files)) {
      if (!pinned) deny(`merge-review-gate: ${pr} — pass expectedHeadSha (the 40-hex head you are merging) so the merge lands only that head.`);
      clear();
    }
    const other = reads.files.filter((f) => !notesOnly([f]));
    if (!other.length) deny(`merge-review-gate: ${pr} — the get_files read listed no files; re-read it before merging.`);
    if (!pinned) deny(`merge-review-gate: ${pr} is not notes-only (${other.join(", ")}); it needs a reviewer verdict and a pinned expectedHeadSha.`);
  }
  if (!pinned) {
    deny(`merge-review-gate: ${pr} — pass expectedHeadSha (the 40-hex head the reviewer verdict names) so the merge lands only the reviewed head.`);
  }
  /* DISC-277: on an org-owned repo the owner is the org, which never posts; the verdicts come from the
     session's own authenticated account, read from its get_me result (not from any comment body). */
  /* DISC-296: a session that never called get_me still has an authenticated gh user, the account the verdict
     comment is posted from (as trustedLogins() in merge-after-review.mjs); gh unavailable -> the owner alone. */
  const me = reads.me.length ? reads.me : ghLogin();
  const review = reviewVerdict(reads.items, t.expectedHeadSha, [t.owner, ...me]);
  if (review?.verdict === "yes") {
    const problem = isVault ? vaultProblem(reads, t.expectedHeadSha) : null;
    if (problem) deny(`merge-review-gate: ${pr} — ${problem}.`);
    process.exit(0);
  }
  const head = t.expectedHeadSha.slice(0, 7);
  const lacks = reads.truncated ? "the verdict read was truncated; re-read the comments and reviews with a smaller perPage —" : "no reviewer verdict";
  const meHint = me.length ? "" : " This session has not read get_me and gh has no authenticated user, so only the repo owner's login counts; on an org-owned repo call get_me first, then merge.";
  deny(`merge-review-gate: ${pr} — ${review ? `the latest reviewer verdict on head ${head} says merge: no` : `${lacks} with merge: yes on head ${head} in this session`} (every merge needs merge: yes on the head it pins, \`2026-10-09-every-merge-reviewed\`). Dispatch the reviewer; once its verdict (shape: agents/reviewer.md § Verdict) is on the PR as a comment or review, read it with pull_request_read get_comments / get_reviews, then merge.${meHint}`);
}

if (process.argv[1] && process.argv[1].endsWith("merge-review-gate.mjs")) {
  try {
    const { notesOnly, reviewVerdict } = await import("../scripts/merge-after-review.mjs");
    check(JSON.parse(readFileSync(0, "utf8")), { notesOnly, reviewVerdict });
  } catch (err) {
    deny(`merge-review-gate failed closed — ${err.message}. The merge is refused until the gate runs cleanly; re-run the merge, or report the gate error.`);
  }
}
