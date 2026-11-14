#!/usr/bin/env node
/* PreToolUse (mcp__.*__archive_session, whatever the MCP server is called) — DISC-262 (operator 2026-11-07: "just archive the
   helpers we don't archive parents"; s61 archived three wrapped parents by hand). A session may be
   archived only when this session's transcript has shown it as a helper: a get_session / list_sessions result
   carrying that id with a "Helper ·" title AND a parent_session_id. Anything else, a wrapped parent included,
   is denied with the step to take. Fails closed: unreadable input or transcript denies.
   DISC-280 (s71: archiving the Safari helper closed its open draft PR two seconds later): a helper is refused while it has an
   open PR. DISC-315 (operator s84: "we were able to do this easily previously and now it's impossible"): that is checked by a
   direct open-PR lookup, not by paging the helper's whole event history (DISC-280/281/285). The transcript must hold, for the
   helper, (1) a lookup of open PRs naming its session id (descriptions carry the opening session's link) and (2) one naming each
   branch get_session shows for it (PRs without the link; a body search can lag a fresh PR, a head: search does not). Only one lookup form is read (see LOOKUP_TOOL):
   a search whose query is exactly `is:pr is:open <id or head:branch>`; any open PR it returns refuses; a lookup that is missing, a
   different form, made before the get_session, or truncated refuses, and so does a helper still working. DISC-284 (s76): reads made by a subagent of this
   same session count (subagentLines).   */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { extractJson } from "../scripts/lib/extract-json.mjs";

const deny = (reason) => {
  console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } }));
  process.exit(0);
};
const SHOWS = /__(get_session|list_sessions)$/;

/* Session objects (anything with an id and a title) found anywhere inside a parsed value. */
function* sessionsIn(v) {
  if (Array.isArray(v)) { for (const x of v) yield* sessionsIn(x); return; }
  if (!v || typeof v !== "object") return;
  if (typeof v.id === "string" && typeof v.title === "string") yield v;
  for (const x of Object.values(v)) yield* sessionsIn(x);
}

/* The last-shown { title, parent_session_id } for `id` in the transcript, or null. */
export function shownSession(lines, id) {
  const calls = new Set();
  let found = null;
  for (const [at, line] of lines.entries()) {
    let e; try { e = JSON.parse(line); } catch { continue; }
    for (const part of Array.isArray(e?.message?.content) ? e.message.content : []) {
      if (part?.type === "tool_use" && SHOWS.test(part.name || "")) calls.add(part.id);
      if (part?.type !== "tool_result" || !calls.has(part.tool_use_id)) continue;
      const c = part.content;
      const text = typeof c === "string" ? c : Array.isArray(c) ? c.map((x) => (typeof x?.text === "string" ? x.text : "")).join("") : "";
      const parsed = extractJson(text);
      if (parsed === undefined) continue;
      for (const s of sessionsIn(parsed)) if (s.id === id) found = { title: s.title, parent: s.parent_session_id || null, branches: [...branchesIn(s)], ts: e.timestamp, working: /(WORKING|RUNNING)$/i.test(String(s.status_bucket ?? "")) || /(WORKING|RUNNING)$/i.test(String(s.session_status ?? s.status ?? "")), at };
    }
  }
  return found;
}

/* Branch names anywhere inside a get_session object: a helper's external_metadata.current_branches values, a parent's
   session_context.outcomes[].git_info.branches, outcome_branch. */
function* branchesIn(v) {
  if (Array.isArray(v)) { for (const x of v) yield* branchesIn(x); return; }
  if (!v || typeof v !== "object") return;
  for (const [k, x] of Object.entries(v)) {
    if (k === "branches" && Array.isArray(x)) for (const b of x) { if (typeof b === "string" && b) yield b; }
    else if (k === "outcome_branch" && typeof x === "string" && x) yield x;
    else if (k === "current_branches" && x && typeof x === "object") for (const b of Object.values(x)) { if (typeof b === "string" && b) yield b; }
    else yield* branchesIn(x);
  }
}

/* Results of tool calls whose name matches `nameRe`, as { input, text }. */
function* results(lines, nameRe, from = 0) {
  const calls = new Map();
  for (const [i, line] of lines.entries()) {
    if (i < from) continue;
    let e; try { e = JSON.parse(line); } catch { continue; }
    for (const part of Array.isArray(e?.message?.content) ? e.message.content : []) {
      if (part?.type === "tool_use" && nameRe.test(part.name || "")) calls.set(part.id, part.input || {});
      if (part?.type !== "tool_result" || !calls.has(part.tool_use_id)) continue;
      const c = part.content;
      yield { input: calls.get(part.tool_use_id), ts: e.timestamp, text: typeof c === "string" ? c : Array.isArray(c) ? c.map((x) => (typeof x?.text === "string" ? x.text : "")).join("") : "" };
    }
  }
}

/* DISC-315 round 2: the ONE accepted lookup form (review of #200: every wider form let a lookup of something else clear the
   helper). A search whose query is exactly `is:pr is:open <term>`: no repo:, author:, negation or other qualifier, term = the
   helper's session id, or head:<one of its branches>, matched as a whole token. Run as `gh api -X GET search/issues -f q='<query>'`
   alone (no pipe, no wrapper) or as the MCP search_pull_requests tool. Its result must be the search object, untruncated. */
const LOOKUP_TOOL = /^Bash$|__search_pull_requests$/;
const GH_SEARCH = /^\s*gh api -X GET search\/issues -f q=(?:'([^']*)'|"([^"]*)")\s*$/;
const queryOf = (input) => {
  if (typeof input.command === "string") { const m = GH_SEARCH.exec(input.command); return m ? (m[1] ?? m[2]) : null; }
  return typeof input.query === "string" && Object.keys(input).length === 1 ? input.query : null; /* any scoping param (owner, repo) makes it another lookup */
};
/* The term of an accepted query, or null. */
function termOf(query) {
  const rest = query.trim().split(/\s+/).filter(Boolean);
  for (const need of ["is:pr", "is:open"]) { const k = rest.indexOf(need); if (k < 0) return null; rest.splice(k, 1); }
  return rest.length === 1 ? rest[0] : null;
}
/* The PRs an accepted lookup returned, or null when the result is not the untruncated search object. */
export function listed(text) {
  const j = extractJson(text);
  if (!j || typeof j !== "object" || Array.isArray(j) || !Array.isArray(j.items)) return null;
  if (j.incomplete_results === true || typeof j.total_count !== "number" || j.total_count > j.items.length) return null;
  return j.items;
}

/* "owner/repo#n" for a search item (its URL when it is not a pull URL). */
export function prName(p) {
  const url = p?.html_url || p?.url || `#${p?.number ?? "?"}`;
  const m = /github\.com\/([\w.-]+\/[\w.-]+)\/pull\/(\d+)/.exec(url);
  return m ? `${m[1]}#${m[2]}` : url;
}

/* DISC-325: the second accepted lookup form. `node "<this plugin's scripts dir>/archive-prep.mjs" --session <id> [--branches a,b]`,
   alone (no pipe, wrapper or substitution), prints { lookups: [{ query, result }] }: the same searches, run by the script. The
   command is pinned to the one archive-prep.mjs beside this guard (a script at any other path could print a fake clear lookup,
   review A1), and its output is read from the harness-written tool_result, so a typed-in echo is not it; each lookup then goes
   through the same termOf / listed checks as a gh search. Not covered: an agent that rewrites the plugin's own archive-prep.mjs. */
const PREP_SCRIPT = fileURLToPath(new URL("../scripts/archive-prep.mjs", import.meta.url));
const PREP_CMD = new RegExp(`^\\s*node "${PREP_SCRIPT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}" --session [\\w./:-]+(?: --branches [\\w./:,-]+)?\\s*$`);
/* [{ query, text }] for one Bash/MCP call: its single gh search, or each lookup an archive-prep run printed. */
function lookupsOf(input, text) {
  if (typeof input.command === "string" && PREP_CMD.test(input.command)) {
    const j = extractJson(text);
    return Array.isArray(j?.lookups) ? j.lookups.map((l) => ({ query: String(l?.query ?? ""), text: JSON.stringify(l?.result) })) : [];
  }
  const q = queryOf(input);
  return q ? [{ query: q, text }] : [];
}

/* { open, missing }: open = PRs an accepted lookup returned for the helper's id or a branch; missing = names with no accepted
   lookup. `from`: lookups in the parent's own transcript count only after its last get_session of the helper. */
export function openPrLookup(lines, id, branches = [], subLines = [], from = 0, since = null) {
  const covered = new Set(), open = new Set();
  /* A subagent's lines carry no position relative to the parent's, so they are ordered by their time stamps: a lookup with no
     stamp, or earlier than the parent's last get_session of the helper (or with no stamp on that sighting), does not count. */
  const later = (ts) => !!since && !!ts && Date.parse(ts) >= Date.parse(since);
  const subs = [...results(subLines, LOOKUP_TOOL)].filter((r) => later(r.ts));
  for (const { input, text: raw } of [...results(lines, LOOKUP_TOOL, from), ...subs]) for (const { query: q, text } of lookupsOf(input, raw)) {
    const term = termOf(q);
    const name = term === id ? id : branches.find((b) => term === `head:${b}`);
    const prs = name && listed(text);
    if (!prs) continue;
    covered.add(name);
    for (const p of prs) {
      if (p?.state !== undefined && String(p.state).toLowerCase() !== "open") continue;
      open.add(prName(p));
    }
  }
  return { open: [...open], missing: [id, ...branches].filter((w) => !covered.has(w)) };
}

/* DISC-284: transcripts of this session's subagents, at <transcript dir>/<transcript name>/subagents/agent-*.jsonl.
   Their list_events pages and pull_request_read results count as reads; who a session is (the helper title) is only
   ever taken from the parent's own sight. */
export function subagentLines(transcriptPath) {
  const dir = join(dirname(transcriptPath), basename(transcriptPath, ".jsonl"), "subagents");
  let files; try { files = readdirSync(dir).filter((f) => /^agent-.*\.jsonl$/.test(f)).sort(); } catch { return []; }
  const out = [];
  for (const f of files) { try { out.push(...readFileSync(join(dir, f), "utf8").split("\n").filter(Boolean)); } catch { /* an unreadable subagent file adds nothing, so it can only keep a refusal */ } }
  return out;
}

export function verdict(lines, id, subLines = []) {
  const s = shownSession(lines, id);
  if (!s) return `archive_session refused (DISC-262): this session has not seen ${id} as a helper. Call get_session on it first; only a session titled "Helper ·" with a parent is archived.`;
  if (!/^Helper ·/.test(s.title) || !s.parent) return `archive_session refused (DISC-262): "${s.title}" is a parent session, not a helper. Parent sessions, wrapped or not, are never archived (operator 2026-10-31, 2026-11-07).`;
  if (s.working) return `archive_session refused (DISC-315): ${id} is still working; a PR it opens next is not yet findable by a body search (s84). Archive it once it is idle.`;
  const { open, missing } = openPrLookup(lines, id, s.branches, subLines, s.at, s.ts);
  if (open.length) return `archive_session refused (DISC-315/280): ${id} has open PR(s) ${open.join(", ")}; archiving a helper closes its open draft PR (s71). Merge or close it first.`;
  if (missing.length) return `archive_session refused (DISC-315): no readable, untruncated open-PR lookup names ${missing.join(", ")}. Run it first, exactly: gh api -X GET search/issues -f q='is:pr is:open <session id>' (no repo:, no pipe), and the same with head:<branch> for each branch; after the get_session; then archive.`;
  return null;
}

function main() {
  let input; try { input = JSON.parse(readFileSync(0, "utf8")); } catch { return deny("archive_session refused (DISC-262): hook input unreadable."); }
  const id = input?.tool_input?.session_id;
  if (!id || !input.transcript_path) return deny("archive_session refused (DISC-262): no session id or transcript to check it against.");
  let lines; try { lines = readFileSync(input.transcript_path, "utf8").split("\n").filter(Boolean); } catch { return deny("archive_session refused (DISC-262): transcript unreadable."); }
  const why = verdict(lines, id, subagentLines(input.transcript_path));
  if (why) deny(why);
}

if (process.argv[1]?.endsWith("archive-guard.mjs")) main();
