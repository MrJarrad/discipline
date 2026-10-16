/* row-marker — DISC-179(1). row-add appends one line per new ask here; the Stop
   hook (hooks/bin/needed-from-you-stop.mjs) reads it to know a new ask was
   raised this turn, and for which project prefix. Lives in os.tmpdir() keyed by
   the vault path (never in the vault, never committed). */
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export function markerPath(vault) {
  const dir = process.env.DISCIPLINE_MARKER_DIR || tmpdir();
  return join(dir, `discipline-row-add-${createHash("sha1").update(resolve(vault)).digest("hex").slice(0, 12)}.jsonl`);
}
export function writeMarker(vault, { prefix, id, to, ts = new Date().toISOString() }) {
  appendFileSync(markerPath(vault), JSON.stringify({ ts, prefix, id, to }) + "\n");
}
export function readMarkers(vault) {
  const p = markerPath(vault);
  if (!existsSync(p)) return [];
  return readFileSync(p, "utf8").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}
