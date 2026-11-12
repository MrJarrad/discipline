// DISC-288: the pinned checklist mirrors the queue files; this script says what a session must change on it.
// Run: node --test hooks/scripts/queue-page-sync.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { syncPlan } from "./queue-page-sync.mjs";

const script = fileURLToPath(new URL("./queue-page-sync.mjs", import.meta.url));
const FM = (px, kind) => `---\nname: x\nkind: ${kind}\nprefix: ${px}\n---\n`;
function vault() {
  const v = mkdtempSync(join(tmpdir(), "qps-"));
  const put = (p, t) => { mkdirSync(join(v, p, ".."), { recursive: true }); writeFileSync(join(v, p), t); };
  put("projects/portfolio/portfolio-queue.md", FM("PF", "queue") + "| # | Needed | Where | Why | Recommended |\n| - | - | - | - | - |\n| PF-5 | look at footer | | | |\n| PF-6 | pick hero | | | |\n| ~~PF-7~~ | struck | | | |\n");
  put("projects/portfolio/portfolio-backlog.md", FM("PF", "backlog") + "## Open\n\n| # | Item | Raised | Status |\n| - | --- | --- | --- |\n| PF-8 | idea | d | waiting on operator |\n\n## Done\n\n| # | Item | Raised | Status |\n| - | --- | --- | --- |\n");
  return v;
}
const DOC = `# Needed from you

## Waiting on you

- [ ] **PF-5** look at footer
- [x] **PF-6** pick hero
- [ ] **PF-4** old row, since answered

## Running now

- [ ] D2 status out of the thread (session_019vvsKxkt4YUc2iRJhzm8jJ)
- [ ] A lane with no helper named

## Done this session

- [x] **PF-3** earlier
`;

test("open queue and waiting-backlog rows become checklist lines, row id first in bold; struck rows do not", () => {
  const p = syncPlan({ vault: vault(), prefixes: ["PF"] });
  assert.deepEqual(p.items, ["- [ ] **PF-5** look at footer", "- [ ] **PF-6** pick hero", "- [ ] **PF-8** idea"]);
});
test("against the live doc: missing open rows to add, landed rows to tick, his ticks to bank as answers", () => {
  const p = syncPlan({ vault: vault(), prefixes: ["PF"], docText: DOC });
  assert.deepEqual(p.toAdd, ["- [ ] **PF-8** idea"]);
  assert.deepEqual(p.toTick, ["PF-4"], "unticked on the page but no longer open in the queue");
  assert.deepEqual(p.answered, ["PF-6"], "ticked on the page while the queue row is still open");
});
test("every Running now item is listed for a helper check; a named session id is carried, none is flagged", () => {
  const p = syncPlan({ vault: vault(), prefixes: ["PF"], docText: DOC });
  assert.deepEqual(p.running, [
    { text: "D2 status out of the thread (session_019vvsKxkt4YUc2iRJhzm8jJ)", sessions: ["session_019vvsKxkt4YUc2iRJhzm8jJ"] },
    { text: "A lane with no helper named", sessions: [] },
  ]);
});
test("DISC-288 (operator s77: \"clear it at each sessions end\"): every Done this session item is listed so wrap can empty the section", () => {
  const p = syncPlan({ vault: vault(), prefixes: ["PF"], docText: DOC });
  assert.deepEqual(p.clearAtWrap, ["- [x] **PF-3** earlier"]);
});
test("CLI prints the plan as JSON and refuses an unknown project", () => {
  const v = vault(); const f = join(v, "doc.md"); writeFileSync(f, DOC);
  const ok = spawnSync("node", [script, "--vault", v, "--projects", "PF", "--doc", f], { encoding: "utf8" });
  assert.equal(ok.status, 0, ok.stderr);
  assert.deepEqual(JSON.parse(ok.stdout).toTick, ["PF-4"]);
  assert.equal(spawnSync("node", [script, "--vault", v, "--projects", "ZZ"], { encoding: "utf8" }).status, 1);
});

test("DISC-290 (operator s78: \"can we clear done at the end of each session too\"): a ticked Waiting on you item whose row is closed is cleared at wrap; a ticked one still open is banked first", () => {
  const doc = DOC.replace("- [ ] **PF-4** old row, since answered", "- [x] **PF-4** old row, since answered");
  const p = syncPlan({ vault: vault(), prefixes: ["PF"], docText: doc });
  assert.deepEqual(p.clearAtWrap, ["- [x] **PF-4** old row, since answered", "- [x] **PF-3** earlier"]);
  assert.deepEqual(p.answered, ["PF-6"], "PF-6 is ticked but its row is open: bank it, never clear it unbanked");
  assert.ok(!p.clearAtWrap.some((l) => l.includes("PF-6")));
});

// DISC-297 (operator s80: "Generally we may be getting a bit granular with reviews"; "i'm getting a bit confused with what i should be looking at").
const DOC297 = `# Needed from you

## Waiting on you

- [ ] **PF-5** Look now: footer round 3 https://p.example/r3 — Status: Ready for you
- [ ] **PF-6** pick hero, round 1 https://p.example/a, round 2 https://p.example/b — Status: Ready for you
- [x] **PF-4** old row, since answered — Status: Done
- [ ] **PF-8** idea
- [ ] **PF-9** (lane: footer) second ask on the footer — Status: Ready for you
- [ ] **PF-10** (lane: footer) third ask on the footer — Status: Claude's on it

## Running now

- [ ] footer round 4 (session_019vvsKxkt4YUc2iRJhzm8jJ) — Status: Claude's on it
- [ ] a lane with no chip (session_019vvsKyTCE2owmQkRCwS64c)

## Done this session

- [x] **PF-3** earlier — Status: Done
`;
test("DISC-297 (a): a Waiting or Running item with no Status chip is flagged; Done items need none", () => {
  const p = syncPlan({ vault: vault(), prefixes: ["PF"], docText: DOC297 });
  assert.deepEqual(p.noStatus, ["PF-8", "a lane with no chip (session_019vvsKyTCE2owmQkRCwS64c)"]);
});
test("DISC-297 (b): a Waiting item carrying two links is an appended round, flagged to be replaced", () => {
  const p = syncPlan({ vault: vault(), prefixes: ["PF"], docText: DOC297 });
  assert.deepEqual(p.appended, ["PF-6"]);
});
test("DISC-297 (c): two open Waiting items on one lane are flagged for one combined look row", () => {
  const p = syncPlan({ vault: vault(), prefixes: ["PF"], docText: DOC297 });
  assert.deepEqual(p.sameLane, [{ lane: "footer", ids: ["PF-9", "PF-10"] }]);
});
test("DISC-297 (d): an answered item leaves Waiting on you the same turn: ticked or closed items are listed in leaveWaiting", () => {
  const p = syncPlan({ vault: vault(), prefixes: ["PF"], docText: DOC297 });
  assert.deepEqual(p.leaveWaiting, ["PF-4", "PF-9", "PF-10"], "PF-4 ticked; PF-9 and PF-10 are not open rows in this vault");
  const q = syncPlan({ vault: vault(), prefixes: ["PF"], docText: DOC });
  assert.deepEqual(q.leaveWaiting, ["PF-6", "PF-4"], "the ticked PF-6 (answered, row still open) and the closed PF-4");
});
test("DISC-297: a plan against no doc carries the new fields empty", () => {
  const p = syncPlan({ vault: vault(), prefixes: ["PF"] });
  assert.deepEqual([p.noStatus, p.appended, p.sameLane, p.leaveWaiting], [[], [], [], []]);
});

// DISC-297 correction (parent s81): the pinned doc's Status is a real dropdown chip. A Claude Docs read returns each item as
// <listItem><paragraph><dropdown enum=… index=…>Value</dropdown><text> …</text></paragraph></listItem>, entity-escaped.
const li = (chip, text, extra = "") => `&lt;listItem id='.1'${extra}&gt;&lt;paragraph&gt;${chip === null ? "" : `&lt;dropdown id='.2' enum='bc09b9b4-c14e' index='1'&gt;${chip}&lt;/dropdown&gt;`}&lt;text&gt; ${text}&lt;/text&gt;&lt;/paragraph&gt;&lt;/listItem&gt;`;
// The real Status doc heading shape (parent s81): a paragraph carrying heading='N', not a <heading> element.
const heading = (t, n = 2) => `&lt;paragraph id='.9' h='${t.length}' heading='${n}'&gt;${t}&lt;/paragraph&gt;`;
const CHIPDOC = [heading("Waiting on you"), li("Ready for you", "**PF-5** look at footer https://p.example/r3"), li(null, "**PF-8** idea"), li("Done", "**PF-4** old row", " checked='true'"),
  heading("Running now"), li("Claude's on it", "footer round 4 (session_019vvsKxkt4YUc2iRJhzm8jJ)"), li(null, "a lane with no chip")].join("\n");
test("DISC-297: the Status chip is read from the dropdown shape of a Claude Docs read", () => {
  const p = syncPlan({ vault: vault(), prefixes: ["PF"], docText: CHIPDOC });
  assert.deepEqual(p.noStatus, ["PF-8", "a lane with no chip"]);
  assert.deepEqual(p.running.map((r) => r.sessions), [["session_019vvsKxkt4YUc2iRJhzm8jJ"], []]);
  assert.deepEqual(p.leaveWaiting, ["PF-4"], "a checked item leaves Waiting");
});
test("DISC-297: an unescaped dropdown read gives the same plan", () => {
  const raw = CHIPDOC.replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  assert.deepEqual(syncPlan({ vault: vault(), prefixes: ["PF"], docText: raw }).noStatus, ["PF-8", "a lane with no chip"]);
});
test("DISC-297: end to end, a Claude Docs item holding two links is flagged appended and one holding a single link is not", () => {
  const two = li("Ready for you", "**PF-5** round 1 &lt;link href='https://p.example/a'&gt;a&lt;/link&gt; round 2 &lt;link href='https://p.example/b'&gt;b&lt;/link&gt;");
  const one = li("Ready for you", "**PF-6** &lt;link href='https://p.example/c'&gt;c&lt;/link&gt;");
  const p = syncPlan({ vault: vault(), prefixes: ["PF"], docText: [heading("Waiting on you"), two, one].join("\n") });
  assert.deepEqual(p.appended, ["PF-5"]);
});

// DISC-302 (operator s81: "can you make sure status in the needed from you doc get updated with responses") and
// DISC-305 (operator s81: "I think status is correct"; "a way to group different projects within the doc may be worthwhile").
const GROUPED = `# Status

## Waiting on you

### PF — portfolio

- [ ] **PF-5** Look now: footer https://p.example/r3 [Ready for you]
- [x] **PF-6** pick hero [Ready for you]
- [ ] **PF-4** old row, since landed [Claude's on it]

### HB — hoverboard

- [ ] **PF-9** filed under the wrong project [Ready for you]

## Running now

### PF — portfolio

- [ ] footer round 4 (session_019vvsKxkt4YUc2iRJhzm8jJ) [Claude's on it]

## Done this session

- [x] **PF-3** earlier [Done]
`;
test("DISC-305: the plan names each session project's heading and where a missing open row is placed", () => {
  const p = syncPlan({ vault: vault(), prefixes: ["PF"], docText: GROUPED });
  assert.deepEqual(p.projects, [{ prefix: "PF", heading: "### PF — portfolio" }]);
  assert.deepEqual(p.toAddUnder, [{ id: "PF-8", under: "### PF — portfolio" }]);
});
test("DISC-305: a Waiting item under another project's heading, or under none when the doc groups by project, is misfiled", () => {
  const p = syncPlan({ vault: vault(), prefixes: ["PF"], docText: GROUPED });
  assert.deepEqual(p.misfiled, [{ id: "PF-9", under: "### HB — hoverboard", belongsTo: "PF" }]);
  const flat = syncPlan({ vault: vault(), prefixes: ["PF"], docText: DOC });
  assert.deepEqual(flat.misfiled, [], "a doc with no project headings at all is not flagged item by item");
  assert.equal(flat.needsProjectHeadings, true);
  assert.equal(p.needsProjectHeadings, false);
});
test("DISC-305: a Running now item carries the project of the heading it sits under", () => {
  const p = syncPlan({ vault: vault(), prefixes: ["PF"], docText: GROUPED });
  assert.deepEqual(p.running, [{ text: "footer round 4 (session_019vvsKxkt4YUc2iRJhzm8jJ) [Claude's on it]", sessions: ["session_019vvsKxkt4YUc2iRJhzm8jJ"], project: "PF" }]);
});
test("DISC-302: every answered or landed Waiting item whose chip is not Done gets a chip change to Done", () => {
  const p = syncPlan({ vault: vault(), prefixes: ["PF"], docText: GROUPED });
  assert.deepEqual(p.chipChanges, [
    { id: "PF-6", from: "Ready for you", to: "Done", why: "answered" },
    { id: "PF-4", from: "Claude's on it", to: "Done", why: "landed" },
    { id: "PF-9", from: "Ready for you", to: "Done", why: "landed" },
  ], "PF-9 is not an open row in this vault, so it reads as landed");
});
test("DISC-305: a heading='3' paragraph in a Claude Docs read is a project heading, not a section", () => {
  const h3 = (t) => heading(t, 3);
  const docs = [heading("Waiting on you"), h3("PF — portfolio"), li("Ready for you", "**PF-5** look"), li("Ready for you", "**PF-6** pick"), h3("HB — hoverboard"), li("Ready for you", "**PF-8** wrong place")].join("\n");
  const p = syncPlan({ vault: vault(), prefixes: ["PF"], docText: docs });
  assert.deepEqual(p.misfiled, [{ id: "PF-8", under: "### HB — hoverboard", belongsTo: "PF" }]);
  assert.equal(p.needsProjectHeadings, false);
});

test("DISC-305: fromDocsRead reads the real heading shape at levels 1-3 and leaves a plain paragraph alone", async () => {
  const { fromDocsRead } = await import("./queue-page-sync.mjs");
  const out = fromDocsRead([heading("Status", 1), heading("Waiting on you"), heading("PF — portfolio", 3), `&lt;paragraph id='.7'&gt;just text&lt;/paragraph&gt;`, li("Ready for you", "**PF-5** look")].join("\n"));
  assert.match(out, /^# Status$/m); assert.match(out, /^## Waiting on you$/m); assert.match(out, /^### PF — portfolio$/m);
  assert.ok(!/^#+ just text/m.test(out), "a paragraph with no heading attribute is not a heading");
});
