#!/usr/bin/env node
/* lane-capacity — DISC-295 (operator 2026-11-12, ruling orchestrator-takes-charge-of-the-backlog): a parent keeps
   each of its projects at full lane capacity, refilling from the backlog the moment a lane lands, and never waits
   for the operator to pick the next item. This reads the parent's lanes (a JSON file the parent writes from
   get_session on each helper: [{ id, project, state }], state `running` or `waiting-operator`; any other state, a
   landed or failed lane, is ignored) against CAPACITY per project and the project's open agent-ownable backlog rows.
   A lane waiting on the operator's look does not count toward capacity. An agent-ownable row is an open,
   unstruck row of the `## Open` table whose item cell ends `Agent.`; Operator and unlabelled rows are never
   dispatched for the operator. A project is UNDER CAPACITY when running < capacity and at least one such row exists;
   `--reason PF="…"` (one per gap) clears it and is echoed.

   Usage: node lane-capacity.mjs --vault <root> --projects PF,DISC,HT --lanes <lanes.json> [--reason PF="why"]...
   Exit 0 every project at capacity, out of rows, or reasoned · 1 under capacity (rows printed) · 2 usage/refusal. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { discoverFiles } from "./lib/queue-ids.mjs";
import { resolveVaultRoot } from "./lib/vault-root.mjs";
import { parseBacklog } from "./list-drift-check.mjs";

/* Lanes per project: portfolio 4–5 (ruling 2026-11-09-s70-parallel-portfolio-lanes, top of the range), one discipline lane, one handoff-toolkit lane. */
export const CAPACITY = { PF: 5, DISC: 1, HT: 1 };

const isAgentRow = (r) => r.section === "open" && !r.struck && /^open$/i.test(r.status) && /\bAgent\.?\s*$/.test(r.cells[1] || "");

export function laneCapacity(vault, prefixes, lanes, reasons = {}) {
  const want = [...new Set(prefixes.map((p) => String(p).trim()).filter(Boolean))];
  if (!want.length) return { ok: false, reason: "name at least one project prefix (--projects PF,DISC,HT)" };
  const reg = discoverFiles(vault);
  const unknown = want.filter((p) => !reg.byPrefix.has(p));
  if (unknown.length) return { ok: false, reason: `unknown project prefix: ${unknown.join(", ")}` };
  const unset = want.filter((p) => !(p in CAPACITY));
  if (unset.length) return { ok: false, reason: `no lane capacity is set for: ${unset.join(", ")} (set: ${Object.keys(CAPACITY).join(", ")})` };
  const projects = {};
  for (const px of want) {
    const mine = (lanes || []).filter((l) => l.project === px);
    const running = mine.filter((l) => l.state === "running").length;
    const waiting = mine.filter((l) => l.state === "waiting-operator").length;
    const file = reg.byPrefix.get(px).backlog;
    const rows = file ? parseBacklog(readFileSync(join(vault, file), "utf8")).filter((r) => r.prefix === px && isAgentRow(r)) : [];
    const gap = Math.max(0, CAPACITY[px] - running);
    const dispatch = rows.slice(0, gap).map((r) => ({ id: r.id, text: (r.cells[1] || "").slice(0, 140) }));
    projects[px] = { capacity: CAPACITY[px], running, waiting, gap, rows: rows.length, dispatch, reason: reasons[px] || null, under: gap > 0 && rows.length > 0 && !reasons[px] };
  }
  return { ok: true, projects, under: Object.values(projects).some((p) => p.under) };
}

export function render(r) {
  const out = [];
  for (const [px, p] of Object.entries(r.projects)) {
    out.push(`${px}: ${p.running} of ${p.capacity} lanes running${p.waiting ? ` (${p.waiting} waiting on the operator, not counted)` : ""}; ${p.rows} open agent row${p.rows === 1 ? "" : "s"}${p.reason ? `; gap reasoned: ${p.reason}` : ""}`);
    if (p.under) { out.push(`  UNDER CAPACITY by ${Math.min(p.gap, p.rows)}: dispatch next`); for (const d of p.dispatch) out.push(`  - ${d.id} ${d.text}`); }
  }
  out.push(r.under ? "UNDER CAPACITY: dispatch the rows above, or rerun with --reason <PFX>=\"why this gap is right\"." : "At capacity (or out of agent rows, or every gap reasoned).");
  return out.join("\n");
}

function main() {
  const a = process.argv.slice(2), arg = (k) => { const i = a.indexOf(k); return i < 0 ? null : a[i + 1]; };
  const reasons = {};
  a.forEach((x, i) => { if (x === "--reason") { const m = /^([A-Z]{2,4})=(.+)$/s.exec(a[i + 1] || ""); if (m) reasons[m[1]] = m[2]; } });
  if (!arg("--vault") || !arg("--projects") || !arg("--lanes")) { console.error("usage: lane-capacity.mjs --vault <root> --projects PF,DISC,HT --lanes <lanes.json> [--reason PF=\"why\"]"); process.exit(2); }
  let lanes; try { lanes = JSON.parse(readFileSync(arg("--lanes"), "utf8")); } catch (e) { console.error(`lane-capacity: cannot read --lanes: ${e.message}`); process.exit(2); }
  const r = laneCapacity(resolveVaultRoot(arg("--vault")), arg("--projects").split(","), lanes, reasons);
  if (!r.ok) { console.error(`lane-capacity: ${r.reason}`); process.exit(2); }
  console.log(render(r));
  process.exit(r.under ? 1 : 0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
