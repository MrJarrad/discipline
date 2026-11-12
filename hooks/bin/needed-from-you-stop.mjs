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
      `## Build in Progress` / `## Upcoming` heading (DISC-197; the script
      prints Upcoming above the block) means a status reply / new ask: the message
      must then carry the block, with a heading for each marker prefix.
   c) DISC-288: when the block links the vault's Status doc, it need only
      carry this turn's new asks (by row ID) plus that link line; old rows live on
      the checklist, not in the thread.
   d) s79 (operator: "it's not been what the last couple of session automatically did"): DISC-288
      is enforced, not advised. With the Status doc configured in the vault, a status reply
      must carry the exact `Full list:` link line (a full block reprinted inline is refused), and
      must follow a write to the Status doc this turn (an `update` or `batch` tool call naming the
      doc id), so Running now and Done this session are current before the reply.
   Otherwise (an automated wake with nothing new, a wrapped session) it allows.
   A failure blocks once (`stop_hook_active` set -> allow, no loop). No
   DISCIPLINE_VAULT_ROOT -> silent exit 0, like the commit gate.            */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { neededFromYou } from "../scripts/needed-from-you.mjs";
import { readMarkers } from "../scripts/lib/row-marker.mjs";
import { pinnedChecklistIds, pinnedChecklistUrl } from "../scripts/lib/pinned-checklist.mjs";

/* s81: a turn started by the harness, not the operator: a notification wrapper, a GitHub wake, a helper's message. */
const WRAPPERS = [/<system-reminder>[\s\S]*?<\/system-reminder>/g, /<wake\b[\s\S]*?<\/wake>/g, /<cross-session-message\b[\s\S]*?<\/cross-session-message>/g, /<task-notification>[\s\S]*?<\/task-notification>/g];
/* Anchored (review AMBER 2): a wake is a user entry made ONLY of harness wrappers. Strip them; any text left is the operator's. */
export function isWake(text) {
  let rest = String(text || ""), n = 0;
  for (const re of WRAPPERS) rest = rest.replace(re, () => { n++; return ""; });
  return n > 0 && rest.trim() === "";
}
const HEAD = /^## Needed from you\s*$/m;
const textOf = (c) => (typeof c === "string" ? c : Array.isArray(c) ? c.filter((b) => b?.type === "text").map((b) => b.text).join("\n") : "");
const isToolResult = (c) => Array.isArray(c) && c.some((b) => b?.type === "tool_result");

/* The last assistant text after the last real user message, that message's timestamp, and whether this turn wrote to
   the Status doc (an `update`/`batch` MCP call whose input names one of `docIds`: the artifact id and the doc UUID
   the Claude Docs connector sends as container.id; see pinnedChecklistIds). */
export function lastTurn(transcriptText, docIds) {
  const ids = (Array.isArray(docIds) ? docIds : []).filter(Boolean);
  const docId = ids.length ? ids : null;
  let userTs = "", text = null, docWritten = false, answered = [], docWrites = [], wake = false;
  for (const line of transcriptText.split("\n")) {
    if (!line) continue;
    let e; try { e = JSON.parse(line); } catch { continue; }
    const c = e.message?.content;
    if (e.type === "user" && !isToolResult(c)) { userTs = e.timestamp || ""; text = null; docWritten = false; answered = []; docWrites = []; wake = isWake(textOf(c)); }
    else if (e.type === "assistant") {
      const t = textOf(c); if (t.trim()) text = t;
      if (Array.isArray(c)) for (const b of c) if (b?.type === "tool_use" && b.name === "Bash") for (const m of String(b.input?.command || "").matchAll(/lane-end\.mjs[^\n]*?--id\s+([A-Z]{2,4}-\d+[a-z]?)/g)) if (!answered.includes(m[1])) answered.push(m[1]);
      if (docId && Array.isArray(c)) for (const b of c) if (b?.type === "tool_use" && /^mcp__.*__(update|batch)$/.test(b.name || "") && ids.some((id) => JSON.stringify(b.input || {}).includes(id))) docWrites.push(b.input || {});
      if (docId && Array.isArray(c) && c.some((b) => b?.type === "tool_use" && /^mcp__.*__(update|batch)$/.test(b.name || "") && ids.some((id) => JSON.stringify(b.input || {}).includes(id)))) docWritten = true;
    }
  }
  return docId ? { userTs, text, docWritten, answered, docWrites, wake } : { userTs, text, wake };
}

/* DISC-302 (review AMBER 4): an answered row's own item must have its dropdown set to a non-Ready value in one op of this turn's doc
   writes: an op (a `batch` element, or the whole input) that names the row id AND carries a dropdown set to Done / You're on it /
   Claude's on it, as an element (`<dropdown …>Done</dropdown>`) or a key (`"dropdown":{"value":"Done"}`). The word Done elsewhere
   ("Done this session") or another row's dropdown does not count. */
const CHIP = "(?:Done|You're on it|Claude's on it)";
const CHIP_RE = new RegExp(`<dropdown\\b[^>]*>\\s*${CHIP}\\s*</dropdown>|"dropdown"\\s*:\\s*(?:"${CHIP}"|\\{[^}]*"${CHIP}")`);
export function chipChangedFor(id, docWrites) {
  const idRe = new RegExp(`(?<![A-Za-z0-9-])${id}(?![A-Za-z0-9-])`);
  const ops = (docWrites || []).flatMap((w) => (Array.isArray(w?.batch) ? w.batch : [w]));
  return ops.some((op) => { const t = JSON.stringify(op || {}); return idRe.test(t) && CHIP_RE.test(t.replace(/\\"/g, '"')); });
}
export function check({ text: raw, userTs, vault, sessionId, docWritten, answered = [], docWrites = [], wake = false }) {
  // a heading inside a fenced code block is not a heading
  const text = raw && raw.replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, "");
  if (!text || /^\s*This session is wrapped/i.test(text)) return null;
  const markers = readMarkers(vault).filter((m) => m.ts > userTs && (!m.session || !sessionId || m.session === sessionId));
  /* s81 (operator: "you've started status updates in the thread again"): an automated wake that raised no new ask gets no chat text. */
  if (wake && markers.length === 0) return "Stop check (s81): this turn started from an automated wake (a GitHub event, a helper's message or a background completion) and raised no new ask, so it gets no chat text at all; the result goes to the Status doc. End the turn with no text.";
  const hasHead = HEAD.test(text);
  const status = hasHead || markers.length > 0 || /^## (Build in Progress|Upcoming)\s*$/m.test(text);
  if (!status) return null;
  const mPrefixes = [...new Set(markers.map((m) => m.prefix))];
  const how = "End the reply with the `## Needed from you` block exactly as `node <plugin>/hooks/scripts/needed-from-you.mjs --vault <vault> --projects <PFX,...>` prints it (every open row, each project under `### <PFX> — <project>`), as the last section.";
  if (!hasHead) return `Stop check (DISC-179): this reply is a status reply or raises a new ask but has no \`## Needed from you\` block. ${how}`;
  const idx = text.search(HEAD);
  const block = text.slice(idx);
  if (/^## (?!Needed from you)/m.test(block.slice(block.indexOf("\n") + 1))) return `Stop check (DISC-179): \`## Needed from you\` must be the last section of the reply. ${how}`;
  /* DISC-288: the short form — only this turn's new asks plus one line linking the pinned
     checklist (its URL read from the vault), matched as that exact line. Anything else is the full-block check below. */
  const url = pinnedChecklistUrl(vault);
  if (url && block.split("\n").some((l) => [`Full list: [Status](${url})`, `Full list: [Needed from you](${url})`].includes(l.trim()))) {
    const unlisted = [...new Set(markers.map((m) => m.id).filter(Boolean))].filter((id) => !new RegExp(`(?<![A-Za-z0-9-])${id}(?![A-Za-z0-9-])`).test(block));
    if (unlisted.length) return `Stop check (DISC-288): the short Needed-from-you block omits row(s) added this turn: ${unlisted.join(", ")}. List each new ask, then the one link line to the Status doc.`;
    if (docWritten === false) return `Stop check (DISC-288): a status reply comes after the Status doc is brought current this turn. Run \`queue-page-sync.mjs\`, apply its lines to the doc (Running now checked with get_session, Done this session, Waiting on you), then reply with the new asks and the Full list link.`;
    /* DISC-302: a row answered this turn (lane-end --id) needs its Status chip changed in this turn's doc write. */
    const unchipped = answered.filter((id) => !chipChangedFor(id, docWrites));
    if (unchipped.length) return `Stop check (DISC-302): ${unchipped.join(", ")} answered this turn, but no op in this turn's writes to the Status doc names that row and sets its dropdown to Done, You're on it or Claude's on it, so its chip still reads Ready for you. Replace the item's dropdown with Done (a chars-range replace carrying a new dropdown chip; queue-page-sync prints each as chipChanges) and drop its "Look now:" lead, then reply.`;
    return null;
  }
  if (url) return `Stop check (DISC-288): the vault names a Status doc, so a status reply carries only this turn's new asks plus the exact line \`Full list: [Status](${url})\`, not the queue reprinted inline. Update the doc first (Running now, Done this session, Waiting on you), then reply.`;
  const prefixes = [...new Set([...block.matchAll(/^### ([A-Z]{2,4}) — /gm)].map((m) => m[1]).concat(mPrefixes))];
  if (!prefixes.length) return `Stop check (DISC-179): the Needed-from-you block has no \`### <PFX> — <project>\` heading, so it was not built by the script. ${how}`;
  const missingHeads = mPrefixes.filter((p) => !new RegExp(`^### ${p} — `, "m").test(block));
  if (missingHeads.length) return `Stop check (DISC-179): a row was added for ${missingHeads.join(", ")} this turn but the block has no section for it. ${how}`;
  const r = neededFromYou(vault, prefixes);
  if (!r.ok) return `Stop check (DISC-179): ${r.reason}. ${how}`;
  const want = r.projects.flatMap((p) => [...p.queue.rows, ...p.backlog.rows].map((x) => x.id));
  const missing = want.filter((id) => !new RegExp(`(?<![A-Za-z0-9-])${id}(?![A-Za-z0-9-])`).test(block));
  if (missing.length) return `Stop check (DISC-179): the Needed-from-you block omits open row(s) ${missing.join(", ")}. Print the script's full block, not only the newest asks. ${how}`;
  return null;
}

function main() {
  const vaultEnv = process.env.DISCIPLINE_VAULT_ROOT;
  if (!vaultEnv) return;
  let input; try { input = JSON.parse(readFileSync(0, "utf8")); } catch { return; }
  if (input.stop_hook_active || !input.transcript_path) return;
  let t; try { t = readFileSync(input.transcript_path, "utf8"); } catch { return; }
  const vault = resolve(vaultEnv);
  const { userTs, text, docWritten, answered, docWrites, wake } = lastTurn(t, pinnedChecklistIds(vault));
  let reason; try { reason = check({ text, userTs, vault, sessionId: input.session_id, docWritten, answered, docWrites, wake }); } catch { return; }
  if (reason) process.stdout.write(JSON.stringify({ decision: "block", reason }));
}

if (process.argv[1]?.endsWith("needed-from-you-stop.mjs")) main();
