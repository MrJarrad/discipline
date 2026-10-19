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
   read in the session (`notesOnly`) whose last page came back short (a full
   page may hide more files), and the merge still pins `expectedHeadSha`.
   Limits: trusted means the repo owner, and every fleet agent posts as that
   login, so the gate proves a verdict-shaped comment exists, not who wrote it.
   A subagent's own reads are not in the parent's transcript.
   Fails closed: unreadable input, any crash, or a failure to load
   merge-after-review.mjs (imported inside the try) denies the merge, naming why. */
import { readFileSync } from "node:fs";

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
   `filesComplete` is false when the latest `get_files` page was full (default
   30 rows, else its `perPage`), so more files may follow;
   `truncated` is set when a result was a persisted-output stub whose file
   could not be read. */
export function prReads(lines, { owner, repo, pullNumber }) {
  const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
  const calls = new Map();
  const out = { items: [], files: null, filesComplete: true, truncated: false };
  for (const line of lines) {
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    const content = Array.isArray(e?.message?.content) ? e.message.content : [];
    for (const part of content) {
      if (part?.type === "tool_use" && /__(pull_request_read|issue_read)$/.test(part.name || "")) calls.set(part.id, part.input || {});
      if (part?.type !== "tool_result") continue;
      const i = calls.get(part.tool_use_id);
      if (!i || !same(i.owner, owner) || !same(i.repo, repo) || Number(i.pullNumber ?? i.issue_number) !== Number(pullNumber)) continue;
      if (!["get_comments", "get_reviews", "get_files"].includes(i.method)) continue;
      let text = Array.isArray(part.content) ? part.content.map((p) => p?.text || "").join("") : String(part.content || "");
      if (text.startsWith("<persisted-output>")) {
        try { text = readFileSync(text.match(/saved to: (\S+)/)[1], "utf8"); } catch { out.truncated = true; continue; }
      }
      let rows;
      try { rows = JSON.parse(text); } catch { continue; }
      if (!Array.isArray(rows)) continue;
      if (i.method === "get_files") {
        out.files = [...(out.files || []), ...rows.map((f) => f.filename)];
        out.filesComplete = rows.length < Number(i.perPage || 30);
      }
      else for (const c of rows) out.items.push({ body: c.body, author: { login: c.user?.login }, at: c.submitted_at ?? c.created_at });
    }
  }
  return out;
}

function check(input, { notesOnly, reviewVerdict }) {
  const t = input.tool_input || {};
  const pr = `${t.owner}/${t.repo}#${t.pullNumber}`;
  let lines = [];
  try { lines = readFileSync(input.transcript_path, "utf8").split("\n"); } catch {}
  const reads = prReads(lines, t);
  const pinned = /^[0-9a-f]{40}$/.test(String(t.expectedHeadSha || ""));
  if (/^mrjarrad$/i.test(String(t.owner)) && /^jhd-vault$/i.test(String(t.repo))) {
    if (!reads.files) deny(`merge-review-gate: ${pr} — a vault merge skips review only when notes-only; read its files with pull_request_read get_files first, or get a reviewer verdict.`);
    if (!reads.filesComplete) deny(`merge-review-gate: ${pr} — the last get_files page was full, so more files may follow; re-read with a larger perPage (or the next page) before merging.`);
    if (notesOnly(reads.files)) {
      if (!pinned) deny(`merge-review-gate: ${pr} — pass expectedHeadSha (the 40-hex head you read the files at) so the merge lands only the head you checked.`);
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
