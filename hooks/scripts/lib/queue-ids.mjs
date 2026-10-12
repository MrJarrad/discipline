/* queue-ids — the one place that knows what a project-prefixed row ID is
   (`PF-279`), which file a prefix owns, and what a queue/backlog row is.

   Why (backlog 166, operator 2026-10-12): bare row numbers repeated across
   projects, so another project's row could show up in a session, or be
   overwritten by a write keyed to the same number. An ID is `<PREFIX>-<n>`;
   the prefix is declared once per project in the frontmatter (`prefix: PF`) of
   its `projects/<p>/<p>-queue.md` and `projects/<p>/<p>-backlog.md`, and a
   prefix may belong to exactly one project. Every reader and writer resolves
   the file FROM the prefix, so a row is never looked up in a file that does
   not own it.

   Interface:
     parseId("PF-279") -> { prefix, n } | null        (bare "279" -> null)
     frontmatterPrefix(text) -> "PF" | null
     discoverFiles(vault) -> { byPrefix: Map<prefix, {project, queue, backlog}>,
                               collisions: [{prefix, projects}], missing: [file] }
     tableRows(text) -> [{ id, prefix, n, bare, struck, cells, lineIndex, line }]
*/
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const ID_RE = /^([A-Z]{2,4})-(\d+[a-z]?)$/;
export const parseId = (s) => {
  const m = ID_RE.exec(String(s ?? "").trim());
  return m ? { prefix: m[1], n: m[2] } : null;
};

export function frontmatterPrefix(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(String(text));
  if (!m) return null;
  const p = /^prefix:\s*["']?([A-Z]{2,4})["']?\s*$/m.exec(m[1]);
  return p ? p[1] : null;
}

/* Every project queue/backlog file, keyed by declared prefix. */
export function discoverFiles(vault) {
  const byPrefix = new Map();
  const owners = new Map(); // prefix -> Set(project)
  const missing = []; // queue/backlog files with no valid prefix
  const projects = join(vault, "projects");
  const dirs = existsSync(projects) ? readdirSync(projects, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort() : [];
  for (const project of dirs) {
    for (const f of readdirSync(join(projects, project))) {
      const kind = f.endsWith("-queue.md") ? "queue" : f.endsWith("-backlog.md") ? "backlog" : null;
      if (!kind) continue;
      const rel = `projects/${project}/${f}`;
      const prefix = frontmatterPrefix(readFileSync(join(vault, rel), "utf8"));
      if (!prefix) { missing.push(rel); continue; }
      if (!owners.has(prefix)) owners.set(prefix, new Set());
      owners.get(prefix).add(project);
      const entry = byPrefix.get(prefix) || { project, queue: null, backlog: null };
      entry[kind] = rel;
      byPrefix.set(prefix, entry);
    }
  }
  const collisions = [...owners].filter(([, s]) => s.size > 1).map(([prefix, s]) => ({ prefix, projects: [...s] }));
  return { byPrefix, collisions, missing };
}

const cellsOf = (line) =>
  line.replace(/\[\[[^\]]*\]\]/g, (m) => m.replace(/\|/g, "\u0001")).replace(/^\||\|\s*$/g, "")
    .split("|").map((c) => c.trim().replace(/\u0001/g, "|"));

const ROW = /^\|\s*(~~)?((?:[A-Z]{2,4}-)?\d+[a-z]?)(~~)?\s*\|/;

/* Table rows whose first cell is a row number or ID. `struck` = the ID cell or
   the first cell after it is struck through (`~~`). */
export function tableRows(text) {
  const rows = [];
  String(text).split(/\r?\n/).forEach((line, lineIndex) => {
    const m = ROW.exec(line);
    if (!m) return;
    const cells = cellsOf(line);
    const id = m[2];
    const p = parseId(id);
    rows.push({
      id, prefix: p ? p.prefix : null, n: p ? p.n : id, bare: !p,
      struck: Boolean(m[1]) || /^~~/.test(cells[1] || ""), cells, lineIndex, line,
    });
  });
  return rows;
}
