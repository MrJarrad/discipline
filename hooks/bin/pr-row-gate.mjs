#!/usr/bin/env node
/* PreToolUse (mcp__github__create_pull_request) — a product PR must name the backlog row it closes
   (DISC-255, operator s58: "is the backlog list up to date? It seems to continuously not be"). A PR
   that cites no row id is how a row stays open after its work merges (PF-934, HB-301): nothing links
   the two, so list-drift-check has nothing to read. The title or body must carry a row id
   (`<PREFIX>-<n>`, 2-4 capitals) or a line `No backlog row: <reason>` for work with no row.
   The vault is exempt: its PRs are the lists themselves. Fails OPEN: unreadable input or a crash
   lets the PR through (a gate that blocks every PR when it breaks is worse than a missed check).  */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { discoverFiles } from "../scripts/lib/queue-ids.mjs";
import { resolveVaultRoot } from "../scripts/lib/vault-root.mjs";

const ROW_ID = /\b([A-Z]{2,4})-\d+[a-z]?\b/g;
/* Tokens shaped like a row id that are not one (DISC-255 review amber: "UTF-8" and "SHA-256" let a PR through
   with no row). Used when the vault's project lists cannot be read; with the lists, only a known prefix counts. */
const LOOK_ALIKES = new Set(["UTF", "SHA", "ISO", "RFC", "CVE", "MD", "TLS", "SSL", "AES", "RSA", "WCAG", "ARIA", "GMT", "UTC", "HTTP", "HTML", "CSS", "SVG", "PNG", "JPEG", "MP", "H", "X", "GPT", "GIF", "PDF", "ES", "PHP", "IPV", "UTF", "OAUTH", "ARM", "USB", "RGB", "HSL"]);

/* The row-id prefixes the vault's project lists declare, or null when no vault is readable here.
   DISCIPLINE_VAULT_ROOT wins (any non-directory value, e.g. "none", means unreadable); else the usual clones. */
function knownPrefixes() {
  const env = process.env.DISCIPLINE_VAULT_ROOT;
  const roots = env !== undefined ? [env] : [join(homedir(), "JHD", "vault"), "/home/user/jhd-vault"];
  for (const r of roots) {
    try {
      if (!r || !existsSync(r)) continue;
      const set = new Set(discoverFiles(resolveVaultRoot(r)).byPrefix.keys());
      if (set.size) return set;
    } catch { /* unreadable: fall back */ }
  }
  return null;
}

function namesRow(text) {
  const known = knownPrefixes();
  for (const m of text.matchAll(ROW_ID)) if (known ? known.has(m[1]) : !LOOK_ALIKES.has(m[1])) return true;
  return false;
}
const NO_ROW = /^\s*No backlog row:\s*\S+/im;

export function prRowProblem({ owner, repo, title, body }) {
  if (!repo || /^jhd-vault$/i.test(String(repo))) return null;
  const text = `${title ?? ""}\n${body ?? ""}`;
  if (namesRow(text) || NO_ROW.test(String(body ?? ""))) return null;
  return `pr-row-gate: ${owner || "?"}/${repo} PR names no backlog row id (DISC-255). Put the row id the PR closes or advances in the title or body (for example "PF-934"), or add a line "No backlog row: <reason>" for work with no row. A row no PR names stays open after the work merges.`;
}

/* s84 lesson 1: a PR to this plugin whose title or branch is about a gate or guard states what the check costs per use
   (the archive guard grew until 27 finished helpers could not be archived in a session). A line `Per-use cost: <text>`. */
const GATE_WORDS = /\b(gate|guard)s?\b/i;
const PER_USE_COST = /^[\s>*_-]*Per-use cost:\**_*[ \t]*[^\s*_]/im; // bold, list and quote forms; the value starts on the same line
export function gateCostProblem({ repo, title, head, body }) {
  if (!/^discipline$/i.test(String(repo ?? ""))) return null;
  if (!GATE_WORDS.test(`${title ?? ""} ${String(head ?? "").replace(/[-_/]/g, " ")}`)) return null;
  if (PER_USE_COST.test(String(body ?? ""))) return null;
  return "pr-row-gate: this PR changes a gate or guard, so its body needs a line \"Per-use cost: <calls or reads one use now takes, and what it cost before>\" (s84: a guard tightened round by round priced its own job out). A check that costs more than a few calls needs a cheaper evidence source; \"Per-use cost: none, no new check\" is allowed when nothing was added.";
}

function main() {
  let input; try { input = JSON.parse(readFileSync(0, "utf8")); } catch { return; }
  if (!/__create_pull_request$/.test(input?.tool_name || "")) return;
  const problem = prRowProblem(input.tool_input || {}) || gateCostProblem(input.tool_input || {});
  if (problem) console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: problem } }));
}

if (process.argv[1]?.endsWith("pr-row-gate.mjs")) { try { main(); } catch { /* fail open */ } }
