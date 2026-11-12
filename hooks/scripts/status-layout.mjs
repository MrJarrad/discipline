#!/usr/bin/env node
/* status-layout — DISC-310 (operator s82: "the doc needs be consistent, easy to maintain and scan"; "yes" to the layout). Turns the vault's queue,
   backlog, Up next and go-live files plus a read of the Status doc (real Claude Docs xml, lib/status-doc.mjs) into the EDIT OPS that make the
   doc exactly this layout, so nothing is hand-edited:
     # Status / date · you / ## Ready for you / ## You're on it / ## Claude's on it / ## Up next / ## Done this session (each: one ### heading per session
     project, "Nothing." when empty; Up next ### Portfolio also carries "Launch: N of M done · link"; ticked items MOVE to Done, no note line) / ## Backlogs.
   Ops (the session applies each with the Claude Docs connector, in order): setDate, insertSection, insertProjectHeading (a run of missing headings is emitted last-wanted first), ensureList (a project with a heading but no list), insertItem, moveItem (delete
   + insert with the item's new chip: the connector cannot set a chip in place, so an item's section always matches its chip), insertNothing, removeNode,
   setUpNext, setLaunchLine, removeSection, setBacklogLinks. `answered` lists open queue rows whose chip the operator flipped (bank like an answer). `unknown` lists row ids the doc holds that no queue or backlog file in this vault checkout has (a stale checkout: pull the vault first; such an item is never called landed). An empty `ops` means the doc is
   already in the layout. `unplaced` lists items naming no project.
   Up next sources: a project's backlog `## Up next` (an ordered list of row ids, first five), or, when `projects/<p>/<p>-go-live.md` exists, its
   first unticked lines; neither -> "Nothing.". A row already in Ready for you, You're on it or Claude's on it is never also Up next. The launch count is the go-live file's
   groups 1-4 (ticked of all).
   Usage: node status-layout.mjs --vault <root> --projects PF,DISC,HT --doc <file with the xml of the doc's body node, or - for stdin> | --doc-json <the connector's JSON result, file or ->  [--today YYYY-MM-DD]  */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, basename, join } from "node:path";
import { resolveVaultRoot } from "./lib/vault-root.mjs";
import { neededFromYou, vaultBlobBase } from "./needed-from-you.mjs";
import { openItems } from "./queue-page-sync.mjs";
import { parseStatusDoc, toMarkdown } from "./lib/status-doc.mjs";

export const displayName = (project) => { const n = String(project).replace(/^jhd-/, "").replace(/-/g, " "); return n.charAt(0).toUpperCase() + n.slice(1); };
const ID_AT = /\b([A-Z]{2,4}-\d+[a-z]?)\b/;
const prefixOf = (id) => /^([A-Z]{2,4})-/.exec(id)?.[1] ?? null;
const shortTitle = (t) => {
  let x = String(t || "").replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, "$2").replace(/\[\[([^\]]*)\]\]/g, "$1").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/https?:\/\/\S+/g, "").replace(/~~/g, "").replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+/)[0].replace(/[.!?…]+$/, "");
  if (x.length > 120) {
    x = x.slice(0, 120).replace(/\s+\S*$/, "");
    const o = x.lastIndexOf("("); if (o > x.lastIndexOf(")")) x = x.slice(0, o).trim();
    x = `${x.replace(/[\s,;:(-]+$/, "")}…`;
  }
  return x;
};

/* Go-live file: `## N. group` headings and `- [x] PF-1 · title` lines. */
export function parseGoLive(text) {
  const lines = [];
  let group = null;
  for (const l of String(text).split(/\r?\n/)) {
    const g = /^##\s+(\d+)[a-z]?\./.exec(l);
    if (g) { group = Number(g[1]); continue; }
    const m = /^- \[( |x)\]\s+([A-Z]{2,4}-\d+[a-z]?)\s+·\s+(.*)$/i.exec(l);
    if (m) lines.push({ ticked: m[1].toLowerCase() === "x", id: m[2], title: m[3].trim(), group });
  }
  const before = lines.filter((x) => x.group !== null && x.group <= 4);
  return { lines, done: before.filter((x) => x.ticked).length, total: before.length };
}

function upNextIds(text) {
  const m = /^##\s+Up next\s*$/im.exec(text);
  if (!m) return null;
  const rest = text.slice(m.index + m[0].length).split(/^##\s/m)[0];
  return rest.split(/\r?\n/).filter((l) => /^\s*(?:\d+\.|[-*])\s/.test(l)).map((l) => ID_AT.exec(l)?.[1]).filter(Boolean);
}
const rowTitle = (text, id) => shortTitle(new RegExp(`^\\|\\s*(?:~~)?${id}(?:~~)?\\s*\\|([^|]*)\\|`, "m").exec(text)?.[1] ?? "");

/* DISC-310 amendment (operator s82: "would it be better to perhaps group by status and sub group by project? ... we don't really need running now as a
   specific section if there's a claude's on it status"): the top-level sections ARE the chip values. An item's section always matches its chip. */
export const SECTIONS = ["Ready for you", "You're on it", "Claude's on it", "Up next", "Done this session"];
const CHIP_SECTION = { 0: "Ready for you", 1: "You're on it", 2: "Done this session", 3: "Claude's on it" };
const SECTION_CHIP = { "Ready for you": "Ready for you", "You're on it": "You're on it", "Claude's on it": "Claude's on it", "Done this session": "Done" };
const OLD_SECTIONS = ["Waiting on you", "Running now", "Go-live"];

const LIVE_SECTIONS = ["Running now", "Claude's on it", "You're on it"];
const STALE = /\b(building|measuring|being built|in review|helper session_[A-Za-z0-9]+|fixing review|(?:is|are|still) running|running now)\b/i;
const MAC_DIRS = ["queue/mac/pending", "queue/mac/review", "queue/mac/running"];

export function layoutPlan({ vault, prefixes, docXml, today, base = vaultBlobBase(vault) }) {
  const r = neededFromYou(vault, prefixes);
  if (!r.ok) throw new Error(r.reason);
  const doc = parseStatusDoc(docXml), structure = [], work = [], tail = [], unplaced = [], answered = [], refused = [], droppedComments = [], holds = [];
  const names = r.projects.map((p) => ({ prefix: p.prefix, name: displayName(p.project), backlog: p.backlog.file }));
  const { open, formatted } = openItems(r);
  /* every row id the run can see, open or struck or done: a row in none of these files is UNKNOWN (a stale vault checkout), never "landed" */
  const known = new Set(open.keys());
  for (const p of r.projects) for (const f of [p.queue.file, p.backlog.file]) if (f) for (const m of readFileSync(join(vault, f), "utf8").matchAll(/^\|\s*(?:~~)?([A-Z]{2,4}-\d+[a-z]?)(?:~~)?\s*\|/gm)) known.add(m[1]);
  const unknown = [];
  /* Mac work still queued: a pending, review or running job that names the row means the row is not done */
  const macJobs = MAC_DIRS.flatMap((d) => (existsSync(join(vault, d)) ? readdirSync(join(vault, d)).filter((f) => f.endsWith(".md")).map((f) => ({ path: `${d}/${f}`, text: readFileSync(join(vault, d, f), "utf8") })) : []));
  const pendingJob = (id) => macJobs.find((j) => new RegExp(`(?<![A-Za-z0-9-])${id}(?![A-Za-z0-9-])`).test(j.text))?.path ?? null;
  const section = (n) => doc.sections.find((x) => x.name === n);
  const project = (sec, n) => sec?.projects.find((q) => q.name === n);
  const byPrefix = (px) => names.find((x) => x.prefix === px);
  const dateOps = doc.date !== today && doc.dateId ? [{ op: "setDate", id: doc.dateId, value: today, why: `the doc's date line reads ${doc.date}` }] : [];
  const drop = (comments, op, item) => { for (const c of comments) droppedComments.push({ id: c.id, answered: c.answered, op, item }); };
  const refuse = (entry) => refused.push(entry);
  /* the item's own short headline with the in-flight clause cut off (never the queue ask, which carries developer detail); the row's title only when
     the item has none. An item with several ids keeps its own id text, e.g. "(DISC-299/303)"; a single-row item gets "(ID) " in front. */
  const headline = (it) => {
    const t = it.text.replace(/\*\*/g, "").trim(), cut = t.search(STALE);
    let own = (cut > 0 ? t.slice(0, cut) : t).replace(/[\s:;,.…—-]+$/, "");
    if (it.rowId) own = own.replace(new RegExp(`^\\(?${it.rowId}\\)?[\\s:.]*`), "").replace(new RegExp(`\\s*\\(${it.rowId}\\)$`), "");
    own = shortTitle(own).replace(/[.…\s]+$/, "");
    if (!own && it.rowId) for (const p of r.projects) for (const f of [p.queue.file, p.backlog.file]) if (!own && f && prefixOf(it.rowId) === p.prefix) own = shortTitle(rowTitle(readFileSync(join(vault, f), "utf8"), it.rowId)).replace(/[.…\s]+$/, "");
    return `${it.rowId ? `(${it.rowId}) ` : ""}${own}`;
  };

  /* 1. every existing item: where it is, where its chip (or tick, or closed row) says it belongs */
  const itemSections = [...SECTIONS.filter((n) => n !== "Up next"), "Waiting on you", "Running now"];
  const stay = new Map(), seenIds = new Set(), busy = new Set(open.keys()), stuck = new Set();
  const bump = (sec, proj, n = 1) => stay.set(`${sec}|${proj}`, (stay.get(`${sec}|${proj}`) || 0) + n);
  const all = [];
  for (const sname of itemSections) {
    const sec = section(sname);
    if (!sec) continue;
    for (const q of sec.projects) for (const it of q.items) all.push({ sname, proj: q.name, it });
    for (const it of sec.items) all.push({ sname, proj: null, it });
  }
  /* one row, one section: a row on the doc twice keeps the live lane's item (else the first); the other copy goes */
  const dupOf = new Map();
  for (const x of all) if (x.it.rowId && byPrefix(prefixOf(x.it.rowId))) dupOf.set(x.it.rowId, [...(dupOf.get(x.it.rowId) || []), x]);
  const dropped = new Set();
  for (const [rowId, list] of dupOf) {
    if (list.length < 2) continue;
    const keep = list.find((x) => LIVE_SECTIONS.includes(x.sname)) || list[0];
    for (const x of list) if (x !== keep) {
      if (x.it.comments.some((c) => !c.answered)) { refuse({ id: x.it.id, rowId, section: x.sname, reason: "unanswered comment thread", comments: x.it.comments }); stuck.add(x.sname); continue; }
      work.push({ op: "removeDuplicate", id: x.it.id, rowId, keptId: keep.it.id, why: `${rowId} is on the doc twice; the ${LIVE_SECTIONS.includes(keep.sname) ? "live lane's" : "first"} item stays` });
      drop(x.it.comments, "removeDuplicate", x.it.id);
      dropped.add(x.it);
    }
  }
  for (const { sname, proj, it } of all) {
    if (dropped.has(it)) continue;
    const mirrorsQueue = sname === "Waiting on you" || sname === "Ready for you";
    if (it.rowId) seenIds.add(it.rowId);
    if (sname !== "Done this session") { if (it.rowId) busy.add(it.rowId); for (const m of it.text.matchAll(new RegExp(ID_AT, "g"))) busy.add(m[1]); }
    const owner = byPrefix(prefixOf(it.rowId || ID_AT.exec(it.text)?.[1] || ""));
    const home = owner?.name ?? proj;
    if (!home) { unplaced.push({ id: it.id, text: it.text }); continue; }
    const job = it.rowId && byPrefix(prefixOf(it.rowId)) ? pendingJob(it.rowId) : null;
    if (job && !holds.some((h) => h.rowId === it.rowId)) holds.push({ rowId: it.rowId, job });
    const sessionRow = mirrorsQueue && it.rowId && byPrefix(prefixOf(it.rowId));
    if (sessionRow && !known.has(it.rowId) && !unknown.includes(it.rowId)) unknown.push(it.rowId);
    const landed = sessionRow && !open.has(it.rowId) && known.has(it.rowId);
    let to = it.ticked || landed ? "Done this session" : CHIP_SECTION[it.chip?.index] ?? "Claude's on it";
    let reason = it.ticked ? "ticked" : landed ? "landed" : sname !== to ? (OLD_SECTIONS.includes(sname) ? "layout" : "chip") : home !== proj ? "misfiled" : !it.chip ? "chip" : null;
    if (to === "Done this session" && job) { to = "Claude's on it"; reason = "pending"; }
    if (sname === to && home === proj && it.chip && reason === null) { bump(sname, home); continue; }
    /* DISC-314 1: a ticked item already in Done under its project is where it belongs; moving it again never converges */
    if (sname === "Done this session" && it.ticked && to === sname && home === proj && it.chip?.label === "Done") { bump(sname, home); if (open.has(it.rowId)) answered.push(it.rowId); continue; }
    if (reason === null) reason = "chip";
    const chipLabel = SECTION_CHIP[to], chipOk = it.chip?.label === chipLabel;
    /* DISC-314 5: lane text that says the work is still going must not reach Done verbatim: the item is re-created as the row's title + "Done." */
    const rewrite = to === "Done this session" && STALE.test(it.text);
    const recreate = !chipOk || rewrite;
    if (recreate && it.comments.some((c) => !c.answered)) { refuse({ id: it.id, rowId: it.rowId, section: sname, reason: "unanswered comment thread", comments: it.comments }); stuck.add(sname); bump(sname, home); continue; }
    const from = { section: sname, project: proj }, dest = { section: to, project: home };
    const isDone = to === "Done this session";
    if (!recreate) work.push({ op: "move", id: it.id, rowId: it.rowId, from, to: dest, reason, kids: it.kids.length, ...(isDone ? { staleText: false, ticked: true } : {}) });
    else {
      /* DISC-314 4: everything that enters Done is ticked, the ones the operator did not tick (landed) included */
      const body = rewrite ? { ...it, text: `**${headline(it)}. Done.**` } : it;
      work.push({ op: "replaceItem", id: it.id, rowId: it.rowId, from, to: dest, chip: chipLabel, reason, markdown: toMarkdown({ ...body, ticked: isDone || it.ticked, chip: { label: chipLabel }, listKind: "check" }), comments: it.comments, ...(isDone ? { staleText: STALE.test(it.text), ticked: true } : {}) });
      drop(it.comments, "replaceItem", it.id);
    }
    bump(to, home);
    if (sname === "Ready for you" && reason === "chip" && it.rowId && open.has(it.rowId)) answered.push(it.rowId);
    if (it.ticked && open.has(it.rowId)) answered.push(it.rowId);
  }
  /* open rows the doc does not hold yet: Ready for you, in the item format */
  for (const [id] of open) if (!seenIds.has(id)) {
    const x = byPrefix(prefixOf(id));
    work.push({ op: "insertItem", section: "Ready for you", project: x.name, rowId: id, markdown: formatted.get(id) });
    bump("Ready for you", x.name);
  }

  /* 2. structure: every section, and a heading per session project in it; "Nothing." for the empty ones */
  let prevName = null;
  for (const sname of SECTIONS) {
    const sec = section(sname);
    if (!sec) structure.push({ op: "insertSection", name: sname, afterSection: prevName, projects: names.map((x) => x.name) });
    else {
      /* DISC-314 2: inserts after one anchor stack up newest-first, so a run of missing headings is emitted last-wanted first */
      let prev = null, run = [];
      const flush = () => { for (const name of run.reverse()) structure.push({ op: "insertProjectHeading", section: sname, name, afterId: prev ? prev.last : sec.id }); run = []; };
      for (const x of names) {
        const pr = project(sec, x.name);
        if (!pr) { run.push(x.name); continue; }
        flush();
        prev = pr;
      }
      flush();
    }
    prevName = sname;
    if (sname === "Up next") continue;
    for (const x of names) {
      const pr = project(sec, x.name), n = stay.get(`${sname}|${x.name}`) || 0;
      const nothing = pr?.paras.find((q) => q.text === "Nothing.");
      const incoming = work.some((o) => (o.to?.section || o.section) === sname && (o.to?.project || o.project) === x.name);
      if (!n && !incoming && !nothing) tail.push({ op: "insertNothing", section: sname, project: x.name, afterId: pr?.last ?? null });
      else if ((n || incoming) && nothing) tail.push({ op: "removeNode", section: sname, id: nothing.id, why: "the project has items again" });
    }
  }

  /* DISC-314 3: the connector refuses a move or insert into a project that has no list (shape_mismatch): make the list first */
  const ensured = new Set();
  for (const o of work) {
    const sname = o.to?.section || o.section, pname = o.to?.project || o.project, sec = section(sname);
    if (!sname || !pname || sname === "Up next" || ensured.has(`${sname}|${pname}`)) continue;
    /* a project of a section this plan inserts (or whose heading it inserts) has a heading and no list until this op makes it */
    const pr = sec ? project(sec, pname) : null;
    if (pr && pr.listIds.length) continue;
    ensured.add(`${sname}|${pname}`);
    structure.push(pr ? { op: "ensureList", section: sname, project: pname, afterId: pr.last } : { op: "ensureList", section: sname, project: pname, afterHeading: pname });
  }

  /* 3. Up next */
  const upSec = section("Up next"), upOps = [];
  for (const x of names) {
    let lines = [], launch = null;
    const dir = x.backlog ? dirname(x.backlog) : null, base0 = dir ? basename(dir) : null;
    const gl = dir && existsSync(join(vault, dir, `${base0}-go-live.md`)) ? parseGoLive(readFileSync(join(vault, dir, `${base0}-go-live.md`), "utf8")) : null;
    if (gl) {
      lines = gl.lines.filter((l) => !l.ticked && !busy.has(l.id)).slice(0, 5).map((l) => `- (${l.id}) ${shortTitle(l.title)}`);
      launch = `Launch: ${gl.done} of ${gl.total} done · ${base ? `[Full go-live list](${base}/${dir}/${base0}-go-live.md)` : "full list in the vault"}`;
    } else if (x.backlog) {
      const text = readFileSync(join(vault, x.backlog), "utf8");
      lines = (upNextIds(text) || []).filter((id) => !busy.has(id)).slice(0, 5).map((id) => `- (${id}) ${rowTitle(text, id) || id}`);
    }
    if (!lines.length) lines = ["Nothing."];
    const pr = project(upSec, x.name);
    const have = (pr?.items || []).map((i) => (i.text === "Nothing." ? "Nothing." : `- ${i.text}`));
    if (!upSec || !pr || have.length !== lines.length || have.some((h, i) => h !== lines[i])) upOps.push({ op: "setUpNext", section: "Up next", project: x.name, replaceId: pr?.listIds[0] ?? null, afterId: pr ? pr.id : null, lines });
    if (launch) {
      const have2 = pr?.paras.find((q) => q.text.startsWith("Launch:"));
      if (!have2 || have2.text !== launch) upOps.push({ op: "setLaunchLine", section: "Up next", project: x.name, id: have2?.id ?? null, text: launch });
    }
  }

  /* 4. clean-up: the Done note, the sections the layout replaced (never one still holding an item that could not move), the backlog links */
  const clean = [];
  const done = section("Done this session");
  for (const q of done?.paras || []) if (q.text !== "Nothing.") {
    const cs = done.comments || [];
    if (cs.some((c) => !c.answered)) refuse({ id: q.id, section: "Done this session", reason: "unanswered comment thread", comments: cs });
    else { clean.push({ op: "removeNode", section: "Done this session", id: q.id, why: "the explanatory note line goes" }); drop(cs, "removeNode", q.id); }
  }
  for (const old of OLD_SECTIONS) {
    const sec = section(old);
    if (!sec) continue;
    const cs = sec.comments || [];
    if (stuck.has(old)) refuse({ section: old, reason: "still holds an item that could not move" });
    else if (cs.some((c) => !c.answered)) refuse({ section: old, id: sec.id, reason: "unanswered comment thread", comments: cs });
    else { clean.push({ op: "removeSection", name: old, id: sec.id, nodeIds: sec.nodeIds, why: old === "Go-live" ? "the go-live list lives in the vault file; its From you part duplicated the Ready for you items" : "the sections are the chip values now (items moved above)" }); drop(cs, "removeSection", sec.id); }
  }
  const bk = section("Backlogs");
  if (base && names.every((x) => x.backlog)) {
    const links = names.map((x) => ({ label: x.name, url: `${base}/${x.backlog}` })), droppedLinks = [];
    for (const it of bk?.items || []) {
      const m = /^\[([^\]]+)\]\((.+)\)$/.exec(it.text);
      if (!m || links.some((l) => l.label === m[1])) continue;
      const file = decodeURI(m[2]).replace(`${base}/`, "");
      const text = existsSync(join(vault, file)) ? readFileSync(join(vault, file), "utf8") : "";
      const qf = file.replace(/-backlog\.md$/, "-queue.md"), qt = existsSync(join(vault, qf)) ? readFileSync(join(vault, qf), "utf8") : "";
      const hasOpen = /^\|\s*(?!~~)[A-Z]{2,4}-\d+\s*\|[^\n]*\|\s*(?:open|waiting on operator|in flight[^|]*)\s*\|/im.test(text) || /^\|\s*(?!~~)[A-Z]{2,4}-\d+\s*\|/m.test(qt);
      if (hasOpen) links.push({ label: m[1], url: m[2] }); else droppedLinks.push(m[1]);
    }
    const have = (bk?.items || []).map((i) => i.text);
    if (!bk || have.length !== links.length || have.some((t, i) => t !== `[${links[i].label}](${links[i].url})`)) clean.push({ op: "setBacklogLinks", id: bk?.listIds[0] ?? null, links, dropped: droppedLinks });
  }
  return { ops: [...dateOps, ...structure, ...work, ...tail, ...upOps, ...clean], unplaced, answered: [...new Set(answered)], unknown, refused, droppedComments, holds };
}

/* DISC-314 8: the doc read arrives inline in the session, never as a file: `-` reads stdin; --doc-json takes the connector's JSON result ({ xml }, or the xml as a JSON string) */
function readDoc(doc, docJson) {
  const text = readFileSync(doc === "-" || docJson === "-" ? 0 : doc || docJson, "utf8");
  if (doc) return text;
  const j = JSON.parse(text), xml = typeof j === "string" ? j : j?.xml ?? j?.node?.xml;
  if (typeof xml !== "string" || !xml.trim()) throw new Error("the --doc-json input holds no xml field");
  return xml;
}

function main() {
  const a = process.argv.slice(2), get = (k) => { const i = a.indexOf(k); return i !== -1 ? a[i + 1] : undefined; };
  if (!get("--vault") || !(get("--doc") || get("--doc-json"))) { console.error("usage: status-layout --vault <root> --projects PF,DISC (--doc <xml file|-> | --doc-json <connector result file|->) [--today YYYY-MM-DD]"); process.exit(1); }
  try {
    const out = layoutPlan({ vault: resolveVaultRoot(get("--vault")), prefixes: String(get("--projects") || "").split(","), docXml: readDoc(get("--doc"), get("--doc-json")), today: get("--today") || new Date().toISOString().slice(0, 10) });
    if (out.unknown.length) console.error(`status-layout: ${out.unknown.join(", ")} are on the doc but in no queue or backlog file here: the vault checkout is stale (pull it first); they were not called landed`);
    console.log(JSON.stringify(out, null, 2));
  } catch (e) { console.error(`status-layout: ${e.message}`); process.exit(1); }
}
if (process.argv[1]?.endsWith("status-layout.mjs")) main();
