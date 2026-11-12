#!/usr/bin/env node
/* queue-page-sync — DISC-288. The queue files stay the source of truth; the operator's pinned
   Claude Doc checklist ("Needed from you") mirrors them. A script cannot call the Claude Docs
   connector, so this prints what the session must change there (the session then applies each
   line with the connector's find/replace) and what to read back:
     items    one `- [ ] **(PF-5)** text` line per open queue row and waiting-on-operator backlog row
     toAdd    open rows the doc does not list yet, each in the Status item format (formatItem, DISC-307)
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
     chipChanges  (DISC-302) every answered or landed Waiting item whose Status chip is not Done: replace its dropdown with Done
                  the same turn (a chars-range replace carrying a new dropdown chip; s81 proven), and drop its "Look now:" lead
     clearAtWrap every ticked "Done this session" item and every ticked "Waiting on you" item whose row is
              no longer open (DISC-290; a ticked one still open is in `answered`, banked first): at wrap the session deletes each, so the
              section starts empty next session (the vault keeps the record; operator s77: "clear it
              at each sessions end").
   DISC-310 / DISC-312: the whole-doc layout (sections, project headings and where an item sits, Up next, Done moves) is status-layout.mjs; this script is the
   row-level step and reads the layout's sections: Ready for you and You're on it mirror the queue, Claude's on it lists the lanes (the old Waiting on you and
   Running now names still read the same way).
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
const POINTER = /^(?:the\s+)?(?:pinned doc|status doc|status|reply here|reply|drop|claude app|here)\b/i;
const FIELD_END = "(?=\\s(?:Problem|Solution(?:\\s*\\([^)]*\\))?|Caveat):|$)";
/* The title and the rest of a row's first part: cut at the first ": " outside brackets, else the first sentence. */
function splitHead(head) {
  let depth = 0;
  for (let i = 0; i < head.length; i++) {
    const c = head[i];
    if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth = Math.max(0, depth - 1);
    else if (c === ":" && depth === 0 && /\s/.test(head[i + 1] || "")) return [head.slice(0, i), head.slice(i + 1).trim()];
  }
  const m = /^(.*?[.!?])\s+(.*)$/.exec(head);
  return m ? [m[1], m[2]] : [head, ""];
}
/* A title: links reduced to their text, URLs dropped, cut at a word boundary within 90 characters and never inside a parenthesis. */
function titleOf(raw) {
  let t = raw.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/https?:\/\/\S+/g, "").replace(/\s+/g, " ").trim().replace(/[.!?…:;,]+$/, "");
  if (t.length > 90) {
    t = t.slice(0, 90).replace(/\s+\S*$/, "");
    const open = t.lastIndexOf("("); if (open > t.lastIndexOf(")")) t = t.slice(0, open).trim();
    t = t.replace(/[\s,;:(-]+$/, "");
  }
  return cap(t);
}
export function formatItem({ id, needed = "", where = "", why = "", recommended = "", chip = "Ready for you" }) {
  let text = clean(needed);
  const closing = /\s(Say [^.]*\.)\s*$/.exec(text)?.[1];
  if (closing) text = text.slice(0, text.length - closing.length).trim();
  const field = (name) => new RegExp(`(?:^|\\s)${name}(?:\\s*\\([^)]*\\))?:\\s*(.*?)${FIELD_END}`, "i").exec(text)?.[1]?.trim() || "";
  const problem = field("Problem"), caveat = field("Caveat");
  let solution = field("Solution");
  if (solution && caveat) solution = `${solution} Caveat: ${caveat}`;
  const head = text.replace(/(?:^|\s)(?:Problem|Solution(?:\s*\([^)]*\))?|Caveat):.*$/i, "").trim();
  const [titleRaw, rest] = splitHead(head);
  const title = titleOf(titleRaw);
  const mdLink = /\[[^\]]+\]\(https?:\/\/[^)]+\)/.test(rest || text);
  const rawUrl = /https?:\/\/[^\s)>\]]+/.exec(clean([needed, why].join(" ")))?.[0];
  const look = mdLink || !!rawUrl;
  const choice = clean(recommended);
  const alt = /\bAlternative:?\s*(.*)$/i.exec(choice)?.[1]?.trim();
  const decision = !!alt;
  const state = decision ? "Needs your decision." : look ? "Ready for your look." : "Waiting on you.";
  const lines = [`- [ ] [${chip}] **(${id}) ${title}. ${state}**`];
  if (problem) lines.push(`  - **Problem:** ${problem}`);
  if (solution) lines.push(`  - **Solution:** ${solution}`);
  if (caveat && !solution) lines.push(`  - **Caveat:** ${caveat}`);
  if (decision) {
    lines.push(`  - **Decision:** ${head}`, `    - **Recommended:** ${choice.replace(/\s*Alternative:?.*$/i, "").replace(/^Recommended:?\s*/i, "").trim()}`, `    - **Alternative:** ${alt}`);
  }
  if (look) {
    const steps = mdLink ? rest : [rest, POINTER.test(clean(where)) ? "" : clean(where)].filter(Boolean).join(" ");
    const body = mdLink ? cap(steps) : `[Open the preview](${rawUrl})${steps ? ` ${steps.replace(/[.!?]+$/, "")}` : ""}`;
    lines.push(`  - **Look:** ${body.replace(/\s+$/, "")}${/[.!?]$/.test(body) ? "" : "."} ${closing || "Say yes, or what's off."}`);
  }
  if (!problem && !solution && !caveat && !decision && !look) {
    const plain = rest || (POINTER.test(clean(why)) ? "" : clean(why)) || (POINTER.test(clean(where)) ? "" : clean(where));
    const one = plain.length > 240 ? `${plain.slice(0, 240).replace(/\s+\S*$/, "").replace(/[\s,;:(-]+$/, "")}…` : plain;
    lines.push(`  - ${sentence(one) || "Needs your answer."}`);
  }
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
  const headed = doc.replace(/<paragraph\b([^>]*\bheading=['"]?(\d)['"]?[^>]*)>([\s\S]*?)<\/paragraph>/g, (_, _a, level, h) => `\n${"#".repeat(Math.min(6, Math.max(1, Number(level))))} ${h.replace(/<[^>]+>/g, "").trim()}\n`)
  ;
  /* Items, innermost first (DISC-307 round 2): a nested listItem is converted before its parent, then re-indented under it as a plain bullet. */
  const item = /<listItem\b([^>]*)>((?:(?!<listItem\b)[\s\S])*?)<\/listItem>/;
  let out = headed;
  for (let guard = 0; item.test(out) && guard < 500; guard++) {
    out = out.replace(item, (_, attrs, rawBody) => {
      const body = rawBody.replace(/<\/?list\b[^>]*>/g, "");
      const box = /checked=['"]?true/i.test(attrs) ? "x" : " ";
      const k = body.indexOf("\n- [");
      const own = k === -1 ? body : body.slice(0, k), kids = k === -1 ? "" : body.slice(k);
      const chip = /<dropdown\b[^>]*>([\s\S]*?)<\/dropdown>/.exec(own)?.[1].trim();
      const text = own.replace(/<\/bold>\s*<\/text>\s*<text\b[^>]*>\s*<bold>/g, "").replace(/<\/bold>\s*<bold>/g, "").replace(/<bold>([\s\S]*?)<\/bold>/g, (_, t) => (t.trim() ? `${/^\s/.test(t) ? " " : ""}**${t.trim()}**${/\s$/.test(t) ? " " : ""}` : t)).replace(/<(?:link|a)\b[^>]*href=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/(?:link|a)>/g, "$2 $1").replace(/<dropdown\b[^>]*>[\s\S]*?<\/dropdown>/g, "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
      return `\n- [${box}] ${text}${chip ? ` [${chip}]` : ""}\n${kids.split("\n").map((l) => (/^- \[[ x]\] /.test(l) ? l.replace(/^- \[[ x]\] /, "  - ") : /^\s+- /.test(l) ? `  ${l}` : l)).join("\n").replace(/^\n+/, "")}`;
    });
  }
  return out;

}

/* Every open row of the result: `open` id -> the one-line form, `formatted` id -> the DISC-307 item (formatItem), each in the queue's order. */
export function openItems(r) {
  const open = new Map(), formatted = new Map();
  for (const p of r.projects) for (const [kind, rows] of [["queue", p.queue.rows], ["backlog", p.backlog.rows]]) for (const row of rows) {
    open.set(row.id, `- [ ] **(${row.id})** ${clean(cells(row.line)[1] || "")}`);
    const c = cells(row.line);
    formatted.set(row.id, formatItem(kind === "queue" ? { id: row.id, needed: c[1], where: c[2], why: c[3], recommended: c[4] } : { id: row.id, needed: c[1] }));
  }
  return { open, formatted };
}

/* the doc's sections by what they hold (section names, lower case): items that mirror a queue row, and lanes in flight */
const MIRRORS = ["waiting", "ready for you", "you're on it"], LANES = ["running", "claude's on it"];
export function syncPlan({ vault, prefixes, docText }) {
  const r = neededFromYou(vault, prefixes);
  if (!r.ok) throw new Error(r.reason);
  const { open, formatted } = openItems(r);
  const plan = { items: [...open.values()], toAdd: [], toTick: [], answered: [], running: [], clearAtWrap: [], noStatus: [], appended: [], sameLane: [], leaveWaiting: [] };
  const lanes = new Map();
  plan.chipChanges = [];
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
    if (LANES.some((x) => section.startsWith(x))) {
      if (!ticked) { plan.running.push({ text, sessions: [...text.matchAll(/session_[A-Za-z0-9]+/g)].map((m) => m[0]) }); if (!hasStatus(text)) plan.noStatus.push(text); }
      continue;
    }
    const id = (/^(?:\[[^\]]*\]\s*)?\*\*(?:\(([A-Z]{2,4}-\d+[a-z]?)\)|([A-Z]{2,4}-\d+[a-z]?)\*\*)/.exec(text) || []).slice(1).find(Boolean);
    if (!id) continue;
    listed.add(id);
    if (MIRRORS.some((x) => section.startsWith(x))) {
      if (!ticked && !hasStatus(text)) plan.noStatus.push(id);
      if (!ticked && new Set(text.match(/https?:\/\/[^\s)>\]]+/g) || []).size > 1) plan.appended.push(id);
      const lane = !ticked && /\(lane:\s*([^)]+)\)/i.exec(text)?.[1].trim().toLowerCase();
      if (lane) lanes.set(lane, [...(lanes.get(lane) || []), id]);
      if (ticked || !open.has(id)) plan.leaveWaiting.push(id);
      const chip = chipOf(text);
      if ((ticked || !open.has(id)) && chip !== "Done") plan.chipChanges.push({ id, from: chip, to: "Done", why: ticked && open.has(id) ? "answered" : "landed" });
      if (!ticked && !open.has(id)) plan.toTick.push(id);
      if (ticked && !open.has(id)) plan.clearAtWrap.push(line.trim());
      if (ticked && open.has(id)) plan.answered.push(id);
    }
  }
  for (const [lane, ids] of lanes) if (ids.length > 1) plan.sameLane.push({ lane, ids });
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
