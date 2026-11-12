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
     projects     (DISC-305) the `### <PFX> — <project>` heading each session project owns in the doc
     toAddUnder   (DISC-305) each missing open row with the project heading it goes under
     misfiled     (DISC-305) Waiting items under another project's heading (or none, once the doc groups by project)
     chipChanges  (DISC-302) every answered or landed Waiting item whose Status chip is not Done: replace its dropdown with Done
                  the same turn (a chars-range replace carrying a new dropdown chip; s81 proven), and drop its "Look now:" lead
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
/* The chip a line shows, "Status: X" or "[X]", else null (DISC-302). */
const chipOf = (t) => STATUSES.find((s) => t.includes(`Status: ${s}`) || t.includes(`[${s}]`)) ?? null;
/* DISC-307 (operator s81: "ideally though we would consistently format things like i've done for pf-15131"; Recommended and Alternative are
   each their own nested bullet): one item format. Chip, bold "(ID) Title." plus one bold state line, then nested bullets in fixed order
   Problem, Solution, Decision (Recommended, Alternative nested; only when there is a choice), Look (link + steps, ends "Say yes, or what's
   off."). A short item is the chip, the bold line and one plain line. Built from a queue row's cells: needed, where, why, recommended. */
const sentence = (t) => { const x = String(t || "").trim().replace(/\s+/g, " "); return x && /[.!?…]$/.test(x) ? x : x ? `${x}.` : ""; };
const cap = (t) => (t ? t[0].toUpperCase() + t.slice(1) : t);
export function formatItem({ id, needed = "", where = "", why = "", recommended = "", chip = "Ready for you" }) {
  const all = clean([needed, why].join(" "));
  const field = (name, text) => new RegExp(`${name}:\\s*(.*?)\\s*(?=(?:Problem|Solution):|$)`, "i").exec(text)?.[1]?.trim() || "";
  const problem = field("Problem", clean(needed)), solution = field("Solution", clean(needed));
  const head = clean(needed).replace(/\s*(?:Problem|Solution):.*$/i, "").trim();
  const title = cap(head.split(/(?<=[.!?])\s+/)[0].replace(/[.!?…]+$/, "").slice(0, 90).trim());
  const url = /https?:\/\/[^\s)>\]]+/.exec(all)?.[0];
  const choice = clean(recommended);
  const decision = !!choice, look = !!url;
  const state = decision ? "Needs your decision." : look ? "Ready for your look." : "Waiting on you.";
  const lines = [`- [ ] [${chip}] **(${id}) ${title}. ${state}**`];
  if (problem) lines.push(`  - **Problem:** ${problem}`);
  if (solution) lines.push(`  - **Solution:** ${solution}`);
  if (decision) {
    const m = /^(?:Recommended:?\s*)?(.*?)(?:\s*Alternative:?\s*(.*))?$/i.exec(choice);
    lines.push(`  - **Decision:** ${head}`, `    - **Recommended:** ${m[1].trim()}`);
    if (m[2]) lines.push(`    - **Alternative:** ${m[2].trim()}`);
  }
  if (look) lines.push(`  - **Look:** [Open the preview](${url})${clean(where) ? ` ${clean(where).replace(/[.!?]+$/, "")}` : ""}. Say yes, or what's off.`);
  if (!problem && !solution && !decision && !look) lines.push(`  - ${sentence(clean(why) || clean(where)) || "Needs your answer."}`);
  return lines.join("\n");
}
const clean = (t) => t.replace(/<br>/g, " ").replace(/\s+/g, " ").trim();

/* DISC-297 / DISC-305: a Claude Docs read returns the doc as (entity-escaped) XML. An item is
   <listItem><paragraph><dropdown>Status</dropdown><text> …</text></paragraph></listItem>; a heading is a paragraph carrying its level,
   <paragraph id='…' h='…' heading='2'>Waiting on you</paragraph> (the real shape, s81). Rewrite that to the checklist lines the plan
   reads below, the chip kept as `[Status]`; markdown input passes through. */
export function fromDocsRead(t) {
  if (!/(<|&lt;)(listItem|paragraph)\b/.test(t)) return t;
  const doc = t.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#39;/g, "'");
  return doc.replace(/<paragraph\b([^>]*\bheading=['"]?(\d)['"]?[^>]*)>([\s\S]*?)<\/paragraph>/g, (_, _a, level, h) => `\n${"#".repeat(Math.min(6, Math.max(1, Number(level))))} ${h.replace(/<[^>]+>/g, "").trim()}\n`)
    .replace(/<listItem\b([^>]*)>([\s\S]*?)<\/listItem>/g, (_, attrs, body) => {
      const box = /checked=['"]?true/i.test(attrs) ? "x" : " ";
      const chip = /<dropdown\b[^>]*>([\s\S]*?)<\/dropdown>/.exec(body)?.[1].trim();
      const text = body.replace(/<(?:link|a)\b[^>]*href=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/(?:link|a)>/g, "$2 $1").replace(/<dropdown\b[^>]*>[\s\S]*?<\/dropdown>/g, "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
      return `\n- [${box}] ${text}${chip ? ` [${chip}]` : ""}\n`;
    });
}

export function syncPlan({ vault, prefixes, docText }) {
  const r = neededFromYou(vault, prefixes);
  if (!r.ok) throw new Error(r.reason);
  const open = new Map();
  const formatted = new Map();
  for (const p of r.projects) for (const [kind, rows] of [["queue", p.queue.rows], ["backlog", p.backlog.rows]]) for (const row of rows) {
    open.set(row.id, `- [ ] **${row.id}** ${clean(cells(row.line)[1] || "")}`);
    const c = cells(row.line);
    formatted.set(row.id, formatItem(kind === "queue" ? { id: row.id, needed: c[1], where: c[2], why: c[3], recommended: c[4] } : { id: row.id, needed: c[1] }));
  }
  const plan = { items: [...open.values()], toAdd: [], toTick: [], answered: [], running: [], clearAtWrap: [], noStatus: [], appended: [], sameLane: [], leaveWaiting: [] };
  const lanes = new Map();
  /* DISC-305: one doc for all projects, a `### <PFX> — <project>` heading per project inside Waiting on you and Running now. */
  plan.projects = r.projects.map((p) => ({ prefix: p.prefix, heading: `### ${p.prefix} — ${p.project}` }));
  Object.assign(plan, { toAddUnder: [], misfiled: [], needsProjectHeadings: false, chipChanges: [] });
  if (docText == null) return plan;
  docText = fromDocsRead(docText);
  plan.needsProjectHeadings = !/^###\s+/m.test(docText);
  const headingOf = new Map(plan.projects.map((p) => [p.prefix, p.heading]));
  let under = null;
  let section = "";
  const listed = new Set();
  for (const line of docText.split(/\r?\n/)) {
    const h = /^##\s+(.*)$/.exec(line);
    if (h) { section = h[1].trim().toLowerCase(); under = null; continue; }
    const sub = /^###\s+(.*)$/.exec(line);
    if (sub) { under = { text: line.trim(), prefix: /^([A-Z]{2,4}) —/.exec(sub[1].trim())?.[1] ?? null }; continue; }
    if (section.startsWith("done") && /^- \[x\]/i.test(line)) plan.clearAtWrap.push(line.trim());
    const it = /^- \[( |x)\]\s+(.*)$/i.exec(line);
    if (!it) continue;
    const ticked = it[1].toLowerCase() === "x", text = it[2].trim();
    if (section.startsWith("running")) {
      if (!ticked) { plan.running.push({ text, sessions: [...text.matchAll(/session_[A-Za-z0-9]+/g)].map((m) => m[0]), ...(under?.prefix ? { project: under.prefix } : {}) }); if (!hasStatus(text)) plan.noStatus.push(text); }
      continue;
    }
    const id = (/^(?:\[[^\]]*\]\s*)?\*\*(?:\(([A-Z]{2,4}-\d+[a-z]?)\)|([A-Z]{2,4}-\d+[a-z]?)\*\*)/.exec(text) || []).slice(1).find(Boolean);
    if (!id) continue;
    listed.add(id);
    if (section.startsWith("waiting")) {
      if (!ticked && !hasStatus(text)) plan.noStatus.push(id);
      if (!ticked && new Set(text.match(/https?:\/\/[^\s)>\]]+/g) || []).size > 1) plan.appended.push(id);
      const lane = !ticked && /\(lane:\s*([^)]+)\)/i.exec(text)?.[1].trim().toLowerCase();
      if (lane) lanes.set(lane, [...(lanes.get(lane) || []), id]);
      if (ticked || !open.has(id)) plan.leaveWaiting.push(id);
      const chip = chipOf(text);
      if ((ticked || !open.has(id)) && chip !== "Done") plan.chipChanges.push({ id, from: chip, to: "Done", why: ticked && open.has(id) ? "answered" : "landed" });
      const owner = /^([A-Z]{2,4})-/.exec(id)?.[1];
      if (!plan.needsProjectHeadings && (!under || under.prefix !== owner)) plan.misfiled.push({ id, under: under ? under.text : null, belongsTo: owner });
      if (!ticked && !open.has(id)) plan.toTick.push(id);
      if (ticked && !open.has(id)) plan.clearAtWrap.push(line.trim());
      if (ticked && open.has(id)) plan.answered.push(id);
    }
  }
  for (const [lane, ids] of lanes) if (ids.length > 1) plan.sameLane.push({ lane, ids });
  plan.toAddUnder = [...open.keys()].filter((id) => !listed.has(id)).map((id) => ({ id, under: headingOf.get(/^([A-Z]{2,4})-/.exec(id)[1]) }));
  plan.toAdd = [...open.keys()].filter((id) => !listed.has(id)).map((id) => formatted.get(id));
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
