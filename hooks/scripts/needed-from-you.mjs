#!/usr/bin/env node
/* needed-from-you — the `## Needed from you` block, built by script so a
   session can only ever print its own projects' rows (backlog 166, operator
   2026-10-12: "other project items appearing in sessions where we aren't working
   on those projects ... things i've answered that come back").

   `--projects PF,HB` names the session's projects by row-ID prefix. For each
   prefix this opens that project's `*-queue.md` and `*-backlog.md` and nothing
   else, so another project's rows are never read, let alone printed. It prints:
     - every queue row that is not struck, in full, and
     - every backlog row whose status is `waiting on operator` and is not struck
       (Needed from you = queue plus backlog).
   A struck row, or a backlog row under ## Done, is never printed. A row whose
   prefix is not the file's own is refused, not shown. An unknown prefix, or no
   project at all, is a refusal.

   Usage: node needed-from-you.mjs --vault <root> --projects PF,HB
   Exit 0 printed (even when "none") · 1 refused.                          */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { discoverFiles, tableRows } from "./lib/queue-ids.mjs";
import { isReleaseOnlyAsk } from "./lib/release-only-ask.mjs";
import { parseBacklog, parseStatus } from "./list-drift-check.mjs";

/* DISC-178: a hand-typed "release?" row is never printed as an operator ask
   (ruling 2026-10-15-release-follows-merge). what = the row's first text cell. */
const releaseOnly = (line) => { const c = line.split("|").slice(1, -1).map((x) => x.trim()); return isReleaseOnlyAsk(c[1] || "", c.slice(2).join(" ")); };

export function neededFromYou(vault, prefixes) {
  const want = [...new Set(prefixes.map((p) => String(p).trim()).filter(Boolean))];
  if (!want.length) return { ok: false, reason: "name at least one project prefix (--projects PF,HB); there is no all-projects view" };
  const reg = discoverFiles(vault);
  const unknown = want.filter((p) => !reg.byPrefix.has(p));
  if (unknown.length) return { ok: false, reason: `unknown project prefix: ${unknown.join(", ")} (known: ${[...reg.byPrefix.keys()].sort().join(", ")})` };
  const head = (t) => { const l = t.split(/\r?\n/); const i = l.findIndex((x) => /^\|\s*#\s*\|/.test(x)); return i === -1 ? [] : [l[i], l[i + 1] || ""]; };
  const out = [];
  for (const prefix of want) {
    const e = reg.byPrefix.get(prefix);
    const queue = { head: [], rows: [] };
    const backlog = { head: [], rows: [] };
    if (e.queue) {
      const qt = readFileSync(join(vault, e.queue), "utf8");
      queue.head = head(qt);
      for (const r of tableRows(qt)) {
        if (r.prefix !== prefix) return { ok: false, reason: `${e.queue} holds ${r.id}, which is not a ${prefix} row; run list-drift-check` };
        if (!r.struck && !releaseOnly(r.line)) queue.rows.push({ id: r.id, line: r.line });
      }
    }
    if (e.backlog) {
      const text = readFileSync(join(vault, e.backlog), "utf8");
      const lines = text.split(/\r?\n/);
      backlog.head = head(text);
      for (const r of parseBacklog(text)) {
        if (r.prefix !== prefix) return { ok: false, reason: `${e.backlog} holds ${r.id}, which is not a ${prefix} row; run list-drift-check` };
        if (!r.struck && r.section !== "done" && parseStatus(r.status)?.kind === "waiting" && !releaseOnly(lines[r.lineIndex])) backlog.rows.push({ id: r.id, line: lines[r.lineIndex] });
      }
    }
    out.push({ prefix, project: e.project, queue, backlog });
  }
  return { ok: true, projects: out };
}

export function render(result) {
  const lines = ["## Needed from you", ""];
  for (const p of result.projects) {
    lines.push(`### ${p.prefix} — ${p.project}`, "");
    if (!p.queue.rows.length && !p.backlog.rows.length) lines.push("Nothing needed from you.", "");
    if (p.queue.rows.length) lines.push(...p.queue.head, ...p.queue.rows.map((r) => r.line), "");
    if (p.backlog.rows.length) lines.push("Waiting on you (backlog):", "", ...p.backlog.head, ...p.backlog.rows.map((r) => r.line), "");
  }
  return lines.join("\n");
}

function main() {
  const a = process.argv.slice(2);
  const get = (k) => { const i = a.indexOf(k); return i !== -1 ? a[i + 1] : undefined; };
  const vault = get("--vault");
  if (!vault) { console.error("usage: needed-from-you --vault <root> --projects PF,HB"); process.exit(1); }
  const r = neededFromYou(resolve(vault), String(get("--projects") || "").split(","));
  if (!r.ok) { console.error(`needed-from-you: ${r.reason}`); process.exit(1); }
  console.log(render(r));
}

if (process.argv[1] && process.argv[1].endsWith("needed-from-you.mjs")) main();
