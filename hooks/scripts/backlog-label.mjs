#!/usr/bin/env node
/* backlog-label — DISC-336: give open backlog rows the trailing owner label lib/backlog-rank.mjs reads (`Agent.`, `Mac.`,
   `Operator.`) and, for a gated row, a `Blocked by <ID>, <ID>.` clause in the Item cell, from a class map the caller supplies
   (for example the s87 triage). A row that already carries a label, a Done row and an id outside the map are not touched.
   Dry run unless --apply writes the file; the vault change itself goes through a vault PR like any note.
   Usage: node backlog-label.mjs --backlog <file> --map <map.json> [--apply] [--force]
   --force replaces a label the row already carries.
   map.json: { "PF-36": "Agent", "PF-39": "Mac", "PF-65": "Operator", "PF-1399": { "label": "Agent", "blockedBy": ["PF-65"] } } */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseBacklog } from "./list-drift-check.mjs";

const LABELS = ["Agent", "Mac", "Operator"];
const HAS_LABEL = /\b(Agent|Mac|Operator)\.?\s*$/;

export function labelBacklog(text, map, { force = false } = {}) {
  const lines = String(text).split("\n");
  const labelled = [], skipped = [];
  const rows = new Map(parseBacklog(text).map((r) => [r.id, r]));
  for (const [id, spec] of Object.entries(map)) {
    const label = typeof spec === "string" ? spec : spec.label;
    if (!LABELS.includes(label)) throw new Error(`${id}: the label is Agent, Mac or Operator, not ${label}`);
    const r = rows.get(id);
    if (!r || r.section !== "open" || r.struck) { skipped.push({ id, why: "not an open row" }); continue; }
    const had = HAS_LABEL.test(r.cells[1] || "");
    if (had && !force) { skipped.push({ id, why: "already labelled" }); continue; }
    const masked = lines[r.lineIndex].replace(/\[\[[^\]]*\]\]/g, (m) => m.replace(/\|/g, "\u0001"));
    const pipes = [...masked].flatMap((c, i) => (c === "|" ? [i] : []));
    const at = pipes[2];
    const item = lines[r.lineIndex].slice(pipes[1] + 1, at).trimEnd().replace(had ? HAS_LABEL : /$^/, "").trimEnd();
    const blockedBy = typeof spec === "string" ? [] : spec.blockedBy || [];
    const add = `${/[.!?)]$/.test(item) ? "" : "."}${blockedBy.length ? ` Blocked by ${blockedBy.join(", ")}.` : ""} ${label}.`;
    lines[r.lineIndex] = `${lines[r.lineIndex].slice(0, pipes[1] + 1)}${item}${add} ${lines[r.lineIndex].slice(at)}`;
    labelled.push(id);
  }
  return { text: lines.join("\n"), labelled, skipped };
}

function main() {
  const a = process.argv.slice(2), arg = (k) => { const i = a.indexOf(k); return i < 0 ? null : a[i + 1]; };
  if (!arg("--backlog") || !arg("--map")) { console.error("usage: backlog-label.mjs --backlog <file> --map <map.json> [--apply] [--force]"); process.exit(2); }
  const r = labelBacklog(readFileSync(arg("--backlog"), "utf8"), JSON.parse(readFileSync(arg("--map"), "utf8")), { force: a.includes("--force") });
  if (a.includes("--apply") && r.labelled.length) writeFileSync(arg("--backlog"), r.text);
  console.log(JSON.stringify({ labelled: r.labelled, skipped: r.skipped, applied: a.includes("--apply") && r.labelled.length > 0 }, null, 2));
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
