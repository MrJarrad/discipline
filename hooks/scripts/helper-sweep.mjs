#!/usr/bin/env node
/* helper-sweep — which un-archived sessions to archive, keep, or surface (DISC-211;
   operator 2026-10-28: "archive it when it's task is complete or if another session takes over").
   A script cannot call archive_session (an MCP tool), so this only sorts; the parent archives.

   node helper-sweep.mjs --self <session id> --sessions <list_sessions.json> [--sessions <page2.json>]
     [--keep <id,...>]    helpers whose PR still waits on a look or review
     [--merged <id,...>]  helpers whose PR is merged
     [--now <ISO>]
   Input files are saved list_sessions results (raw {"ccr":{"data":[…]}}, {data:[…]} or an array).

   Interface: classify({ sessions, self, now, keep, merged, staleHours }) -> { archive, keep, surface },
   each row { id, title, reason }.                                                              */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const TALK_HERE = /← talk here/;
const WRAPPED = /\(wrapped\)/;

/** Hours without an update after which a "working" helper under a wrapped parent is surfaced. */
export const STALE_HOURS = 12;

export function classify({ sessions, self, now, keep = [], merged = [], staleHours = STALE_HOURS }) {
  const out = { archive: [], keep: [], surface: [] };
  const byId = new Map(sessions.map((x) => [x.id, x]));
  const today = new Date(now).toISOString().slice(0, 10);
  for (const x of sessions) {
    if (x.id === self || /ARCHIVED/.test(x.session_status || "")) continue;
    const add = (list, reason) => out[list].push({ id: x.id, title: x.title, reason });
    if (TALK_HERE.test(x.title)) { add("keep", "titled ← talk here"); continue; }
    if (!x.parent_session_id) {
      const earlier = x.created_at.slice(0, 10) < today;
      if (!earlier) add("keep", "parent session from today");
      else if (WRAPPED.test(x.title)) add("archive", "wrapped parent from an earlier day");
      else add("surface", "earlier-day parent never marked (wrapped)");
      continue;
    }
    if (keep.includes(x.id)) { add("keep", "PR waits on a look or review"); continue; }
    const bucket = String(x.status_bucket || "").replace("SESSION_STATUS_BUCKET_", "").toLowerCase();
    const parent = byId.get(x.parent_session_id);
    const parentLive = parent && !WRAPPED.test(parent.title);
    if (parentLive) {
      if (merged.includes(x.id) && bucket === "completed") add("archive", "PR merged and helper completed");
      else add("keep", "its parent is live and owns it");
      continue;
    }
    const why = parent ? "parent wrapped" : "parent archived";
    if (bucket === "completed") add("archive", `completed; ${why}`);
    else if (bucket === "working") {
      const quietH = (Date.parse(now) - Date.parse(x.updated_at)) / 3.6e6;
      if (quietH > staleHours) add("surface", `working but quiet ${Math.floor(quietH)}h; ${why}`);
      else add("keep", `still working; ${why}`);
    } else add("surface", `${bucket || "unknown"}; ${why}, nobody is answering it`);
  }
  return out;
}

function readPages(paths) {
  return paths.flatMap((p) => {
    const j = JSON.parse(readFileSync(p, "utf8"));
    return Array.isArray(j) ? j : j.ccr?.data ?? j.data ?? [];
  });
}

function main(argv) {
  const opt = { sessions: [], keep: [], merged: [] };
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i].replace(/^--/, ""), v = argv[i + 1];
    if (k === "sessions") opt.sessions.push(v);
    else if (k === "keep" || k === "merged") opt[k].push(...v.split(",").filter(Boolean));
    else opt[k] = v;
  }
  if (!opt.self || !opt.sessions.length) {
    console.error("usage: helper-sweep.mjs --self <id> --sessions <file> [--sessions <file>] [--keep ids] [--merged ids] [--now ISO]");
    return 2;
  }
  const r = classify({ sessions: readPages(opt.sessions), self: opt.self, now: opt.now || new Date().toISOString(), keep: opt.keep, merged: opt.merged });
  const block = (hd, rows) => [`## ${hd} (${rows.length})`, ...rows.map((x) => `- ${x.id} | ${x.title} | ${x.reason}`), ""].join("\n");
  console.log([block("Archive", r.archive), block("Keep", r.keep), block("Surface", r.surface)].join("\n"));
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exitCode = main(process.argv.slice(2));
