// DISC-328: the stop check learns the Status doc is out of layout by running the layout plan on a doc read.
// Run: node --test hooks/scripts/lib/doc-layout-check.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { docLayoutIssue } from "./doc-layout-check.mjs";
import { layoutDoc } from "../fixtures/status-doc-live.mjs";

const FM = (px, kind) => `---\nname: x\nkind: ${kind}\nprefix: ${px}\n---\n`;
function vault() {
  const v = mkdtempSync(join(tmpdir(), "dlc-"));
  const put = (p, t) => { mkdirSync(join(v, p, ".."), { recursive: true }); writeFileSync(join(v, p), t); };
  put("projects/portfolio/portfolio-queue.md", FM("PF", "queue") + "| # | Needed | Where | Why | Recommended |\n| - | - | - | - | - |\n| PF-5 | look at footer | | | |\n");
  put("projects/portfolio/portfolio-backlog.md", FM("PF", "backlog") + "## Open\n\n| # | Item | Raised | Status |\n| - | --- | --- | --- |\n");
  return v;
}
const ask = { id: "r5", chip: 0, text: "(PF-5) Look at the footer. Waiting on you." };
const inLayout = (over = {}) => layoutDoc({ base: "https://x", upNext: { Portfolio: ["Nothing."] }, sections: { "Ready for you": { Portfolio: [ask] } }, ...over });

test("a doc already in the layout has no issue", () => {
  assert.equal(docLayoutIssue({ vault: vault(), docXml: inLayout(), today: "2026-11-12" }), null);
});
test("an item with no chip is an issue, named by its row", () => {
  const bare = inLayout().replace("<dropdown id='dr5' enum='e' index='0'>Ready for you</dropdown>", "");
  assert.match(docLayoutIssue({ vault: vault(), docXml: bare, today: "2026-11-12" }), /out of layout[^]*PF-5/);
});
test("an open row the doc lacks is an issue", () => {
  assert.match(docLayoutIssue({ vault: vault(), docXml: inLayout({ sections: {} }), today: "2026-11-12" }), /out of layout[^]*PF-5/);
});
test("a stale date line alone is not a layout issue", () => {
  assert.equal(docLayoutIssue({ vault: vault(), docXml: inLayout({ today: "2026-11-01" }), today: "2026-11-12" }), null);
});
test("it fails open: empty xml, unparsable input, or a doc naming no known project give no issue", () => {
  assert.equal(docLayoutIssue({ vault: vault(), docXml: "", today: "2026-11-12" }), null);
  assert.equal(docLayoutIssue({ vault: vault(), docXml: "<doc node='n'></doc>", today: "2026-11-12" }), null);
  assert.equal(docLayoutIssue({ vault: "/nonexistent", docXml: inLayout(), today: "2026-11-12" }), null);
});
