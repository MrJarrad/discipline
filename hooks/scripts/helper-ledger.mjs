#!/usr/bin/env node
/* helper-ledger — DISC-335 (operator s91, 2026-11-15: "we have some really big issues with helper session management, in
   particularly if you don't know what they're doing if it was important"). One table of every non-archived helper across ALL past
   parents (list_sessions has no parent filter, so every saved page is the universe), each with its lane, PR and PR state, and last
   summary, plus the verdict: archive (landed), keep, NOT LANDED, unknown. A helper whose work did not land is never in the archive
   list; the parent accepts it by id (--accept) once its return is banked. A script cannot call list_sessions or archive_session
   (MCP tools), so the parent saves the pages and makes the archive calls; this does the rest and writes the ledger to the vault.
   node helper-ledger.mjs --self <id> --sessions <list_sessions.json> [--sessions <page2.json>] [--landed <file>] [--accept <ids>]
     [--waiting <ids>] [--vault <dir>]   writes <dir>/orchestrator/helper-ledger.md      [--prs-file <json: a search result or an array of PRs>]  [--now ISO]
   PRs are read ONCE (every PR of ours created since the oldest helper) and matched here on the helper's session id or lane key in
   title/body: GitHub search cannot match the id inside a markdown link, which is how most PR bodies carry it (review of #223, RED 2).  */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { classify } from "./helper-sweep.mjs";
import { extractJson } from "./lib/extract-json.mjs";
import { listed, prName, isOurs } from "../bin/archive-guard.mjs";
import { laneKeys, mentions } from "./lib/lane-key.mjs";

const isArchived = (x) => /ARCHIVED/.test(x.session_status || "");
const isHelper = (x) => Boolean(x.parent_session_id) && /^Helper ·/.test(x.title || "");
const bucketOf = (x) => String(x.status_bucket || "").replace("SESSION_STATUS_BUCKET_", "").toLowerCase();
const cell = (s) => String(s ?? "").replace(/\s+/g, " ").replace(/\|/g, "\\|").trim();

/** The lane label for the table: the tag after the session prefix ("s91-PF1655" -> PF1655), else a row key in the title. */
export function laneOf(x) {
  for (const t of x.tags || []) { const m = /^s\d+-(.+)$/.exec(t); if (m) return m[1]; }
  const m = /\b([A-Z]{2,5}-\d+)\b/.exec(x.title || "");
  return m ? m[1] : "";
}

const stateOf = (p) => (String(p.state).toLowerCase() === "open" ? "open" : p.pull_request?.merged_at ? "merged" : "closed");

/** The PRs that belong to a helper: its session id in title/body (any form, links included), else its lane key. */
function matchPrs(x, prs) {
  const keys = laneKeys(x);
  return prs.filter(isOurs).flatMap((p) => {
    const text = `${p.title ?? ""}\n${p.body ?? ""}`;
    const by = text.includes(x.id) ? "id" : mentions(p.title ?? "", keys) ? "lane key in title" : mentions(text, keys) ? "lane key in body" : null;
    return by ? [{ p, by }] : [];
  });
}

export function buildLedger({ sessions, self, now, prs, landedIds = [], accept = [], waiting = [], pages = null }) {
  const byId = new Map(sessions.map((x) => [x.id, x]));
  sessions = [...byId.values()]; // overlapping list_sessions pages repeat a session; the later sighting wins
  const helpers = sessions.filter((x) => x.id !== self && !isArchived(x) && isHelper(x));
  const rows = helpers.map((x) => {
    const hits = prs ? matchPrs(x, prs) : null;
    let pr;
    if (landedIds.includes(x.id)) pr = { state: "merged", text: "landed (lane-end)" };
    else if (!hits) pr = { state: "unknown", text: "PR lookup failed or truncated" };
    else if (!hits.length) pr = { state: "none", text: "PR not found (searched session id and lane key)" };
    else {
      const states = hits.map((h) => stateOf(h.p));
      /* A merged PR proves the helper landed only on its id or its lane key in the title; a body mention of the key (a PR that
         merely cites PF-1596) is shown but never lands a helper (dry run of #223: one vault PR cited two unrelated lanes). */
      const proves = hits.some((h) => stateOf(h.p) === "merged" && h.by !== "lane key in body");
      pr = { state: states.includes("open") ? "open" : proves ? "merged" : states.includes("merged") ? "cited" : "closed", text: hits.map((h) => `${prName(h.p)} ${stateOf(h.p)} (by ${h.by})`).join(", ") };
    }
    const bucket = bucketOf(x), done = bucket === "completed";
    let verdict, reason;
    if (waiting.includes(x.id)) [verdict, reason] = ["keep", "waiting on an operator answer"];
    else if (pr.state === "unknown") [verdict, reason] = ["unknown", "PR lookup unreadable or truncated; not archived"];
    else if (pr.state === "open") [verdict, reason] = ["keep", "open PR"];
    else if (bucket === "working") [verdict, reason] = ["keep", "still working"];
    else if (pr.state === "merged" && done) [verdict, reason] = ["archive", "landed: PR merged, helper completed"];
    else if (accept.includes(x.id)) [verdict, reason] = ["archive", "accepted by the parent: its return is banked"];
    else if (pr.state === "merged") [verdict, reason] = ["keep", `PR merged but helper is ${bucket || "not completed"}`];
    else if (pr.state === "cited") [verdict, reason] = ["not-landed", "a merged PR only cites its lane key in the body; confirm it is this helper's, then --accept"];
    else [verdict, reason] = ["not-landed", pr.state === "closed" ? "PR closed unmerged" : `${bucket || "idle"}, PR not found`];
    const p = byId.get(x.parent_session_id);
    return { id: x.id, title: x.title, lane: laneOf(x), parent: x.parent_session_id, parentTitle: p?.title ?? "(not in the pages)", pr: pr.text, bucket, summary: x.post_turn_summary?.recent_action || x.task_summary || "(no summary)", verdict, reason };
  });
  const pick = (v) => rows.filter((r) => r.verdict === v);
  const repoint = classify({ sessions, self, now, keep: rows.filter((r) => r.verdict !== "archive").map((r) => r.id) }).repoint;
  return { rows, archive: pick("archive"), notLanded: pick("not-landed"), keep: pick("keep"), unknown: pick("unknown"), repoint, pages };
}

/** The saved-page coverage line: the last list_sessions page must report has_more false, or helpers of older parents are missing. */
export function pagesLine(pages) {
  const lists = pages.filter((p) => p.has_more !== undefined), done = lists.some((p) => p.has_more === false);
  return `Pages: ${pages.length} saved, ${pages.reduce((n, p) => n + p.count, 0)} sessions read; a page reporting has_more false: ${done ? "yes, the list is complete" : "NO — INCOMPLETE: helpers on later pages are missing; save the next page (after_id = the last page's last_id) and run again before trusting this ledger"}.`;
}

export function renderLedger(l, now) {
  const list = (hd, rs, f) => [`## ${hd} (${rs.length})`, ...rs.map(f), ""].join("\n");
  const line = (r) => `- ${r.id} | ${r.title} | ${r.reason} | ${r.pr}`;
  const open = [...l.keep, ...l.notLanded, ...l.unknown].map((r) => r.id);
  return [
    `# Helper ledger (generated ${now}; overwritten by helper-ledger.mjs, never hand-edited)`, "",
    "Covers sessions titled `Helper ·` that have a parent, across every parent in the saved pages; a session without that title is not shown here and is never archived by the sweep.",
    l.pages ? pagesLine(l.pages) : "Pages: not reported.", "",
    "| id | helper | lane | parent | PR | last summary | verdict |", "| --- | --- | --- | --- | --- | --- | --- |",
    ...l.rows.map((r) => `| ${cell(r.id)} | ${cell(r.title)} | ${cell(r.lane)} | ${cell(r.parent)} (${cell(r.parentTitle)}) | ${cell(r.pr)} | ${cell(r.summary)} | ${cell(r.verdict)}: ${cell(r.reason)} |`), "",
    list("Archive", l.archive, line), list("Not landed", l.notLanded, line), list("Keep", l.keep, line), list("Unknown", l.unknown, line),
    [`## Re-point (${l.repoint.length})`, ...l.repoint.map((x) => `- ${x.id} | ${x.message}`), ""].join("\n"),
    `Helpers: ${open.length ? open.join(", ") : "none"}`, "",
  ].join("\n");
}

const gh = (query, page = 1) => JSON.parse(execFileSync("gh", ["api", "-X", "GET", "search/issues", "-f", `q=${query}`, "-f", "per_page=100", "-f", `page=${page}`], { encoding: "utf8" }));

/** Every PR of ours created on/after `since` (YYYY-MM-DD), one search paged; null when it cannot be read whole (fail closed). */
export function listPrs(search, since) {
  const items = [];
  try {
    for (let page = 1; page <= 10; page++) {
      const r = search(`is:pr user:MrJarrad created:>=${since}`, page);
      if (!r || !Array.isArray(r.items) || r.incomplete_results === true || typeof r.total_count !== "number") return null;
      items.push(...r.items);
      if (items.length >= r.total_count) return items;
      if (!r.items.length) return null;
    }
  } catch { return null; }
  return null; /* more than 1000 PRs: the search API cannot return them, so the lookup is not whole */
}

function readPages(paths) {
  const sessions = [], pages = [];
  for (const p of paths) {
    const j = extractJson(readFileSync(p, "utf8"));
    if (j === undefined) throw new Error(`${p}: no JSON in the saved session result`);
    const rows = Array.isArray(j) ? j : j.ccr?.id ? [j.ccr] : j.ccr?.data ?? j.data ?? [];
    sessions.push(...rows);
    pages.push({ file: p, count: rows.length, has_more: j.ccr?.data ? j.ccr.has_more : j.data ? j.has_more : undefined });
  }
  return { sessions, pages };
}

function main(argv) {
  const o = { sessions: [], accept: [], waiting: [] };
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i].replace(/^--/, ""), v = argv[i + 1];
    if (v === undefined || v.startsWith("--")) { o.bad = true; break; }
    if (k === "sessions") o.sessions.push(v); else if (k === "accept" || k === "waiting") o[k].push(...v.split(",").filter(Boolean)); else o[k] = v;
  }
  if (o.bad || !o.self || !o.sessions.length) { console.error("usage: helper-ledger.mjs --self <id> --sessions <file> [--sessions <file>] [--landed <file>] [--accept ids] [--waiting ids] [--vault <dir>] [--prs-file <json>] [--now ISO]"); return 2; }
  let landedIds = []; if (o.landed) { try { landedIds = readFileSync(o.landed, "utf8").split(/\s+/).filter(Boolean); } catch { /* none landed yet */ } }
  const { sessions, pages } = readPages(o.sessions);
  const now = o.now || new Date().toISOString();
  let prs;
  if (o["prs-file"]) { const c = JSON.parse(readFileSync(o["prs-file"], "utf8")); prs = Array.isArray(c) ? c : c.items ?? null; }
  else {
    const born = sessions.filter((x) => isHelper(x) && !isArchived(x)).map((x) => Date.parse(x.created_at)).filter(Number.isFinite);
    const since = new Date((born.length ? Math.min(...born) : Date.parse(now)) - 864e5).toISOString().slice(0, 10);
    prs = listPrs(gh, since);
  }
  const text = renderLedger(buildLedger({ sessions, self: o.self, now, prs, landedIds, accept: o.accept, waiting: o.waiting, pages }), now);
  if (o.vault) { const f = join(o.vault, "orchestrator", "helper-ledger.md"); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, text); }
  console.log(text);
  return 0;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exitCode = main(process.argv.slice(2));
