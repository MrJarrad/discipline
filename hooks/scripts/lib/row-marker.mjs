/* row-marker — DISC-179(1). row-add appends one line per new ask here; the Stop
   hook (hooks/bin/needed-from-you-stop.mjs) reads it to know a new ask was
   raised this turn, and for which project prefix. Lives in os.tmpdir() keyed by
   the vault path (never in the vault, never committed). */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export function markerPath(vault) {
  const dir = process.env.DISCIPLINE_MARKER_DIR || tmpdir();
  return join(dir, `discipline-row-add-${createHash("sha1").update(resolve(vault)).digest("hex").slice(0, 12)}.jsonl`);
}
export function writeMarker(vault, { prefix, id, to, ts = new Date().toISOString(), session = process.env.CLAUDE_CODE_SESSION_ID }) {
  // session: the Stop hook only counts markers from its own session; absent id -> counted by any session (fallback).
  appendFileSync(markerPath(vault), JSON.stringify({ ts, prefix, id, to, session }) + "\n");
}
export function readMarkers(vault) {
  const p = markerPath(vault);
  if (!existsSync(p)) return [];
  return readFileSync(p, "utf8").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

/* DISC-221 L1 (s43): list-drift-check stamps the time it last ran for a vault; row-add
   refuses a queue row that cites other rows unless the stamp is under DRIFT_STAMP_MINUTES
   old (a script cannot see "this turn", so a window stands in for it). Same tmpdir home. */
export const DRIFT_STAMP_MINUTES = 15;
export function driftStampPath(vault) {
  const dir = process.env.DISCIPLINE_MARKER_DIR || tmpdir();
  return join(dir, `discipline-drift-check-${createHash("sha1").update(resolve(vault)).digest("hex").slice(0, 12)}.json`);
}
export function writeDriftStamp(vault, ts = new Date().toISOString(), repos = []) {
  writeFileSync(driftStampPath(vault), JSON.stringify({ ts, repos }));
}
export function driftStampFresh(vault, now = Date.now()) {
  try {
    const t = Date.parse(JSON.parse(readFileSync(driftStampPath(vault), "utf8")).ts);
    return Number.isFinite(t) && now - t >= 0 && now - t < DRIFT_STAMP_MINUTES * 60e3;
  } catch { return false; }
}
