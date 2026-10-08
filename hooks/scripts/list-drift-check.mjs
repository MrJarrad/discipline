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

   Usage: node list-drift-check.mjs --vault <root> [--repo <path>[,<path>]]...
   Also exports the row editors lane-end uses (setRowStatus, addRow).        */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

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

const ROW = /^\|\s*(~~)?(\d+[a-z]?)(~~)?\s*\|/;
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
    rows.push({ n: m[2], section, status: c[at], statusAt: at, cells: c, struck: Boolean(m[1]), lineIndex: line_i });
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
      const subjects = git(path, "log", defaultRef(path), "--format=%s").split("\n");
      const nums = new Set();
      for (const s of subjects) {
        for (const m of s.matchAll(/\(#(\d+)\)\s*$|^Merge pull request #(\d+)/g)) nums.add(m[1] || m[2]);
      }
      let slug = "";
      try { slug = /[:/]([\w.-]+\/[\w.-]+?)(?:\.git)?$/.exec(git(path, "remote", "get-url", "origin").trim())?.[1] || ""; } catch {}
      list.push({ path, slug, nums, name: repoName(path) });
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
    if (!st) { add("bad-status", r.n, `status "${r.status}" is outside the fixed set`); continue; }
    const finished = st.kind === "done" || st.kind === "moot";
    if (r.section === "open" && finished) add("misplaced", r.n, `${st.kind} row under ## Open`);
    if (r.section === "done" && !finished) add("misplaced", r.n, `${st.kind} row under ## Done`);
    if (st.kind === "done") {
      for (const { pr, sha } of st.pairs) {
        if (!idx.merged(pr, project)) add("unknown", r.n, `${pr} not found as merged in the supplied repos`);
        else if (!idx.hasSha(sha, pr, project)) add("unknown", r.n, `sha ${sha} not found in the supplied repos`);
      }
      continue;
    }
    if (st.kind === "moot") continue;
    const cited = st.kind === "in-flight" ? [st.pr] : [];
    for (const pr of cited) {
      if (idx.merged(pr, project)) add("drift", r.n, `in flight on ${pr}, which is merged`);
      else if (!idx.repoKnown(pr, project)) add("unknown", r.n, `${pr} names a repo not among the supplied --repo paths`);
      // in flight and not merged is the expected state: nothing to report
    }
    // An open follow-up legitimately cites the PR it follows up: surfaced, not failing.
    for (const pr of new Set(refsIn(r.cells[1] || ""))) {
      if (!cited.includes(pr) && idx.merged(pr, project)) add("suspect", r.n, `${r.status} row cites ${pr}, which is merged: confirm it is still open`);
    }
  }
  return out;
}

/* Unstruck queue rows citing a merged PR. */
export function checkQueue(text, idx) {
  const out = [];
  let section = "";
  for (const line of String(text).split("\n")) {
    const h = /^##\s+(.+?)\s*$/.exec(line);
    if (h) { section = h[1]; continue; }
    const m = ROW.exec(line);
    if (!m || m[1]) continue;
    for (const pr of new Set(refsIn(line))) {
      if (idx.merged(pr)) out.push({ kind: "suspect", project: section, row: m[2], msg: `open queue row cites ${pr}, which is merged: confirm it is still open` });
    }
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
    if (files.some((f) => f.endsWith("handover.md")) && !backlogs.length) {
      out.push({ kind: "no-backlog", project: p, file: `projects/${p}`, msg: "has a handover but no *-backlog.md" });
    }
    if (backlogs.length > 1) {
      out.push({ kind: "duplicate", project: p, file: `projects/${p}`, msg: `${backlogs.length} backlog files: ${backlogs.join(", ")}` });
    }
    for (const b of backlogs) {
      const file = `projects/${p}/${b}`;
      out.push(...checkBacklog(p, readFileSync(join(vault, file), "utf8"), idx).map((f) => ({ ...f, file })));
    }
  }
  const qf = "orchestrator/operator-queue.md";
  if (existsSync(join(vault, qf))) {
    out.push(...checkQueue(readFileSync(join(vault, qf), "utf8"), idx).map((f) => ({ ...f, file: qf })));
  }
  return out;
}

export const FAILING = new Set(["drift", "bad-status", "misplaced", "no-backlog", "duplicate"]);
export const formatFinding = (f) => `${f.kind} ${f.file || f.project}${f.row ? ` row ${f.row}` : ""}: ${f.msg}`;

/* --- row editors (lane-end flips a row in the same action as its event) --- */

const lastTableLine = (lines, start, end) => {
  for (let i = end - 1; i >= start; i--) if (lines[i].startsWith("|")) return i;
  return -1;
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
  const row = parseBacklog(text).find((r) => r.n === String(n));
  if (!row) return { ok: false, reason: `row ${n} not found in the backlog` };
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

/* A new finding adds a row: next number, status open, appended to the ## Open table. */
export function addRow(text, item, raised) {
  const lines = String(text).split("\n");
  const o = headingIndex(lines, /^##\s+open\b/i);
  const at = o === -1 ? -1 : lastTableLine(lines, o + 1, sectionEnd(lines, o));
  if (at === -1) return { ok: false, reason: "no ## Open table to add the row to" };
  let next = Math.max(0, ...parseBacklog(text).map((r) => parseInt(r.n, 10))) + 1;
  const nf = lines.findIndex((l) => /^\*\*Next free number: \d+/.test(l));
  if (nf !== -1) {
    next = Math.max(next, parseInt(/(\d+)/.exec(lines[nf])[1], 10));
    lines[nf] = lines[nf].replace(/Next free number: \d+/, `Next free number: ${next + 1}`);
  }
  const cols = (lines.slice(0, at).reverse().find((l) => /^\|\s*#\s*\|/.test(l)) || "| # | Item | Raised | Status |");
  const head = cells(cols);
  const row = head.map((h) => ({ "#": String(next), item: item, raised: raised, status: "open" })[h.toLowerCase()] ?? "");
  lines.splice(at + 1, 0, `| ${row.join(" | ")} |`);
  return { ok: true, text: lines.join("\n"), n: next };
}

function main() {
  const argv = process.argv.slice(2);
  const vi = argv.indexOf("--vault");
  if (vi === -1 || !argv[vi + 1]) { console.error("usage: list-drift-check --vault <root> [--repo <path>[,<path>]]..."); process.exit(2); }
  const repos = argv.flatMap((a, i) => (a === "--repo" && argv[i + 1] ? argv[i + 1].split(",") : [])).map((p) => resolve(p));
  const findings = checkVault(resolve(argv[vi + 1]), repos);
  for (const f of findings) console.log(formatFinding(f));
  const failing = findings.filter((f) => FAILING.has(f.kind)).length;
  console.log(`list-drift-check: ${findings.length} finding(s), ${failing} failing, ${findings.length - failing} non-failing (suspect/unknown).`);
  process.exit(failing ? 1 : 0);
}

if (process.argv[1] && process.argv[1].endsWith("list-drift-check.mjs")) main();
