#!/usr/bin/env node
/* PreToolUse (mcp__.*__archive_session, whatever the MCP server is called) — DISC-262 (operator 2026-11-07: "just archive the
   helpers we don't archive parent sessions"; s61 archived three wrapped parents by hand). A session may be
   archived only when this session's transcript has shown it as a helper: a get_session / list_sessions result
   carrying that id with a "Helper ·" title AND a parent_session_id. Anything else, a wrapped parent included,
   is denied with the step to take. Fails closed: unreadable input or transcript denies.
   DISC-280 (s71: archiving the Safari helper closed its open draft PR two seconds later): a helper is also
   refused while any PR it opened is unmerged. Its PRs are the pull/<n> urls in the transcript's list_events
   reads of that helper (get_session carries none); each needs a pull_request_read in the transcript showing
   merged. No list_events read of the helper at all is a refusal, never an allow.                               */
import { readFileSync } from "node:fs";
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

/* PRs the helper opened that the transcript has not shown merged: "owner/repo#n" strings, or null when the
   helper's events were never read. */
export function unmergedPrs(lines, id) {
  const reads = [...results(lines, /__list_events$/)].filter((r) => r.input.session_id === id);
  if (!reads.length) return null;
  const opened = new Set();
  for (const r of reads) for (const m of r.text.matchAll(/github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)/g)) opened.add(`${m[1]}/${m[2]}#${m[3]}`.toLowerCase());
  for (const r of results(lines, /__pull_request_read$/)) {
    if (!/"merged"\s*:\s*true|"merged_at"\s*:\s*"/.test(r.text)) continue;
    opened.delete(`${r.input.owner}/${r.input.repo}#${r.input.pullNumber}`.toLowerCase());
  }
  return [...opened];
}

export function verdict(lines, id) {
  const s = shownSession(lines, id);
  if (!s) return `archive_session refused (DISC-262): this session has not seen ${id} as a helper. Call get_session on it first; only a session titled "Helper ·" with a parent is archived.`;
  if (!/^Helper ·/.test(s.title) || !s.parent) return `archive_session refused (DISC-262): "${s.title}" is a parent session, not a helper. Parent sessions, wrapped or not, are never archived (operator 2026-10-31, 2026-11-07).`;
  const open = unmergedPrs(lines, id);
  if (open === null) return `archive_session refused (DISC-280): read the helper's events first (list_events on ${id}); archiving closes any open PR it opened, and this session has not seen which PRs those are.`;
  if (open.length) return `archive_session refused (DISC-280): ${id} opened ${open.join(", ")}, not shown merged; archiving a helper closes its open draft PR (s71). Merge it (pull_request_read to show it) before archiving.`;
  return null;
}

function main() {
  let input; try { input = JSON.parse(readFileSync(0, "utf8")); } catch { return deny("archive_session refused (DISC-262): hook input unreadable."); }
  const id = input?.tool_input?.session_id;
  if (!id || !input.transcript_path) return deny("archive_session refused (DISC-262): no session id or transcript to check it against.");
  let lines; try { lines = readFileSync(input.transcript_path, "utf8").split("\n").filter(Boolean); } catch { return deny("archive_session refused (DISC-262): transcript unreadable."); }
  const why = verdict(lines, id);
  if (why) deny(why);
}

if (process.argv[1]?.endsWith("archive-guard.mjs")) main();
