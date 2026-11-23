// DISC-310: the Status doc layout (HARD-RULES § The Status doc layout), proven through status-layout.mjs, which owns it.
// Edge cases live in status-layout.test.mjs; this file holds one case per clause of the rule.
// Run: node --test hooks/scripts/disc310-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { layoutPlan } from "./status-layout.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FM = (kind) => `---\nname: x\nkind: ${kind}\nprefix: PF\n---\n`;
function vault() {
  const v = mkdtempSync(join(tmpdir(), "disc310-"));
  const put = (p, t) => { mkdirSync(join(v, p, ".."), { recursive: true }); writeFileSync(join(v, p), t); };
  put("projects/portfolio/portfolio-queue.md", FM("queue") + "| # | Needed | Where | Why | Recommended |\n| - | - | - | - | - |\n| PF-5 | Look at footer | | | |\n");
  put("projects/portfolio/portfolio-backlog.md", FM("backlog") + "## Up next\n\n1. PF-8\n\n## Open\n\n| # | Item | Raised | Status |\n| - | --- | --- | --- |\n| PF-8 | Next thing | d | open |\n");
  return v;
}
const HEAD = "<paragraph id='h1' heading='1'><text id='t'>Status</text></paragraph><paragraph id='d'><date id='dd' value='2026-11-20'/><text id='t'> · </text></paragraph>";
const plan = (body = "") => layoutPlan({ vault: vault(), prefixes: ["PF"], docXml: `<doc node='n'>${HEAD}${body}</doc>`, today: "2026-11-23", base: "B" });

test("the rule points at the script that applies it", () => {
  assert.match(readFileSync(join(root, "skills/routing/references/HARD-RULES.md"), "utf8"), /\*\*The Status doc layout\*\*[^\n]*status-layout\.mjs/);
});

test("the script's header defines every op and flag the rule points at", () => {
  const sl = readFileSync(join(root, "hooks/scripts/status-layout.mjs"), "utf8");
  const header = sl.slice(0, sl.indexOf("\nimport "));
  for (const op of ["move", "replaceItem", "staleChips", "droppedComments", "refused", "removeDuplicate", "holds", "answered"]) assert.match(header, new RegExp("`" + op + "` — "), op);
  assert.ok(header.includes("--doc-json") && header.includes("--doc <file"));
});

test("an empty doc gets the five status sections in order, each with its project heading, and the date line", () => {
  const p = plan();
  const sections = p.ops.filter((o) => o.op === "insertSection");
  assert.deepEqual(sections.map((o) => o.name), ["Ready for you", "You're on it", "Claude's on it", "Up next", "Done this session"]);
  assert.deepEqual(sections.map((o) => o.afterSection), [null, "Ready for you", "You're on it", "Claude's on it", "Up next"]);
  assert.ok(sections.every((o) => o.projects.join() === "Portfolio"));
  assert.ok(p.ops.some((o) => o.op === "setDate" && o.value === "2026-11-23"));
  assert.ok(p.ops.some((o) => o.op === "setBacklogLinks"));
});

test("an open queue row lands in Ready for you in the item format, with no chip; empty sections say Nothing.", () => {
  const p = plan();
  const item = p.ops.find((o) => o.op === "insertItem");
  assert.equal(item.section, "Ready for you");
  assert.match(item.markdown, /^- \[ \] \*\*\(PF-5\) Look at footer\. Waiting on you\.\*\*/);
  assert.doesNotMatch(item.markdown, /Ready for you|You're on it/, "the section is the status; the item carries no chip");
  assert.deepEqual(p.ops.filter((o) => o.op === "insertNothing").map((o) => o.section), ["You're on it", "Claude's on it", "Done this session"]);
});

test("Up next is the backlog's ordered ## Up next", () => {
  const up = plan().ops.find((o) => o.op === "setUpNext");
  assert.deepEqual(up.lines, ["- (PF-8) Next thing"]);
});

test("an item whose id the vault does not hold is reported unknown and never moved to Done", () => {
  const ghost = "<paragraph id='h2' heading='2'><text id='t'>Ready for you</text></paragraph><paragraph id='h3' heading='3'><text id='t'>Portfolio</text></paragraph><list id='l1' kind='check'><listItem id='g'><paragraph id='pg'><text id='tg'><bold>(PF-777) Ghost. Waiting on you.</bold></text></paragraph></listItem></list>";
  const p = plan(ghost);
  assert.deepEqual(p.unknown, ["PF-777"]);
  assert.equal(p.ops.filter((o) => JSON.stringify(o).includes("PF-777")).length, 0);
});

test("no doc still tells a session to write the retired Running now section", () => {
  for (const f of ["skills/pause-resume/SKILL.md", "skills/wrap/references/SECTIONS.md", "skills/routing/references/OPERATOR-REPLIES.md"])
    assert.doesNotMatch(readFileSync(join(root, f), "utf8"), /"Running now"|\*\*Running now\*\*/, f);
});
