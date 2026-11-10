#!/usr/bin/env node
/* PreToolUse (mcp__.*__archive_session, whatever the MCP server is called) — DISC-262 (operator 2026-11-07: "just archive the
   helpers we don't archive parent sessions"; s61 archived three wrapped parents by hand). A session may be
   archived only when this session's transcript has shown it as a helper: a get_session / list_sessions result
   carrying that id with a "Helper ·" title AND a parent_session_id. Anything else, a wrapped parent included,
   is denied with the step to take. Fails closed: unreadable input or transcript denies.
   DISC-280 (s71: archiving the Safari helper closed its open draft PR two seconds later): a helper is also
   refused while any PR it opened is unmerged. Its PRs are the create-record tool_results (JSON {url} or a bare PR url) in the transcript's
   list_events reads of that helper (get_session carries none), paged to has_more: false; each needs a pull_request_read
   (method get) in the transcript showing it merged or closed. No list_events read of the helper at all is a refusal, never an allow.
   DISC-284 (s76): reads made by a subagent of this same session count (subagentLines).
   DISC-285: "complete" comes only from an unfiltered backward read chained to the newest page (see unmergedPrs).   */
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
      for (const s of sessionsIn(parsed)) if (s.id === id) found = { title: s.title, parent: s.parent_session_id || null };
    }
  }
  return found;
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

/* PRs the helper itself opened, read from the REAL list_events shape (DISC-281): events are
   { user: { internal_anthropic_catchall: { message: { content: [{ type: "tool_result", tool_use_id, content:
   [{ type: "text", text }] }] } } } }, user-kind pages carry no tool_use. A tool_result is the helper's own PR when
   its text parses to JSON with a top-level `url` that is exactly a PR url (create_pull_request prints
   {"id","url"}), or its WHOLE trimmed text is one PR url (what `gh pr create` prints). A url embedded in other text
   never counts, nor does the JSON of a PR read (it carries number/state/head: a PR the helper only reviewed). */
function* walk(v) {
  if (Array.isArray(v)) { for (const x of v) yield* walk(x); return; }
  if (!v || typeof v !== "object") return;
  yield v;
  for (const x of Object.values(v)) yield* walk(x);
}
const PR_URL = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)$/;
const PR_READ_KEYS = ["number", "state", "head", "base", "merged", "title"];
const textOf = (c) => (typeof c === "string" ? c : Array.isArray(c) ? c.map((x) => (typeof x?.text === "string" ? x.text : "")).join("") : "");

function createdPr(text) {
  const t = text.trim();
  let url = t;
  if (t.startsWith("{")) {
    let j; try { j = JSON.parse(t); } catch { return null; }
    if (!j || typeof j !== "object" || typeof j.url !== "string" || PR_READ_KEYS.some((k) => k in j)) return null;
    url = j.url;
  }
  const m = PR_URL.exec(url);
  return m ? `${m[1]}/${m[2]}#${m[3]}`.toLowerCase() : null;
}

/* A pull_request_read result clears its PR when it is a `get` showing merged, or closed (archiving cannot close
   what is already closed). The result is parsed: a string quoted inside a diff or comment clears nothing. */
const clears = (input, text) => {
  if (input.method !== "get") return false;
  const j = extractJson(text);
  return !!j && typeof j === "object" && (j.merged === true || (typeof j.merged_at === "string" && j.merged_at !== "") || j.state === "closed");
};

/* { read, complete, open }: read = a list_events page of the helper parsed; complete = some page reached the end of
   its history (has_more false), i.e. the helper's events were paged to the oldest; open = PRs not shown merged/closed. */
export function unmergedPrs(lines, id) {
  const reads = [...results(lines, /__list_events$/)].filter((r) => r.input.session_id === id).map((r) => ({ input: r.input, j: extractJson(r.text) })).filter((r) => r.j !== undefined);
  if (!reads.length) return { read: false, complete: false, open: [] };
  const opened = new Set();
  /* DISC-285: complete means the whole history was read. Only an unfiltered backward read counts: no after_id (a forward page
     reaches the NEWEST end, #177 A1) and no kinds filter (has_more describes the unfiltered page, and the filter can drop the
     create-PR record). The newest page has no before_id; an older page counts only when its before_id is the first_id of a
     page already in the chain, so a lone before_id read near the oldest end proves nothing. */
  const eligible = [];
  for (const { input, j } of reads) {
    for (const o of walk(j)) if (o.type === "tool_result") { const pr = createdPr(textOf(o.content)); if (pr) opened.add(pr); }
    if (input.after_id || (Array.isArray(input.kinds) ? input.kinds.length : input.kinds)) continue;
    eligible.push({ before: input.before_id ? String(input.before_id) : null, body: j.ccr ?? j });
  }
  /* A2: resolve the chain from ALL eligible pages, not in transcript order (two subagents' files sort by name): start from the
     page with no before_id and keep adding pages whose before_id is a first_id already in the chain, until nothing is added. */
  const chain = new Set(), used = new Set();
  let complete = false, grew = true;
  while (grew) {
    grew = false;
    eligible.forEach((e, k) => {
      if (used.has(k) || (e.before !== null && !chain.has(e.before))) return;
      used.add(k); grew = true;
      if (e.body.first_id !== undefined) chain.add(String(e.body.first_id));
      if (e.body.has_more === false) complete = true;
    });
  }
  for (const r of results(lines, /__pull_request_read$/))
    if (clears(r.input, r.text)) opened.delete(`${r.input.owner}/${r.input.repo}#${r.input.pullNumber}`.toLowerCase());
  return { read: true, complete, open: [...opened] };
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
  const { read, complete, open } = unmergedPrs([...lines, ...subLines], id);
  if (!read) return `archive_session refused (DISC-280): read the helper's events first (list_events on ${id}); archiving closes any open PR it opened, and this session has not seen which PRs those are.`;
  if (open.length) return `archive_session refused (DISC-280): ${id} opened ${open.join(", ")}, not shown merged or closed; archiving a helper closes its open draft PR (s71). Merge it (pull_request_read, method get, to show it) before archiving.`;
  if (!complete) return `archive_session refused (DISC-281): read the helper's remaining events first (list_events on ${id} reports has_more: true; page back with before_id until it reports false); an unread page may hold a PR it opened.`;
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
