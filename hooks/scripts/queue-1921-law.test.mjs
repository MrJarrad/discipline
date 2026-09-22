// The 1.92.1 queue: `2026-09-22-spend-levers.md` rules 1-3 (operator: "spend is
// getting a bit high"; rule 4 — model choice per orchestration session — is the
// operator's own call, not encoded).
//
// Rule 1: read-back only above `line`; the dispatch gate refuses a `line`
// brief that asks for one.
// Rule 2: the evidence return is the coverage ledger plus gate tails only;
// narrative, reproduction logs and per-frame readings go to the progress
// file, linked by path.
// Rule 3: the parent's reply to a read-back is one line — `go`, or one
// correction — never a restatement.
//
// Run: node --test hooks/scripts/queue-1921-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { checkAgentDispatch, checkLineNoReadBack } from "../bin/agent-dispatch-gate.mjs";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(repo, p), "utf8");
const flat = (text) => text.replace(/\s+/g, " ");

// --- Rule 1: read-back only above line --------------------------------------

test("doer-rules: a line brief never asks for a read-back; the gate refuses one that does", () => {
  const doc = flat(read("doer-rules.md"));
  assert.match(doc, /A `line` brief never\s*asks for a read-back stop; the dispatch gate refuses one that does/);
});

test("dispatch-brief: names the line-lane read-back exemption and gate refusal", () => {
  const doc = flat(read("skills/dispatch-brief/SKILL.md"));
  assert.match(doc, /never on `line`, gate-refused/);
});

test("gate: checkLineNoReadBack is null for a line brief with no read-back ask", () => {
  assert.equal(checkLineNoReadBack("Size: line\nFix the guard on this file."), null);
});

test("gate: checkLineNoReadBack refuses a line brief instructing a ## Read-back return", () => {
  const verdict = checkLineNoReadBack("Size: line\nReturn `## Read-back` before any edit.");
  assert.equal(verdict.item, "line-readback");
});

test("gate: checkLineNoReadBack refuses a line brief instructing a next: parent (go?) stop", () => {
  const verdict = checkLineNoReadBack("Size: line\nStop with next: parent (go?) before editing.");
  assert.equal(verdict.item, "line-readback");
});

test("gate: checkLineNoReadBack does not fire on a component/system brief with a read-back ask", () => {
  assert.equal(checkLineNoReadBack("Size: component\nReturn `## Read-back` before any edit."), null);
});

test("gate: checkAgentDispatch refuses a full line-sized Agent dispatch that asks for a read-back", () => {
  const verdict = checkAgentDispatch({
    description: "cloud — engineer (sonnet): fix the guard",
    model: "sonnet",
    subagent_type: "engineer",
    prompt: "Size: line\nSkills: quality\nReturn `## Read-back` before any edit.",
  });
  assert.equal(verdict.item, "line-readback");
});

test("gate: checkAgentDispatch allows a line-sized dispatch with no read-back ask", () => {
  const verdict = checkAgentDispatch({
    description: "cloud — engineer (sonnet): fix the guard",
    model: "sonnet",
    subagent_type: "engineer",
    prompt: "Size: line\nSkills: quality\nFix the guard on this one file and commit.",
  });
  assert.equal(verdict.ok, true);
});

// --- Rule 2: evidence returns are the ledger + gate tails -------------------

test("doer-rules: the evidence return is the ledger plus gate tails; narrative goes to the progress file", () => {
  const doc = flat(read("doer-rules.md"));
  assert.match(doc, /the ledger plus gate tails, full stop.*narrative, reproduction logs and\s*per-frame readings live in the progress file/);
});

test("dispatch-brief: repeats the ledger-plus-gate-tails evidence rule", () => {
  const doc = flat(read("skills/dispatch-brief/SKILL.md"));
  assert.match(doc, /Evidence is the ledger plus gate tails only, narrative to the progress file/);
});

test("doer-rules: the 250-word evidence budget still stands (rule 2 does not loosen it)", () => {
  const doc = flat(read("doer-rules.md"));
  assert.match(doc, /≤ 250 words/);
});

// --- Rule 3: parent replies to a read-back are one line ---------------------

test("doer-rules: the parent's read-back reply is one line, never a restatement", () => {
  const doc = flat(read("doer-rules.md"));
  assert.match(doc, /The parent's reply is one line — `go`, or one\s*correction — never a\s*restatement/);
});

test("dispatch-brief: repeats the one-line read-back reply rule", () => {
  const doc = flat(read("skills/dispatch-brief/SKILL.md"));
  assert.match(doc, /the parent's reply is one line/);
});

// --- Rule 5: lane-end.mjs is one deterministic parent call ------------------

import { findRow, replaceRow } from "./lane-end.mjs";

test("lane-end: findRow locates a row inside its own section", () => {
  const queue = "## Discipline\n9. a row\n";
  assert.equal(findRow(queue, "9").section, "Discipline");
});

test("lane-end: replaceRow refuses a row absent from the queue", () => {
  assert.equal(replaceRow("## Discipline\n1. x\n", "9", "9. y").ok, false);
});

test("lane-end: replaceRow refuses when the row is in another section", () => {
  const queue = "## Portfolio\n9. x\n## Discipline\n1. y\n";
  assert.equal(replaceRow(queue, "9", "9. z", "Discipline").ok, false);
});

test("routing: the baton table names lane-end.mjs as the lane-landed parent call", () => {
  const doc = flat(read("skills/routing/SKILL.md"));
  assert.match(doc, /Parent runs\*\* `node <plugin>\/hooks\/scripts\/lane-end\.mjs`/);
});

// --- Ledger: rule 4 withdrawn, rule 5 encoded -------------------------------

test("the 1.92.1 CHANGED entry names rules 1-3 and 5, and rule 4's withdrawal", () => {
  const changed = read("CHANGED.txt");
  const top = changed.split(/\n\n/)[0];
  assert.match(top, /1\.92\.1/);
  assert.match(top, /spend-levers/);
  assert.match(top, /rule 4/);
  assert.match(top, /rule 5|lane-end/);
});
