#!/usr/bin/env node
/* helper-sweep — which un-archived sessions to archive, keep, or surface (DISC-211;
   operator 2026-10-28: "archive it when it's task is complete or if another session takes over").
   A script cannot call archive_session (an MCP tool), so this only sorts; the parent archives.

   node helper-sweep.mjs --self <session id> --sessions <list_sessions.json> [--sessions <page2.json>]
     [--keep <id,...>]    helpers whose PR still waits on a look or review
     [--merged <id,...>]  helpers whose PR is merged
     [--now <ISO>]
   Input files are saved list_sessions results (raw {"ccr":{"data":[…]}}, {data:[…]} or an array)
   or saved get_session results ({"ccr":{…one session…}}).

   Interface: classify({ sessions, self, now, keep, merged, staleHours }) -> { archive, keep, surface, repoint },
   each row { id, title, reason }. `repoint` (DISC-221, lesson 2026-10-31-s43 #4: s42's helpers kept
   messaging the wrapped s42 parent) repeats every kept or surfaced helper whose parent is wrapped or
   archived, each with `message`: the one send_message text that points it at `self`.                                                              */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const WRAPPED = /\(wrapped\)\s*$/; // the end marker wrap sets, not the word anywhere in a title
const isArchived = (x) => /ARCHIVED/.test(x.session_status || "");
/** A helper has a parent AND a "Helper ·" title; every other session is a parent (operator 2026-10-31). */
const isHelper = (x) => Boolean(x.parent_session_id) && /^Helper ·/.test(x.title || "");

/** Hours without an update after which a "working" helper under a wrapped parent is surfaced. */
export const STALE_HOURS = 12;

export function classify({ sessions, self, now, keep = [], merged = [], staleHours = STALE_HOURS }) {
  const out = { archive: [], keep: [], surface: [], repoint: [] };
  const byId = new Map(sessions.map((x) => [x.id, x]));
  for (const x of sessions) {
    if (x.id === self || isArchived(x)) continue;
    if (!isHelper(x)) continue; // a parent session is never archived and lands in no list
    const parent = byId.get(x.parent_session_id);
    const parentLive = parent && !isArchived(parent) && !WRAPPED.test(parent.title || "");
    const add = (list, reason) => {
      out[list].push({ id: x.id, title: x.title, reason });
      if (list !== "archive" && !parentLive) out.repoint.push({ id: x.id, title: x.title, reason: "its parent wrapped or was archived",
        message: `Your parent session ${x.parent_session_id} has wrapped; ${self} is your parent now. Send every return, question and verdict with send_message (session_id "${self}"), not "@parent".` });
    };
    if (keep.includes(x.id)) { add("keep", "PR waits on a look or review"); continue; }
    const bucket = String(x.status_bucket || "").replace("SESSION_STATUS_BUCKET_", "").toLowerCase();
    if (parentLive) {
      if (merged.includes(x.id) && bucket === "completed") add("archive", "PR merged and helper completed");
      else add("keep", "its parent is live and owns it");
      continue;
    }
    const why = parent && !isArchived(parent) ? "parent wrapped" : "parent archived";
    if (bucket === "completed") add("archive", `completed; ${why}`);
    else if (bucket === "working") {
      const quietH = (Date.parse(now) - Date.parse(x.updated_at)) / 3.6e6;
      if (!Number.isFinite(quietH)) add("surface", `working, no update time; ${why}`);
      else if (quietH > staleHours) add("surface", `working but quiet ${Math.floor(quietH)}h; ${why}`);
      else add("keep", `still working; ${why}`);
    } else add("surface", `${bucket || "unknown"}; ${why}, nobody is answering it`);
  }
  return out;
}

function readPages(paths) {
  return paths.flatMap((p) => {
    const j = JSON.parse(readFileSync(p, "utf8"));
    if (Array.isArray(j)) return j;
    if (j.ccr?.id) return [j.ccr]; // one saved get_session result (DISC-224: the start sweep reads only the helpers wrap named)
    return j.ccr?.data ?? j.data ?? [];
  });
}

function main(argv) {
  const opt = { sessions: [], keep: [], merged: [] };
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i].replace(/^--/, ""), v = argv[i + 1];
    if (v === undefined || v.startsWith("--")) { opt.bad = true; break; }
    if (k === "sessions") opt.sessions.push(v);
    else if (k === "keep" || k === "merged") opt[k].push(...v.split(",").filter(Boolean));
    else opt[k] = v;
  }
  if (opt.bad || !opt.self || !opt.sessions.length) {
    console.error("usage: helper-sweep.mjs --self <id> --sessions <file> [--sessions <file>] [--keep ids] [--merged ids] [--now ISO]");
    return 2;
  }
  const r = classify({ sessions: readPages(opt.sessions), self: opt.self, now: opt.now || new Date().toISOString(), keep: opt.keep, merged: opt.merged });
  const block = (hd, rows) => [`## ${hd} (${rows.length})`, ...rows.map((x) => `- ${x.id} | ${x.title} | ${x.reason}`), ""].join("\n");
  const repoint = [`## Re-point (${r.repoint.length})`, ...r.repoint.map((x) => `- ${x.id} | ${x.message}`), ""].join("\n");
  console.log([block("Archive", r.archive), block("Keep", r.keep), block("Surface", r.surface), repoint].join("\n"));
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exitCode = main(process.argv.slice(2));
