#!/usr/bin/env node
/* row-add — add a row to a project's queue or backlog; the tool picks the
   number (backlog DISC-167). Nobody types a new number.

   Usage: node row-add.mjs --vault <root> --prefix PF --to backlog|queue \
            --text "<item or need>" [--raised YYYY-MM-DD]          (backlog)
            [--status "waiting on operator"]  (backlog; an idea is added so)
            [--where "<w>"] [--why "<y>"] [--recommended "<r>"]    (queue)
            [--merge-into <ID>]  fold the text into that open row instead (dated; backlog Notes, queue Needed)
            [--distinct]     add the row even though it resembles an open one
            [--offline]      skip the origin/main check (tests, no network)
   A new row that resembles an open backlog row or unstruck queue row (shared
   content words) is refused, naming the rows, unless --merge-into or --distinct
   says which (DISC-189, decision 2026-10-18-orderly-backlogs).
   A queue row that names other rows of its own project (`ZZ-12`) is refused unless every
   named row is open and list-drift-check ran for this vault in the last 15 minutes
   (DISC-221, lesson 2026-10-31-s43 #1: closed rows were offered as "which next?").
   Prints the new ID (e.g. PF-682) on stdout. Exit 0 added · 1 refused (the
   reason is on stderr) · 2 usage error. Warnings (origin unreachable) go to
   stderr and do not fail the call.

   The number is one above every number used in the project's queue AND backlog,
   local and origin/main (lib/row-alloc.mjs). After the write the project's two
   files are re-read and the call fails if the new ID is not present exactly
   once across both.                                                         */
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { addRow, parseBacklog, parseStatus } from "./list-drift-check.mjs";
import { discoverFiles, tableRows } from "./lib/queue-ids.mjs";
import { highestUsed, remoteTexts, withVaultLock } from "./lib/row-alloc.mjs";
import { RELEASE_REFUSAL, isReleaseOnlyAsk } from "./lib/release-only-ask.mjs";
import { DRIFT_STAMP_MINUTES, driftStampFresh, writeMarker } from "./lib/row-marker.mjs";

/* Write via a sibling temp file + rename so a reader never sees a truncated file. */
const writeAtomic = (path, text) => { const tmp = `${path}.${process.pid}.tmp`; writeFileSync(tmp, text); renameSync(tmp, path); };
const clean = (s) => String(s ?? "").replace(/\r?\n/g, " ").trim();

/* Append a queue row to the last line of the file's first table. */
export function addQueueRow(text, prefix, n, cells) {
  const lines = String(text).split("\n");
  const h = lines.findIndex((l) => /^\|\s*#\s*\|/.test(l));
  if (h === -1) return { ok: false, reason: "no `| # | … |` table in the queue to add the row to" };
  let at = h + 1;
  while (at + 1 < lines.length && lines[at + 1].startsWith("|")) at++;
  const width = lines[h].split("|").length - 2;
  const row = [`${prefix}-${n}`, ...cells].slice(0, width);
  while (row.length < width) row.push("");
  lines.splice(at + 1, 0, `| ${row.join(" | ")} |`);
  const nf = lines.findIndex((l) => /^\*\*Next free number: \d+/.test(l));
  if (nf !== -1) lines[nf] = lines[nf].replace(/Next free number: \d+[^*]*/, `Next free number: ${n + 1}`);
  return { ok: true, text: lines.join("\n") };
}

/* Content words: lowercased runs of 4+ letters/digits, minus filler. */
const FILLER = new Set("with from that this then than into when what which have been also only just more some each them they their there should would could after before again about".split(" "));
const words = (s) => new Set((String(s).toLowerCase().match(/[a-z0-9]{4,}/g) || []).filter((w) => !FILLER.has(w)).map((w) => w.replace(/s$/, "")));

/* Open rows of the project (backlog open/waiting/in flight, unstruck queue rows): { id, item, file, cells, lineIndex }. */
function openRows(vault, owner) {
  const out = [];
  if (owner.backlog) for (const r of parseBacklog(readFileSync(join(vault, owner.backlog), "utf8"))) {
    const k = parseStatus(r.status)?.kind;
    if (!r.struck && r.section !== "done" && k !== "done" && k !== "moot") out.push({ id: r.id, item: r.cells[1] || "", file: owner.backlog, cells: r.cells, lineIndex: r.lineIndex });
  }
  if (owner.queue) for (const r of tableRows(readFileSync(join(vault, owner.queue), "utf8"))) {
    if (!r.struck) out.push({ id: r.id, item: r.cells[1] || "", file: owner.queue, cells: r.cells, lineIndex: r.lineIndex });
  }
  return out;
}

/* Open rows sharing at least 3 content words and 60% of the longer text's words
   (a distinct row that reuses a topic's words, "remove the footer typeface override
   …" beside "pick the footer typeface …", passes; #107 review). */
export function similarRows(text, rows) {
  const a = words(text);
  return rows.filter((r) => {
    const b = words(r.item);
    const shared = [...a].filter((w) => b.has(w)).length;
    return shared >= 3 && shared / Math.max(a.size, b.size) >= 0.6;
  });
}

/* Row IDs of this project named in a row's text, deduplicated, in order. */
export function citedIds(text, prefix) {
  return [...new Set(String(text).match(new RegExp(`\\b${prefix}-\\d+\\b`, "g")) || [])];
}

export function rowAdd({ vault, prefix, to, text, raised, where, why, recommended, offline, status, mergeInto, distinct }) {
  const warnings = [];
  const fail = (reason) => ({ ok: false, reason, warnings });
  if (!/^[A-Z]{2,4}$/.test(String(prefix || ""))) return fail(`--prefix must be a project prefix like PF, got "${prefix ?? ""}"`);
  if (to !== "queue" && to !== "backlog") return fail("--to must be queue or backlog");
  if (!clean(text)) return fail("--text is required");
  if (status !== undefined && (to !== "backlog" || !["open", "waiting on operator"].includes(status))) return fail("--status applies to a backlog row and is `open` or `waiting on operator` (an idea is `waiting on operator`)");
  // DISC-178: an ask the operator can act on is a row; "release?" is not (ruling 2026-10-15-release-follows-merge).
  if ((to === "queue" || status === "waiting on operator") && isReleaseOnlyAsk(clean(text), [where, why, recommended].map(clean).join(" "))) return fail(`release-only ask refused — ${RELEASE_REFUSAL}`);
  if (/\|/.test(clean(text) + clean(where) + clean(why) + clean(recommended))) return fail("cell text must not contain | (it would split the row)");
  return withVaultLock(vault, () => {
    // Resolved inside the lock: a concurrent writer's file is never read half-written.
    const owner = discoverFiles(vault).byPrefix.get(prefix);
    if (!owner) return fail(`no project queue declares prefix ${prefix} (frontmatter \`prefix:\` in projects/<p>/<p>-queue.md)`);
    const rels = [owner.queue, owner.backlog].filter(Boolean);
    const open = openRows(vault, owner);
    if (mergeInto) {
      const row = open.find((r) => r.id === mergeInto);
      if (!row) return fail(`${mergeInto} is not an open row of ${prefix} (merge into an open backlog row or unstruck queue row)`);
      const path = join(vault, row.file);
      const lines = readFileSync(path, "utf8").split("\n");
      const c = row.cells.slice();
      const note = `${clean(raised) || new Date().toISOString().slice(0, 10)}: ${clean(text)}`;
      // Backlog: the Notes (last) cell. Queue: the Needed cell, never Recommended (#107 review).
      const at = row.file === owner.queue ? 1 : c.length - 1;
      c[at] = c[at] ? `${c[at]} · ${note}` : note;
      lines[row.lineIndex] = `| ${c.join(" | ")} |`;
      writeAtomic(path, lines.join("\n"));
      return { ok: true, id: row.id, file: row.file, merged: true, warnings };
    }
    if (to === "queue") {
      const cited = citedIds([text, where, why, recommended].map(clean).join(" "), prefix);
      const shut = cited.filter((id) => !open.some((r) => r.id === id));
      if (shut.length) return fail(`cites ${shut.join(", ")}, not an open row of ${prefix} (struck, done, moot or absent): check it against merged work before asking`);
      if (cited.length && !driftStampFresh(vault)) return fail(`cites ${cited.join(", ")}: run \`node <plugin>/hooks/scripts/list-drift-check.mjs --vault <vault> --repo <paths>\` first (no run in the last ${DRIFT_STAMP_MINUTES} minutes; ruling lists-never-stale)`);
    }
    const like = distinct ? [] : similarRows(clean(text), open);
    if (like.length) {
      const named = like.map((r) => `${r.id} ("${r.item.slice(0, 60)}")`).join(", ");
      return { ...fail(`resembles open row ${named}: rerun with --merge-into ${like[0].id} to fold it in, or --distinct to add a new row`), similar: like.map((r) => r.id) };
    }
    const target = owner[to];
    if (!target) return fail(`${prefix} has no ${to} file`);
    const local = rels.map((r) => readFileSync(join(vault, r), "utf8"));
    const remote = offline ? { texts: [], warnings: ["--offline: origin/main not checked"] } : remoteTexts(vault, rels);
    warnings.push(...remote.warnings);
    const floor = highestUsed([...local, ...remote.texts]);
    const path = join(vault, target);
    const before = readFileSync(path, "utf8");
    let edit;
    if (to === "backlog") {
      edit = addRow(before, clean(text), clean(raised) || new Date().toISOString().slice(0, 10), { floor, status: status || "open" });
    } else {
      edit = addQueueRow(before, prefix, floor + 1, [clean(text), clean(where), clean(why), clean(recommended)]);
      if (edit.ok) edit.id = `${prefix}-${floor + 1}`;
    }
    if (!edit.ok) return fail(edit.reason);
    writeAtomic(path, edit.text);
    // Verify: the new ID is present exactly once across the project's two files.
    const seen = rels.flatMap((r) => tableRows(readFileSync(join(vault, r), "utf8"))).filter((r) => r.id === edit.id).length;
    if (seen !== 1) {
      writeAtomic(path, before);
      return fail(`${edit.id} would appear ${seen} times across ${rels.join(" and ")}; the write was rolled back`);
    }
    return { ok: true, id: edit.id, file: target, warnings };
  });
}

function main() {
  const argv = process.argv.slice(2);
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) { console.error(`row-add: unexpected argument "${argv[i]}"`); process.exit(2); }
    const k = argv[i].slice(2);
    a[k] = k === "offline" || k === "distinct" ? true : argv[++i];
  }
  if (!a.vault || !a.prefix || !a.to || !a.text) {
    console.error("usage: row-add --vault <root> --prefix PF --to backlog|queue --text \"…\" [--raised d] [--status \"waiting on operator\"] [--where w --why y --recommended r] [--merge-into ID | --distinct] [--offline]");
    process.exit(2);
  }
  const res = rowAdd({ vault: resolve(a.vault), prefix: a.prefix, to: a.to, text: a.text, raised: a.raised, where: a.where, why: a.why, recommended: a.recommended, status: a.status, offline: Boolean(a.offline), mergeInto: a["merge-into"], distinct: Boolean(a.distinct) });
  for (const w of res.warnings || []) console.error(`row-add: warning — ${w}`);
  if (!res.ok) { console.error(`row-add: refused — ${res.reason}`); process.exit(1); }
  // DISC-179(1): tell the Stop hook a new ask was raised this turn.
  if (res.merged) { console.log(res.id); return; }
  try { writeMarker(resolve(a.vault), { prefix: a.prefix, id: res.id, to: a.to }); } catch { /* the marker is a nudge, never a failure */ }
  console.log(res.id);
}

if (process.argv[1] && process.argv[1].endsWith("row-add.mjs")) main();
