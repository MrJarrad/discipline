import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
/* A trimmed copy of the live Status doc read (rev 312), in the real Claude Docs xml shape. */
export const LIVE = readFileSync(fileURLToPath(new URL("./status-doc-live.xml", import.meta.url)), "utf8");

/* DISC-314: a doc ALREADY in the layout, built in the same real xml shape (headings as paragraphs, check lists, dropdown chips, fragmented bold runs).
   `sections` is { "Ready for you": { Portfolio: [item…] }, … }; an item is { id, chip: 0..3, ticked, text }. A project absent from a section's map gets
   "Nothing."; `noList: ["Done this session|Discipline"]` leaves that project with a heading and "Nothing." only; `omit` drops a project's heading. */
const CHIP_LABEL = ["Ready for you", "You're on it", "Done", "Claude's on it"];
export function layoutDoc({ today = "2026-11-12", base, launch = `Launch: 2 of 8 done · [Full go-live list](${base}/projects/portfolio/portfolio-go-live.md)`, sections = {}, omit = [] } = {}) {
  let n = 0;
  const id = (p) => `${p}${++n}`;
  const h = (t, lvl) => `<paragraph id='${id("h")}' heading='${lvl}'><text id='${id("t")}'>${t}</text></paragraph>`;
  const plain = (t) => `<paragraph id='${id("p")}'><text id='${id("t")}'>${t}</text></paragraph>`;
  const li = (t) => `<listItem id='${id("u")}'><paragraph id='${id("p")}'><text id='${id("t")}'>${t}</text></paragraph></listItem>`;
  const chipLi = (x) => `<listItem id='${x.id}' ${x.ticked ? "checked='true'" : ""}><paragraph id='p${x.id}'><dropdown id='d${x.id}' enum='e' index='${x.chip}'>${CHIP_LABEL[x.chip]}</dropdown><text id='${id("t")}'> </text><text id='${id("t")}'><bold>${x.text}</bold></text></paragraph></listItem>`;
  const names = ["Portfolio", "Discipline", "Handoff toolkit"];
  const projs = (sec) => names.map((name) => {
    if (omit.includes(`${sec}|${name}`)) return "";
    const items = sections[sec]?.[name];
    return h(name, 3) + (items?.length ? `<list id='${id("l")}' kind='check'>${items.map(chipLi).join("")}</list>` : plain("Nothing."));
  }).join("");
  const up = (name, lines) => h(name, 3) + `<list id='${id("l")}' kind='bullet'>${lines.map(li).join("")}</list>`;
  return `<doc node='n'><paragraph id='h1' heading='1'><text id='t'>Status</text></paragraph><paragraph id='d'><date id='dd' value='${today}'/><text id='t'> · </text></paragraph>`
    + ["Ready for you", "You're on it", "Claude's on it"].map((s) => h(s, 2) + projs(s)).join("")
    + h("Up next", 2) + h("Portfolio", 3) + plain(launch)
    + `<list id='u1' kind='bullet'>${["(PF-1505) Time Circuits still laggy", "(PF-1531) Glow sits on each piece of media", "(PF-1475) Grid on a phone: one image paints late", "(PF-1464) Import checklist records film length", "(PF-1391) Safari and iPhone"].map(li).join("")}</list>`
    + up("Discipline", ["(DISC-306) Plugin stale: more clearly", "(DISC-309) Another item", "(DISC-310) Status doc restructure", "(DISC-312) Twelfth", "(DISC-313) Thirteenth"]) + up("Handoff toolkit", ["Nothing."])
    + h("Done this session", 2) + projs("Done this session")
    + h("Backlogs", 2) + `<list id='bk' kind='bullet'>${["portfolio/portfolio", "jhd-discipline/jhd-discipline", "handoff-toolkit/handoff-toolkit"].map((x, i) => li(`<link href='${base}/projects/${x}-backlog.md'>${names[i]}</link>`)).join("")}</list></doc>`;
}
