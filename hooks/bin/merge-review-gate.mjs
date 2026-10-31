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
   Notes-only MrJarrad/jhd-vault PRs are the orchestrator's own merge
   (`2026-10-18-orchestrator-merges-own-vault-notes`), proven by a `get_files`
   read in the session (`notesOnly`) that listed every page, page 1 through a
   short one (a full page may hide more files), and the merge still pins
   `expectedHeadSha`. Limit: a `get_files` result carries no sha, so the pin
   proves the merge lands the head named, not that the files were read at it.
   Lighter proof (DISC-224): a Bash run of `vault-pr-files.mjs --pr <n>` in the session
   whose JSON line is complete, names the pinned head and only notes; it lists names
   from local git, bound to that sha, instead of every patch.
   Limits: trusted means the repo owner, and every fleet agent posts as that
   login, so the gate proves a verdict-shaped comment exists, not who wrote it.
   A subagent's own reads are not in the parent's transcript.
   Fails closed: unreadable input, any crash, or a failure to load
   merge-after-review.mjs (imported inside the try) denies the merge, naming why. */
import { readFileSync } from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";

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
  const calls = new Map(), bash = new Map();
  const saves = transcriptPath ? join(dirname(transcriptPath), basename(transcriptPath, ".jsonl"), "tool-results") + sep : "";
  const out = { items: [], files: null, filesComplete: true, truncated: false, stamps: [] };
  const pages = new Map();
  for (const line of lines) {
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    const content = Array.isArray(e?.message?.content) ? e.message.content : [];
    for (const part of content) {
      if (part?.type === "tool_use" && /__(pull_request_read|issue_read)$/.test(part.name || "")) calls.set(part.id, part.input || {});
      if (part?.type === "tool_use" && part.name === "Bash") bash.set(part.id, String(part.input?.command || ""));
      if (part?.type !== "tool_result") continue;
      if (bash.has(part.tool_use_id)) {
        /* vault-pr-files.mjs (DISC-224): its one JSON line, from a command that runs the script for
           this PR. A stamp echoed by hand or printed for another PR is not proof. */
        const cmd = bash.get(part.tool_use_id);
        /* The whole command is one plain run of the script: no other command can print after it. */
        const plain = /^[ \t]*node[ \t]+[^\s;&|`$<>()\\]*vault-pr-files\.mjs(?:[ \t]+[^\s;&|`$<>()\\'"]+)*[ \t]*$/.test(cmd);
        const m = plain && cmd.match(/[ \t]--pr[ \t]+(\d+)(?:[ \t]|$)/);
        if (!m || Number(m[1]) !== Number(pullNumber)) continue;
        const text = Array.isArray(part.content) ? part.content.map((p) => p?.text || "").join("") : String(part.content || "");
        let v;
        try { v = JSON.parse(text.trim().split("\n").pop()).vaultPrFiles; } catch { continue; }
        if (v && Number(v.pr) === Number(pullNumber)) out.stamps.push(v);
        continue;
      }
      const i = calls.get(part.tool_use_id);
      if (!i || !same(i.owner, owner) || !same(i.repo, repo) || Number(i.pullNumber ?? i.issue_number) !== Number(pullNumber)) continue;
      if (!["get_comments", "get_reviews", "get_files"].includes(i.method)) continue;
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
      try { rows = JSON.parse(text); } catch { continue; }
      if (Array.isArray(rows) && rows.length && rows.every((r) => r?.type === "text" && typeof r.text === "string")) {
        try { rows = JSON.parse(rows.map((r) => r.text).join("")); } catch { continue; }
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

function check(input, { notesOnly, reviewVerdict }) {
  const t = input.tool_input || {};
  const pr = `${t.owner}/${t.repo}#${t.pullNumber}`;
  let lines = [];
  try { lines = readFileSync(input.transcript_path, "utf8").split("\n"); } catch {}
  const reads = prReads(lines, t, input.transcript_path);
  const pinned = /^[0-9a-f]{40}$/.test(String(t.expectedHeadSha || ""));
  if (/^mrjarrad$/i.test(String(t.owner)) && /^jhd-vault$/i.test(String(t.repo))) {
    /* Reads can fail to prove notes-only (a page over the size limit and unreadable, a gap), but
       a reviewer's merge: yes on the pinned head clears the merge on its own (DISC-205). */
    const cleared = pinned && reviewVerdict(reads.items, t.expectedHeadSha, [t.owner])?.verdict === "yes";
    if (cleared && (!reads.files || !reads.filesComplete)) process.exit(0);
    /* A vault-pr-files result on the pinned head proves notes-only without get_files (DISC-224). */
    if (pinned && reads.stamps.some((v) => v.complete === true && v.head === t.expectedHeadSha && Array.isArray(v.files) && notesOnly(v.files))) process.exit(0);
    if (!reads.files) deny(`merge-review-gate: ${pr} — a vault merge skips review only when notes-only; prove it with \`node <plugin>/hooks/scripts/vault-pr-files.mjs --vault <vault> --pr ${t.pullNumber}\` (names only, at the head you pin), or read its files with pull_request_read get_files, or get a reviewer verdict.`);
    if (!reads.filesComplete) deny(`merge-review-gate: ${pr} — the get_files reads do not cover every page (page 1 through a page shorter than perPage, which GitHub caps at 100, every page at the same perPage), so a file may be missing; read the pages in order before merging.`);
    if (notesOnly(reads.files)) {
      if (!pinned) deny(`merge-review-gate: ${pr} — pass expectedHeadSha (the 40-hex head you are merging) so the merge lands only that head.`);
      process.exit(0);
    }
    const other = reads.files.filter((f) => !notesOnly([f]));
    if (!other.length) deny(`merge-review-gate: ${pr} — the get_files read listed no files; re-read it before merging.`);
    if (!pinned) deny(`merge-review-gate: ${pr} is not notes-only (${other.join(", ")}); it needs a reviewer verdict and a pinned expectedHeadSha.`);
  }
  if (!pinned) {
    deny(`merge-review-gate: ${pr} — pass expectedHeadSha (the 40-hex head the reviewer verdict names) so the merge lands only the reviewed head.`);
  }
  const review = reviewVerdict(reads.items, t.expectedHeadSha, [t.owner]);
  if (review?.verdict === "yes") process.exit(0);
  const head = t.expectedHeadSha.slice(0, 7);
  const lacks = reads.truncated ? "the verdict read was truncated; re-read the comments and reviews with a smaller perPage —" : "no reviewer verdict";
  deny(`merge-review-gate: ${pr} — ${review ? `the latest reviewer verdict on head ${head} says merge: no` : `${lacks} with merge: yes on head ${head} in this session`} (every merge needs merge: yes on the head it pins, \`2026-10-09-every-merge-reviewed\`). Dispatch the reviewer; once its verdict (shape: agents/reviewer.md § Verdict) is on the PR as a comment or review, read it with pull_request_read get_comments / get_reviews, then merge.`);
}

if (process.argv[1] && process.argv[1].endsWith("merge-review-gate.mjs")) {
  try {
    const { notesOnly, reviewVerdict } = await import("../scripts/merge-after-review.mjs");
    check(JSON.parse(readFileSync(0, "utf8")), { notesOnly, reviewVerdict });
  } catch (err) {
    deny(`merge-review-gate failed closed — ${err.message}. The merge is refused until the gate runs cleanly; re-run the merge, or report the gate error.`);
  }
}
