#!/usr/bin/env node
/* status-layout — DISC-310 (operator s82: "the doc needs be consistent, easy to maintain and scan"; "yes" to the layout). Turns the vault's queue,
   backlog, Up next and go-live files plus a read of the Status doc (real Claude Docs xml, lib/status-doc.mjs) into the EDIT OPS that make the
   doc exactly this layout, so nothing is hand-edited:
     # Status / date · you / ## Waiting on you / ## Running now / ## Up next (each: one ### heading per session project, "Nothing." when empty;
     Up next ### Portfolio also carries "Launch: N of M done · link") / ## Done this session (ticked items MOVE here, no note line) / ## Backlogs.
   Ops (the session applies each with the Claude Docs connector, in order): setDate, insertSection, insertProjectHeading, insertNothing,
   insertItem, moveToDone, moveItem, setUpNext, setLaunchLine, removeNode, removeSection, setBacklogLinks. An empty `ops` means the doc is
   already in the layout. `unplaced` lists Running lines naming no project heading.
   Up next sources: a project's backlog `## Up next` (an ordered list of row ids, first five), or, when `projects/<p>/<p>-go-live.md` exists, its
   first unticked lines; neither -> "Nothing.". A row already Waiting or Running is never also Up next. The launch count is the go-live file's
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

export function layoutPlan({ vault, prefixes, docXml, today, base = vaultBlobBase(vault) }) {
  const r = neededFromYou(vault, prefixes);
  if (!r.ok) throw new Error(r.reason);
  const doc = parseStatusDoc(docXml), ops = [], unplaced = [];
  const names = r.projects.map((p) => ({ prefix: p.prefix, name: displayName(p.project), backlog: p.backlog.file }));
  const { open, formatted } = openItems(r);
  const section = (n) => doc.sections.find((s) => s.name === n);
  const project = (s, n) => s?.projects.find((p) => p.name === n);
  const byPrefix = (px) => names.find((x) => x.prefix === px);

  if (doc.date !== today && doc.dateId) ops.push({ op: "setDate", id: doc.dateId, value: today, why: `the doc's date line reads ${doc.date}` });

  /* ids already Waiting or Running (never also Up next) */
  const busy = new Set(open.keys());
  for (const n of ["Waiting on you", "Running now"]) for (const pr of section(n)?.projects || []) for (const it of pr.items) { if (it.rowId) busy.add(it.rowId); for (const m of it.text.matchAll(new RegExp(ID_AT, "g"))) busy.add(m[1]); }

  for (const sname of ["Waiting on you", "Running now"]) {
    const sec = section(sname);
    if (!sec) { ops.push({ op: "insertSection", name: sname, afterId: doc.sections.at(-1)?.last ?? null, projects: names.map((x) => x.name) }); continue; }
    let prev = null;
    for (const x of names) {
      let pr = project(sec, x.name);
      if (!pr) { ops.push({ op: "insertProjectHeading", section: sname, name: x.name, afterId: prev ? prev.last : sec.id }); ops.push({ op: "insertNothing", section: sname, project: x.name }); prev = null; continue; }
      let remaining = pr.items.filter((it) => !(it.ticked || (sname === "Waiting on you" && it.rowId && prefixOf(it.rowId) === x.prefix && !open.has(it.rowId))));
      for (const it of pr.items) {
        const gone = it.ticked || (sname === "Waiting on you" && it.rowId && prefixOf(it.rowId) === x.prefix && !open.has(it.rowId));
        if (gone) { ops.push({ op: "moveToDone", section: sname, project: x.name, id: it.id, rowId: it.rowId, reason: it.ticked ? "ticked" : "landed", chip: "Done", text: it.text }); continue; }
        const owner = prefixOf(it.rowId || ID_AT.exec(it.text)?.[1] || "");
        if (owner && owner !== x.prefix && byPrefix(owner)) { ops.push({ op: "moveItem", section: sname, id: it.id, rowId: it.rowId, from: x.name, toProject: byPrefix(owner).name }); remaining = remaining.filter((k) => k !== it); }
      }
      if (sname === "Waiting on you") {
        const seen = new Set(section("Waiting on you").projects.flatMap((q) => q.items.map((k) => k.rowId)));
        for (const [id] of open) if (prefixOf(id) === x.prefix && !seen.has(id)) { ops.push({ op: "insertItem", section: sname, project: x.name, afterId: remaining.at(-1)?.id ?? pr.last, rowId: id, markdown: formatted.get(id) }); remaining.push({ id: `new:${id}` }); }
      }
      if (!remaining.length && !pr.paras.some((q) => q.text === "Nothing.")) ops.push({ op: "insertNothing", section: sname, project: x.name, afterId: pr.last });
      prev = pr;
    }
    for (const it of sec.items) unplaced.push({ id: it.id, text: it.text });
  }

  /* Up next */
  const upSec = section("Up next");
  if (!upSec) ops.push({ op: "insertSection", name: "Up next", afterId: section("Running now")?.last ?? doc.sections.at(-1)?.last ?? null, projects: names.map((x) => x.name) });
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
    const have = (pr?.items || []).map((i) => `- ${i.text}`.replace(/^- Nothing\.$/, "Nothing.").replace(/^- (\*\*)?/, "- "));
    const same = pr && have.length === lines.length && have.every((h, i) => h === lines[i] || h === lines[i].replace(/^- /, "- "));
    if (!upSec || !same) ops.push({ op: "setUpNext", section: "Up next", project: x.name, replaceId: pr?.listIds[0] ?? null, afterId: pr ? pr.id : null, lines });
    if (launch) {
      const have2 = pr?.paras.find((q) => q.text.startsWith("Launch:"));
      if (!upSec || !have2 || have2.text !== launch) ops.push({ op: "setLaunchLine", section: "Up next", project: x.name, id: have2?.id ?? null, text: launch });
    }
  }

  /* Done this session: no note line. Go-live: gone (it lives in the vault file). */
  for (const q of section("Done this session")?.paras || []) ops.push({ op: "removeNode", section: "Done this session", id: q.id, why: "the explanatory note line goes" });
  const gl = section("Go-live");
  if (gl) ops.push({ op: "removeSection", name: "Go-live", id: gl.id, nodeIds: gl.nodeIds, why: "the go-live list lives in the vault file; its From you part duplicated Waiting on you" });

  const bk = section("Backlogs");
  if (base && names.every((x) => x.backlog)) {
    const links = names.map((x) => ({ label: x.name, url: `${base}/${x.backlog}` }));
    const have = (bk?.items || []).map((i) => i.text);
    if (!bk || have.length !== links.length || have.some((t, i) => t !== `[${links[i].label}](${links[i].url})`)) ops.push({ op: "setBacklogLinks", id: bk?.listIds[0] ?? null, links });
  }
  return { ops, unplaced, launch: names.length ? null : null };
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
