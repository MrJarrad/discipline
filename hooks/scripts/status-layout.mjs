#!/usr/bin/env node
/* status-layout — DISC-310 (operator s82: "the doc needs be consistent, easy to maintain and scan"; "yes" to the layout). Turns the vault's queue,
   backlog, Up next and go-live files plus a read of the Status doc (real Claude Docs xml, lib/status-doc.mjs) into the EDIT OPS that make the
   doc exactly this layout, so nothing is hand-edited:
     # Status / date · you / ## Ready for you / ## You're on it / ## Claude's on it / ## Up next / ## Done this session (each: one ### heading per session
     project, "Nothing." when empty; Up next ### Portfolio also carries "Launch: N of M done · link"; ticked items MOVE to Done, no note line) / ## Backlogs.
   Ops (the session applies each with the Claude Docs connector, in order): setDate, insertSection, insertProjectHeading, insertItem, moveItem (delete
   + insert with the item's new chip: the connector cannot set a chip in place, so an item's section always matches its chip), insertNothing, removeNode,
   setUpNext, setLaunchLine, removeSection, setBacklogLinks. `answered` lists open queue rows whose chip the operator flipped (bank like an answer). An empty `ops` means the doc is
   already in the layout. `unplaced` lists items naming no project.
   Up next sources: a project's backlog `## Up next` (an ordered list of row ids, first five), or, when `projects/<p>/<p>-go-live.md` exists, its
   first unticked lines; neither -> "Nothing.". A row already in Ready for you, You're on it or Claude's on it is never also Up next. The launch count is the go-live file's
   groups 1-4 (ticked of all).
   Usage: node status-layout.mjs --vault <root> --projects PF,DISC,HT --doc <file with the xml of the doc's body node> [--today YYYY-MM-DD]  */
import { existsSync, readFileSync } from "node:fs";
import { dirname, basename, join } from "node:path";
import { resolveVaultRoot } from "./lib/vault-root.mjs";
import { neededFromYou, vaultBlobBase } from "./needed-from-you.mjs";
import { openItems } from "./queue-page-sync.mjs";
import { parseStatusDoc } from "./lib/status-doc.mjs";

export const displayName = (project) => { const n = String(project).replace(/^jhd-/, "").replace(/-/g, " "); return n.charAt(0).toUpperCase() + n.slice(1); };
const ID_AT = /\b([A-Z]{2,4}-\d+[a-z]?)\b/;
const prefixOf = (id) => /^([A-Z]{2,4})-/.exec(id)?.[1] ?? null;
const shortTitle = (t) => {
  let x = String(t || "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/https?:\/\/\S+/g, "").replace(/~~/g, "").replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+/)[0].replace(/[.!?…]+$/, "");
  if (x.length > 90) { x = x.slice(0, 90).replace(/\s+\S*$/, ""); const o = x.lastIndexOf("("); if (o > x.lastIndexOf(")")) x = x.slice(0, o).trim(); }
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

export function layoutPlan({ vault, prefixes, docXml, today, base = vaultBlobBase(vault) }) {
  const r = neededFromYou(vault, prefixes);
  if (!r.ok) throw new Error(r.reason);
  const doc = parseStatusDoc(docXml), structure = [], work = [], tail = [], unplaced = [], answered = [];
  const names = r.projects.map((p) => ({ prefix: p.prefix, name: displayName(p.project), backlog: p.backlog.file }));
  const { open, formatted } = openItems(r);
  const section = (n) => doc.sections.find((x) => x.name === n);
  const project = (sec, n) => sec?.projects.find((q) => q.name === n);
  const byPrefix = (px) => names.find((x) => x.prefix === px);
  const dateOps = doc.date !== today && doc.dateId ? [{ op: "setDate", id: doc.dateId, value: today, why: `the doc's date line reads ${doc.date}` }] : [];

  /* 1. every existing item: where it is, where its chip (or tick, or closed row) says it belongs */
  const itemSections = [...SECTIONS.filter((n) => n !== "Up next"), "Waiting on you", "Running now"];
  const stay = new Map(), seenIds = new Set(), busy = new Set(open.keys());
  const bump = (sec, proj, n = 1) => stay.set(`${sec}|${proj}`, (stay.get(`${sec}|${proj}`) || 0) + n);
  for (const sname of itemSections) {
    const sec = section(sname);
    if (!sec) continue;
    const mirrorsQueue = sname === "Waiting on you" || sname === "Ready for you";
    const all = [...sec.projects.flatMap((q) => q.items.map((it) => ({ it, proj: q.name }))), ...sec.items.map((it) => ({ it, proj: null }))];
    for (const { it, proj } of all) {
      if (it.rowId) seenIds.add(it.rowId);
      if (sname !== "Done this session") { if (it.rowId) busy.add(it.rowId); for (const m of it.text.matchAll(new RegExp(ID_AT, "g"))) busy.add(m[1]); }
      const owner = byPrefix(prefixOf(it.rowId || ID_AT.exec(it.text)?.[1] || ""));
      const home = owner?.name ?? proj;
      if (!home) { unplaced.push({ id: it.id, text: it.text }); continue; }
      const landed = mirrorsQueue && it.rowId && byPrefix(prefixOf(it.rowId)) && !open.has(it.rowId);
      const to = it.ticked || landed ? "Done this session" : CHIP_SECTION[it.chip?.index] ?? "Claude's on it";
      const reason = it.ticked ? "ticked" : landed ? "landed" : sname !== to ? (OLD_SECTIONS.includes(sname) ? "layout" : "chip") : home !== proj ? "misfiled" : !it.chip ? "chip" : null;
      if (reason === null) { bump(sname, home); continue; }
      work.push({ op: "moveItem", id: it.id, rowId: it.rowId, from: { section: sname, project: proj }, to: { section: to, project: home }, chip: SECTION_CHIP[to], reason, text: it.text });
      bump(to, home);
      if (sname === "Ready for you" && reason === "chip" && it.rowId && open.has(it.rowId)) answered.push(it.rowId);
      if (it.ticked && open.has(it.rowId)) answered.push(it.rowId);
    }
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
      let prev = null;
      for (const x of names) {
        const pr = project(sec, x.name);
        if (!pr) structure.push({ op: "insertProjectHeading", section: sname, name: x.name, afterId: prev ? prev.last : sec.id });
        prev = pr || prev;
      }
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

  /* 3. Up next */
  const upSec = section("Up next"), upOps = [];
  for (const x of names) {
    let lines = [], launch = null;
    const dir = x.backlog ? dirname(x.backlog) : null, base0 = dir ? basename(dir) : null;
    const gl = dir && existsSync(join(vault, dir, `${base0}-go-live.md`)) ? parseGoLive(readFileSync(join(vault, dir, `${base0}-go-live.md`), "utf8")) : null;
    if (gl) {
      lines = gl.lines.filter((l) => !l.ticked && !busy.has(l.id)).slice(0, 5).map((l) => `- (${l.id}) ${l.title}`);
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

  /* 4. clean-up: the Done note, the sections the layout replaced, the backlog links */
  const clean = [];
  for (const q of section("Done this session")?.paras || []) if (q.text !== "Nothing.") clean.push({ op: "removeNode", section: "Done this session", id: q.id, why: "the explanatory note line goes" });
  for (const old of OLD_SECTIONS) { const sec = section(old); if (sec) clean.push({ op: "removeSection", name: old, id: sec.id, nodeIds: sec.nodeIds, why: old === "Go-live" ? "the go-live list lives in the vault file; its From you part duplicated the Ready for you items" : "the sections are the chip values now (items moved above)" }); }
  const bk = section("Backlogs");
  if (base && names.every((x) => x.backlog)) {
    const links = names.map((x) => ({ label: x.name, url: `${base}/${x.backlog}` }));
    const have = (bk?.items || []).map((i) => i.text);
    if (!bk || have.length !== links.length || have.some((t, i) => t !== `[${links[i].label}](${links[i].url})`)) clean.push({ op: "setBacklogLinks", id: bk?.listIds[0] ?? null, links });
  }
  return { ops: [...dateOps, ...structure, ...work, ...tail, ...upOps, ...clean], unplaced, answered: [...new Set(answered)] };
}

function main() {
  const a = process.argv.slice(2), get = (k) => { const i = a.indexOf(k); return i !== -1 ? a[i + 1] : undefined; };
  if (!get("--vault") || !get("--doc")) { console.error("usage: status-layout --vault <root> --projects PF,DISC --doc <xml file> [--today YYYY-MM-DD]"); process.exit(1); }
  try {
    const out = layoutPlan({ vault: resolveVaultRoot(get("--vault")), prefixes: String(get("--projects") || "").split(","), docXml: readFileSync(get("--doc"), "utf8"), today: get("--today") || new Date().toISOString().slice(0, 10) });
    console.log(JSON.stringify(out, null, 2));
  } catch (e) { console.error(`status-layout: ${e.message}`); process.exit(1); }
}
if (process.argv[1]?.endsWith("status-layout.mjs")) main();
