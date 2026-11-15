#!/usr/bin/env node
/* next-row — DISC-336 (operator 2026-11-15: "running as many sessions in parallel that makes sense in an order that makes
   sense and picking up new tasks when tasks get completed"; ruling 2026-11-15-s91-autonomous-backlog-throughput). Prints
   the doer target, how many doer lanes work, the ranked agent-doable rows (lib/backlog-rank.mjs: go-live order, then
   Up next, then the rest; Mac rows as one Mac job; operator, blocked-by and unlabelled rows out) and the next rows to
   start. A script cannot call create_session; the parent starts what this prints.

   Lanes file: JSON [{ id, project, state, role?, rows? }]. state `running` or `waiting-operator` (anything else is a
   landed or failed lane and is ignored). role `reviewer` is never a doer. Only running doers count toward the target;
   a lane waiting on the operator's look does not. `rows` lists the row ids a lane holds, so they are not offered twice.
   Per-project caps are lane-capacity's CAPACITY (a limit on top of the target).

   Usage: node next-row.mjs --vault <root> --projects PF,DISC,HT --lanes <lanes.json> [--target N] [--local] [--reason "why"] [--json]
   Exit 0 at or above target, nothing to start, or reasoned · 1 under target with rows to start · 2 usage. */
import { readFileSync } from "node:fs";
import { cpus } from "node:os";
import { fileURLToPath } from "node:url";
import { CAPACITY } from "./lane-capacity.mjs";
import { DEFAULT_TARGET, rankBacklogs, targetDoers } from "./lib/backlog-rank.mjs";
import { resolveVaultRoot } from "./lib/vault-root.mjs";

export function nextRows({ vault, prefixes, lanes = [], requested = DEFAULT_TARGET, local = false, nproc = cpus().length, reason = null }) {
  const t = targetDoers({ nproc, local, requested });
  const doers = lanes.filter((l) => l.role !== "reviewer");
  const working = doers.filter((l) => l.state === "running");
  const waiting = doers.filter((l) => l.state === "waiting-operator").length;
  const held = lanes.flatMap((l) => l.rows || []);
  const r = rankBacklogs(vault, prefixes, { held });
  const gap = Math.max(0, t.target - working.length);
  const perProject = (px) => working.filter((l) => l.project === px).length;
  const start = [], skippedCap = [];
  const taken = {};
  for (const e of r.ranked) {
    if (e.kind !== "helper") continue;
    if (start.length >= gap) break;
    const cap = CAPACITY[e.project] ?? 1, now = perProject(e.project) + (taken[e.project] || 0);
    if (now >= cap) { skippedCap.push(e); continue; }
    taken[e.project] = (taken[e.project] || 0) + 1;
    start.push(e);
  }
  return { target: t, working: working.length, waiting, gap, ranked: r.ranked, unknown: r.unknown, counts: r.counts, start, skippedCap, reason, under: gap > 0 && start.length > 0 && !reason };
}

export function render(n) {
  const out = [`Doers: ${n.working} working of target ${n.target.target} (${n.target.why})${n.waiting ? `; ${n.waiting} waiting on the operator, not counted` : ""}`];
  out.push(`Open rows by class: ${Object.entries(n.counts).map(([k, v]) => `${k} ${v}`).join(", ") || "none"}`);
  out.push(`Ranked (${n.ranked.length}):`);
  n.ranked.forEach((e, i) => out.push(`  ${i + 1}. [${e.tier}] ${e.kind === "mac-job" ? "MAC JOB " : ""}${e.ids.join(" + ")} ${e.text}`));
  if (n.unknown.length) { out.push(`Unlabelled, never dispatched (${n.unknown.length}): label each Agent., Mac. or Operator.`); n.unknown.forEach((u) => out.push(`  - ${u.id} ${u.text}`)); }
  if (n.skippedCap.length) out.push(`Held back by a per-project cap: ${n.skippedCap.map((e) => e.ids.join("+")).join(", ")}`);
  if (n.under) { out.push(`UNDER TARGET by ${n.start.length}: start next`); n.start.forEach((e) => out.push(`  - ${e.ids.join(" + ")} ${e.text}`)); out.push("UNDER TARGET: start the rows above, or rerun with --reason \"why this gap is right\"."); }
  else if (n.reason && n.gap > 0 && n.start.length) out.push(`Gap of ${n.gap} reasoned: ${n.reason}`);
  else out.push("At target (or nothing agent-doable left, or every gap reasoned).");
  return out.join("\n");
}

function main() {
  const a = process.argv.slice(2), arg = (k) => { const i = a.indexOf(k); return i < 0 ? null : a[i + 1]; };
  if (!arg("--vault") || !arg("--projects") || !arg("--lanes")) { console.error("usage: next-row.mjs --vault <root> --projects PF,DISC,HT --lanes <lanes.json> [--target N] [--local] [--reason \"why\"] [--json]"); process.exit(2); }
  let lanes; try { lanes = JSON.parse(readFileSync(arg("--lanes"), "utf8")); } catch (e) { console.error(`next-row: cannot read --lanes: ${e.message}`); process.exit(2); }
  const n = nextRows({ vault: resolveVaultRoot(arg("--vault")), prefixes: arg("--projects").split(",").map((s) => s.trim()).filter(Boolean), lanes, requested: arg("--target") ? Number(arg("--target")) : DEFAULT_TARGET, local: a.includes("--local"), reason: arg("--reason") });
  console.log(a.includes("--json") ? JSON.stringify(n, null, 2) : render(n));
  process.exit(n.under ? 1 : 0);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
