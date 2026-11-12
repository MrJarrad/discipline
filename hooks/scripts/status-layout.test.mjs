// DISC-310 (operator s82, "yes" to the layout): queue-page-sync's layout plan turns the queue + backlog + go-live files and a read of the Status
// doc (real shape) into the edit ops that make the doc exactly the approved layout, with nothing hand-edited.
// Run: node --test hooks/scripts/status-layout.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { layoutPlan, displayName } from "./status-layout.mjs";
import { LIVE } from "./fixtures/status-doc-live.mjs";

const FM = (px, kind) => `---\nname: x\nkind: ${kind}\nprefix: ${px}\n---\n`;
const Q = "| # | Needed | Where | Why | Recommended |\n| - | - | - | - | - |\n";
const B = "| # | Item | Raised | Status |\n| - | --- | --- | --- |\n";
function vault({ hbOpen = true } = {}) {
  const v = mkdtempSync(join(tmpdir(), "sl-"));
  const put = (p, t) => { mkdirSync(join(v, p, ".."), { recursive: true }); writeFileSync(join(v, p), t); };
  put("projects/portfolio/portfolio-queue.md", FM("PF", "queue") + Q + "| PF-1585 | Look at glow round 4 | | | |\n| PF-797 | Your final review before the holding screen lifts | | | |\n| PF-65 | Media for each case study | | | |\n| PF-1600 | Look at the new header | reply here | | |\n| ~~PF-1598~~ | ~~Header flicker~~ | | | |\n| ~~PF-1596~~ | ~~Sharper board~~ | | | |\n");
  put("projects/portfolio/portfolio-backlog.md", FM("PF", "backlog") + "## Open\n\n" + B + "| PF-1505 | Time Circuits lag | d | open |\n");
  put("projects/portfolio/portfolio-go-live.md", "---\nname: portfolio go-live\nkind: checklist\n---\n# Go-live\n\n## 1. Site bugs and polish\n\n- [x] PF-1507 · Glide fill\n- [ ] PF-1505 · Time Circuits still laggy\n- [ ] PF-1531 · Glow sits on each piece of media\n- [ ] PF-1475 · Grid on a phone: one image paints late\n\n## 2. Tests and tooling\n\n- [x] PF-1420 · Media import\n- [ ] PF-1464 · Import checklist records film length\n\n## 3. Checks before launch\n\n- [ ] PF-1391 · Safari and iPhone\n\n## 4. Launch steps\n\n- [ ] PF-1412 · Switch to live\n\n## 5. After launch\n\n- [ ] PF-1396 · Raise HTTPS setting\n");
  put("projects/jhd-discipline/jhd-discipline-queue.md", FM("DISC", "queue") + Q + "| DISC-311 | One short extra round on the Status item fix | | | |\n| ~~DISC-303~~ | ~~One tap per release~~ | | | |\n| ~~DISC-999~~ | ~~A finished ask~~ | | | |\n| ~~DISC-304~~ | ~~Delete the test branch~~ | | | |\n");
  put("projects/jhd-discipline/jhd-discipline-backlog.md", FM("DISC", "backlog") + "## Up next\n\n1. DISC-306 — first thing\n2. DISC-309\n3. DISC-310\n4. DISC-312\n5. DISC-313\n6. DISC-314\n\n## Open\n\n" + B + "| DISC-306 | Plugin stale: more clearly | d | open |\n| DISC-309 | Another item | d | open |\n| DISC-310 | Status doc restructure | d | open |\n| DISC-312 | Twelfth | d | open |\n| DISC-313 | Thirteenth | d | open |\n| DISC-314 | Vault graph model migration, the rest of decision [[2026-11-02-vault-graph-model]] after the straggler tidy (jhd-vault #878): kind: and up: on every note and many more words follow here | d | open |\n");
  put("queue/mac/review/20261112T160000Z-delete-probe-branch.md", "---\nrepo: ~/JHD/ai/discipline/main\n---\nDelete the throwaway branch s81-vendor-probe (DISC-304). No background tasks, no subagents.\n");
  put("projects/hoverboard/hoverboard-queue.md", FM("HB", "queue") + Q + (hbOpen ? "| HB-1 | Pick the hover colour | | | |\n" : "| ~~HB-1~~ | ~~Pick the hover colour~~ | | | |\n"));
  put("projects/hoverboard/hoverboard-backlog.md", FM("HB", "backlog") + "## Open\n\n" + B + (hbOpen ? "| HB-2 | A hoverboard idea | d | open |\n" : ""));
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
// DISC-310 amendment (operator s82): the sections ARE the chip values: Ready for you, You're on it, Claude's on it, Up next, Done this session.
const move = (p, id) => p.ops.find((o) => (o.op === "move" || o.op === "replaceItem") && o.id === id);
test("every section is a chip value, in order, each with the three project headings; the sections they replace are removed once their items moved", () => {
  const p = plan();
  assert.deepEqual(ops(p, "insertSection").map((o) => [o.name, o.afterSection, o.projects]), [
    ["Ready for you", null, ["Portfolio", "Discipline", "Handoff toolkit"]], ["You're on it", "Ready for you", ["Portfolio", "Discipline", "Handoff toolkit"]],
    ["Claude's on it", "You're on it", ["Portfolio", "Discipline", "Handoff toolkit"]], ["Up next", "Claude's on it", ["Portfolio", "Discipline", "Handoff toolkit"]]]);
  assert.deepEqual(ops(p, "removeSection").map((o) => o.name), ["Waiting on you", "Running now", "Go-live"]);
  assert.ok(p.ops.findIndex((o) => o.op === "moveItem") < p.ops.findIndex((o) => o.op === "removeSection"), "items move before their old section goes");
});
test("an item's section follows its chip: Ready for you 0, You're on it 1, Claude's on it 3; a ticked item or a closed row goes to Done with chip Done", () => {
  const p = plan();
  const to = (id) => [move(p, id).to.section, move(p, id).to.project, move(p, id).chip ?? "kept", move(p, id).reason];
  assert.deepEqual(to(".32090"), ["Ready for you", "Portfolio", "kept", "layout"], "PF-797: its chip already says Ready, so the block just moves");
  assert.deepEqual(to(".31651"), ["You're on it", "Portfolio", "kept", "layout"], "PF-65, nested list moves with it");
  assert.deepEqual(to(".33589"), ["Claude's on it", "Portfolio", "kept", "layout"], "PF-1585");
  assert.deepEqual(to(".40753"), ["Done this session", "Portfolio", "Done", "ticked"], "PF-1598");
  assert.deepEqual(to(".38335"), ["Done this session", "Discipline", "Done", "ticked"], "DISC-303");
  assert.deepEqual(to(".43205"), ["Ready for you", "Discipline", "kept", "layout"], "DISC-311 is an open row here");
  const landed = move(plan({ docXml: LIVE.replace("(DISC-311)", "(DISC-999)") }), ".43205");
  assert.deepEqual([landed.to.section, landed.chip, landed.reason], ["Done this session", "Done", "landed"], "a Ready item whose row is struck in the vault goes to Done");
  assert.deepEqual(to(".39286"), ["Ready for you", "Handoff toolkit", "kept", "layout"], "HT-95");
});
test("running lines: a ticked one goes to Done; one with no chip lands in Claude's on it with the chip set", () => {
  const p = plan();
  assert.deepEqual([move(p, ".39741").to.section, move(p, ".39877").to.section], ["Done this session", "Done this session"]);
  const bare = move(p, ".42857");
  assert.deepEqual([bare.to.section, bare.to.project, bare.chip, bare.rowId], ["Claude's on it", "Portfolio", "Claude's on it", "PF-1496"]);
  assert.equal(move(p, ".43689").to.section, "Claude's on it");
});
test("an open row the doc lacks is inserted under Ready for you in the item format; one already on the doc with its bold id in runs is not", () => {
  const p = plan();
  assert.deepEqual(ops(p, "insertItem").map((o) => [o.section, o.project, o.rowId]), [["Ready for you", "Portfolio", "PF-1600"]]);
  assert.match(ops(p, "insertItem")[0].markdown, /^- \[ \] \[Ready for you\] \*\*\(PF-1600\) Look at the new header\. Waiting on you\.\*\*/);
});
test("an empty project in a section gets Nothing.", () => {
  const p = plan();
  const n = ops(p, "insertNothing").map((o) => `${o.section}|${o.project}`);
  assert.ok(n.includes("You're on it|Discipline") && n.includes("You're on it|Handoff toolkit") && n.includes("Claude's on it|Handoff toolkit") && n.includes("Done this session|Handoff toolkit"), n.join(", "));
  assert.ok(!n.includes("Ready for you|Portfolio"), "Portfolio has Ready items");
});
test("the operator flips a chip in the doc: the item moves to the matching section and an open queue row is banked as answered", () => {
  const flipped = `<doc node='n'><paragraph id='h1' heading='1'><text id='t'>Status</text></paragraph><paragraph id='d'><date id='dd' value='2026-11-12'/><text id='t'> · </text></paragraph>`
    + `<paragraph id='s1' heading='2'><text id='t'>Ready for you</text></paragraph><paragraph id='pp' heading='3'><text id='t'>Portfolio</text></paragraph><list id='l1' kind='check'><listItem id='i1'><paragraph id='x1'><dropdown id='dd1' enum='e' index='2'>Done</dropdown><text id='t'> </text><text id='t2'><bold>(PF-797) Your final review.</bold></text></paragraph></listItem><listItem id='i2'><paragraph id='x2'><dropdown id='dd2' enum='e' index='1'>You're on it</dropdown><text id='t'> </text><text id='t2'><bold>(PF-65) Media.</bold></text></paragraph></listItem><listItem id='i3'><paragraph id='x3'><dropdown id='dd3' enum='e' index='0'>Ready for you</dropdown><text id='t'> </text><text id='t2'><bold>(PF-1585) Look.</bold></text></paragraph></listItem></list></doc>`;
  const p = plan({ docXml: flipped });
  assert.deepEqual([move(p, "i1").to.section, move(p, "i1").reason], ["Done this session", "chip"]);
  assert.deepEqual([move(p, "i2").to.section, move(p, "i2").reason], ["You're on it", "chip"]);
  assert.equal(move(p, "i3"), undefined, "a Ready item with a Ready chip stays");
  assert.deepEqual(p.answered.sort(), ["PF-65", "PF-797"], "PF-1585 is untouched");
});
test("Up next: Discipline reads the ordered ## Up next of its backlog, top five with titles, skipping rows already Ready, You're on it or Claude's on it (DISC-310 is Claude's on it)", () => {
  const p = plan();
  const disc = ops(p, "setUpNext").find((o) => o.project === "Discipline");
  assert.deepEqual(disc.lines.slice(0, 4), ["- (DISC-306) Plugin stale: more clearly", "- (DISC-309) Another item", "- (DISC-312) Twelfth", "- (DISC-313) Thirteenth"]);
  const long = disc.lines[4].replace("- (DISC-314) ", "");
  assert.ok(!long.includes("[[") && !long.includes("]]"), "a wikilink reads as its plain text: " + long);
  assert.ok(long.startsWith("Vault graph model migration, the rest of decision 2026-11-02-vault-graph-model after the") && long.endsWith("…") && long.length <= 91, long);
  assert.ok(!/\bs…$/.test(long) && !/\(jhd…$/.test(long), "cut at a word boundary, not mid-word or inside a parenthesis: " + long);
  assert.deepEqual(ops(p, "setUpNext").find((o) => o.project === "Handoff toolkit").lines, ["Nothing."]);
});
test("Up next: Portfolio comes from the go-live file (first unticked lines, never one already in play: PF-1531 and PF-1505 are named by Claude's on it lines) with the launch count and a link", () => {
  const p = plan();
  assert.deepEqual(ops(p, "setUpNext").find((o) => o.project === "Portfolio").lines, ["- (PF-1475) Grid on a phone: one image paints late", "- (PF-1464) Import checklist records film length", "- (PF-1391) Safari and iPhone", "- (PF-1412) Switch to live", "- (PF-1396) Raise HTTPS setting"]);
  assert.deepEqual(ops(p, "setLaunchLine").map((o) => o.text), [`Launch: 2 of 8 done · [Full go-live list](${BASE}/projects/portfolio/portfolio-go-live.md)`]);
});
test("Done this session: the explanatory note goes; the Go-live section goes whole", () => {
  const p = plan();
  assert.deepEqual(ops(p, "removeNode").map((o) => o.id), [".11418"]);
  const rs = ops(p, "removeSection").find((o) => o.name === "Go-live");
  assert.ok(rs.nodeIds.includes(".6675") && rs.nodeIds.includes(".9041") && rs.nodeIds.includes(".9213"));
});
test("Backlogs: one link per session project, in order, replacing a list that misses one", () => {
  const b = ops(plan(), "setBacklogLinks");
  assert.equal(b.length, 1);
  assert.deepEqual(b[0].links, [{ label: "Portfolio", url: `${BASE}/projects/portfolio/portfolio-backlog.md` }, { label: "Discipline", url: `${BASE}/projects/jhd-discipline/jhd-discipline-backlog.md` }, { label: "Handoff toolkit", url: `${BASE}/projects/handoff-toolkit/handoff-toolkit-backlog.md` }, { label: "Hoverboard", url: `${BASE}/projects/hoverboard/hoverboard-backlog.md` }], "the doc's Hoverboard link stays while that project has open rows");
  assert.equal(b[0].id, ".1613");
  const gone = ops(layoutPlan({ vault: vault({ hbOpen: false }), prefixes: ["PF", "DISC", "HT"], docXml: LIVE, today: "2026-11-12", base: BASE }), "setBacklogLinks")[0];
  assert.deepEqual(gone.links.map((l) => l.label), ["Portfolio", "Discipline", "Handoff toolkit"]);
  assert.deepEqual(gone.dropped, ["Hoverboard"], "a link left out is named in the plan, never silent");
});
test("a doc already in the layout produces no ops (a second run is empty)", () => {
  let hn = 0;
  const h = (t, lvl) => `<paragraph id='h${++hn}' heading='${lvl}'><text id='t'>${t}</text></paragraph>`;
  const plain = (id, t) => `<paragraph id='${id}'><text id='t'>${t}</text></paragraph>`;
  const chipLi = (id, idx, label, text) => `<listItem id='${id}'><paragraph id='p${id}'><dropdown id='d${id}' enum='e' index='${idx}'>${label}</dropdown><text id='t'> </text><text id='t2'><bold>${text}</bold></text></paragraph></listItem>`;
  const li = (id, t) => `<listItem id='${id}'><paragraph id='p${id}'><text id='t${id}'>${t}</text></paragraph></listItem>`;
  const list = (id, kind, ...items) => `<list id='${id}' kind='${kind}'>${items.join("")}</list>`;
  const projs = (sec, byProject) => ["Portfolio", "Discipline", "Handoff toolkit"].map((n) => h(n, 3) + (byProject[n] || plain(`n${sec}${n}`, "Nothing."))).join("");
  const ok = `<doc node='n'><paragraph id='h1' heading='1'><text id='t'>Status</text></paragraph><paragraph id='d'><date id='dd' value='2026-11-12'/><text id='t'> · </text></paragraph>`
    + h("Ready for you", 2) + projs("r", { Portfolio: list("lr1", "check", chipLi("a", 0, "Ready for you", "(PF-1585) Look at glow round 4. Waiting on you."), chipLi("b", 0, "Ready for you", "(PF-797) Your final review before the holding screen lifts. Waiting on you."), chipLi("e", 0, "Ready for you", "(PF-1600) Look at the new header. Waiting on you.")), Discipline: list("lr2", "check", chipLi("f", 0, "Ready for you", "(DISC-311) One short extra round on the Status item fix. Waiting on you.")), "Handoff toolkit": list("lr3", "check", chipLi("g", 0, "Ready for you", "(HT-95) Invite your friend to the toolkit. Waiting on you.")) })
    + h("You're on it", 2) + projs("y", { Portfolio: list("ly1", "check", chipLi("m", 1, "You're on it", "(PF-65) Media for each case study. Waiting on you.")) })
    + h("Claude's on it", 2) + projs("c", {})
    + h("Up next", 2) + h("Portfolio", 3) + plain("l", `Launch: 2 of 8 done · [Full go-live list](${BASE}/projects/portfolio/portfolio-go-live.md)`)
    + list("u1", "bullet", ...["(PF-1505) Time Circuits still laggy", "(PF-1531) Glow sits on each piece of media", "(PF-1475) Grid on a phone: one image paints late", "(PF-1464) Import checklist records film length", "(PF-1391) Safari and iPhone"].map((t, i) => li(`u1${i}`, t)))
    + h("Discipline", 3) + list("u2", "bullet", ...["(DISC-306) Plugin stale: more clearly", "(DISC-309) Another item", "(DISC-310) Status doc restructure", "(DISC-312) Twelfth", "(DISC-313) Thirteenth"].map((t, i) => li(`u2${i}`, t)))
    + h("Handoff toolkit", 3) + list("u3", "bullet", li("u3a", "Nothing."))
    + h("Done this session", 2) + projs("d", {})
    + h("Backlogs", 2) + list("bk", "bullet", ...["portfolio/portfolio", "jhd-discipline/jhd-discipline", "handoff-toolkit/handoff-toolkit"].map((x, i) => li(`bk${i}`, `<link href='${BASE}/projects/${x}-backlog.md'>${["Portfolio", "Discipline", "Handoff toolkit"][i]}</link>`)))
    + "</doc>";
  assert.deepEqual(plan({ docXml: ok }).ops, []);
});
// DISC-310 round 2 (review of #192, session_019vvsL13jPRvdiiXyyekYaH)
test("RED 1: a delete+insert op carries the WHOLE item (every child, chip and tick) so nothing is lost at the destination; PF-65's checklist and PF-1598's Problem/Decision travel", () => {
  const ticked = LIVE.replace("<listItem id='.31651' rev='269' h='3a0af54e'>", "<listItem id='.31651' rev='269' h='3a0af54e' checked='true'>");
  const pf65 = plan({ docXml: ticked }).ops.find((o) => o.op === "replaceItem" && o.id === ".31651");
  assert.equal(pf65.chip, "Done");
  assert.ok(pf65.markdown.startsWith("- [x] [Done] **(PF-65) Media for each case study.**"), pf65.markdown);
  assert.ok(pf65.markdown.includes("\n  - [x] [Done] Yardsale") && pf65.markdown.includes("\n  - [ ] [You're on it] Sabina Savage"), "the nested checklist keeps its ticks and chips");
  const pf1598 = plan().ops.find((o) => o.op === "replaceItem" && o.id === ".40753");
  for (const t of ["\n  - **Problem:** the card title shown in the header caught the pointer.", "\n  - **Decision:** while a card is held", "\n    - **Recommended:** keep it unclickable.", "\n    - **Alternative:** keep it clickable another way."]) assert.ok(pf1598.markdown.includes(t), t);
});
test("amber 3: a section move that needs no new chip is the connector's `move` (keeps block ids, children, comment threads); delete+insert (`replaceItem`) only where the chip itself changes", () => {
  const p = plan();
  const pf65 = p.ops.find((o) => o.id === ".31651"), pf797 = p.ops.find((o) => o.id === ".32090"), pf1598 = p.ops.find((o) => o.id === ".40753");
  assert.deepEqual([pf65.op, pf65.to.section, pf65.kids], ["move", "You're on it", 2]);
  assert.deepEqual([pf797.op, pf797.to.section, pf797.kids], ["move", "Ready for you", 0]);
  assert.equal(pf1598.op, "replaceItem", "its chip must become Done");
});
test("amber 3: the plan names every comment thread an op would drop; an answered one is listed, an UNANSWERED one refuses the op", () => {
  const p = plan();
  const dropped = p.droppedComments.map((c) => `${c.id}|${c.op}`);
  for (const d of ["9f8eaeb7-56b8|replaceItem", "b60a38fc-e0cf|removeNode", "6686672e-610e|removeSection", "bb7a2b05-65bd|removeDuplicate"]) assert.ok(dropped.includes(d), d + " in " + dropped.join(", "));
  assert.ok(p.droppedComments.every((c) => c.answered === true));
  const bad = plan({ docXml: LIVE.replace("<comment id='9f8eaeb7-56b8' to='claude' answered='true'/><text id='.40756'>", "<comment id='9f8eaeb7-56b8' to='claude'/><text id='.40756'>") });
  assert.ok(!bad.ops.some((o) => o.id === ".40753"), "PF-1598 is not deleted over an unanswered thread");
  assert.deepEqual(bad.refused.filter((r) => r.id).map((r) => [r.id, r.rowId, r.reason]), [[".40753", "PF-1598", "unanswered comment thread"]]);
  assert.ok(bad.refused.some((r) => r.section === "Waiting on you" && /still holds/.test(r.reason)), "the old section is not removed while it still holds that item");
  assert.ok(!bad.ops.some((o) => o.op === "removeSection" && o.name === "Waiting on you"));
  const gl = plan({ docXml: LIVE.replace("<comment id='6686672e-610e' to='claude' answered='true'/><text id='.9026'>", "<comment id='6686672e-610e' to='claude'/><text id='.9026'>") });
  assert.ok(!gl.ops.some((o) => o.op === "removeSection" && o.name === "Go-live"));
  assert.ok(gl.refused.some((r) => r.section === "Go-live"), "the Go-live section is refused, not removed");
});
test("amber 4: one row, one section: a row on the doc twice keeps the live lane's item and the other copy is removed (PF-1596: the ticked Waiting copy goes, the Claude's-on-it line stays)", () => {
  const p = plan();
  assert.deepEqual(ops(p, "removeDuplicate").map((o) => [o.id, o.rowId, o.keptId]).filter((x) => x[1] === "PF-1596"), [[".35506", "PF-1596", ".39504"]]);
  assert.ok(!p.ops.some((o) => o.id === ".35506" && o.op !== "removeDuplicate"), "the duplicate is not also moved to Done");
  assert.equal(move(p, ".39504").to.section, "Claude's on it");
});
test("amber 4: a row with Mac work still queued (a pending, review or running job names it) is never Done: DISC-304 stays in Claude's on it, once", () => {
  const p = plan();
  assert.deepEqual(ops(p, "removeDuplicate").filter((o) => o.rowId === "DISC-304").map((o) => [o.id, o.keptId]), [[".38721", ".40125"]]);
  assert.equal(move(p, ".40125").to.section, "Claude's on it");
  assert.deepEqual(p.holds, [{ rowId: "DISC-304", job: "queue/mac/review/20261112T160000Z-delete-probe-branch.md" }]);
  const alone = `<doc node='n'><paragraph id='h1' heading='1'><text id='t'>Status</text></paragraph><paragraph id='h2' heading='2'><text id='t'>Ready for you</text></paragraph><paragraph id='h3' heading='3'><text id='t'>Discipline</text></paragraph><list id='l' kind='check'><listItem id='i' checked='true'><paragraph id='x'><dropdown id='dd' enum='e' index='3'>Claude's on it</dropdown><text id='t'> </text><text id='t2'><bold>(DISC-304) Delete the test branch.</bold></text></paragraph></listItem></list></doc>`;
  const q = plan({ docXml: alone });
  assert.deepEqual([move(q, "i").to.section, move(q, "i").reason], ["Claude's on it", "pending"], "ticked, but its work is not done");
});
test("note 5: an item sent to Done whose lane text says it is still being worked on is flagged for a rewrite", () => {
  const p = plan();
  assert.equal(p.ops.find((o) => o.id === ".39741").staleText, false, "'fix ready, link in Waiting on you' is a result, not a lane in flight");
  const building = plan({ docXml: LIVE.replace("<listItem id='.42857' rev='309' h='f01939b7'>", "<listItem id='.42857' rev='309' h='f01939b7' checked='true'>") });
  assert.equal(building.ops.find((o) => o.id === ".42857").staleText, true, "'building, helper session_…' goes to Done verbatim otherwise");
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
  writeFileSync(f, LIVE.replace("(DISC-311)", "(DISC-777)"));
  assert.match(run("PF,DISC,HT").stderr, /DISC-777.*stale|stale.*DISC-777/i, "a row the vault does not hold is called out on stderr");
});

// s82 (parent: DISC-311 is open in the parent's vault but this run called it landed): a row the vault does not hold at all is UNKNOWN, never landed.
test("an item whose row id is in no queue or backlog file the run can see stays put and is reported as unknown (a stale vault checkout is not a landed row)", () => {
  const p = plan({ docXml: LIVE.replace("(DISC-311)", "(DISC-777)") });
  const m = move(p, ".43205");
  assert.deepEqual([m.to.section, m.reason], ["Ready for you", "layout"], "it keeps its chip's section, it is not sent to Done");
  assert.deepEqual(p.unknown, ["DISC-777"]);
  assert.deepEqual(plan().unknown, [], "every id in the fixture doc is known to the vault (open or struck)");
});
test("a backlog row marked done counts as known and landed", () => {
  const v = vault();
  writeFileSync(join(v, "projects/jhd-discipline/jhd-discipline-backlog.md"), readFileSync(join(v, "projects/jhd-discipline/jhd-discipline-backlog.md"), "utf8") + "| DISC-888 | an old item | d | done (MrJarrad/discipline#1) |\n");
  const p = layoutPlan({ vault: v, prefixes: ["PF", "DISC", "HT"], docXml: LIVE.replace("(DISC-311)", "(DISC-888)"), today: "2026-11-12", base: BASE });
  assert.equal(move(p, ".43205").reason, "landed");
});
