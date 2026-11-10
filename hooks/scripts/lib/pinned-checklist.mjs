/* pinned-checklist — DISC-288. The one place that reads where the operator's pinned
   "Needed from you" checklist (a Claude Doc) lives: the "Pinned checklist" paragraph of the
   vault's orchestrator/operator-queue.md carries its URL. Read at run time, never copied into
   the plugin, so moving the doc is a vault edit. Returns null when the vault has no such
   paragraph; callers then fall back to the full-block rule. */
import { readFileSync } from "node:fs";
import { join } from "node:path";

export function pinnedChecklistUrl(vault) {
  let text;
  try { text = readFileSync(join(vault, "orchestrator", "operator-queue.md"), "utf8"); } catch { return null; }
  const para = text.split(/\r?\n\s*\r?\n/).find((p) => /\*\*Pinned checklist\b/.test(p));
  const m = para && /https:\/\/claude\.ai\/artifact\/[A-Za-z0-9_-]+/.exec(para);
  return m ? m[0] : null;
}
