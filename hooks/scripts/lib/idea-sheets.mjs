/* idea-sheets — an idea never lives only in an evidence file (backlog DISC-168,
   operator 2026-10-15: "ideas are part of the backlog / queue list like everything
   else, so they don't get lost, probably as items that are needed from me").

   An idea sheet is any `.md` file under `projects/<p>/evidence/` named `ideas*.md` or whose
   frontmatter description starts "Idea sheet". It must carry an `Idea rows`
   section (a heading or an `Idea rows:` line) citing one backlog/queue row ID per
   idea; each cited ID must exist in a project's backlog or queue; the count of
   cited IDs must reach the count of ideas (`## N.` headings or `N. **` items).
   A sheet whose frontmatter status is archived or moot is skipped.

   checkIdeaSheets(vault) -> [{ kind: "idea-unrowed", project, file, msg }]   */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ID = /\b[A-Z]{2,4}-\d+[a-z]?\b/g;

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".md")) out.push(p);
  }
  return out;
}

function knownIds(vault, dirs) {
  const ids = new Set();
  for (const p of dirs) {
    for (const f of readdirSync(join(vault, "projects", p))) {
      if (!/-(backlog|queue)\.md$/.test(f)) continue;
      for (const line of readFileSync(join(vault, "projects", p, f), "utf8").split(/\r?\n/)) {
        const m = /^\|\s*(?:~~)?([A-Z]{2,4}-\d+[a-z]?)/.exec(line);
        if (m) ids.add(m[1]);
      }
    }
  }
  return ids;
}

export function checkIdeaSheets(vault) {
  const projects = join(vault, "projects");
  if (!existsSync(projects)) return [];
  const dirs = readdirSync(projects, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  const known = knownIds(vault, dirs);
  const out = [];
  for (const p of dirs) {
    const ev = join(projects, p, "evidence");
    if (!existsSync(ev)) continue;
    for (const path of walk(ev)) {
      const text = readFileSync(path, "utf8");
      const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] || "";
      const named = /(^|\/)ideas[^/]*\.md$/i.test(path);
      const described = /^description:\s*["']?Idea sheet/im.test(fm);
      if (!named && !described) continue;
      if (/^status:\s*(archived|moot)\s*$/im.test(fm)) continue;
      const file = path.slice(vault.length + 1);
      const flag = (msg) => out.push({ kind: "idea-unrowed", project: p, file, msg });
      const body = text.slice(text.indexOf("\n---", 3) + 4).split(/\r?\n/);
      const at = body.findIndex((l) => /^(#{1,6}\s*)?Idea rows\s*:?\s*$/i.test(l.trim()));
      let cited = [];
      let rest = body;
      if (at !== -1) {
        const level = /^(#+)/.exec(body[at].trim())?.[1].length || 7;
        let end = body.length;
        for (let i = at + 1; i < body.length; i++) {
          const h = /^(#+)\s/.exec(body[i]);
          if (h && h[1].length <= level) { end = i; break; }
        }
        cited = [...new Set(body.slice(at + 1, end).join("\n").match(ID) || [])];
        rest = [...body.slice(0, at), ...body.slice(end)];
      }
      const ideas = rest.filter((l) => /^#{2,3}\s+\d+\.\s/.test(l) || /^\d+\.\s+\*\*/.test(l)).length;
      if (at === -1) { flag("no `Idea rows` section: every idea needs its own backlog row (row-add.mjs, status `waiting on operator`) cited here"); continue; }
      const missing = cited.filter((id) => !known.has(id));
      if (missing.length) flag(`Idea rows cites ${missing.join(", ")}, which is in no backlog or queue`);
      if (!cited.length) flag("`Idea rows` cites no row ID");
      else if (cited.length < ideas) flag(`${ideas} ideas but ${cited.length} row${cited.length === 1 ? "" : "s"} cited: one backlog row per idea`);
    }
  }
  return out;
}
