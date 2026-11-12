/* DISC-314 (review of #195): a small stand-in for the Claude Docs connector, so a test can apply a status-layout plan to a doc and plan again.
   toXml(model) / applyOps(model, ops) work on lib/status-doc.mjs's parsed model; the rules it enforces are the connector's the plan has to respect:
   an item can only go into a project that has a list (else shape_mismatch), a node id must exist. It is deliberately dumb about anything else. */
import { parseStatusDoc } from "../lib/status-doc.mjs";

const CHIPS = ["Ready for you", "You're on it", "Done", "Claude's on it"];
const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/'/g, "&#39;");
let seq = 0;
const nid = (p = "n") => `${p}${++seq}`;

function inline(text) {
  return String(text).split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/).filter(Boolean).map((part) => {
    const b = /^\*\*([^*]+)\*\*$/.exec(part), l = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
    return b ? `<text id='${nid("t")}'><bold>${esc(b[1])}</bold></text>` : l ? `<link id='${nid("k")}' href='${esc(l[2])}'>${esc(l[1])}</link>` : `<text id='${nid("t")}'>${esc(part)}</text>`;
  }).join("");
}
const itemXml = (it) => {
  const chip = it.chip ? `<dropdown id='${nid("d")}' enum='e' index='${CHIPS.indexOf(it.chip.label)}'>${esc(it.chip.label)}</dropdown><text id='${nid("t")}'> </text>` : "";
  const kids = it.kids?.length ? `<list id='${nid("l")}' kind='${it.kids[0].listKind || "bullet"}'>${it.kids.map(itemXml).join("")}</list>` : "";
  return `<listItem id='${it.id}'${it.ticked ? " checked='true'" : ""}><paragraph id='${nid("p")}'>${chip}${inline(it.text)}</paragraph>${kids}</listItem>`;
};
const head = (id, lvl, t) => `<paragraph id='${id}' heading='${lvl}'><text id='${nid("t")}'>${esc(t)}</text></paragraph>`;
export function toXml(m) {
  const body = (x) => x.paras.map((q) => `<paragraph id='${q.id}'>${inline(q.text)}</paragraph>`).join("") + (x.items.length || x.listIds.length ? `<list id='${x.listIds[0] || nid("l")}' kind='${x.items[0]?.listKind || "check"}'>${x.items.map(itemXml).join("")}</list>` : "");
  return `<doc node='n'>${head("title", 1, m.title)}<paragraph id='${m.dateId}'><date id='${nid("dt")}' value='${m.date}'/><text id='${nid("t")}'> · </text></paragraph>`
    + m.sections.map((s) => head(s.id, 2, s.name) + body(s) + s.projects.map((p) => head(p.id, 3, p.name) + body(p)).join("")).join("") + "</doc>";
}

export function parseMd(md) {
  const lines = md.split("\n"), re = /^(\s*)- (?:\[( |x)\] )?(?:\[([^\]]+)\] )?(.*)$/;
  const mk = (m) => ({ id: nid("i"), text: m[4], ticked: m[2] === "x", chip: m[3] ? { label: m[3] } : null, kids: [], listKind: m[2] !== undefined ? "check" : "bullet", comments: [], rowId: /^\**\(?([A-Z]{2,4}-\d+[a-z]?)\)?/.exec(m[4])?.[1] ?? null });
  const stack = [];
  let top = null;
  for (const l of lines) {
    const m = re.exec(l);
    if (!m) continue;
    const it = mk(m), depth = m[1].length / 2;
    if (!depth) top = it; else (stack[depth - 1] || top).kids.push(it);
    stack[depth] = it;
  }
  return top;
}

export function applyOps(m, ops) {
  const sec = (n) => m.sections.find((s) => s.name === n);
  const proj = (sn, pn) => sec(sn)?.projects.find((p) => p.name === pn);
  const find = (id) => { for (const s of m.sections) for (const x of [s, ...s.projects]) { const i = x.items.findIndex((it) => it.id === id); if (i !== -1) return { x, i }; const q = x.paras.findIndex((p) => p.id === id); if (q !== -1) return { x, q }; } return null; };
  const take = (id) => { const f = find(id); if (!f || f.i === undefined) throw new Error(`no item ${id}`); return f.x.items.splice(f.i, 1)[0]; };
  const into = (to, it) => { const p = proj(to.section, to.project); if (!p) throw new Error(`no project ${to.section}/${to.project}`); if (!p.items.length && !p.listIds.length) throw new Error(`shape_mismatch: ${to.section}/${to.project} has no list`); p.items.push(it); };
  for (const o of ops) {
    if (o.op === "setDate") m.date = o.value;
    else if (o.op === "insertSection") { const at = o.afterSection ? m.sections.findIndex((s) => s.name === o.afterSection) + 1 : 0; m.sections.splice(at, 0, { name: o.name, id: nid("s"), paras: [], items: [], listIds: [], projects: o.projects.map((n) => ({ name: n, id: nid("h"), paras: [], items: [], listIds: [], last: null })) }); }
    else if (o.op === "insertProjectHeading") { const s = sec(o.section), at = o.afterId === s.id ? 0 : s.projects.findIndex((p) => p.last === o.afterId || p.id === o.afterId) + 1; s.projects.splice(at, 0, { name: o.name, id: nid("h"), paras: [], items: [], listIds: [], last: null }); }
    else if (o.op === "ensureList") { const p = proj(o.section, o.project); if (!p) throw new Error(`ensureList: no project ${o.section}/${o.project}`); if (!p.listIds.length) p.listIds.push(nid("l")); }
    else if (o.op === "insertItem") into({ section: o.section, project: o.project }, parseMd(o.markdown));
    else if (o.op === "move") { const it = take(o.id); if (o.ticked) it.ticked = true; into(o.to, it); }
    else if (o.op === "replaceItem") { take(o.id); into(o.to, parseMd(o.markdown)); }
    else if (o.op === "removeDuplicate") take(o.id);
    else if (o.op === "insertNothing") { const p = proj(o.section, o.project); if (!p) throw new Error(`no project ${o.section}/${o.project}`); p.paras.push({ id: nid("p"), text: "Nothing." }); }
    else if (o.op === "removeNode") { const f = find(o.id); if (!f || f.q === undefined) throw new Error(`no paragraph ${o.id}`); f.x.paras.splice(f.q, 1); }
    else if (o.op === "setUpNext") { const p = proj(o.section, o.project); p.items = o.lines.map((l) => ({ id: nid("i"), text: l.replace(/^- /, ""), ticked: false, chip: null, kids: [], listKind: "bullet", comments: [] })); if (!p.listIds.length) p.listIds.push(nid("l")); }
    else if (o.op === "setLaunchLine") { const p = proj(o.section, o.project), q = p.paras.find((x) => x.text.startsWith("Launch:")); if (q) q.text = o.text; else p.paras.push({ id: nid("p"), text: o.text }); }
    else if (o.op === "removeSection") m.sections.splice(m.sections.findIndex((s) => s.name === o.name), 1);
    else if (o.op === "setBacklogLinks") { const s = sec("Backlogs"); s.items = o.links.map((l) => ({ id: nid("i"), text: `[${l.label}](${l.url})`, ticked: false, chip: null, kids: [], listKind: "bullet", comments: [] })); if (!s.listIds.length) s.listIds.push(nid("l")); }
    else throw new Error(`the applier does not know ${o.op}`);
  }
  return m;
}
export const applyToXml = (xml, ops) => toXml(applyOps(parseStatusDoc(xml), ops));
