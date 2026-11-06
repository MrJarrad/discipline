#!/usr/bin/env node
/* PreToolUse (mcp__github__create_pull_request) — a product PR must name the backlog row it closes
   (DISC-255, operator s58: "is the backlog list up to date? It seems to continuously not be"). A PR
   that cites no row id is how a row stays open after its work merges (PF-934, HB-301): nothing links
   the two, so list-drift-check has nothing to read. The title or body must carry a row id
   (`<PREFIX>-<n>`, 2-4 capitals) or a line `No backlog row: <reason>` for work with no row.
   The vault is exempt: its PRs are the lists themselves. Fails OPEN: unreadable input or a crash
   lets the PR through (a gate that blocks every PR when it breaks is worse than a missed check).  */
import { readFileSync } from "node:fs";

const ROW_ID = /\b[A-Z]{2,4}-\d+[a-z]?\b/;
const NO_ROW = /^\s*No backlog row:\s*\S+/im;

export function prRowProblem({ owner, repo, title, body }) {
  if (!repo || /^jhd-vault$/i.test(String(repo))) return null;
  const text = `${title ?? ""}\n${body ?? ""}`;
  if (ROW_ID.test(text) || NO_ROW.test(String(body ?? ""))) return null;
  return `pr-row-gate: ${owner || "?"}/${repo} PR names no backlog row id (DISC-255). Put the row id the PR closes or advances in the title or body (for example "PF-934"), or add a line "No backlog row: <reason>" for work with no row. A row no PR names stays open after the work merges.`;
}

function main() {
  let input; try { input = JSON.parse(readFileSync(0, "utf8")); } catch { return; }
  if (!/__create_pull_request$/.test(input?.tool_name || "")) return;
  const problem = prRowProblem(input.tool_input || {});
  if (problem) console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: problem } }));
}

if (process.argv[1]?.endsWith("pr-row-gate.mjs")) { try { main(); } catch { /* fail open */ } }
