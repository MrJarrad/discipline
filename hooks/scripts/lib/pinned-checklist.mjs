/* pinned-checklist — DISC-288. The one place that reads where the operator's pinned
   "Needed from you" checklist (a Claude Doc) lives: the "Pinned checklist" paragraph of the
   vault's orchestrator/operator-queue.md carries its URL. Read at run time, never copied into
   the plugin, so moving the doc is a vault edit. Returns null when the vault has no such
   paragraph; callers then fall back to the full-block rule. */
import { readFileSync } from "node:fs";
import { join } from "node:path";

/* The ids a write to the checklist doc can name: the artifact id (last segment of the URL) and the doc UUID the Claude Docs
   connector puts in `container.id` (the paragraph's "doc id <uuid>"). Empty when the vault has no such paragraph. */
export function pinnedChecklistIds(vault) {
  let text;
  try { text = readFileSync(join(vault, "orchestrator", "operator-queue.md"), "utf8"); } catch { return []; }
  const para = text.split(/\r?\n\s*\r?\n/).find((p) => /\*\*Pinned checklist\b/.test(p));
  if (!para) return [];
  const url = /https:\/\/claude\.ai\/artifact\/([A-Za-z0-9_-]+)/.exec(para)?.[1];
  const uuid = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/.exec(para)?.[0];
  return [url, uuid].filter(Boolean);
}

export function pinnedChecklistUrl(vault) {
  let text;
  try { text = readFileSync(join(vault, "orchestrator", "operator-queue.md"), "utf8"); } catch { return null; }
  const para = text.split(/\r?\n\s*\r?\n/).find((p) => /\*\*Pinned checklist\b/.test(p));
  const m = para && /https:\/\/claude\.ai\/artifact\/[A-Za-z0-9_-]+/.exec(para);
  return m ? m[0] : null;
}
