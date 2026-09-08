// Tests for the 1.69.0 communication law carried by the forced output style and
// the evidence-return contract in dispatch-brief + every agent.
// Same idiom as dispatch-law.test.mjs / review-loop.test.mjs: the law's WORDS are
// its interface, so the operator-ratified sentences are asserted here.
// Run: node --test scripts/output-style.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(repo, p), "utf8");

// The law hides across line wraps — prose assertions run on a whitespace-flattened
// copy so a reflowed paragraph can never silently drop a rule (review-loop.test.mjs).
const flow = (text) => text.replace(/\s+/g, " ");

const style = flow(read("output-styles/discipline.md"));
const styleRaw = read("output-styles/discipline.md");
const dispatchBrief = flow(read("skills/dispatch-brief/SKILL.md"));
const dispatchBriefRaw = read("skills/dispatch-brief/SKILL.md");
const agentFiles = readdirSync(join(repo, "agents")).filter((f) => f.endsWith(".md"));
const agents = agentFiles.map((f) => [`agents/${f}`, flow(read(`agents/${f}`))]);
const agentsRaw = agentFiles.map((f) => [`agents/${f}`, read(`agents/${f}`)]);

// --- AC1: one forced style, communication rules first ---------------------

test("the style keeps its filename and forces itself for the plugin", () => {
  const fm = styleRaw.slice(0, styleRaw.indexOf("\n---", 4));
  assert.match(fm, /^force-for-plugin:\s*true$/m);
  assert.match(fm, /^keep-coding-instructions:\s*true$/m);
  assert.match(fm, /^name:\s*Discipline$/m);
});

test("communication rules are the FIRST section; routing follows", () => {
  const headings = [...styleRaw.matchAll(/^##\s+(.*)$/gm)].map((m) => m[1]);
  assert.ok(headings.length > 1, "style must have sections");
  assert.match(headings[0], /how (?:you|it) (?:talk|read)|communicat|say it/i);
  const routingIdx = headings.findIndex((h) => /rout|dispatch/i.test(h));
  assert.ok(routingIdx > 0, "routing/orchestration must come after communication");
});

test("operator-voice.md is retired — one style file only", () => {
  assert.ok(!existsSync(join(repo, "output-styles/operator-voice.md")));
  const styles = readdirSync(join(repo, "output-styles")).filter((f) => f.endsWith(".md"));
  assert.deepEqual(styles, ["discipline.md"]);
});

test("nothing in the repo still points at the retired operator-voice style", () => {
  for (const rel of [
    "skills/grilling/references/DOS-AND-DONTS.md",
    "skills/skill-authoring/references/DOS-AND-DONTS.md",
  ]) {
    assert.doesNotMatch(read(rel), /operator-voice/i, `${rel} must not cite a deleted file`);
  }
});

test("operator-voice's load-bearing rules survive the merge", () => {
  assert.match(style, /Skill tool|real tool/i, "announce-by-invoking survives");
  assert.match(style, /creative/i);
  assert.match(style, /aesthetic/i);
  assert.match(style, /scope/i);
  assert.match(style, /destructive/i);
  assert.match(style, /never a menu/i, "one recommendation, never a menu survives");
  assert.match(style, /\/plan|\/context|\/compact|\/todos/, "native commands unprompted survive");
});

// --- AC2: the ten communication rules, positively framed ------------------

test("(a) outcome first", () => {
  assert.match(style, /outcome first|lead with the outcome/i);
});

test("(b) the operator's own vocabulary, with a gloss on first use", () => {
  assert.match(style, /vocabular/i);
  assert.match(style, /first use/i);
  assert.match(style, /same sentence/i, "the gloss rides in the same sentence");
});

test("(c) the six researched failure types are named DON'Ts with the operator's signals", () => {
  assert.match(style, /verdict wall/i);
  assert.match(style, /jargon/i);
  assert.match(style, /repeat/i);
  assert.match(style, /buried correction|correction .{0,20}buried/i);
  assert.match(style, /waiting message/i);
  assert.match(style, /overclaim/i);
  assert.match(style, /i don't know what this means/i, "operator's own quoted signal");
});

test("(d) a second confusion signal earns different framing, never the same sentences", () => {
  assert.match(style, /second (?:confusion )?signal/i);
  assert.match(style, /different framing/i);
  assert.match(style, /never the same sentences/i);
});

test("(e) walk-backs lead with 'Correction:'", () => {
  assert.match(style, /lead(?:s|ing)? with \*\*?"?Correction:/i);
});

test("(f) every status ends with one next-action sentence", () => {
  assert.match(style, /next-action sentence/i);
});

test("(g) waiting messages state what is observably happening", () => {
  assert.match(style, /observably happening/i);
});

test("(h) a decision message is one question, one recommendation, one alternative", () => {
  assert.match(style, /one question/i);
  assert.match(style, /one recommend/i);
  assert.match(style, /one .{0,20}alternative/i);
});

test("(i) the ~120-word tripwire opens with what this means", () => {
  assert.match(style, /120 words/i);
  assert.match(style, /tripwire/i);
  assert.match(style, /what this means/i);
});

test("(j) a pre-send self-check line", () => {
  assert.match(style, /before you send|pre-send/i);
  assert.match(style, /20 words/i);
  assert.match(style, /two meanings/i);
});

test("borrowed rules are credited", () => {
  assert.match(style, /wait-what|plain-english|eli15|smixs|mattpocock/i);
});

// --- AC3: one fixed evidence-return shape, stated once --------------------

const FIXED_RETURN_HEADING = "## Fixed evidence return";

test("dispatch-brief owns the fixed evidence return shape", () => {
  assert.ok(dispatchBriefRaw.includes(FIXED_RETURN_HEADING), "section must exist by that name");
  const section = flow(dispatchBriefRaw.slice(dispatchBriefRaw.indexOf(FIXED_RETURN_HEADING)));
  for (const field of [
    /final sha/i,
    /per-criterion|per-AC/i,
    /file:line/i,
    /verbatim/i,
    /open gaps/i,
    /next owner/i,
  ]) {
    assert.match(section, field);
  }
  assert.match(section, /250 words/i, "word budget for a return is stated");
  assert.match(section, /no prose recap|never a prose recap/i);
});

test("every agent references the fixed return instead of inventing its own", () => {
  for (const [name, text] of agents) {
    assert.match(
      text,
      /dispatch-brief.{0,80}Fixed evidence return|Fixed evidence return.{0,80}dispatch-brief/is,
      `${name} must point at the one shape`,
    );
  }
});

test("no agent carries a free-form report/summary return instruction", () => {
  for (const [name, text] of agentsRaw) {
    assert.doesNotMatch(
      text,
      /^[^\n]*\b(?:return|report|write|hand back)[^\n]*\b(?:a )?(?:prose |narrative |written )?(?:report|summary|write-?up|recap)\b[^\n]*$/im,
      `${name} must not invent its own return shape`,
    );
  }
});

// --- AC4: briefs name skills, they do not restate them --------------------

test("dispatch-brief forbids restating a skill's procedure and caps pasted rulings", () => {
  assert.match(dispatchBrief, /name skills[^.\n]*never restate|never restate[^.\n]*procedure/i);
  assert.match(dispatchBrief, /one DO\/DON'T pair/i);
  assert.match(dispatchBrief, /beyond one DO\/DON'T pair|no more than one DO\/DON'T pair/i);
});

test("dispatch-brief states a target brief length", () => {
  assert.match(dispatchBrief, /target[^.\n]*brief[^.\n]*\d{3}|brief[^.\n]*under[^.\n]*\d{3} words/i);
});

test("the dispatch checklist gates the fixed return, skill-names-only, and brief length", () => {
  const checklist = flow(dispatchBriefRaw.slice(dispatchBriefRaw.indexOf("## Checklist before dispatch")));
  assert.match(checklist, /Fixed evidence return/i);
  assert.match(checklist, /restate/i);
  assert.match(checklist, /brief length|words/i);
});

// --- AC6: out of scope, must not appear ----------------------------------

test("nothing in the touched law mentions subagent token roll-up or budgets", () => {
  const docs = [["style", styleRaw], ["dispatch-brief", dispatchBriefRaw], ...agentsRaw];
  for (const [name, text] of docs) {
    assert.doesNotMatch(text, /token roll-?up|subagent (?:token|budget)/i, `${name} is out of scope`);
  }
});

// --- AC8: the style reads on a phone -------------------------------------

test("the style stays short enough to read on a phone", () => {
  const lines = styleRaw.trimEnd().split("\n").length;
  assert.ok(lines <= 130, `style is ${lines} lines; budget is 130`);
});

test("the style body carries no wide tables", () => {
  const body = styleRaw.slice(styleRaw.indexOf("\n---", 4));
  assert.doesNotMatch(body, /^\s*\|.*\|.*\|/m, "no markdown tables in the style body");
});
