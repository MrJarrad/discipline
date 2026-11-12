// DISC-310 (operator s82: "the doc needs be consistent, easy to maintain and scan"): the Status doc is read in its REAL Claude Docs shape.
// Fixture = a trimmed copy of the live read (rev 312): fragmented bold runs, inline comments, nested lists, checked items in place.
// Run: node --test hooks/scripts/status-doc.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseStatusDoc, toMarkdown } from "./lib/status-doc.mjs";

import { LIVE } from "./fixtures/status-doc-live.mjs";
const doc = parseStatusDoc(LIVE);
const section = (n) => doc.sections.find((s) => s.name === n);
const project = (s, n) => section(s).projects.find((p) => p.name === n);
const row = (s, n, id) => project(s, n).items.find((i) => i.rowId === id);

test("sections come in document order, each with its heading node id", () => {
  assert.deepEqual(doc.sections.map((s) => s.name), ["Waiting on you", "Running now", "Done this session", "Go-live", "Backlogs"]);
  assert.equal(section("Waiting on you").id, ".132");
  assert.equal(doc.title, "Status");
});
test("project headings are the level-3 names, in order, per section; a section can lack one (Running now has no Handoff toolkit)", () => {
  assert.deepEqual(section("Waiting on you").projects.map((p) => p.name), ["Portfolio", "Discipline", "Handoff toolkit"]);
  assert.deepEqual(section("Running now").projects.map((p) => p.name), ["Portfolio", "Discipline"]);
  assert.equal(project("Waiting on you", "Discipline").id, ".39258");
});
test("a bold id split across runs reads as one id and one bold span", () => {
  const it = row("Waiting on you", "Portfolio", "PF-1585");
  assert.equal(it.rowId, "PF-1585");
  assert.match(it.text, /^\*\*\(PF-1585\) Glow on images, round 4: ready for your look\.\*\*/);
  assert.equal(it.id, ".33589");
});
test("the chip is read by index and label; a tick is the checked attribute; inline comments are dropped", () => {
  const [glow, hdr] = ["PF-1585", "PF-1598"].map((id) => row("Waiting on you", "Portfolio", id));
  assert.deepEqual(glow.chip, { index: 3, label: "Claude's on it" });
  assert.equal(glow.ticked, false);
  assert.equal(hdr.rowId, "PF-1598"); assert.equal(hdr.ticked, true);
  assert.ok(!hdr.text.includes("comment"));
  assert.equal(row("Waiting on you", "Discipline", "DISC-311").chip.index, 0);
});
test("nested bullets are kept under their item, two levels deep; a nested check list keeps its own ticks and chips", () => {
  const [glow, header, media] = ["PF-1585", "PF-1598", "PF-65"].map((id) => row("Waiting on you", "Portfolio", id));
  assert.deepEqual(glow.kids.map((k) => k.text.replace(/\*\*/g, "").split(":")[0]), ["Problem", "Solution", "[Open round 4](https"]);
  const decision = header.kids.find((k) => k.text.startsWith("**Decision:**"));
  assert.deepEqual(decision.kids.map((k) => k.text.replace(/\*\*/g, "").split(":")[0]), ["Recommended", "Alternative"]);
  assert.deepEqual(media.kids.map((k) => [k.text.trim(), k.ticked, k.chip.label]), [["Yardsale", true, "Done"], ["Sabina Savage", false, "You're on it"]]);
});
test("the date paragraph and the Done-this-session note are read; Go-live headings keep their text across split runs", () => {
  assert.equal(doc.date, "2026-11-10");
  assert.deepEqual(section("Done this session").paras.map((p) => p.text), ["Cleared at the end of each session; the vault keeps the record."]);
  const gl = section("Go-live");
  assert.equal(gl.paras[0].text.startsWith("Launch happens when every box in steps 1–4 is ticked"), true);
  assert.deepEqual(gl.projects.map((p) => p.name), ["1. Site bugs and polish (30)", "2. From you (3)", "3. Checks before launch (5)"]);
});
test("backlog links and plain lines (a running line with no item id) are read", () => {
  assert.deepEqual(section("Backlogs").items.map((i) => i.text), ["[Portfolio](https://github.com/MrJarrad/jhd-vault/blob/main/projects/portfolio/portfolio-backlog.md)", "[Discipline](https://github.com/MrJarrad/jhd-vault/blob/main/projects/jhd-discipline/jhd-discipline-backlog.md)", "[Hoverboard](https://github.com/MrJarrad/jhd-vault/blob/main/projects/hoverboard/hoverboard-backlog.md)"]);
  const running = project("Running now", "Portfolio").items;
  const bare = running.find((i) => i.rowId === "PF-1496");
  assert.equal(bare.chip, null);
  assert.equal(project("Waiting on you", "Discipline").items[0].rowId, "DISC-303", "an id in parentheses mid-line is the row id when none leads");
  assert.match(bare.text, /PF-1496/);
  assert.equal(running[0].chip.label, "Claude's on it");
});
test("node ids the layout plan needs: the date paragraph, every node of a section, and the last node of a section and of a project", () => {
  assert.equal(doc.dateId, ".16");
  const gl = section("Go-live");
  assert.equal(gl.nodeIds[0], ".6675");
  assert.ok(gl.nodeIds.includes(".9041") && gl.nodeIds.includes(".9213"), "its lists are nodes of the section");
  assert.equal(gl.nodeIds.at(-1), ".9213");
  assert.equal(section("Waiting on you").last, "mqr6t9fdtnv.2", "the blank spacer paragraph is the last node before Running now");
  assert.equal(project("Waiting on you", "Portfolio").last, ".31650".replace(".31650", ".33588"));
  assert.equal(project("Running now", "Discipline").last, ".39876");
});

// DISC-310 round 2 (review of #192): a moved item carries its children; comment threads are named, never silently dropped.
test("an item's comment threads are collected from its own paragraph and every nested one, once each, with their answered state", () => {
  const [glow, header] = ["PF-1585", "PF-1598"].map((id) => row("Waiting on you", "Portfolio", id));
  assert.deepEqual(glow.comments, [{ id: "e20c655e-54dc", answered: true }, { id: "c4040c7b-cbdc", answered: true }]);
  assert.deepEqual(header.comments, [{ id: "9f8eaeb7-56b8", answered: true }]);
  assert.deepEqual(row("Waiting on you", "Portfolio", "PF-797").comments, []);
  const unanswered = parseStatusDoc(LIVE.replace("<comment id='9f8eaeb7-56b8' to='claude' answered='true'/><text id='.40756'>", "<comment id='9f8eaeb7-56b8' to='claude'/><text id='.40756'>"));
  assert.equal(unanswered.sections[0].projects[0].items.find((i) => i.rowId === "PF-1598").comments[0].answered, false, "a comment without answered='true' is unanswered");
});
test("sections and their paragraphs carry their comment threads (the Done note, the Go-live headings and items)", () => {
  assert.deepEqual(section("Done this session").comments, [{ id: "b60a38fc-e0cf", answered: true }]);
  assert.deepEqual(section("Go-live").comments, [{ id: "6686672e-610e", answered: true }]);
});
test("toMarkdown renders an item with ALL its children: chips, ticks, bullets and nested checklists, two levels deep", () => {
  const [glow, header, media] = ["PF-1585", "PF-1598", "PF-65"].map((id) => row("Waiting on you", "Portfolio", id));
  assert.equal(toMarkdown(media), [
    "- [ ] [You're on it] **(PF-65) Media for each case study.** Drop: media/projects/<project>/ with grid row order.",
    "  - [x] [Done] Yardsale",
    "  - [ ] [You're on it] Sabina Savage"].join("\n"));
  assert.deepEqual(toMarkdown(header).split("\n").slice(0, 2), ["- [x] [Claude's on it] **(PF-1598) Header flicker fix. You said yes (title stays unclickable); in review, then merge.**", "  - **Problem:** the card title shown in the header caught the pointer."]);
  assert.ok(toMarkdown(header).includes("\n    - **Recommended:** keep it unclickable.\n    - **Alternative:** keep it clickable another way."));
  assert.ok(toMarkdown(glow).includes("\n  - [Open round 4](https://preview-pf-1531-media-layer-glow-r4-jhd-preview-staging.jh-229.workers.dev/?time-circuits=on), let Time Circuits land."));
});
