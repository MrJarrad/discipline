/* backlog-rank — DISC-336 (ruling 2026-11-15-s91-autonomous-backlog-throughput): the one place that classes every
   open backlog row and ranks the ones a helper can start today. Pure over a vault checkout; next-row.mjs prints it.

   Class of a row (first match wins):
     busy        status `in flight (…)` — a helper already holds it; counts as working, never offered
     operator    status `waiting on operator`, or the Item cell ends `Operator.`
     blocked-by  the Item cell says `blocked by <ID>` / `waits on <ID>` and a named ID is still open (backlog or unticked go-live)
     mac         the Item cell ends `Mac.`
     cloud-now   the Item cell ends `Agent.`
     unknown     no owner label: listed, never dispatched (a guess would start a lane on an operator or Mac row)
   Struck rows, Done rows and moot/done statuses are not open and get no class.

   A go-live row in group 5 (after launch) is blocked-by until every line of groups 1-4 is ticked.

   Rank of the cloud-now rows: the project's unticked go-live lines in file order, then its backlog `## Up next` order,
   then the rest by row number; projects interleave at equal position in the order the caller named them. Every mac row
   is ONE `mac-job` entry placed at its best member's rank. `with <ID>` in an Item cell bundles two cloud-now rows into
   one helper entry. */
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { discoverFiles } from "./queue-ids.mjs";
import { parseBacklog } from "../list-drift-check.mjs";
import { parseGoLive } from "../status-layout.mjs";

export const DEFAULT_TARGET = 8;
const ID = "[A-Z]{2,4}-\\d+[a-z]?";
const OWNER = /\b(Agent|Mac|Operator)\.?\s*$/;
const BLOCK = new RegExp(`\\b(?:blocked by|waits on|waiting on)\\s+((?:${ID}(?:\\s*(?:,|/|and|&)\\s*)?)+)`, "i");
const WITH = new RegExp(`\\bwith\\s+(${ID})`, "i");
const isOpenStatus = (s) => /^(open|waiting on operator|in flight)/i.test(s || "");

/** Doer target: DEFAULT_TARGET, lowered to floor(nproc/2) only for local lanes (heavy-lane ceiling, routing rule 15);
    a create_session helper has its own container, so it is not nproc-bound. */
export function targetDoers({ nproc, local = false, requested = DEFAULT_TARGET }) {
  const ceiling = local ? Math.max(1, Math.floor(nproc / 2)) : Infinity;
  const target = Math.min(requested, ceiling);
  return { target, ceiling, why: local ? `local lanes: floor(nproc ${nproc} / 2) = ${ceiling}, requested ${requested}` : `create_session helpers have their own container; requested ${requested}` };
}

function upNext(text) {
  const m = /^##\s+Up next\s*$/im.exec(text);
  if (!m) return [];
  const rest = text.slice(m.index + m[0].length).split(/^##\s/m)[0];
  return rest.split(/\r?\n/).filter((l) => /^\s*(?:\d+\.|[-*])\s/.test(l)).map((l) => new RegExp(`(${ID})`).exec(l)?.[1]).filter(Boolean);
}

export function rankBacklogs(vault, prefixes, { held = [] } = {}) {
  const reg = discoverFiles(vault);
  const open = new Set(); // every open id in every backlog and every unticked go-live line
  const perProject = new Map();
  for (const [px, f] of reg.byPrefix) {
    if (!f.backlog) continue;
    const text = readFileSync(join(vault, f.backlog), "utf8");
    const rows = parseBacklog(text).filter((r) => r.prefix === px && r.section === "open" && !r.struck && isOpenStatus(r.status));
    rows.forEach((r) => open.add(r.id));
    const dir = dirname(f.backlog), glf = join(vault, dir, `${basename(dir)}-go-live.md`);
    const parsed = existsSync(glf) ? parseGoLive(readFileSync(glf, "utf8")).lines : [];
    const gl = parsed.filter((l) => !l.ticked).map((l) => l.id);
    gl.forEach((id) => open.add(id));
    /* Group 5 of a go-live file follows the launch (groups 1-4 all ticked): until then those rows wait on it. */
    const afterLaunch = parsed.some((l) => l.group !== null && l.group <= 4 && !l.ticked) ? new Set(parsed.filter((l) => l.group >= 5).map((l) => l.id)) : new Set();
    perProject.set(px, { rows, goLive: gl, afterLaunch, upNext: upNext(text) });
  }
  const out = { rows: [], ranked: [], unknown: [], counts: {} };
  const cands = [];
  prefixes.forEach((px, pi) => {
    const p = perProject.get(px);
    if (!p) return;
    for (const r of p.rows) {
      const item = r.cells[1] || "";
      let cls;
      if (/^in flight/i.test(r.status)) cls = "busy";
      else if (/^waiting on operator/i.test(r.status)) cls = "operator";
      else {
        const owner = OWNER.exec(item)?.[1]?.toLowerCase();
        const blockers = (BLOCK.exec(item)?.[1] || "").match(new RegExp(ID, "g")) || [];
        if (owner === "operator") cls = "operator";
        else if (blockers.some((b) => open.has(b) && b !== r.id) || p.afterLaunch.has(r.id)) cls = "blocked-by";
        else cls = owner === "mac" ? "mac" : owner === "agent" ? "cloud-now" : "unknown";
      }
      const gi = p.goLive.indexOf(r.id), ui = p.upNext.indexOf(r.id);
      const pos = gi >= 0 ? [0, gi] : ui >= 0 ? [1, ui] : [2, r.n];
      const row = { id: r.id, project: px, class: cls, text: item.replace(OWNER, "").trim().slice(0, 140), pos, pi, with: WITH.exec(item)?.[1] || null };
      out.rows.push({ id: row.id, project: px, class: cls });
      out.counts[cls] = (out.counts[cls] || 0) + 1;
      if (cls === "unknown") out.unknown.push({ id: row.id, project: px, text: row.text });
      if ((cls === "cloud-now" || cls === "mac") && !held.includes(r.id)) cands.push(row);
    }
  });
  const cmp = (a, b) => a.pos[0] - b.pos[0] || a.pos[1] - b.pos[1] || a.pi - b.pi;
  const cloud = cands.filter((c) => c.class === "cloud-now");
  const used = new Set();
  const entries = [];
  for (const c of cloud) {
    if (used.has(c.id)) continue;
    const mate = c.with && cloud.find((o) => o.id === c.with && !used.has(o.id));
    const reverse = cloud.find((o) => o.with === c.id && !used.has(o.id) && o !== c);
    const group = [c, mate || reverse].filter(Boolean).sort((a, b) => a.pos[0] - b.pos[0] || a.pos[1] - b.pos[1] || a.pi - b.pi);
    group.forEach((g) => used.add(g.id));
    entries.push({ kind: "helper", ids: group.map((g) => g.id).sort((a, b) => Number(a.split("-")[1]) - Number(b.split("-")[1])), project: c.project, pos: group[0].pos, pi: group[0].pi, text: group[0].text });
  }
  const macs = cands.filter((c) => c.class === "mac").sort(cmp);
  if (macs.length) entries.push({ kind: "mac-job", ids: macs.map((m) => m.id), project: macs[0].project, pos: macs[0].pos, pi: macs[0].pi, text: "one Mac job: " + macs.map((m) => m.id).join(", ") });
  out.ranked = entries.sort(cmp).map(({ kind, ids, project, text, pos }) => ({ kind, ids, project, text, tier: ["go-live", "up-next", "backlog"][pos[0]] }));
  return out;
}
