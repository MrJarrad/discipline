/* doc-layout-check — DISC-328 (operator s88: "I still don't feel like we're cleanly, consistently and dependably using the status doc.").
   One question for the Stop hook: is this read of the Status doc in the agreed layout? Answered by running the layout plan (status-layout.mjs, the
   same script that lays the doc out) on the read; any op it still wants, or any chip-less item, means the doc is out of layout.
   Interface: docLayoutIssue({ vault, docXml, today?, prefixes? }) -> a one-paragraph reason string, or null when the doc is in layout or cannot be judged.
   Fail-open on every error (no vault, no xml, a doc that names no known project): a hook that blocks on its own failure loops the operator. The date line
   is not a layout issue (a read across midnight must not block), so a setDate op is ignored. */
import { layoutPlan } from "../status-layout.mjs";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { neededFromYou } from "../needed-from-you.mjs";
import { displayName } from "../status-layout.mjs";
import { parseStatusDoc } from "./status-doc.mjs";

const ID_PREFIX = /(?<![A-Za-z0-9-])([A-Z]{2,4})-\d+[a-z]?(?![A-Za-z0-9-])/g;
/* the doc's own project headings name the session's projects: a heading matches the project whose display name it is, and that project's backlog frontmatter gives the prefix */
function headingPrefixes(vault, docXml) {
  const headings = new Set(parseStatusDoc(docXml).sections.flatMap((s) => s.projects.map((p) => p.name)));
  const dir = join(vault, "projects");
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((p) => headings.has(displayName(p))).map((p) => { try { return /^prefix:\s*([A-Z]{2,4})\s*$/m.exec(readFileSync(join(dir, p, `${p}-backlog.md`), "utf8"))?.[1]; } catch { return null; } }).filter(Boolean);
}
const describe = (o) => `${o.op}${o.rowId ? ` ${o.rowId}` : o.project ? ` ${o.project}` : o.name ? ` ${o.name}` : ""}`;

export function docLayoutIssue({ vault, docXml, today = new Date().toISOString().slice(0, 10), prefixes }) {
  try {
    if (!vault || typeof docXml !== "string" || !docXml.includes("<doc")) return null;
    const wanted = prefixes ?? [...new Set([...[...docXml.matchAll(ID_PREFIX)].map((m) => m[1]), ...headingPrefixes(vault, docXml)])];
    const known = wanted.filter((p) => { try { return neededFromYou(vault, [p]).ok; } catch { return false; } });
    if (!known.length) return null;
    const plan = layoutPlan({ vault, prefixes: known, docXml, today });
    const ops = plan.ops.filter((o) => o.op !== "setDate");
    if (!ops.length && !plan.chipless.length) return null;
    const shown = [...ops.map(describe), ...plan.chipless.filter((c) => !ops.some((o) => o.id === c.id)).map((c) => `chipless ${c.rowId ?? c.id}`)];
    return `Stop check (DISC-328): the Status doc is out of layout: the layout plan still wants ${ops.length} op(s)${plan.chipless.length ? ` and ${plan.chipless.length} item(s) have no chip` : ""} (${shown.slice(0, 3).join("; ")}${shown.length > 3 ? "; …" : ""}). Run \`status-layout.mjs --vault <vault> --projects ${known.join(",")} --doc-json -\` on a fresh read of the doc (pass the read's \`data\` object), apply its ops with the Claude Docs connector, read the doc back, then end the turn.`;
  } catch { return null; }
}
