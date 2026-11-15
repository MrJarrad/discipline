#!/usr/bin/env node
/* helper-ledger — DISC-335 (operator s91, 2026-11-15: "we have some really big issues with helper session management, in
   particularly if you don't know what they're doing if it was important"). One table of every non-archived helper across ALL past
   parents (list_sessions has no parent filter, so every saved page is the universe), each with its lane, PR and PR state, and last
   summary, plus the verdict: archive (landed), keep, NOT LANDED, unknown. A helper whose work did not land is never in the archive
   list; the parent accepts it by id (--accept) once its return is banked. A script cannot call list_sessions or archive_session
   (MCP tools), so the parent saves the pages and makes the archive calls; this does the rest and writes the ledger to the vault.
   node helper-ledger.mjs --self <id> --sessions <list_sessions.json> [--sessions <page2.json>] [--landed <file>] [--accept <ids>]
     [--vault <dir>]   writes <dir>/orchestrator/helper-ledger.md      [--prs-file <json: id -> search result>]  [--now ISO]    */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { classify } from "./helper-sweep.mjs";
import { extractJson } from "./lib/extract-json.mjs";
import { listed, prName, isOurs } from "../bin/archive-guard.mjs";

const isArchived = (x) => /ARCHIVED/.test(x.session_status || "");
const isHelper = (x) => Boolean(x.parent_session_id) && /^Helper ·/.test(x.title || "");
const bucketOf = (x) => String(x.status_bucket || "").replace("SESSION_STATUS_BUCKET_", "").toLowerCase();
const cell = (s) => String(s ?? "").replace(/\s+/g, " ").replace(/\|/g, "\\|").trim();

/** The lane key: a tag after the session prefix ("s91-PF1655" -> PF1655), else a row key in the title. */
export function laneOf(x) {
  for (const t of x.tags || []) { const m = /^s\d+-(.+)$/.exec(t); if (m) return m[1]; }
  const m = /\b([A-Z]{2,5}-\d+)\b/.exec(x.title || "");
  return m ? m[1] : "";
}

/** lookup(id) -> a search object for every PR (any state) in MrJarrad's repos naming the session id (it may throw). */
export const prLookup = (search) => (id) => search(`is:pr user:MrJarrad ${id}`);

/** { state: "merged"|"open"|"closed"|"none"|"unknown", prs: [names], text } from one lookup result. */
function prState(result) {
  const items = listed(JSON.stringify(result));
  if (!items) return { state: "unknown", text: "lookup unreadable or truncated" };
  const ours = items.filter(isOurs);
  if (!ours.length) return { state: "none", text: "no PR" };
  const st = (p) => (String(p.state).toLowerCase() === "open" ? "open" : p.pull_request?.merged_at ? "merged" : "closed");
  const state = ours.some((p) => st(p) === "open") ? "open" : ours.some((p) => st(p) === "merged") ? "merged" : "closed";
  return { state, text: ours.map((p) => `${prName(p)} ${st(p)}`).join(", ") };
}

export function buildLedger({ sessions, self, now, lookup, landedIds = [], accept = [] }) {
  const byId = new Map(sessions.map((x) => [x.id, x]));
  sessions = [...byId.values()]; // overlapping list_sessions pages repeat a session; the later sighting wins
  const helpers = sessions.filter((x) => x.id !== self && !isArchived(x) && isHelper(x));
  const rows = helpers.map((x) => {
    let res; try { res = lookup(x.id); } catch (err) { res = { error: String(err.message || err) }; }
    const pr = landedIds.includes(x.id) ? { state: "merged", text: "landed (lane-end)" } : prState(res);
    const bucket = bucketOf(x), done = bucket === "completed";
    let verdict, reason;
    if (pr.state === "unknown") [verdict, reason] = ["unknown", "PR lookup unreadable or truncated; not archived"];
    else if (pr.state === "open") [verdict, reason] = ["keep", "open PR"];
    else if (bucket === "working") [verdict, reason] = ["keep", "still working"];
    else if (pr.state === "merged" && done) [verdict, reason] = ["archive", "landed: PR merged, helper completed"];
    else if (accept.includes(x.id)) [verdict, reason] = ["archive", "accepted by the parent: its return is banked"];
    else if (pr.state === "merged") [verdict, reason] = ["keep", `PR merged but helper is ${bucket || "not completed"}`];
    else [verdict, reason] = ["not-landed", pr.state === "closed" ? "PR closed unmerged" : `${bucket || "idle"} with no PR`];
    const p = byId.get(x.parent_session_id);
    return { id: x.id, title: x.title, lane: laneOf(x), parent: x.parent_session_id, parentTitle: p?.title ?? "(not in the pages)", pr: pr.text, bucket, summary: x.post_turn_summary?.recent_action || x.task_summary || "(no summary)", verdict, reason };
  });
  const pick = (v) => rows.filter((r) => r.verdict === v);
  const repoint = classify({ sessions, self, now, keep: rows.filter((r) => r.verdict !== "archive").map((r) => r.id) }).repoint;
  return { rows, archive: pick("archive"), notLanded: pick("not-landed"), keep: pick("keep"), unknown: pick("unknown"), repoint };
}

export function renderLedger(l, now) {
  const list = (hd, rs, f) => [`## ${hd} (${rs.length})`, ...rs.map(f), ""].join("\n");
  const line = (r) => `- ${r.id} | ${r.title} | ${r.reason} | ${r.pr}`;
  const open = [...l.keep, ...l.notLanded, ...l.unknown].map((r) => r.id);
  return [
    `# Helper ledger (generated ${now}; overwritten by helper-ledger.mjs, never hand-edited)`, "",
    "| id | helper | lane | parent | PR | last summary | verdict |", "| --- | --- | --- | --- | --- | --- | --- |",
    ...l.rows.map((r) => `| ${cell(r.id)} | ${cell(r.title)} | ${cell(r.lane)} | ${cell(r.parent)} (${cell(r.parentTitle)}) | ${cell(r.pr)} | ${cell(r.summary)} | ${cell(r.verdict)}: ${cell(r.reason)} |`), "",
    list("Archive", l.archive, line), list("Not landed", l.notLanded, line), list("Keep", l.keep, line), list("Unknown", l.unknown, line),
    [`## Re-point (${l.repoint.length})`, ...l.repoint.map((x) => `- ${x.id} | ${x.message}`), ""].join("\n"),
    `Helpers: ${open.length ? open.join(", ") : "none"}`, "",
  ].join("\n");
}

const gh = (query) => JSON.parse(execFileSync("gh", ["api", "-X", "GET", "search/issues", "-f", `q=${query}`], { encoding: "utf8" }));

function pages(paths) {
  return paths.flatMap((p) => {
    const j = extractJson(readFileSync(p, "utf8"));
    if (j === undefined) throw new Error(`${p}: no JSON in the saved session result`);
    return Array.isArray(j) ? j : j.ccr?.id ? [j.ccr] : j.ccr?.data ?? j.data ?? [];
  });
}

function main(argv) {
  const o = { sessions: [], accept: [] };
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i].replace(/^--/, ""), v = argv[i + 1];
    if (v === undefined || v.startsWith("--")) { o.bad = true; break; }
    if (k === "sessions") o.sessions.push(v); else if (k === "accept") o.accept.push(...v.split(",").filter(Boolean)); else o[k] = v;
  }
  if (o.bad || !o.self || !o.sessions.length) { console.error("usage: helper-ledger.mjs --self <id> --sessions <file> [--sessions <file>] [--landed <file>] [--accept ids] [--vault <dir>] [--prs-file <json>] [--now ISO]"); return 2; }
  let landedIds = []; if (o.landed) { try { landedIds = readFileSync(o.landed, "utf8").split(/\s+/).filter(Boolean); } catch { /* none landed yet */ } }
  const canned = o["prs-file"] ? JSON.parse(readFileSync(o["prs-file"], "utf8")) : null;
  const lookup = canned ? (id) => canned[id] ?? { total_count: 0, incomplete_results: false, items: [] } : prLookup(gh);
  const now = o.now || new Date().toISOString();
  const text = renderLedger(buildLedger({ sessions: pages(o.sessions), self: o.self, now, lookup, landedIds, accept: o.accept }), now);
  if (o.vault) { const f = join(o.vault, "orchestrator", "helper-ledger.md"); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, text); }
  console.log(text);
  return 0;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exitCode = main(process.argv.slice(2));
