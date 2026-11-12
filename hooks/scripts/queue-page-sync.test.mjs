// DISC-288: the Status doc mirrors the queue files; this script says what a session must change on it.
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
  assert.deepEqual(p.items, ["- [ ] **(PF-5)** look at footer", "- [ ] **(PF-6)** pick hero", "- [ ] **(PF-8)** idea"]);
});
test("against the live doc: missing open rows to add, landed rows to tick, his ticks to bank as answers", () => {
  const p = syncPlan({ vault: vault(), prefixes: ["PF"], docText: DOC });
  assert.deepEqual(p.toAdd, ["- [ ] [Ready for you] **(PF-8) Idea. Waiting on you.**\n  - Needs your answer."], "DISC-307: toAdd emits the item format");
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

// DISC-307 (operator s81, verbatim: "ideally though we would consistently format things like i've done for pf-15131 or something even more improved";
// "that's feeling much easier to digest, i made one more change though": under Decision, Recommended and Alternative are each their own nested bullet).
import { formatItem, fromDocsRead as fromDocsReadSync } from "./queue-page-sync.mjs";
test("DISC-307: a short item is chip + bold (ID) Title. state + one plain line", () => {
  assert.equal(formatItem({ id: "PF-5", needed: "look at footer", why: "the spacing changed" }),
    "- [ ] [Ready for you] **(PF-5) Look at footer. Waiting on you.**\n  - the spacing changed.");
  assert.equal(formatItem({ id: "PF-5", needed: "look at footer" }), "- [ ] [Ready for you] **(PF-5) Look at footer. Waiting on you.**\n  - Needs your answer.");
});
test("DISC-307: a fix carries Problem, Solution, then Look (link + steps, ending 'Say yes, or what's off.') in that order", () => {
  const out = formatItem({ id: "PF-1598", needed: "Header flicker fix. Problem: the title caught the pointer. Solution: it no longer catches it.", where: "scroll so the header hides, rest the cursor on a card under it", why: "https://p.example/preview" });
  assert.equal(out, [
    "- [ ] [Ready for you] **(PF-1598) Header flicker fix. Ready for your look.**",
    "  - **Problem:** the title caught the pointer.",
    "  - **Solution:** it no longer catches it.",
    "  - **Look:** [Open the preview](https://p.example/preview) scroll so the header hides, rest the cursor on a card under it. Say yes, or what's off.",
  ].join("\n"));
});
test("DISC-307: a choice carries Decision with Recommended and Alternative as their own nested bullets, before Look", () => {
  const out = formatItem({ id: "PF-7", needed: "Pick the hero crop", recommended: "Recommended: the tight crop. Alternative: the wide crop (a bigger change)." });
  assert.equal(out, [
    "- [ ] [Ready for you] **(PF-7) Pick the hero crop. Needs your decision.**",
    "  - **Decision:** Pick the hero crop",
    "    - **Recommended:** the tight crop.",
    "    - **Alternative:** the wide crop (a bigger change).",
  ].join("\n"));
  assert.ok(!formatItem({ id: "PF-7", needed: "Pick", recommended: "go with the tight crop" }).includes("**Alternative:**"), "no alternative is invented");
});
test("DISC-307: toAdd emits the new shape, items keeps the one-line form, and the parser reads the (ID) form", () => {
  const p = syncPlan({ vault: vault(), prefixes: ["PF"], docText: DOC });
  assert.deepEqual(p.toAdd, ["- [ ] [Ready for you] **(PF-8) Idea. Waiting on you.**\n  - Needs your answer."]);
  assert.deepEqual(p.items[2], "- [ ] **(PF-8)** idea");
  const doc = "## Waiting on you\n\n- [x] [Done] **(PF-6) Pick hero. Waiting on you.**\n  - Needs your answer.\n- [ ] [Ready for you] **(PF-5) Look at footer. Waiting on you.**\n  - Needs your answer.\n";
  const q = syncPlan({ vault: vault(), prefixes: ["PF"], docText: doc });
  assert.deepEqual(q.answered, ["PF-6"], "the (ID) form is read as the row id");
  assert.deepEqual(q.toAdd.map((l) => l.split("\n")[0].match(/PF-\d+/)[0]), ["PF-8"]);
});

// DISC-307 round 2 (review of #190): real rows from the portfolio queue/backlog, cut at word boundaries, a Decision only with a real Alternative,
// no duplicated closing line, "Solution (try-out):" split, backlog rows keep their text, `items` use the (ID) form, a nested listItem reads back.
const ROW_1585 = { id: "PF-1585", needed: "Look at the Time Circuits glow on images, round 3 (PF-1531, pf #592): open [the preview](https://preview-pf-1531-media-layer-glow-r3-jhd-preview-staging.jh-229.workers.dev/?time-circuits=on), let Time Circuits land, watch the arrival glow, then hover the images. Problem: images in dark mode change the colours inside them, so the glow drawn inside them came out pale yellow instead of Time Circuits cyan, most visibly on arrival. Solution: the glow now takes its colour from the page itself, which no image can change; arrival, wave and board code are unchanged from the site. Halo stays cut at the image edge; add &halo=spill to the link to see it spill. Say yes, or what's off.", where: "pinned doc", why: "arrival glow must match the approved one before merge", recommended: "yes (halo cut)" };
const ROW_1596 = { id: "PF-1596", needed: "Look at board sharpness, try-out (pf #597): compare [default](https://preview-board-fine-jhd-preview-staging.jh-229.workers.dev/) with [sharper](https://preview-board-fine-jhd-preview-staging.jh-229.workers.dev/?board=fine), Time Circuits on. Problem: nothing recent lowered the board's resolution (the canvas is a true 2x); it looks soft because the artwork is shrunk about 14x to a ~72px board. Solution (try-out): ?board=fine draws the board alone at 4x in a small canvas that moves with it. Caveat: in testing it cost about 1.5x more to draw, so a Mac speed check runs before it could merge. Say which looks right." };
const ROW_65 = { id: "PF-65", needed: "Project media per case study: all media (every previous file replaced), the grid row (from the Glimpse order) and the share image (file labelled \"share\"). Operator 2026-11-08, verbatim: \"i will adding the media for each project\"." };
test("DISC-307 r2 (real PF-1585): the title stops at the first colon, no link or URL in it; Problem, Solution (no duplicated Say yes), Look with its steps; no Decision for a bare 'yes (halo cut)'", () => {
  const out = formatItem(ROW_1585).split("\n");
  assert.equal(out[0], "- [ ] [Ready for you] **(PF-1585) Look at the Time Circuits glow on images, round 3 (PF-1531, pf #592). Ready for your look.**");
  assert.match(out[1], /^ {2}- \*\*Problem:\*\* images in dark mode change the colours inside them.*most visibly on arrival\.$/);
  assert.match(out[2], /^ {2}- \*\*Solution:\*\* the glow now takes its colour from the page itself.*to see it spill\.$/);
  assert.ok(!out[2].includes("Say yes"), "the closing line lives in Look only");
  assert.equal(out[3], "  - **Look:** Open [the preview](https://preview-pf-1531-media-layer-glow-r3-jhd-preview-staging.jh-229.workers.dev/?time-circuits=on), let Time Circuits land, watch the arrival glow, then hover the images. Say yes, or what's off.");
  assert.equal(out.length, 4, "no Decision, and no raw `where` pointer (pinned doc) anywhere");
  assert.ok(!out.join("\n").includes("pinned doc"));
});
test("DISC-307 r2 (real PF-1596): 'Solution (try-out):' is split, the title is not cut inside a link or parenthesis, the row's own closing 'Say which looks right.' ends Look", () => {
  const out = formatItem(ROW_1596).split("\n");
  assert.equal(out[0], "- [ ] [Ready for you] **(PF-1596) Look at board sharpness, try-out (pf #597). Ready for your look.**");
  assert.match(out[2], /^ {2}- \*\*Solution:\*\* \?board=fine draws the board alone at 4x/);
  assert.ok(!out.some((l) => l.includes("Solution (try-out)")));
  assert.match(out[3], /^ {2}- \*\*Look:\*\* Compare \[default\]\(https:\/\/preview-board-fine-jhd-preview-staging\.jh-229\.workers\.dev\/\) with \[sharper\]\(.*\?board=fine\), Time Circuits on\. Say which looks right\.$/);
});
test("DISC-307 r2 (real PF-65, a backlog row): the title is a clean cut and the row's text stays as its plain line, no placeholder", () => {
  const out = formatItem(ROW_65).split("\n");
  assert.equal(out[0], "- [ ] [Ready for you] **(PF-65) Project media per case study. Waiting on you.**");
  assert.match(out[1], /^ {2}- all media \(every previous file replaced\), the grid row/);
  assert.ok(!out.join("\n").includes("Needs your answer"));
});
test("DISC-307 r2: a title over 90 characters is cut at a word boundary, never inside a parenthesis or link, and carries no URL", () => {
  const long = "Look at the extremely long named thing that goes on and on (with a long parenthetical aside that runs past the limit) https://x.example/a/very/long/url ok";
  const t = /\*\*\(PF-9\) (.*?)\. (?:Ready for your look|Waiting on you)\.\*\*/.exec(formatItem({ id: "PF-9", needed: long }))[1];
  assert.ok(t.length <= 90, t);
  assert.ok(!t.includes("http"), t);
  assert.ok(!/\([^)]*$/.test(t), "no half-open parenthesis: " + t);
});
test("DISC-307 r2: a Decision needs a real Alternative; a bare 'yes …' recommendation on a look row is not a decision", () => {
  assert.ok(!formatItem({ id: "PF-5", needed: "Look at it", why: "https://p.example/x", recommended: "yes (halo cut)" }).includes("**Decision:**"));
  assert.ok(formatItem({ id: "PF-5", needed: "Pick one", recommended: "A. Alternative: B." }).includes("**Decision:**"));
});
test("DISC-307 r2: `items` use the (ID) form too", () => {
  assert.equal(syncPlan({ vault: vault(), prefixes: ["PF"] }).items[0], "- [ ] **(PF-5)** look at footer");
});
test("DISC-307 r2: a nested listItem in the real Claude Docs shape reads back as an indented bullet under its item, and the id still parses", () => {
  const nested = "&lt;listItem id='.1'&gt;&lt;paragraph&gt;&lt;dropdown id='.2' enum='e' index='0'&gt;Ready for you&lt;/dropdown&gt;&lt;text&gt; **(PF-5) Look at footer. Ready for your look.**&lt;/text&gt;&lt;/paragraph&gt;&lt;listItem id='.3'&gt;&lt;paragraph&gt;&lt;text&gt;**Problem:** the gap.&lt;/text&gt;&lt;/paragraph&gt;&lt;/listItem&gt;&lt;listItem id='.4'&gt;&lt;paragraph&gt;&lt;text&gt;**Look:** &lt;link href='https://p.example/x'&gt;the preview&lt;/link&gt;. Say yes, or what's off.&lt;/text&gt;&lt;/paragraph&gt;&lt;/listItem&gt;&lt;/listItem&gt;";
  const doc = [heading("Waiting on you"), nested].join("\n");
  const lines = fromDocsReadSync(doc).split("\n").filter(Boolean);
  assert.ok(lines.some((l) => l.startsWith("- [ ] **(PF-5) Look at footer. Ready for your look.** [Ready for you]")), lines.join("|"));
  assert.ok(lines.includes("  - **Problem:** the gap."), lines.join("|"));
  assert.ok(lines.some((l) => l.startsWith("  - **Look:** the preview https://p.example/x.")), lines.join("|"));
  const p = syncPlan({ vault: vault(), prefixes: ["PF"], docText: doc });
  assert.deepEqual(p.noStatus, [], "the chip is read; the nested bullets are not items");
  assert.equal(p.toAdd.length, 2, "PF-6 and PF-8 are still missing from the doc");
});

// DISC-307 round 3 (review of #190, round 2): the real doc marks bold with <bold>…</bold>; reading it must give **…** or no (ID) is ever seen.
const bold = (t) => `&lt;bold&gt;${t}&lt;/bold&gt;`;
const liB = (chip, boldText, rest = "", extra = "") => `&lt;listItem id='.1'${extra}&gt;&lt;paragraph&gt;${chip === null ? "" : `&lt;dropdown id='.2' enum='e' index='0'&gt;${chip}&lt;/dropdown&gt;`}&lt;text&gt; &lt;/text&gt;${bold(boldText)}&lt;text&gt;${rest}&lt;/text&gt;&lt;/paragraph&gt;&lt;/listItem&gt;`;
test("DISC-307 r3 RED: <bold> reads back as ** **, so the real doc's (ID) titles are seen: nothing is re-added and a tick is banked", () => {
  const doc = [heading("Waiting on you"), liB("Ready for you", "(PF-5) Look at footer. Ready for your look."), liB("Done", "(PF-6) Pick hero. Waiting on you.", "", " checked='true'")].join("\n");
  assert.match(fromDocsReadSync(doc), /^- \[ \] \*\*\(PF-5\) Look at footer\. Ready for your look\.\*\* \[Ready for you\]$/m);
  const p = syncPlan({ vault: vault(), prefixes: ["PF"], docText: doc });
  assert.deepEqual(p.answered, ["PF-6"], "his tick on the open row PF-6 is seen");
  assert.deepEqual(p.toAdd.map((l) => /\(PF-\d+\)/.exec(l)[0]), ["(PF-8)"], "PF-5 and PF-6 are already on the doc, only PF-8 is added");
});
test("DISC-307 r3 AMBER: a row's Caveat is kept, inside Solution when there is one, as its own bullet when there is not", () => {
  const out = formatItem(ROW_1596);
  assert.match(out, /\*\*Solution:\*\* \?board=fine draws the board alone at 4x in a small canvas that moves with it\. Caveat: in testing it cost about 1\.5x more to draw, so a Mac speed check runs before it could merge\./);
  const noSol = formatItem({ id: "PF-4", needed: "Look at it: open https://p.example/x. Problem: it is off. Caveat: only on Safari. Say yes, or what's off." });
  assert.match(noSol, /  - \*\*Problem:\*\* it is off\.\n  - \*\*Caveat:\*\* only on Safari\./);
});
test("DISC-307 r3 NOTE: no stray </list>, a nested bullet's own children keep their extra indent, and a very long plain line is cut at a word boundary", () => {
  const nested = "&lt;listItem id='.1'&gt;&lt;paragraph&gt;&lt;text&gt;**(PF-7) Pick. Needs your decision.**&lt;/text&gt;&lt;/paragraph&gt;&lt;list&gt;&lt;listItem id='.2'&gt;&lt;paragraph&gt;&lt;text&gt;**Decision:** pick one&lt;/text&gt;&lt;/paragraph&gt;&lt;list&gt;&lt;listItem id='.3'&gt;&lt;paragraph&gt;&lt;text&gt;**Recommended:** A.&lt;/text&gt;&lt;/paragraph&gt;&lt;/listItem&gt;&lt;listItem id='.4'&gt;&lt;paragraph&gt;&lt;text&gt;**Alternative:** B.&lt;/text&gt;&lt;/paragraph&gt;&lt;/listItem&gt;&lt;/list&gt;&lt;/listItem&gt;&lt;/list&gt;&lt;/listItem&gt;";
  const out = fromDocsReadSync(nested);
  assert.ok(!out.includes("</list>") && !out.includes("<list"), out);
  const lines = out.split("\n").filter(Boolean);
  assert.deepEqual(lines.slice(1), ["  - **Decision:** pick one", "    - **Recommended:** A.", "    - **Alternative:** B."]);
  const long = formatItem({ id: "PF-65", needed: `Project media: ${"all the media for every case study and then some more words ".repeat(40)}` });
  const plain = long.split("\n")[1];
  assert.ok(plain.length <= 260, `${plain.length}`);
  assert.match(plain, /…$/);
});
