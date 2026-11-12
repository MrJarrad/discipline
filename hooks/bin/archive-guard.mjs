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
   branch get_session shows for it (PRs without the link). A lookup is a `gh api` / `gh pr list` call or a list/search
   pull-requests MCP call restricted to open PRs, whose result parsed and was not truncated. Any open PR it returns for the id or a
   branch refuses; a lookup that is missing, unreadable or truncated refuses. DISC-284 (s76): reads made by a subagent of this
   same session count (subagentLines).   */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname, basename } from "node:path";
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
  for (const line of lines) {
    let e; try { e = JSON.parse(line); } catch { continue; }
    for (const part of Array.isArray(e?.message?.content) ? e.message.content : []) {
      if (part?.type === "tool_use" && SHOWS.test(part.name || "")) calls.add(part.id);
      if (part?.type !== "tool_result" || !calls.has(part.tool_use_id)) continue;
      const c = part.content;
      const text = typeof c === "string" ? c : Array.isArray(c) ? c.map((x) => (typeof x?.text === "string" ? x.text : "")).join("") : "";
      const parsed = extractJson(text);
      if (parsed === undefined) continue;
      for (const s of sessionsIn(parsed)) if (s.id === id) found = { title: s.title, parent: s.parent_session_id || null, branches: [...branchesIn(s)] };
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
function* results(lines, nameRe) {
  const calls = new Map();
  for (const line of lines) {
    let e; try { e = JSON.parse(line); } catch { continue; }
    for (const part of Array.isArray(e?.message?.content) ? e.message.content : []) {
      if (part?.type === "tool_use" && nameRe.test(part.name || "")) calls.set(part.id, part.input || {});
      if (part?.type !== "tool_result" || !calls.has(part.tool_use_id)) continue;
      const c = part.content;
      yield { input: calls.get(part.tool_use_id), text: typeof c === "string" ? c : Array.isArray(c) ? c.map((x) => (typeof x?.text === "string" ? x.text : "")).join("") : "" };
    }
  }
}

/* An open-PR lookup: a gh call (api search/pulls, pr list) or a list/search pull-requests MCP call, restricted to open PRs. */
const LOOKUP_TOOL = /^Bash$|__(list_pull_requests|search_pull_requests)$/;
const inputText = (input) => JSON.stringify(input ?? {});
const isOpenLookup = (input) => {
  const t = inputText(input);
  if (typeof input.command === "string") return /\bgh (api|pr list)\b/.test(input.command) && /is:open|state=open|--state[ =]open/.test(input.command);
  return input.state === "open" || /is:open/.test(t);
};

/* The PRs a lookup result lists, or null when the result is unreadable or truncated (search: total_count above the items
   returned, or incomplete_results). */
function listed(text) {
  const j = extractJson(text);
  if (Array.isArray(j)) return j;
  if (!j || typeof j !== "object" || !Array.isArray(j.items)) return null;
  if (j.incomplete_results === true || (typeof j.total_count === "number" && j.total_count > j.items.length)) return null;
  return j.items;
}

/* { open, missing }: open = PRs a lookup returned for the helper (named by its id or a branch in the lookup's input, or whose
   description holds the id or whose head is one of its branches); missing = what no readable, untruncated lookup covered. */
export function openPrLookup(lines, id, branches = []) {
  const want = [id, ...branches];
  const covered = new Set(), open = new Set();
  for (const { input, text } of results(lines, LOOKUP_TOOL)) {
    if (!isOpenLookup(input)) continue;
    const prs = listed(text);
    if (!prs) continue;
    const named = want.filter((w) => inputText(input).includes(w));
    for (const w of named) covered.add(w);
    for (const p of prs) {
      const url = p?.html_url || p?.url || `#${p?.number ?? "?"}`;
      const m = /github\.com\/([\w.-]+\/[\w.-]+)\/pull\/(\d+)/.exec(url);
      const ref = p?.head?.ref ?? p?.head;
      const hit = named.length || String(p?.body ?? "").includes(id) || (typeof ref === "string" && branches.includes(ref));
      if (hit && (p?.state === undefined || p.state === "open")) open.add(m ? `${m[1]}#${m[2]}` : url);
    }
  }
  return { open: [...open], missing: want.filter((w) => !covered.has(w)) };
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
  const { open, missing } = openPrLookup([...lines, ...subLines], id, s.branches);
  if (open.length) return `archive_session refused (DISC-315/280): ${id} has open PR(s) ${open.join(", ")}; archiving a helper closes its open draft PR (s71). Merge or close it first.`;
  if (missing.length) return `archive_session refused (DISC-315): no readable, untruncated open-PR lookup names ${missing.join(", ")}. Run it first, e.g. gh api -X GET search/issues -f q='is:pr is:open <session id or head:<branch>>' (one call per name), then archive.`;
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
