#!/usr/bin/env node
/* queue-migrate — the one-time vault migration for per-project queues (backlog
   166, operator 2026-10-12). Dry-run by default; `--apply` writes.

   Before: one shared `orchestrator/operator-queue.md` with a `## <section>` per
   group of projects and bare row numbers that repeated across sections; backlogs
   with bare numbers. After:
     - every project has `projects/<p>/<p>-queue.md` (frontmatter `prefix:`), its
       rows keyed `<PREFIX>-<n>`; the suffix IS the old bare number, so an old
       number N in project P is exactly `P-N` (no renumbering, nothing to alias
       beyond that rule, which each file states);
     - every `*-backlog.md` gets the same `prefix:` and prefixed row IDs; a number
       used twice inside one backlog gets the next free number for its later row,
       with the old number kept in the row;
     - `orchestrator/operator-queue.md` becomes an index with no rows.
   Rows are assigned by their own content, never by section heading: SECTION_DEFAULT
   is the starting point and ROW_OVERRIDE names every row that goes elsewhere, with
   its reason, printed in the report. Struck rows stay struck, verbatim: only the
   first cell changes, and the script refuses to write if any old row's text is not
   found in a new file, or the per-project counts do not add up.
   Usage: node queue-migrate.mjs --vault <root> [--apply]                     */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

export const PREFIX = {
  portfolio: "PF", hoverboard: "HB", "jhd-design-system": "DS", "jhd-discipline": "DISC", skillz: "SK",
  "capture-app": "CAP", "capture-figma": "CF", "handoff-toolkit": "HT", squish: "SQ", "payload-cms": "PL", "own-tool": "OT",
};
const SECTION_DEFAULT = {
  "Portfolio + discipline": "portfolio", Hoverboard: "hoverboard", "Capture + Squish": null,
  "Cloud setup": "portfolio", "Own tool (canvas)": "own-tool",
};
/* `<section>|<number>` -> [project, reason]. */
export const ROW_OVERRIDE = {
  "Portfolio + discipline|268": ["jhd-design-system", "Action size 400 is deleted by the design-system lane (row text: \"DS lane deletes size 400\")"],
};
const ROW = /^\|\s*(~~)?(\d+[a-z]?)(~~)?\s*\|/;
const rowKey = (line) => ROW.exec(line)?.[2] ?? null;
const withId = (line, id) => line.replace(ROW, (m, a, n, b) => m.replace(`${a || ""}${n}${b || ""}`, `${a || ""}${id}${b || ""}`));

export function migrate(vault) {
  const report = { projects: {}, judgement: [], renumbered: [], files: {}, errors: [] };
  const files = {};
  const projectsDir = join(vault, "projects");
  const dirs = readdirSync(projectsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  const backlogNext = {};
  const stat = (p) => (report.projects[p] ||= { backlogBefore: 0, backlogAfter: 0, queueBefore: 0, queueAfter: 0 });

  // 1. Backlogs.
  for (const p of dirs) {
    const file = `projects/${p}/${p}-backlog.md`;
    if (!existsSync(join(vault, file))) continue;
    const px = PREFIX[p];
    if (!px) { report.errors.push(`no prefix chosen for project ${p}`); continue; }
    const text = readFileSync(join(vault, file), "utf8");
    if (/^prefix:/m.test(text.split(/\n---\n/)[0])) continue; // already migrated
    const lines = text.split("\n");
    const nums = lines.map(rowKey).filter(Boolean);
    stat(p).backlogBefore = nums.length;
    let next = Math.max(0, ...nums.map((n) => parseInt(n, 10))) + 1;
    const nf = lines.findIndex((l) => /^\*\*Next free number: \d+/.test(l));
    if (nf !== -1) next = Math.max(next, parseInt(/(\d+)/.exec(lines[nf])[1], 10));
    const seen = new Set();
    const out = lines.map((l) => {
      const n = rowKey(l);
      if (!n) return l;
      if (seen.has(n)) {
        const id = `${px}-${next++}`;
        report.renumbered.push(`${file}: second row ${n} -> ${id}`);
        return withId(l, id).replace(/\s*\|\s*$/, ` (was ${px}-${n}, a duplicate number; renumbered by the 2026-10-12 migration) |`);
      }
      seen.add(n);
      return withId(l, `${px}-${n}`);
    });
    backlogNext[p] = next;
    if (nf !== -1) out[nf] = out[nf].replace(/Next free number: \d+/, `Next free number: ${next}`);
    const fmEnd = out.findIndex((l, i) => i > 0 && l === "---");
    if (out[0] !== "---" || fmEnd < 0) { report.errors.push(`${file}: no frontmatter`); continue; }
    out.splice(fmEnd, 0, `prefix: ${px}`);
    files[file] = out.join("\n");
    stat(p).backlogAfter = out.filter((l) => /^\|\s*(~~)?[A-Z]{2,4}-\d+[a-z]?(~~)?\s*\|/.test(l)).length;
  }

  // 2. Queue rows from the shared file.
  const qpath = "orchestrator/operator-queue.md";
  const old = readFileSync(join(vault, qpath), "utf8");
  const oldLines = old.split("\n");
  const rows = {}; // project -> [{line, n, section}]
  const notes = {}; // project -> prose lines from its sections
  const heads = {}; // project -> table header
  const nextFree = {}; // project -> max of declared next-free of sections that default to it
  let section = null;
  let sectionRows = 0;
  oldLines.forEach((l, i) => {
    const h = /^##\s+(.+?)\s*$/.exec(l);
    if (h) { section = h[1]; return; }
    if (!section) return;
    const def = SECTION_DEFAULT[section];
    const nf = /Next free number: (\d+)/.exec(l);
    if (nf && def) nextFree[def] = Math.max(nextFree[def] || 0, parseInt(nf[1], 10));
    const n = rowKey(l);
    if (n) {
      sectionRows++;
      const ov = ROW_OVERRIDE[`${section}|${n}`];
      const proj = ov ? ov[0] : def;
      if (ov) report.judgement.push(`${section} row ${n} -> ${PREFIX[proj]}-${n}: ${ov[1]}`);
      else if (section === "Cloud setup") report.judgement.push(`${section} row ${n} -> ${PREFIX[proj]}-${n} (section default: ${proj})`);
      (rows[proj] ||= []).push({ line: l, n, section });
      return;
    }
    if (/^\|\s*#\s*\|/.test(l) && def) heads[def] ||= [l, oldLines[i + 1]];
    if (/^\|[\s|:-]+\|$/.test(l) || /^\|\s*#\s*\|/.test(l)) return;
    if (/^\|\s*—\s*\|/.test(l)) return; // "No open rows" placeholder
    if (nf || !l.trim() || !def) return;
    (notes[def] ||= []).push(l);
  });
  report.placeholderRows = oldLines.filter((l) => /^\|\s*—\s*\|/.test(l)).length;

  for (const p of dirs) {
    const px = PREFIX[p];
    if (!px || !existsSync(join(vault, `projects/${p}/${p}-backlog.md`))) continue;
    const file = `projects/${p}/${p}-queue.md`;
    if (existsSync(join(vault, file))) continue;
    const mine = rows[p] || [];
    stat(p).queueBefore = mine.length;
    const maxN = Math.max(0, ...mine.map((r) => parseInt(r.n, 10)));
    // A project with no queue history starts past its backlog numbers, so a queue ID never repeats a backlog ID.
    const next = Math.max(nextFree[p] || (mine.length ? 1 : backlogNext[p] || 1), maxN + 1);
    const head = heads[p] || heads.portfolio || ["| # | Needed | Where | Why | Recommended |", "| - | - | - | - | - |"];
    const body = [
      "---", `name: ${p}-queue`, "kind: queue", `prefix: ${px}`,
      `description: "Operator queue for ${p}: what is needed from Jarrad, one row each. Rows are ${px}-<n>; struck when answered, never deleted."`,
      "updated: 2026-10-12", "---", "",
      `# ${p} — operator queue`, "",
      `Hubs: [[${p}-handover]] · backlog [[${p}-backlog]]. One queue per project (backlog 166, 2026-10-12): this file holds only ${px} rows and the session prints them with \`needed-from-you.mjs --projects ${px}\`. Struck when answered, never deleted, numbers never reused. Status replies end with this project's open rows in full.`,
      "", `**Legacy numbers:** before 2026-10-12 queue rows had bare numbers repeated across sections; an old bare number N in this project is exactly \`${px}-N\` (older struck rows are in [[operator-queue-archive-2026-10]] and [[operator-queue-archive-2026-09]] under their old section headings).`,
      ...(notes[p] ? ["", "Notes carried over from the old section:", "", ...notes[p]] : []),
      "", `**Next free number: ${next}** (highest used ${maxN || "none"}).`, "", ...head, ...mine.map((r) => withId(r.line, `${px}-${r.n}`)), "",
    ];
    files[file] = body.join("\n");
    stat(p).queueAfter = mine.length;
  }

  // 3. The shared file becomes an index.
  const archiveLine = oldLines.find((l) => l.includes("operator-queue-archive")) || "";
  const idxRows = Object.entries(PREFIX).map(([p, px]) => `- ${px} — [[${p}-queue]] (\`projects/${p}/${p}-queue.md\`) · backlog [[${p}-backlog]]`);
  files[qpath] = [
    "# Operator queue — index", "",
    "**There is no shared queue.** Each project has its own queue file beside its backlog, rows keyed `<PREFIX>-<n>` (backlog 166, operator 2026-10-12: \"completely separate project backlogs/needed from me so that can't happen\"). A session prints only its own projects' rows: `node <plugin>/hooks/scripts/needed-from-you.mjs --vault <vault> --projects PF,HB`. Writes go through `lane-end.mjs --id <PREFIX-n>`; a bare number is refused. `list-drift-check.mjs` fails on a bare, foreign or duplicate ID, and on any row left in this file.", "",
    ...idxRows, "",
    "Archives (struck rows, old section headings and bare numbers, moved 2026-10-06 and later): [[operator-queue-archive-2026-10|2026-10]] · [[operator-queue-archive-2026-09|2026-09]]. Their numbers are the old bare numbers; the section heading names the project(s).", "",
  ].join("\n");

  // 4. Verify: every old row text survives in exactly its project's new queue; counts add up.
  const totalOld = sectionRows;
  let totalNew = 0;
  for (const [p, mine] of Object.entries(rows)) {
    const px = PREFIX[p];
    const nf = files[`projects/${p}/${p}-queue.md`];
    if (!nf) { report.errors.push(`rows for ${p} but no queue file`); continue; }
    for (const r of mine) {
      if (!nf.includes(withId(r.line, `${px}-${r.n}`))) report.errors.push(`${p}: row ${r.n} text not found in new queue`);
      totalNew++;
    }
  }
  if (totalOld !== totalNew) report.errors.push(`queue row count ${totalOld} before, ${totalNew} after`);
  report.totalQueueRows = totalOld;
  report.files = files;
  return report;
}

function main() {
  const a = process.argv.slice(2);
  const vi = a.indexOf("--vault");
  if (vi === -1 || !a[vi + 1]) { console.error("usage: queue-migrate --vault <root> [--apply]"); process.exit(2); }
  const vault = resolve(a[vi + 1]);
  const r = migrate(vault);
  console.log("project              backlog before->after   queue before->after");
  for (const [p, s] of Object.entries(r.projects)) console.log(`${p.padEnd(20)} ${String(s.backlogBefore).padStart(6)} -> ${String(s.backlogAfter).padEnd(6)}        ${String(s.queueBefore).padStart(5)} -> ${s.queueAfter}`);
  console.log(`queue rows total: ${r.totalQueueRows} before; "No open rows" placeholders dropped: ${r.placeholderRows}`);
  for (const j of r.judgement) console.log(`judgement: ${j}`);
  for (const j of r.renumbered) console.log(`renumbered: ${j}`);
  if (r.errors.length) { for (const e of r.errors) console.error(`ERROR ${e}`); process.exit(1); }
  if (!a.includes("--apply")) { console.log(`[dry-run] would write ${Object.keys(r.files).length} files`); return; }
  for (const [f, t] of Object.entries(r.files)) writeFileSync(join(vault, f), t, "utf8");
  console.log(`wrote: ${Object.keys(r.files).join(" ")}`);
}

if (process.argv[1] && process.argv[1].endsWith("queue-migrate.mjs")) main();
