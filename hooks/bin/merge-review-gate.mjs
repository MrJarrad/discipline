#!/usr/bin/env node
/* PreToolUse (mcp__github__merge_pull_request) — makes "every merge has a
   reviewer verdict first" (`2026-10-09-every-merge-reviewed`) mechanical for
   cloud parents, which merge through the GitHub MCP rather than
   merge-after-review.mjs (#361 merged with no verdict, lesson
   `2026-10-18-helper-waits-for-go`). The hook has no GitHub access of its own,
   so it reads the PR's comments from this session's transcript: the results of
   `pull_request_read` / `issue_read` `get_comments` calls for the same PR. The
   merge must pin `expectedHeadSha`, and a trusted (repo owner) `## Review…`
   comment naming that head must say `merge: yes` (`reviewVerdict`). Notes-only
   vault PRs are the orchestrator's own merge
   (`2026-10-18-orchestrator-merges-own-vault-notes`), so jhd-vault passes. */
import { readFileSync } from "node:fs";
import { reviewVerdict } from "../scripts/merge-after-review.mjs";

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

/* Comments for owner/repo#pull fetched in the transcript, oldest first, shaped `{ body, author: { login } }`. */
export function fetchedComments(lines, { owner, repo, pullNumber }) {
  const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
  const calls = new Map();
  const out = [];
  for (const line of lines) {
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    const content = Array.isArray(e?.message?.content) ? e.message.content : [];
    for (const part of content) {
      if (part.type === "tool_use" && /__(pull_request_read|issue_read)$/.test(part.name || "")) calls.set(part.id, part.input || {});
      if (part.type !== "tool_result") continue;
      const i = calls.get(part.tool_use_id);
      if (!i || i.method !== "get_comments" || !same(i.owner, owner) || !same(i.repo, repo) || Number(i.pullNumber ?? i.issue_number) !== Number(pullNumber)) continue;
      const text = Array.isArray(part.content) ? part.content.map((p) => p.text || "").join("") : String(part.content || "");
      try {
        for (const c of JSON.parse(text)) out.push({ body: c.body, author: { login: c.user?.login } });
      } catch {}
    }
  }
  return out;
}

function main() {
  let input;
  try { input = JSON.parse(readFileSync(0, "utf8")); } catch { process.exit(0); }
  const t = input.tool_input || {};
  if (/^jhd-vault$/i.test(String(t.repo))) process.exit(0);
  const pr = `${t.owner}/${t.repo}#${t.pullNumber}`;
  if (!/^[0-9a-f]{40}$/.test(String(t.expectedHeadSha || ""))) {
    deny(`merge-review-gate: ${pr} — pass expectedHeadSha (the 40-hex head the reviewer verdict names) so the merge lands only the reviewed head.`);
  }
  let lines = [];
  try { lines = readFileSync(input.transcript_path, "utf8").split("\n"); } catch {}
  const review = reviewVerdict(fetchedComments(lines, t), t.expectedHeadSha, [t.owner]);
  if (review?.verdict === "yes") process.exit(0);
  deny(`merge-review-gate: ${pr} — ${review ? "the latest reviewer verdict says merge: no" : "no reviewer verdict"} with merge: yes on head ${t.expectedHeadSha.slice(0, 7)} in this session (\`2026-10-09-every-merge-reviewed\`). Dispatch the reviewer; once its verdict comment (\`## Review… head <sha>\` … \`merge: yes\`) is on the PR, read it with pull_request_read get_comments, then merge.`);
}

if (process.argv[1] && process.argv[1].endsWith("merge-review-gate.mjs")) main();
