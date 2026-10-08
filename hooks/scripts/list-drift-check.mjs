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
   done (<PR> <sha>) · moot (<reason>). <PR> is `#n` or `owner/repo#n`.

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
import { join, resolve } from "node:path";

const PR = String.raw`(?:[\w.-]+\/[\w.-]+)?#\d+`;
const STATUS = [
  ["open", /^open$/],
  ["waiting", /^waiting on operator$/],
  ["in-flight", new RegExp(`^in flight \\((${PR})\\)$`)],
  ["done", new RegExp(`^done \\((${PR}) ([0-9a-f]{7,40})\\)$`)],
  ["moot", /^moot \((.+)\)$/],
];

export function parseStatus(text) {
  const t = String(text).trim();
  for (const [kind, re] of STATUS) {
    const m = re.exec(t);
    if (!m) continue;
    if (kind === "in-flight") return { kind, pr: m[1] };
    if (kind === "done") return { kind, pr: m[1], sha: m[2] };
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

/* History the caller supplied: which PR numbers are merged, which shas exist. */
export function mergedIndex(repos) {
  const list = [];
  for (const path of repos) {
    try {
      const subjects = git(path, "log", "--all", "--format=%s").split("\n");
      const nums = new Set();
      for (const s of subjects) {
        for (const m of s.matchAll(/\(#(\d+)\)\s*$|^Merge pull request #(\d+)/g)) nums.add(m[1] || m[2]);
      }
      let slug = "";
      try { slug = /[:/]([\w.-]+\/[\w.-]+?)(?:\.git)?$/.exec(git(path, "remote", "get-url", "origin").trim())?.[1] || ""; } catch {}
      list.push({ path, slug, nums });
    } catch { /* not a repo: contributes nothing, so its PRs stay unknown */ }
  }
  return {
    merged(ref) {
      const m = /^(?:([\w.-]+\/[\w.-]+))?#(\d+)$/.exec(ref);
      if (!m) return false;
      return list.some((r) => (!m[1] || r.slug === m[1]) && r.nums.has(m[2]));
    },
    hasSha(sha) {
      return list.some((r) => { try { git(r.path, "cat-file", "-e", `${sha}^{commit}`); return true; } catch { return false; } });
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
      if (!idx.merged(st.pr)) add("unknown", r.n, `${st.pr} not found as merged in the supplied repos`);
      else if (!idx.hasSha(st.sha)) add("unknown", r.n, `sha ${st.sha} not found in the supplied repos`);
      continue;
    }
    if (st.kind === "moot") continue;
    const cited = st.kind === "in-flight" ? [st.pr] : [];
    for (const pr of cited) {
      if (idx.merged(pr)) add("drift", r.n, `in flight on ${pr}, which is merged`);
      else add("unknown", r.n, `${pr} not found as merged in the supplied repos`);
    }
    // An open follow-up legitimately cites the PR it follows up: surfaced, not failing.
    for (const pr of new Set(refsIn(r.cells[1] || ""))) {
      if (!cited.includes(pr) && idx.merged(pr)) add("suspect", r.n, `${r.status} row cites ${pr}, which is merged: confirm it is still open`);
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

/* Set row n's status (validated against the fixed set); done/moot moves it to ## Done. */
export function setRowStatus(text, n, status) {
  const st = parseStatus(status);
  if (!st) return { ok: false, reason: `status "${status}" is outside the fixed set` };
  const lines = String(text).split("\n");
  const row = parseBacklog(text).find((r) => r.n === String(n));
  if (!row) return { ok: false, reason: `row ${n} not found in the backlog` };
  const finished = st.kind === "done" || st.kind === "moot";
  if (row.section === "done" && !finished) return { ok: false, reason: `row ${n} is archived under ## Done; open a new row instead` };
  const c = row.cells.slice();
  c[row.statusAt] = status.trim();
  const newLine = `| ${c.join(" | ")} |`;
  if (!finished || row.section === "done") { lines[row.lineIndex] = newLine; return { ok: true, text: lines.join("\n") }; }
  lines.splice(row.lineIndex, 1);
  let d = headingIndex(lines, /^##\s+done\b/i);
  if (d === -1) {
    lines.push("", "## Done", "", "| # | Item | Raised | Status |", "| - | --- | --- | --- |", newLine);
  } else {
    let at = lastTableLine(lines, d + 1, sectionEnd(lines, d));
    if (at === -1) { lines.splice(d + 1, 0, "", "| # | Item | Raised | Status |", "| - | --- | --- | --- |"); at = d + 3; }
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
