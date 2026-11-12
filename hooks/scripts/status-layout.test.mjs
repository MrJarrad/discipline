// DISC-310 (operator s82, "yes" to the layout): queue-page-sync's layout plan turns the queue + backlog + go-live files and a read of the Status
// doc (real shape) into the edit ops that make the doc exactly the approved layout, with nothing hand-edited.
// Run: node --test hooks/scripts/status-layout.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { layoutPlan, displayName } from "./status-layout.mjs";
import { LIVE } from "./fixtures/status-doc-live.mjs";

const FM = (px, kind) => `---\nname: x\nkind: ${kind}\nprefix: ${px}\n---\n`;
const Q = "| # | Needed | Where | Why | Recommended |\n| - | - | - | - | - |\n";
const B = "| # | Item | Raised | Status |\n| - | --- | --- | --- |\n";
function vault() {
  const v = mkdtempSync(join(tmpdir(), "sl-"));
  const put = (p, t) => { mkdirSync(join(v, p, ".."), { recursive: true }); writeFileSync(join(v, p), t); };
  put("projects/portfolio/portfolio-queue.md", FM("PF", "queue") + Q + "| PF-1585 | Look at glow round 4 | | | |\n| PF-797 | Your final review before the holding screen lifts | | | |\n| PF-65 | Media for each case study | | | |\n| PF-1600 | Look at the new header | reply here | | |\n| ~~PF-1598~~ | ~~Header flicker~~ | | | |\n");
  put("projects/portfolio/portfolio-backlog.md", FM("PF", "backlog") + "## Open\n\n" + B + "| PF-1505 | Time Circuits lag | d | open |\n");
  put("projects/portfolio/portfolio-go-live.md", "---\nname: portfolio go-live\nkind: checklist\n---\n# Go-live\n\n## 1. Site bugs and polish\n\n- [x] PF-1507 · Glide fill\n- [ ] PF-1505 · Time Circuits still laggy\n- [ ] PF-1531 · Glow sits on each piece of media\n- [ ] PF-1475 · Grid on a phone: one image paints late\n\n## 2. Tests and tooling\n\n- [x] PF-1420 · Media import\n- [ ] PF-1464 · Import checklist records film length\n\n## 3. Checks before launch\n\n- [ ] PF-1391 · Safari and iPhone\n\n## 4. Launch steps\n\n- [ ] PF-1412 · Switch to live\n\n## 5. After launch\n\n- [ ] PF-1396 · Raise HTTPS setting\n");
  put("projects/jhd-discipline/jhd-discipline-queue.md", FM("DISC", "queue") + Q + "| DISC-311 | One short extra round on the Status item fix | | | |\n| ~~DISC-303~~ | ~~One tap per release~~ | | | |\n");
  put("projects/jhd-discipline/jhd-discipline-backlog.md", FM("DISC", "backlog") + "## Up next\n\n1. DISC-306 — first thing\n2. DISC-309\n3. DISC-310\n4. DISC-312\n5. DISC-313\n6. DISC-314\n\n## Open\n\n" + B + "| DISC-306 | Plugin stale: more clearly | d | open |\n| DISC-309 | Another item | d | open |\n| DISC-310 | Status doc restructure | d | open |\n| DISC-312 | Twelfth | d | open |\n| DISC-313 | Thirteenth | d | open |\n| DISC-314 | Fourteenth, past the top five | d | open |\n");
  put("projects/handoff-toolkit/handoff-toolkit-queue.md", FM("HT", "queue") + Q + "| HT-95 | Invite your friend to the toolkit | | | |\n");
  put("projects/handoff-toolkit/handoff-toolkit-backlog.md", FM("HT", "backlog") + "## Open\n\n" + B + "| HT-1 | something | d | open |\n");
  return v;
}
const BASE = "https://github.com/MrJarrad/jhd-vault/blob/main";
const plan = (extra = {}) => layoutPlan({ vault: vault(), prefixes: ["PF", "DISC", "HT"], docXml: LIVE, today: "2026-11-12", base: BASE, ...extra });
const ops = (p, name) => p.ops.filter((o) => o.op === name);

test("a project's heading name drops a leading jhd-, spaces the hyphens and capitalises the first letter", () => {
  assert.deepEqual(["portfolio", "jhd-discipline", "handoff-toolkit", "hoverboard"].map(displayName), ["Portfolio", "Discipline", "Handoff toolkit", "Hoverboard"]);
});
test("the date line is set to today when it differs", () => {
  assert.deepEqual(ops(plan(), "setDate"), [{ op: "setDate", id: ".16", value: "2026-11-12", why: "the doc's date line reads 2026-11-10" }]);
  assert.deepEqual(ops(plan({ docXml: LIVE.replace("2026-11-10", "2026-11-12") }), "setDate"), []);
});
test("Waiting on you: a ticked item or one whose row is closed MOVES to Done (never ticked in place); a missing open row is inserted under its project", () => {
  const p = plan();
  const moves = ops(p, "moveToDone").filter((o) => o.section === "Waiting on you");
  assert.deepEqual(moves.map((o) => [o.id, o.rowId, o.reason]), [[".40753", "PF-1598", "ticked"], [".38335", "DISC-303", "ticked"]]);
  assert.deepEqual(ops(p, "insertItem").filter((o) => o.section === "Waiting on you").map((o) => [o.project, o.afterId, o.rowId]), [["Portfolio", ".32090", "PF-1600"]]);
  assert.match(ops(p, "insertItem")[0].markdown, /^- \[ \] \[Ready for you\] \*\*\(PF-1600\) Look at the new header\. Waiting on you\.\*\*/);
});
test("Waiting on you: an open row already on the doc, with its bold id split into runs, is NOT added again", () => {
  const p = plan();
  for (const id of ["PF-1585", "PF-797", "PF-65", "DISC-311", "HT-95"]) assert.ok(!ops(p, "insertItem").some((o) => o.rowId === id), id);
});
test("Running now: a ticked line moves to Done; a missing project heading is inserted with Nothing.; a line with no id is reported unplaced only when it sits under no project", () => {
  const p = plan();
  assert.deepEqual(ops(p, "moveToDone").filter((o) => o.section === "Running now").map((o) => o.id), [".39741", ".39877"]);
  assert.deepEqual(ops(p, "insertProjectHeading").filter((o) => o.section === "Running now").map((o) => [o.name, o.afterId]), [["Handoff toolkit", ".39876"]]);
  assert.ok(ops(p, "insertNothing").some((o) => o.section === "Running now" && o.project === "Handoff toolkit"));
  assert.deepEqual(p.unplaced, []);
});
test("Up next: a section after Running now with each project's heading; Discipline reads the ordered ## Up next of its backlog, top five with their titles", () => {
  const p = plan();
  assert.deepEqual(ops(p, "insertSection").map((o) => [o.name, o.afterId]), [["Up next", ".39876"]]);
  const disc = ops(p, "setUpNext").find((o) => o.project === "Discipline");
  assert.deepEqual(disc.lines, ["- (DISC-306) Plugin stale: more clearly", "- (DISC-309) Another item", "- (DISC-312) Twelfth", "- (DISC-313) Thirteenth", "- (DISC-314) Fourteenth, past the top five"]);
  const ht = ops(p, "setUpNext").find((o) => o.project === "Handoff toolkit");
  assert.deepEqual(ht.lines, ["Nothing."]);
});
test("Up next: Portfolio comes from the go-live file (first unticked lines, never one already Waiting or Running: PF-1531 is Running) and carries the launch count with a link", () => {
  const p = plan();
  const pf = ops(p, "setUpNext").find((o) => o.project === "Portfolio");
  assert.deepEqual(pf.lines, ["- (PF-1505) Time Circuits still laggy", "- (PF-1475) Grid on a phone: one image paints late", "- (PF-1464) Import checklist records film length", "- (PF-1391) Safari and iPhone", "- (PF-1412) Switch to live"]);
  assert.deepEqual(ops(p, "setLaunchLine").map((o) => o.text), [`Launch: 2 of 8 done · [Full go-live list](${BASE}/projects/portfolio/portfolio-go-live.md)`]);
});
test("Done this session: the explanatory note goes; the Go-live section goes whole (its From you part duplicated Waiting on you)", () => {
  const p = plan();
  assert.deepEqual(ops(p, "removeNode").map((o) => o.id), [".11418"]);
  const rs = ops(p, "removeSection");
  assert.deepEqual(rs.map((o) => o.name), ["Go-live"]);
  assert.ok(rs[0].nodeIds.includes(".6675") && rs[0].nodeIds.includes(".9041") && rs[0].nodeIds.includes(".9213"));
});
test("Backlogs: one link per session project, in order, replacing a list that misses one", () => {
  const b = ops(plan(), "setBacklogLinks");
  assert.equal(b.length, 1);
  assert.deepEqual(b[0].links, [{ label: "Portfolio", url: `${BASE}/projects/portfolio/portfolio-backlog.md` }, { label: "Discipline", url: `${BASE}/projects/jhd-discipline/jhd-discipline-backlog.md` }, { label: "Handoff toolkit", url: `${BASE}/projects/handoff-toolkit/handoff-toolkit-backlog.md` }]);
  assert.equal(b[0].id, ".1613");
});
test("a doc already in the layout produces no ops (a second run is empty)", () => {
  const p = (t, lvl) => `<paragraph id='x${t}' heading='${lvl}'><text id='t'>${t}</text></paragraph>`;
  const plain = (id, t) => `<paragraph id='${id}'><text id='t'>${t}</text></paragraph>`;
  const li = (id, t, extra = "") => `<listItem id='${id}'${extra}><paragraph id='p${id}'><text id='t${id}'>${t}</text></paragraph></listItem>`;
  const bullets = (id, ...items) => `<list id='${id}' kind='bullet'>${items.join("")}</list>`;
  const ok = `<doc node='n'><paragraph id='h1' heading='1'><text id='t'>Status</text></paragraph><paragraph id='d'><date id='dd' value='2026-11-12'/><text id='t'> · </text></paragraph>`
    + p("Waiting on you", 2) + p("Portfolio", 3) + `<list id='lw1' kind='check'>${li("a", "**(PF-1585) Look at glow round 4. Waiting on you.**")}${li("b", "**(PF-797) Your final review before the holding screen lifts. Waiting on you.**")}${li("c", "**(PF-65) Media for each case study. Waiting on you.**")}${li("e", "**(PF-1600) Look at the new header. Waiting on you.**")}</list>`
    + p("Discipline", 3) + `<list id='lw2' kind='check'>${li("f", "**(DISC-311) One short extra round on the Status item fix. Waiting on you.**")}</list>` + p("Handoff toolkit", 3) + `<list id='lw3' kind='check'>${li("g", "**(HT-95) Invite your friend to the toolkit. Waiting on you.**")}</list>`
    + p("Running now", 2) + p("Portfolio", 3) + bullets("r1", li("r1a", "Nothing.")) + p("Discipline", 3) + bullets("r2", li("r2a", "Nothing.")) + p("Handoff toolkit", 3) + bullets("r3", li("r3a", "Nothing."))
    + p("Up next", 2) + p("Portfolio", 3) + plain("l", `Launch: 2 of 8 done · [Full go-live list](${BASE}/projects/portfolio/portfolio-go-live.md)`)
    + bullets("u1", ...["(PF-1505) Time Circuits still laggy", "(PF-1531) Glow sits on each piece of media", "(PF-1475) Grid on a phone: one image paints late", "(PF-1464) Import checklist records film length", "(PF-1391) Safari and iPhone"].map((t, i) => li(`u1${i}`, t)))
    + p("Discipline", 3) + bullets("u2", ...["(DISC-306) Plugin stale: more clearly", "(DISC-309) Another item", "(DISC-310) Status doc restructure", "(DISC-312) Twelfth", "(DISC-313) Thirteenth"].map((t, i) => li(`u2${i}`, t)))
    + p("Handoff toolkit", 3) + bullets("u3", li("u3a", "Nothing."))
    + p("Done this session", 2) + p("Backlogs", 2) + bullets("bk", ...["portfolio/portfolio", "jhd-discipline/jhd-discipline", "handoff-toolkit/handoff-toolkit"].map((x, i) => li(`bk${i}`, `<link href='${BASE}/projects/${x}-backlog.md'>${["Portfolio", "Discipline", "Handoff toolkit"][i]}</link>`)))
    + "</doc>";
  assert.deepEqual(plan({ docXml: ok }).ops, []);
});
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
test("CLI: prints the plan as JSON for a doc file and refuses an unknown project", () => {
  const v = vault(), dir = mkdtempSync(join(tmpdir(), "sld-")), f = join(dir, "doc.xml");
  writeFileSync(f, LIVE);
  const run = (projects) => spawnSync("node", [fileURLToPath(new URL("./status-layout.mjs", import.meta.url)), "--vault", v, "--projects", projects, "--doc", f, "--today", "2026-11-12"], { encoding: "utf8" });
  const ok = run("PF,DISC,HT");
  assert.equal(ok.status, 0, ok.stderr);
  const out = JSON.parse(ok.stdout);
  assert.ok(out.ops.some((o) => o.op === "setDate" && o.value === "2026-11-12"));
  assert.ok(out.ops.some((o) => o.op === "removeSection" && o.name === "Go-live"));
  assert.equal(run("ZZ").status, 1);
});
