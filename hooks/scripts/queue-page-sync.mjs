#!/usr/bin/env node
/* queue-page-sync — DISC-288. The queue files stay the source of truth; the operator's pinned
   Claude Doc checklist ("Needed from you") mirrors them. A script cannot call the Claude Docs
   connector, so this prints what the session must change there (the session then applies each
   line with the connector's find/replace) and what to read back:
     items    one `- [ ] **PF-5** text` line per open queue row and waiting-on-operator backlog row
     toAdd    open rows the doc does not list yet
     toTick   doc rows still unticked whose queue row is no longer open (landed or answered)
     answered doc rows the operator ticked while the queue row is still open (bank as an answer,
              then `lane-end.mjs --id` strikes the queue row; the next sync ticks nothing twice)
     running  every unticked "Running now" item with the helper session ids it names; a session
              checks each with get_session before trusting it (landed -> tick, live -> re-point,
              no id -> name the helper or drop it). Run at session start and again at wrap.
     noStatus     (DISC-297) unticked Waiting / Running items showing no Status chip (Ready for you / You're on it / Claude's on it / Done)
     appended     (DISC-297) Waiting items holding more than one link: a round appended, not replaced; rewrite to the current round
     sameLane     (DISC-297) open Waiting items sharing a `(lane: x)` marker: present them as one look row
     leaveWaiting (DISC-297) Waiting items ticked (answered) or no longer open: delete them from Waiting the same turn
     clearAtWrap every ticked "Done this session" item and every ticked "Waiting on you" item whose row is
              no longer open (DISC-290; a ticked one still open is in `answered`, banked first): at wrap the session deletes each, so the
              section starts empty next session (the vault keeps the record; operator s77: "clear it
              at each sessions end").
   Usage: node queue-page-sync.mjs --vault <root> --projects PF,HB [--doc <file with the doc text>] */
import { readFileSync } from "node:fs";
import { resolveVaultRoot } from "./lib/vault-root.mjs";
import { neededFromYou } from "./needed-from-you.mjs";

const cells = (line) => line.split("|").slice(1, -1).map((x) => x.trim());
/* DISC-297: the four values of the doc's Status chip, as a line shows it ("Status: Ready for you" or "[Ready for you]"). */
export const STATUSES = ["Ready for you", "You're on it", "Claude's on it", "Done"];
const hasStatus = (t) => STATUSES.some((s) => t.includes(`Status: ${s}`) || t.includes(`[${s}]`));
const clean = (t) => t.replace(/<br>/g, " ").replace(/\s+/g, " ").trim();

/* DISC-297: a Claude Docs read returns the doc as (entity-escaped) XML, each item a <listItem><paragraph><dropdown>Status</dropdown><text> …</text></paragraph></listItem>
   and each section a <heading>. Rewrite that shape to the checklist lines the plan reads below, the chip kept as `[Status]`; markdown input passes through. */
export function fromDocsRead(t) {
  if (!/(<|&lt;)listItem\b/.test(t)) return t;
  const doc = t.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
  return doc.replace(/<heading\b[^>]*>([\s\S]*?)<\/heading>/g, (_, h) => `\n## ${h.replace(/<[^>]+>/g, "").trim()}\n`)
    .replace(/<listItem\b([^>]*)>([\s\S]*?)<\/listItem>/g, (_, attrs, body) => {
      const box = /checked=['"]?true/i.test(attrs) ? "x" : " ";
      const chip = /<dropdown\b[^>]*>([\s\S]*?)<\/dropdown>/.exec(body)?.[1].trim();
      const text = body.replace(/<dropdown\b[^>]*>[\s\S]*?<\/dropdown>/g, "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
      return `\n- [${box}] ${text}${chip ? ` [${chip}]` : ""}\n`;
    });
}

export function syncPlan({ vault, prefixes, docText }) {
  const r = neededFromYou(vault, prefixes);
  if (!r.ok) throw new Error(r.reason);
  const open = new Map();
  for (const p of r.projects) for (const row of [...p.queue.rows, ...p.backlog.rows]) open.set(row.id, `- [ ] **${row.id}** ${clean(cells(row.line)[1] || "")}`);
  const plan = { items: [...open.values()], toAdd: [], toTick: [], answered: [], running: [], clearAtWrap: [], noStatus: [], appended: [], sameLane: [], leaveWaiting: [] };
  const lanes = new Map();
  if (docText == null) return plan;
  docText = fromDocsRead(docText);
  let section = "";
  const listed = new Set();
  for (const line of docText.split(/\r?\n/)) {
    const h = /^##\s+(.*)$/.exec(line);
    if (h) { section = h[1].trim().toLowerCase(); continue; }
    if (section.startsWith("done") && /^- \[x\]/i.test(line)) plan.clearAtWrap.push(line.trim());
    const it = /^- \[( |x)\]\s+(.*)$/i.exec(line);
    if (!it) continue;
    const ticked = it[1].toLowerCase() === "x", text = it[2].trim();
    if (section.startsWith("running")) {
      if (!ticked) { plan.running.push({ text, sessions: [...text.matchAll(/session_[A-Za-z0-9]+/g)].map((m) => m[0]) }); if (!hasStatus(text)) plan.noStatus.push(text); }
      continue;
    }
    const id = /^\*\*([A-Z]{2,4}-\d+[a-z]?)\*\*/.exec(text)?.[1];
    if (!id) continue;
    listed.add(id);
    if (section.startsWith("waiting")) {
      if (!ticked && !hasStatus(text)) plan.noStatus.push(id);
      if (!ticked && new Set(text.match(/https?:\/\/[^\s)>\]]+/g) || []).size > 1) plan.appended.push(id);
      const lane = !ticked && /\(lane:\s*([^)]+)\)/i.exec(text)?.[1].trim().toLowerCase();
      if (lane) lanes.set(lane, [...(lanes.get(lane) || []), id]);
      if (ticked || !open.has(id)) plan.leaveWaiting.push(id);
      if (!ticked && !open.has(id)) plan.toTick.push(id);
      if (ticked && !open.has(id)) plan.clearAtWrap.push(line.trim());
      if (ticked && open.has(id)) plan.answered.push(id);
    }
  }
  for (const [lane, ids] of lanes) if (ids.length > 1) plan.sameLane.push({ lane, ids });
  plan.toAdd = [...open].filter(([id]) => !listed.has(id)).map(([, l]) => l);
  return plan;
}

function main() {
  const a = process.argv.slice(2);
  const get = (k) => { const i = a.indexOf(k); return i !== -1 ? a[i + 1] : undefined; };
  const vault = get("--vault");
  if (!vault) { console.error("usage: queue-page-sync --vault <root> --projects PF,HB [--doc <file>]"); process.exit(1); }
  try {
    const doc = get("--doc");
    console.log(JSON.stringify(syncPlan({ vault: resolveVaultRoot(vault), prefixes: String(get("--projects") || "").split(","), docText: doc ? readFileSync(doc, "utf8") : undefined }), null, 2));
  } catch (e) { console.error(`queue-page-sync: ${e.message}`); process.exit(1); }
}

if (process.argv[1] && process.argv[1].endsWith("queue-page-sync.mjs")) main();
