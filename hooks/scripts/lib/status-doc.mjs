/* status-doc — DISC-310. Reads the operator's Status doc in the REAL shape the Claude Docs connector returns (the `xml` of a node read):
   headings are paragraphs carrying heading='1|2|3'; items are <listItem> in <list kind='check|bullet'>; the chip is a <dropdown index='N'>;
   bold arrives in many fragmented <bold> runs; <comment/> elements sit inside paragraphs; lists nest. Output is a plain model:
     { title, date, sections: [{ name, id, paras, items, projects: [{ name, id, paras, items }] }] }
   An item is { id, text, ticked, chip: {index, label}|null, rowId, kids: [item…] }; `text` is markdown with adjacent bold runs merged into one
   **…** span, links as [text](url), comments and the chip dropped. No imports beyond node built-ins. */
const ENT = { "&lt;": "<", "&gt;": ">", "&amp;": "&", "&quot;": '"', "&#39;": "'", "&apos;": "'" };
const decode = (s) => s.replace(/&(?:lt|gt|amp|quot|apos|#39);/g, (m) => ENT[m]);
const CHIPS = ["Ready for you", "You're on it", "Done", "Claude's on it"];

export function parseXml(xml) {
  const root = { name: "#root", attrs: {}, children: [] }, stack = [root];
  const re = /<(\/?)([A-Za-z][\w-]*)((?:\s+[\w:-]+=(?:'[^']*'|"[^"]*"))*)\s*(\/?)>|([^<]+)/g;
  for (let m; (m = re.exec(xml)); ) {
    if (m[5] !== undefined) { stack.at(-1).children.push({ name: "#text", text: decode(m[5]) }); continue; }
    if (m[1]) { if (stack.length > 1) stack.pop(); continue; }
    const attrs = {};
    for (const a of m[3].matchAll(/([\w:-]+)=(?:'([^']*)'|"([^"]*)")/g)) attrs[a[1]] = decode(a[2] ?? a[3]);
    const node = { name: m[2], attrs, children: [] };
    stack.at(-1).children.push(node);
    if (!m[4]) stack.push(node);
  }
  return root;
}

/* Inline segments of a paragraph: [{ t, bold }], skipping the chip, comments, dates and mentions. */
function segments(node, bold = false, out = []) {
  for (const c of node.children) {
    if (c.name === "#text") out.push({ t: c.text, bold });
    else if (c.name === "bold") segments(c, true, out);
    else if (c.name === "hardBreak") out.push({ t: " ", bold: false });
    else if (c.name === "link") { const inner = []; segments(c, bold, inner); out.push({ t: `[${inner.map((s) => s.t).join("")}](${c.attrs.href || ""})`, bold: false }); }
    else if (["dropdown", "comment", "date", "mention", "list"].includes(c.name)) continue;
    else segments(c, bold, out);
  }
  return out;
}
export function render(paragraph) {
  const segs = segments(paragraph), parts = [];
  for (let i = 0; i < segs.length; ) {
    if (!segs[i].bold) { parts.push(segs[i].t); i++; continue; }
    let j = i, run = "";
    while (j < segs.length && segs[j].bold) run += segs[j++].t;
    const lead = /^\s*/.exec(run)[0], trail = /\s*$/.exec(run)[0];
    const core = run.trim();
    parts.push(core ? `${lead}**${core}**${trail}` : run);
    i = j;
  }
  return parts.join("").replace(/\s+/g, " ").trim();
}

const ID = /^\**\(?([A-Z]{2,4}-\d+[a-z]?)\)?/;
function item(li) {
  const p = li.children.find((c) => c.name === "paragraph");
  const dd = p?.children.find((c) => c.name === "dropdown");
  const text = p ? render(p) : "";
  const kids = li.children.filter((c) => c.name === "list").flatMap((l) => l.children.filter((c) => c.name === "listItem").map(item));
  const index = dd ? Number(dd.attrs.index) : null;
  return { id: li.attrs.id, text, ticked: li.attrs.checked === "true", chip: dd ? { index, label: CHIPS[index] ?? decode(dd.children.map((c) => c.text || "").join("")) } : null, rowId: ID.exec(text)?.[1] ?? /\(([A-Z]{2,4}-\d+[a-z]?)\)/.exec(text)?.[1] ?? null, kids };
}

export function parseStatusDoc(xml) {
  const tree = parseXml(xml);
  const docNode = tree.children.find((c) => c.name === "doc") || tree;
  const out = { title: "", date: null, dateId: null, sections: [] };
  let section = null, project = null;
  for (const c of docNode.children) {
    /* every top-level node after a section heading belongs to it (nodeIds, last); a project's last node is tracked the same way */
    if (section && !(c.name === "paragraph" && Number(c.attrs.heading) === 2)) { section.nodeIds.push(c.attrs.id); section.last = c.attrs.id; if (project && !(c.name === "paragraph" && Number(c.attrs.heading) === 3)) project.last = c.attrs.id; }
    if (c.name === "paragraph") {
      const level = Number(c.attrs.heading) || 0, text = render(c);
      if (level === 1) { out.title = text; continue; }
      if (level === 2) { section = { name: text, id: c.attrs.id, paras: [], items: [], projects: [], listIds: [], nodeIds: [c.attrs.id], last: c.attrs.id }; project = null; out.sections.push(section); continue; }
      if (level === 3 && section) { project = { name: text, id: c.attrs.id, paras: [], items: [], listIds: [], last: c.attrs.id }; section.projects.push(project); continue; }
      const date = c.children.find((k) => k.name === "date");
      if (date && !section) { out.date = date.attrs.value; out.dateId = c.attrs.id; continue; }
      if (!text) continue;
      (project || section)?.paras.push({ id: c.attrs.id, text });
    } else if (c.name === "list" && section) {
      (project || section).listIds.push(c.attrs.id);
      (project || section).items.push(...c.children.filter((k) => k.name === "listItem").map(item));
    }
  }
  return out;
}
