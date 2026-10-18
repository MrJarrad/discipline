#!/usr/bin/env node
/* list-drift-check — backlogs and queues are never stale (ruling
   `lists-never-stale`, 2026-10-08). A mechanical check, offline: a row that
   cites a PR is judged against git history the caller supplies (--repo paths).

   Discovers every `projects/<p>/*-backlog.md` plus `orchestrator/operator-queue.md`
   by glob — never a fixed list — and reports one line per finding:
     drift       an in-flight row whose PR is merged (the row should be done)
     suspect     an open row or unstruck queue row cites a merged PR: confirm (non-failing; a follow-up row legitimately cites its parent PR)
     unknown     a cited PR or sha cannot be resolved in the supplied repos (never "done")
     bad-status  a backlog status outside the fixed set
     misplaced   an open-ish row under ## Done, or a done/moot row under ## Open
     no-backlog  a project folder has a handover but no `*-backlog.md`
     duplicate   a project has more than one `*-backlog.md`
     idea-unrowed an idea sheet in evidence whose ideas lack backlog rows (lib/idea-sheets.mjs; DISC-168)
   Fixed status set: open · waiting on operator · in flight (<PR>) ·
   done (<PR> <sha>[, <PR> <sha>]...) · moot (<reason>). <PR> is `#n`,
   `owner/repo#n` or `<name> #n`; a bare name resolves against the --repo
   basenames (`hoverboard` = jhd-hoverboard; alias `DS` = jhd-design-system).

   Backlog shape (as rebuilt in the vault, 2026-10-08): tables headed
   `| # | Item | Raised | Status | Notes |` — the Status column is found from the
   header, not by position — under `## Open` (with `###` groups) and
   `## Done archive`. A row's PR citations are read from its Item cell only;
   Notes are free history. `**Next free number: N**` is honoured by addRow.
   Exit 1 on drift / bad-status / misplaced / no-backlog / duplicate; `suspect` and `unknown`
   alone exit 0 (needs a repo the caller did not give).

   --fix (DISC-189, decision 2026-10-18-orderly-backlogs) repairs what needs no
   judgement, then reports what is left: an `in flight (#n)` row whose own PR
   merged becomes `done (<repo> #n <sha>)` and moves to Done; misplaced and
   stranded rows (outside any `| # |` table) are refiled by status; a bare ID
   takes the file's prefix when that ID is free; `[NEXT SESSION …]` on a
   done/moot row is struck in place; a `Next free number` below the highest used
   is raised. Rows are never deleted and numbers never reused. bad-status,
   dup-id, suspect, unknown and named-by stay for a person: `named-by` (non-failing)
   is an open row whose ID a merged PR's title names. A title can name a row it
   does not finish ("part 1 of 3", a prototype, a follow-up), so it is never
   struck on that alone; Revert titles are ignored (#107 review, red).
   --stale [--days 30] adds a `stale` line (non-failing) for each open row whose
   last change (git blame) and Raised date are both older than the window: keep
   or park, asked at wrap. A shallow clone can only under-report.

   Usage: node list-drift-check.mjs --vault <root> [--repo <path>[,<path>]]... [--fix] [--stale [--days N]]
   Also exports the row editors lane-end uses (setRowStatus, addRow).        */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { discoverFiles, frontmatterPrefix, tableRows } from "./lib/queue-ids.mjs";
import { checkIdeaSheets } from "./lib/idea-sheets.mjs";
import { highestUsed } from "./lib/row-alloc.mjs";

const ALIAS = { ds: "jhd-design-system" };
// `<name>/main` worktree layout: the repo is the parent folder's name.
const repoName = (p) => (/^(main|master)$/.test(basename(p)) ? basename(dirname(p)) : basename(p)).toLowerCase();

const PR = String.raw`(?:[\w.-]+\/[\w.-]+)?#\d+`;
// In a status cell a PR may also carry a bare repo name: `hoverboard #10`, `DS #91`.
const PRN = String.raw`(?:[\w.-]+\/[\w.-]+#\d+|(?:[\w.-]+ )?#\d+)`;
const PAIR = `${PRN} [0-9a-f]{7,40}`;
const STATUS = [
  ["open", /^open$/],
  ["waiting", /^waiting on operator$/],
  ["in-flight", new RegExp(`^in flight \\((${PRN})\\)$`)],
  ["done", new RegExp(`^done \\(((?:${PAIR})(?:, (?:${PAIR}))*)\\)$`)],
  ["moot", /^moot \((.+)\)$/],
];

export function parseStatus(text) {
  const t = String(text).trim();
  for (const [kind, re] of STATUS) {
    const m = re.exec(t);
    if (!m) continue;
    if (kind === "in-flight") return { kind, pr: m[1] };
    if (kind === "done") {
      const pairs = m[1].split(", ").map((p) => { const i = p.lastIndexOf(" "); return { pr: p.slice(0, i), sha: p.slice(i + 1) }; });
      return { kind, pairs };
    }
    return { kind };
  }
  return null;
}

const ROW = /^\|\s*(~~)?((?:[A-Z]{2,4}-)?\d+[a-z]?)(~~)?\s*\|/;
const numOf = (id) => String(id).replace(/^[A-Z]{2,4}-/, "");
const prefixOf = (id) => (/^([A-Z]{2,4})-/.exec(String(id)) || [])[1] || null;
/* Cells of a table line; a `|` inside a [[wikilink|alias]] is not a column break. */
const cells = (line) =>
  line.replace(/\[\[[^\]]*\]\]/g, (m) => m.replace(/\|/g, "\u0001")).replace(/^\||\|\s*$/g, "")
    .split("|").map((c) => c.trim().replace(/\u0001/g, "|"));

/* Rows of a backlog: { n, section: open|done|null, status, cells, line }. */
export function parseBacklog(text) {
  const rows = [];
  let section = null;
  let statusAt = -1;
  String(text).split("\n").forEach((line, line_i) => {
    const h = /^##\s+(.+?)\s*$/.exec(line);
    if (h) section = /^open\b/i.test(h[1]) ? "open" : /^done\b/i.test(h[1]) ? "done" : null;
    if (/^\|\s*#\s*\|/.test(line)) statusAt = cells(line).findIndex((c) => c.toLowerCase() === "status");
    const m = ROW.exec(line);
    if (!m) return;
    const c = cells(line);
    const at = statusAt >= 0 && statusAt < c.length ? statusAt : c.length - 1;
    rows.push({ id: m[2], n: numOf(m[2]), prefix: prefixOf(m[2]), section, status: c[at], statusAt: at, cells: c, struck: Boolean(m[1]), lineIndex: line_i });
  });
  return rows;
}

const git = (repo, ...a) => execFileSync("git", ["-C", repo, ...a], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });

/* Merged means on the default branch: origin/HEAD, else main, else master, else origin/main, else origin/master, else HEAD. */
function defaultRef(path) {
  for (const ref of ["origin/HEAD", "main", "master", "origin/main", "origin/master"]) {
    try { git(path, "rev-parse", "--verify", "-q", `${ref}^{commit}`); return ref; } catch {}
  }
  return "HEAD";
}

/* History the caller supplied: which PR numbers are merged, which shas exist. */
export function mergedIndex(repos) {
  const list = [];
  for (const path of repos) {
    try {
      // One record per commit: sha, subject, body. A merge commit's PR title is its body's first line.
      const commits = git(path, "log", defaultRef(path), "--format=%h%x00%s%x00%b%x1e").split("\x1e").map((c) => c.replace(/^\n/, "").split("\0")).filter((c) => c.length >= 2);
      const nums = new Set();
      const shaOf = new Map();
      const named = [];
      for (const [sha, subj, body = ""] of commits) {
        for (const m of subj.matchAll(/\(#(\d+)\)\s*$|^Merge pull request #(\d+)/g)) {
          const n = m[1] || m[2];
          nums.add(n);
          if (!shaOf.has(n)) shaOf.set(n, sha);
          const title = m[2] ? (body.split("\n").find((l) => l.trim()) || "") : subj;
          if (/^revert\b/i.test(title.trim())) continue;
          for (const id of title.match(/\b[A-Z]{2,4}-\d+[a-z]?\b/g) || []) named.push({ id, num: n, sha });
        }
      }
      let slug = "";
      try { slug = /[:/]([\w.-]+\/[\w.-]+?)(?:\.git)?$/.exec(git(path, "remote", "get-url", "origin").trim())?.[1] || ""; } catch {}
      list.push({ path, slug, nums, shaOf, named, name: repoName(path) });
    } catch { /* not a repo: contributes nothing, so its PRs stay unknown */ }
  }
  // Repos a ref can mean: owner/repo by remote slug, a bare name by basename. A bare
  // `#n` means the backlog's own project repo (name, jhd-name or name minus jhd-);
  // an unmapped project means none (unknown) however many repos were supplied, never the union.
  const match = (m, project) => {
    if (m[1]) return list.filter((r) => r.slug === m[1]);
    if (!m[2]) {
      if (project === undefined) return list;
      const own = list.filter((r) => r.name === project || r.name === `jhd-${project}` || project === `jhd-${r.name}`);
      return own;
    }
    const want = (ALIAS[m[2].toLowerCase()] || m[2]).toLowerCase();
    return list.filter((r) => r.name === want || r.name === `jhd-${want}` || r.slug.split("/")[1]?.toLowerCase() === want);
  };
  return {
    merged(ref, project) {
      const m = /^(?:([\w.-]+\/[\w.-]+)|([\w.-]+) )?#(\d+)$/.exec(ref);
      return Boolean(m) && match(m, project).some((r) => r.nums.has(m[3]));
    },
    // False when the ref names a repo none of the supplied paths is.
    repoKnown(ref, project) {
      const m = /^(?:([\w.-]+\/[\w.-]+)|([\w.-]+) )?#(\d+)$/.exec(ref);
      return Boolean(m) && match(m, project).length > 0;
    },
    // `<repo> #n <sha>` for each merged PR whose title names this row ID (DISC-189; reported, never struck).
    namedBy(id) {
      return list.flatMap((r) => r.named.filter((x) => x.id === id).map((x) => `${r.name} #${x.num} ${x.sha}`));
    },
    // `<repo> #n <sha>` for a merged PR ref, or null.
    mergeOf(ref, project) {
      const m = /^(?:([\w.-]+\/[\w.-]+)|([\w.-]+) )?#(\d+)$/.exec(ref);
      const r = m && match(m, project).find((x) => x.nums.has(m[3]));
      return r ? `${r.name} #${m[3]} ${r.shaOf.get(m[3])}` : null;
    },
    hasSha(sha, ref = "#0", project) {
      const m = /^(?:([\w.-]+\/[\w.-]+)|([\w.-]+) )?#(\d+)$/.exec(ref);
      return (m ? match(m, project) : list).some((r) => { try { git(r.path, "cat-file", "-e", `${sha}^{commit}`); return true; } catch { return false; } });
    },
  };
}

const refsIn = (text) => [...String(text).matchAll(new RegExp(PR, "g"))].map((m) => m[0]);

/* Findings for one backlog's text. Pure given the index. */
export function checkBacklog(project, text, idx) {
  const out = [];
  const add = (kind, row, msg) => out.push({ kind, project, row, msg });
  for (const r of parseBacklog(text)) {
    const st = parseStatus(r.status);
    if (!st) { add("bad-status", r.id, `status "${r.status}" is outside the fixed set`); continue; }
    const finished = st.kind === "done" || st.kind === "moot";
    if (r.section === "open" && finished) add("misplaced", r.id, `${st.kind} row under ## Open`);
    if (r.section === "done" && !finished) add("misplaced", r.id, `${st.kind} row under ## Done`);
    if (st.kind === "done") {
      for (const { pr, sha } of st.pairs) {
        if (!idx.merged(pr, project)) add("unknown", r.id, `${pr} not found as merged in the supplied repos`);
        else if (!idx.hasSha(sha, pr, project)) add("unknown", r.id, `sha ${sha} not found in the supplied repos`);
      }
      continue;
    }
    if (st.kind === "moot") continue;
    for (const by of idx.namedBy?.(r.id) || []) if (!r.struck) add("named-by", r.id, `${st.kind} row is named by merged ${by}: strike it if that PR finished it`);
    const cited = st.kind === "in-flight" ? [st.pr] : [];
    for (const pr of cited) {
      if (idx.merged(pr, project)) add("drift", r.id, `in flight on ${pr}, which is merged`);
      else if (!idx.repoKnown(pr, project)) add("unknown", r.id, `${pr} names a repo not among the supplied --repo paths`);
      // in flight and not merged is the expected state: nothing to report
    }
    // An open follow-up legitimately cites the PR it follows up: surfaced, not failing.
    for (const pr of new Set(refsIn(r.cells[1] || ""))) {
      if (!cited.includes(pr) && idx.merged(pr, project)) add("suspect", r.id, `${r.status} row cites ${pr}, which is merged: confirm it is still open`);
    }
  }
  return out;
}

/* Unstruck queue rows citing a merged PR (per-project queue; `label` names the project). */
export function checkQueue(text, idx, label = "") {
  const out = [];
  for (const line of String(text).split("\n")) {
    const m = ROW.exec(line);
    if (!m || m[1] || /^\|\s*[^|]+\|\s*~~/.test(line)) continue;
    for (const by of idx.namedBy?.(m[2]) || []) out.push({ kind: "named-by", project: label, row: m[2], msg: `open queue row is named by merged ${by}: strike it if the operator's ask is answered` });
    for (const pr of new Set(refsIn(line))) {
      if (idx.merged(pr)) out.push({ kind: "suspect", project: label, row: m[2], msg: `open queue row cites ${pr}, which is merged: confirm it is still open` });
    }
  }
  return out;
}

/* Row-ID law over one prefixed file: every row carries this file's own prefix
   (`bare-id`, `foreign-id`) and no ID appears twice (`dup-id`). */
export function checkIds(text, prefix, file) {
  const out = [];
  const seen = new Map();
  for (const r of tableRows(text)) {
    const add = (kind, msg) => out.push({ kind, project: file, row: r.id, msg, file });
    if (r.bare) add("bare-id", `row ${r.id} has no project prefix; every row is ${prefix}-<n>`);
    else if (r.prefix !== prefix) add("foreign-id", `row ${r.id} belongs to ${r.prefix}, not to this ${prefix} file`);
    if (seen.has(r.id)) add("dup-id", `row ${r.id} appears twice`);
    seen.set(r.id, true);
  }
  return out;
}

export function checkVault(vault, repos) {
  const idx = mergedIndex(repos);
  const out = [];
  const projects = join(vault, "projects");
  const dirs = existsSync(projects) ? readdirSync(projects, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort() : [];
  for (const p of dirs) {
    const files = readdirSync(join(projects, p));
    const backlogs = files.filter((f) => f.endsWith("-backlog.md"));
    const queues = files.filter((f) => f.endsWith("-queue.md"));
    if (files.some((f) => f.endsWith("handover.md")) && !backlogs.length) {
      out.push({ kind: "no-backlog", project: p, file: `projects/${p}`, msg: "has a handover but no *-backlog.md" });
    }
    if (backlogs.length > 1) {
      out.push({ kind: "duplicate", project: p, file: `projects/${p}`, msg: `${backlogs.length} backlog files: ${backlogs.join(", ")}` });
    }
    if (queues.length > 1) {
      out.push({ kind: "duplicate", project: p, file: `projects/${p}`, msg: `${queues.length} queue files: ${queues.join(", ")}` });
    }
    if (backlogs.length && !queues.length) {
      out.push({ kind: "no-queue", project: p, file: `projects/${p}`, msg: "has a backlog but no *-queue.md (each project has its own operator queue)" });
    }
    for (const b of backlogs) {
      const file = `projects/${p}/${b}`;
      const text = readFileSync(join(vault, file), "utf8");
      out.push(...checkBacklog(p, text, idx).map((f) => ({ ...f, file })));
      const prefix = frontmatterPrefix(text);
      if (prefix) out.push(...checkIds(text, prefix, file));
    }
    for (const q of queues) {
      const file = `projects/${p}/${q}`;
      const text = readFileSync(join(vault, file), "utf8");
      out.push(...checkQueue(text, idx, p).map((f) => ({ ...f, file })));
      const prefix = frontmatterPrefix(text);
      if (prefix) out.push(...checkIds(text, prefix, file));
    }
  }
  out.push(...crossFileDupIds(vault));
  const reg = discoverFiles(vault);
  for (const f of reg.missing) out.push({ kind: "no-prefix", project: f, file: f, msg: "frontmatter has no valid `prefix: <2-4 capitals>`" });
  for (const c of reg.collisions) out.push({ kind: "prefix-collision", project: c.prefix, file: `projects/${c.projects[0]}`, msg: `prefix ${c.prefix} is claimed by ${c.projects.join(" and ")}` });
  for (const [prefix, e] of reg.byPrefix) {
    if (e.queue && e.backlog && e.queue.split("/")[1] !== e.backlog.split("/")[1]) {
      out.push({ kind: "prefix-collision", project: prefix, file: e.queue, msg: `queue and backlog of ${prefix} are in different projects` });
    }
  }
  // The old shared queue is only an index now: any row in it is a row in the wrong place.
  const qf = "orchestrator/operator-queue.md";
  if (existsSync(join(vault, qf)) && tableRows(readFileSync(join(vault, qf), "utf8")).length) {
    out.push({ kind: "rows-in-index", project: "orchestrator", file: qf, msg: "queue rows live in projects/<p>/<p>-queue.md; the orchestrator file is an index only" });
  }
  out.push(...checkIdeaSheets(vault));
  return out;
}

/* One ID, one row, across a project's queue AND backlog (backlog DISC-167). */
export function crossFileDupIds(vault) {
  const out = [];
  for (const [prefix, e] of discoverFiles(vault).byPrefix) {
    if (!e.queue || !e.backlog) continue;
    const inQueue = new Map();
    tableRows(readFileSync(join(vault, e.queue), "utf8")).forEach((r) => inQueue.set(r.id, r.lineIndex + 1));
    for (const r of tableRows(readFileSync(join(vault, e.backlog), "utf8"))) {
      if (inQueue.has(r.id)) out.push({ kind: "dup-id", project: prefix, file: e.backlog, row: r.id, msg: `row ${r.id} is in both ${e.queue}:${inQueue.get(r.id)} and ${e.backlog}:${r.lineIndex + 1}; a number is used once per project` });
    }
  }
  return out;
}

export const FAILING = new Set(["drift", "bad-status", "misplaced", "no-backlog", "duplicate", "no-queue", "no-prefix", "prefix-collision", "bare-id", "foreign-id", "dup-id", "rows-in-index", "idea-unrowed"]);
export const formatFinding = (f) => `${f.kind} ${f.file || f.project}${f.row ? ` row ${f.row}` : ""}: ${f.msg}`;

/* --- row editors (lane-end flips a row in the same action as its event) --- */

/* Last line of the section's last `| # |`-headed table. A `|` block with no header
   (stranded rows) is never the target, or rows would be appended to it and rotated
   on every --fix run (#107 review round 2). */
const lastTableLine = (lines, start, end) => {
  let h = -1;
  for (let i = end - 1; i >= start; i--) if (/^\|\s*#\s*\|/.test(lines[i])) { h = i; break; }
  if (h === -1) return -1;
  let i = h;
  while (i + 1 < end && lines[i + 1].startsWith("|")) i++;
  return i;
};
const headingIndex = (lines, re) => lines.findIndex((l) => /^##\s/.test(l) && re.test(l));
const sectionEnd = (lines, from) => {
  for (let i = from + 1; i < lines.length; i++) if (/^##\s/.test(lines[i])) return i;
  return lines.length;
};

/* Header + separator of the Open table, so a created Done table has the same columns. */
const doneHead = (lines) => {
  const i = lines.findIndex((l) => /^\|\s*#\s*\|/.test(l));
  return i !== -1 && /^\|[\s|:-]+\|$/.test(lines[i + 1] || "") ? [lines[i], lines[i + 1]] : ["| # | Item | Raised | Status |", "| - | --- | --- | --- |"];
};

/* Set row n's status (validated against the fixed set); done/moot moves it to ## Done. */
export function setRowStatus(text, n, status) {
  const st = parseStatus(status);
  if (!st) return { ok: false, reason: `status "${status}" is outside the fixed set` };
  const lines = String(text).split("\n");
  // A prefixed row is addressed by its full ID only; a bare number never matches it.
  const hits = parseBacklog(text).filter((r) => r.id === String(n));
  if (hits.length > 1) return { ok: false, reason: `row ${n} appears ${hits.length} times in the backlog; refusing to guess which` };
  const row = hits[0];
  if (!row) return { ok: false, reason: `row ${n} not found in the backlog (rows are addressed by their full ID, e.g. PF-12)` };
  if (/[|\r\n]/.test(status)) return { ok: false, reason: "status must not contain | or a newline (it would split the row)" };
  const finished = st.kind === "done" || st.kind === "moot";
  if (row.section === "done" && !finished) return { ok: false, reason: `row ${n} is archived under ## Done; open a new row instead` };
  const c = row.cells.slice();
  c[row.statusAt] = status.trim();
  const newLine = `| ${c.join(" | ")} |`;
  if (!finished || row.section === "done") { lines[row.lineIndex] = newLine; return { ok: true, text: lines.join("\n") }; }
  lines.splice(row.lineIndex, 1);
  let d = headingIndex(lines, /^##\s+done\b/i);
  if (d === -1) {
    lines.push("", "## Done", "", ...doneHead(lines), newLine);
  } else {
    let at = lastTableLine(lines, d + 1, sectionEnd(lines, d));
    if (at === -1) { const h = doneHead(lines); lines.splice(d + 1, 0, "", ...h); at = d + 1 + h.length; }
    lines.splice(at + 1, 0, newLine);
  }
  return { ok: true, text: lines.join("\n") };
}

/* A new finding adds a row: next number (above `floor`, the highest number used
   anywhere in the project's queue and backlog — see lib/row-alloc.mjs), status `open` (or the given `open` / `waiting on operator`), appended to the ## Open table. */
export function addRow(text, item, raised, { floor = 0, status = "open" } = {}) {
  const lines = String(text).split("\n");
  const o = headingIndex(lines, /^##\s+open\b/i);
  const at = o === -1 ? -1 : lastTableLine(lines, o + 1, sectionEnd(lines, o));
  if (at === -1) return { ok: false, reason: "no ## Open table to add the row to" };
  const prefix = frontmatterPrefix(text);
  let next = Math.max(floor, ...parseBacklog(text).map((r) => parseInt(r.n, 10))) + 1;
  const nf = lines.findIndex((l) => /^\*\*Next free number: \d+/.test(l));
  if (nf !== -1) {
    next = Math.max(next, parseInt(/(\d+)/.exec(lines[nf])[1], 10));
    lines[nf] = lines[nf].replace(/Next free number: \d+/, `Next free number: ${next + 1}`);
  }
  const cols = (lines.slice(0, at).reverse().find((l) => /^\|\s*#\s*\|/.test(l)) || "| # | Item | Raised | Status |");
  const head = cells(cols);
  const row = head.map((h) => ({ "#": prefix ? `${prefix}-${next}` : String(next), item: item, raised: raised, status })[h.toLowerCase()] ?? "");
  lines.splice(at + 1, 0, `| ${row.join(" | ")} |`);
  return { ok: true, text: lines.join("\n"), n: next, id: prefix ? `${prefix}-${next}` : String(next) };
}

/* --- --fix: repairs that need no judgement (DISC-189, decision 2026-10-18-orderly-backlogs) --- */

/* Move the row at lineIndex to the end of the ## Open or ## Done table (created if missing). */
function moveRow(text, lineIndex, to) {
  const lines = String(text).split("\n");
  const [row] = lines.splice(lineIndex, 1);
  const re = to === "open" ? /^##\s+open\b/i : /^##\s+done\b/i;
  let h = headingIndex(lines, re);
  if (h === -1) {
    if (to === "open") return null; // no Open section: a person files it
    lines.push("", "## Done", "", ...doneHead(lines), row);
    return lines.join("\n");
  }
  let at = lastTableLine(lines, h + 1, sectionEnd(lines, h));
  if (at === -1) { const hd = doneHead(lines); lines.splice(h + 1, 0, "", ...hd); at = h + 1 + hd.length; }
  lines.splice(at + 1, 0, row);
  return lines.join("\n");
}

/* Row lines in a `|` block that does not start with a `| # |` header: stranded outside any table. */
function strandedLines(text) {
  const out = [];
  let inTable = false;
  String(text).split("\n").forEach((l, i) => {
    if (!l.startsWith("|")) { inTable = false; return; }
    if (/^\|\s*#\s*\|/.test(l)) { inTable = true; return; }
    if (!inTable && ROW.test(l)) out.push(i);
  });
  return out;
}

const finishedKind = (status) => ["done", "moot"].includes(parseStatus(status)?.kind);

/* Apply edit(text) -> text|null until it returns null; each pass re-parses, since rows move. */
const untilStable = (text, edit, cap = 1000) => {
  for (let i = 0; i < cap; i++) { const next = edit(text); if (next == null || next === text) return text; text = next; }
  return text;
};

/* One backlog: `others` is the project's queue text (numbers are one sequence per prefix). */
export function fixBacklog(text, project, idx, others = "") {
  const prefix = frontmatterPrefix(text);
  // 1. Stranded rows go to Open or Done by status.
  text = untilStable(text, (t) => {
    const i = strandedLines(t)[0];
    if (i === undefined) return null;
    const c = cells(t.split("\n")[i]);
    const statusAt = cells(t.split("\n").find((l) => /^\|\s*#\s*\|/.test(l)) || "").findIndex((x) => x.toLowerCase() === "status");
    // Filed by the status's first word, so an off-set `done — #329 …` still lands in Done (and is reported as bad-status).
    return moveRow(t, i, /^(done|moot)\b/i.test(c[statusAt >= 0 ? statusAt : c.length - 1] || "") ? "done" : "open");
  });
  // 2. A bare ID takes the file's prefix when that ID is free across queue and backlog.
  if (prefix) text = untilStable(text, (t) => {
    const used = new Set([...tableRows(t), ...tableRows(others)].map((r) => r.id));
    const r = tableRows(t).find((x) => x.bare && !used.has(`${prefix}-${x.n}`));
    if (!r) return null;
    const lines = t.split("\n");
    lines[r.lineIndex] = lines[r.lineIndex].replace(/^(\|\s*(?:~~)?)(\d+[a-z]?)/, `$1${prefix}-$2`);
    return lines.join("\n");
  });
  // 3. An `in flight (#n)` row whose own PR merged is done. A title naming a row is only reported (named-by).
  text = untilStable(text, (t) => {
    for (const r of parseBacklog(t)) {
      const st = parseStatus(r.status);
      if (r.struck || st?.kind !== "in-flight") continue;
      const by = idx.mergeOf(st.pr, project);
      if (!by) continue;
      const res = setRowStatus(t, r.id, `done (${by})`);
      if (res.ok) return res.text;
    }
    return null;
  });
  // 4. Misplaced rows: done/moot under Open move to Done; open-ish under Done move to Open.
  text = untilStable(text, (t) => {
    for (const r of parseBacklog(t)) {
      const st = parseStatus(r.status);
      if (!st) continue;
      const fin = st.kind === "done" || st.kind === "moot";
      if (r.section === "open" && fin) return moveRow(t, r.lineIndex, "done");
      if (r.section === "done" && !fin) return moveRow(t, r.lineIndex, "open");
    }
    return null;
  });
  // 5. `[NEXT SESSION …]` on a finished row is struck in place (the session-start grep dispatches every hit).
  const lines = text.split("\n");
  for (const r of parseBacklog(text)) {
    if (finishedKind(r.status)) lines[r.lineIndex] = lines[r.lineIndex].replace(/(?<!~~)(\[NEXT SESSION[^\]]*\])(?!~~)/gi, "~~$1~~");
  }
  return bumpNextFree(lines.join("\n"), others);
}

/* `**Next free number: N**` below the highest row number used across the project's files is raised. */
function bumpNextFree(text, others) {
  const m = /\*\*Next free number:\s*(\d+)/.exec(text);
  if (!m) return text;
  const top = highestUsed([text.replace(m[0], ""), String(others).replace(/\*\*Next free number:\s*\d+/, "")]);
  if (parseInt(m[1], 10) > top) return text;
  return text.replace(/(\*\*Next free number:\s*)\d+/, `$1${top + 1}`).replace(/(Next free number:[^\n]*\(highest used )\d+/, `$1${top}`);
}

/* One queue: only the number marker. A queue row is the operator's ask: never struck by a tool (#107 review). */
export const fixQueue = (text, idx, others = "") => bumpNextFree(String(text), others);

/* Fix every project's backlog and queue in place; returns { changed: [rel], findings } (what is left). */
export function fixVault(vault, repos) {
  const idx = mergedIndex(repos);
  const changed = [];
  const projects = join(vault, "projects");
  const dirs = existsSync(projects) ? readdirSync(projects, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort() : [];
  for (const p of dirs) {
    const files = readdirSync(join(projects, p));
    const b = files.filter((f) => f.endsWith("-backlog.md"));
    const q = files.filter((f) => f.endsWith("-queue.md"));
    if (b.length > 1 || q.length > 1) continue; // duplicate files: a person merges them first
    const rel = (f) => `projects/${p}/${f}`;
    const read = (f) => (f ? readFileSync(join(vault, rel(f)), "utf8") : "");
    const [bt, qt] = [read(b[0]), read(q[0])];
    const nb = b[0] ? fixBacklog(bt, p, idx, qt) : bt;
    const nq = q[0] ? fixQueue(qt, idx, nb) : qt;
    if (nb !== bt) { writeFileSync(join(vault, rel(b[0])), nb); changed.push(rel(b[0])); }
    if (nq !== qt) { writeFileSync(join(vault, rel(q[0])), nq); changed.push(rel(q[0])); }
  }
  return { changed, findings: checkVault(vault, repos) };
}

/* --- --stale: open rows untouched for `days` (blame and Raised both older), asked keep-or-park at wrap --- */
export function staleRows(vault, { days = 30, today = new Date().toISOString().slice(0, 10) } = {}) {
  const cutoff = Date.parse(`${today}T00:00:00Z`) / 1000 - days * 86400;
  const out = [];
  for (const [prefix, e] of discoverFiles(vault).byPrefix) {
    for (const rel of [e.backlog, e.queue].filter(Boolean)) {
      let blame;
      try { blame = git(vault, "blame", "--line-porcelain", "--", rel); } catch { continue; } // not committed: nothing to date
      const times = [];
      let t = 0;
      for (const l of blame.split("\n")) {
        if (l.startsWith("author-time ")) t = parseInt(l.slice(12), 10);
        else if (l.startsWith("\t")) times.push(t);
      }
      const text = readFileSync(join(vault, rel), "utf8");
      const rows = rel === e.backlog
        ? parseBacklog(text).filter((r) => !r.struck && r.section !== "done" && !finishedKind(r.status))
        : tableRows(text).filter((r) => !r.struck);
      for (const r of rows) {
        const touched = times[r.lineIndex];
        const raised = /^\d{4}-\d{2}-\d{2}$/.test(r.cells[2] || "") ? Date.parse(`${r.cells[2]}T00:00:00Z`) / 1000 : 0;
        if (!touched || touched >= cutoff || raised >= cutoff) continue;
        const since = new Date(Math.max(touched, raised) * 1000).toISOString().slice(0, 10);
        out.push({ kind: "stale", project: prefix, file: rel, row: r.id, msg: `untouched since ${since}: keep or park` });
      }
    }
  }
  return out;
}

function main() {
  const argv = process.argv.slice(2);
  const vi = argv.indexOf("--vault");
  if (vi === -1 || !argv[vi + 1]) { console.error("usage: list-drift-check --vault <root> [--repo <path>[,<path>]]... [--fix] [--stale [--days N]]"); process.exit(2); }
  const vault = resolve(argv[vi + 1]);
  const repos = argv.flatMap((a, i) => (a === "--repo" && argv[i + 1] ? argv[i + 1].split(",") : [])).map((p) => resolve(p));
  let findings;
  if (argv.includes("--fix")) {
    const res = fixVault(vault, repos);
    console.log(res.changed.length ? `list-drift-check: fixed ${res.changed.join(", ")} (bank with vault-write)` : "list-drift-check: nothing to fix");
    findings = res.findings;
  } else findings = checkVault(vault, repos);
  if (argv.includes("--stale")) {
    const di = argv.indexOf("--days");
    findings.push(...staleRows(vault, di === -1 ? {} : { days: parseInt(argv[di + 1], 10) }));
  }
  for (const f of findings) console.log(formatFinding(f));
  const failing = findings.filter((f) => FAILING.has(f.kind)).length;
  console.log(`list-drift-check: ${findings.length} finding(s), ${failing} failing, ${findings.length - failing} non-failing (suspect/unknown/named-by/stale).`);
  process.exit(failing ? 1 : 0);
}

if (process.argv[1] && process.argv[1].endsWith("list-drift-check.mjs")) main();
