#!/usr/bin/env node
/* Stop — DISC-179(1), lesson 2026-10-16-status-drift-drop-miss-unseen-ready
   (operator: "needed from you has become not the way you combine things").
   The rule "every status reply ends with the full Needed-from-you block, built
   by needed-from-you.mjs" existed and nothing checked it. This hook does, at
   stop, on the final assistant message of the turn:

   a) The message has a `## Needed from you` heading: it must be the LAST `## `
      heading, carry a `### <PFX> — <project>` heading per project, and name
      every open row ID the script prints for those prefixes. (Chat prints rows
      as numbered items, so IDs are compared, not table text.) Prefixes come
      from the `###` headings inside the message's own block.
   b) A `row-add.mjs` call this turn (its marker, lib/row-marker.mjs) or a
      `## Build in Progress` heading means a status reply / new ask: the message
      must then carry the block, with a heading for each marker prefix.
   Otherwise (an automated wake with nothing new, a wrapped session) it allows.
   A failure blocks once (`stop_hook_active` set -> allow, no loop). No
   DISCIPLINE_VAULT_ROOT -> silent exit 0, like the commit gate.            */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { neededFromYou } from "../scripts/needed-from-you.mjs";
import { readMarkers } from "../scripts/lib/row-marker.mjs";

const HEAD = /^## Needed from you\s*$/m;
const textOf = (c) => (typeof c === "string" ? c : Array.isArray(c) ? c.filter((b) => b?.type === "text").map((b) => b.text).join("\n") : "");
const isToolResult = (c) => Array.isArray(c) && c.some((b) => b?.type === "tool_result");

/* The last assistant text after the last real user message, and that message's timestamp. */
export function lastTurn(transcriptText) {
  let userTs = "", text = null;
  for (const line of transcriptText.split("\n")) {
    if (!line) continue;
    let e; try { e = JSON.parse(line); } catch { continue; }
    const c = e.message?.content;
    if (e.type === "user" && !isToolResult(c)) { userTs = e.timestamp || ""; text = null; }
    else if (e.type === "assistant") { const t = textOf(c); if (t.trim()) text = t; }
  }
  return { userTs, text };
}

export function check({ text, userTs, vault }) {
  if (!text || /^\s*This session is wrapped/i.test(text)) return null;
  const markers = readMarkers(vault).filter((m) => m.ts > userTs);
  const hasHead = HEAD.test(text);
  const status = hasHead || markers.length > 0 || /^## Build in Progress\s*$/m.test(text);
  if (!status) return null;
  const mPrefixes = [...new Set(markers.map((m) => m.prefix))];
  const how = "End the reply with the `## Needed from you` block exactly as `node <plugin>/hooks/scripts/needed-from-you.mjs --vault <vault> --projects <PFX,...>` prints it (every open row, each project under `### <PFX> — <project>`), as the last section.";
  if (!hasHead) return `Stop check (DISC-179): this reply is a status reply or raises a new ask but has no \`## Needed from you\` block. ${how}`;
  const idx = text.search(HEAD);
  const block = text.slice(idx);
  if (/^## (?!Needed from you)/m.test(block.slice(block.indexOf("\n") + 1))) return `Stop check (DISC-179): \`## Needed from you\` must be the last section of the reply. ${how}`;
  const prefixes = [...new Set([...block.matchAll(/^### ([A-Z]{2,4}) — /gm)].map((m) => m[1]).concat(mPrefixes))];
  if (!prefixes.length) return `Stop check (DISC-179): the Needed-from-you block has no \`### <PFX> — <project>\` heading, so it was not built by the script. ${how}`;
  const missingHeads = mPrefixes.filter((p) => !new RegExp(`^### ${p} — `, "m").test(block));
  if (missingHeads.length) return `Stop check (DISC-179): a row was added for ${missingHeads.join(", ")} this turn but the block has no section for it. ${how}`;
  const r = neededFromYou(vault, prefixes);
  if (!r.ok) return `Stop check (DISC-179): ${r.reason}. ${how}`;
  const want = r.projects.flatMap((p) => [...p.queue.rows, ...p.backlog.rows].map((x) => x.id));
  const missing = want.filter((id) => !block.includes(id));
  if (missing.length) return `Stop check (DISC-179): the Needed-from-you block omits open row(s) ${missing.join(", ")}. Print the script's full block, not only the newest asks. ${how}`;
  return null;
}

function main() {
  const vaultEnv = process.env.DISCIPLINE_VAULT_ROOT;
  if (!vaultEnv) return;
  let input; try { input = JSON.parse(readFileSync(0, "utf8")); } catch { return; }
  if (input.stop_hook_active || !input.transcript_path) return;
  let t; try { t = readFileSync(input.transcript_path, "utf8"); } catch { return; }
  const { userTs, text } = lastTurn(t);
  let reason; try { reason = check({ text, userTs, vault: resolve(vaultEnv) }); } catch { return; }
  if (reason) process.stdout.write(JSON.stringify({ decision: "block", reason }));
}

if (process.argv[1]?.endsWith("needed-from-you-stop.mjs")) main();
