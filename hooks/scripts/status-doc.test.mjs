// DISC-310 (operator s82: "the doc needs be consistent, easy to maintain and scan"): the Status doc is read in its REAL Claude Docs shape.
// Fixture = a trimmed copy of the live read (rev 312): fragmented bold runs, inline comments, nested lists, checked items in place.
// Run: node --test hooks/scripts/status-doc.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseStatusDoc } from "./lib/status-doc.mjs";

import { LIVE } from "./fixtures/status-doc-live.mjs";
const doc = parseStatusDoc(LIVE);
const section = (n) => doc.sections.find((s) => s.name === n);
const project = (s, n) => section(s).projects.find((p) => p.name === n);

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
  const it = project("Waiting on you", "Portfolio").items[0];
  assert.equal(it.rowId, "PF-1585");
  assert.match(it.text, /^\*\*\(PF-1585\) Glow on images, round 4: ready for your look\.\*\*/);
  assert.equal(it.id, ".33589");
});
test("the chip is read by index and label; a tick is the checked attribute; inline comments are dropped", () => {
  const items = project("Waiting on you", "Portfolio").items;
  assert.deepEqual(items[0].chip, { index: 3, label: "Claude's on it" });
  assert.equal(items[0].ticked, false);
  assert.equal(items[1].rowId, "PF-1598"); assert.equal(items[1].ticked, true);
  assert.ok(!items[1].text.includes("comment"));
  assert.equal(project("Waiting on you", "Discipline").items[1].chip.index, 0);
});
test("nested bullets are kept under their item, two levels deep; a nested check list keeps its own ticks and chips", () => {
  const [glow, header, media] = project("Waiting on you", "Portfolio").items;
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
  assert.deepEqual(section("Backlogs").items.map((i) => i.text), ["[Portfolio](https://github.com/MrJarrad/jhd-vault/blob/main/projects/portfolio/portfolio-backlog.md)", "[Discipline](https://github.com/MrJarrad/jhd-vault/blob/main/projects/jhd-discipline/jhd-discipline-backlog.md)"]);
  const running = project("Running now", "Portfolio").items;
  assert.equal(running[1].rowId, "PF-1496", "an id in parentheses mid-line is the row id when none leads");
  assert.equal(project("Waiting on you", "Discipline").items[0].rowId, "DISC-303");
  assert.match(running[1].text, /PF-1496/);
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
