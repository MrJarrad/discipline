// Tests for the 1.77.0 two-tier brief law: tier 1 is doer-rules.md (standing
// rules every dispatched agent carries), tier 2 is a dispatch-brief skill that
// points at the contract in four parts with eight mandatory items.
// The shape IS the law here, so the shape is asserted as counts and ceilings.
// Run: node --test scripts/brief-shape-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(repo, p), "utf8");

const dispatchBrief = read("skills/dispatch-brief/SKILL.md");
const doerRules = read("doer-rules.md");

const words = (text) => text.split(/\s+/).filter(Boolean).length;

test("the dispatch-brief skill stays under its 900-word ceiling", () => {
  const count = words(dispatchBrief);
  assert.ok(count <= 900, `dispatch-brief is ${count} words; the ceiling is 900`);
});

test("the scenario table has exactly eight rows", () => {
  const start = dispatchBrief.indexOf("## Pick the contract");
  const table = dispatchBrief.slice(start, dispatchBrief.indexOf("\n## ", start + 1));
  const rows = table.match(/^\| \d \|/gm) || [];
  assert.equal(rows.length, 8, `the scenario table has ${rows.length} rows; the ratified count is 8`);
});

test("the only checklist is eight items, and the old one is gone", () => {
  assert.doesNotMatch(dispatchBrief, /## Checklist before dispatch/);
  const list = dispatchBrief.slice(dispatchBrief.indexOf("## Before you dispatch"));
  const items = list.match(/^\[ \]/gm) || [];
  assert.equal(items.length, 8, `the list is ${items.length} items; the ratified count is 8`);
});

test("the brief is four parts, each named", () => {
  const parts = dispatchBrief.slice(dispatchBrief.indexOf("## The brief — four parts"));
  for (const part of [/\*\*Goal\*\*/, /\*\*Context\*\*/, /\*\*Constraints\*\*/, /\*\*Done-when\*\*/]) {
    assert.match(parts, part);
  }
});

test("the one rule is the contract pointer", () => {
  assert.match(
    dispatchBrief,
    /\*\*The brief points at the contract; it never restates it\.\*\*/,
    "the one rule must be stated verbatim",
  );
});

test("doer-rules.md stays under its 200-line ceiling", () => {
  const lines = doerRules.trimEnd().split("\n").length;
  assert.ok(lines <= 200, `doer-rules.md is ${lines} lines; the ceiling is 200`);
});

test("doer-rules carries the four standing sections", () => {
  for (const heading of [
    "## You are the doer",
    "## Repo and safety",
    "## Fixed evidence return",
    "## Ports",
    "## Notes ledger",
  ]) {
    assert.ok(doerRules.includes(heading), `doer-rules.md missing: ${heading}`);
  }
});

test("every agent points at doer-rules.md and reads it whole", () => {
  for (const file of readdirSync(join(repo, "agents")).filter((f) => f.endsWith(".md"))) {
    assert.match(
      read(`agents/${file}`),
      /Standing rules: `doer-rules\.md` — read it whole\./,
      `agents/${file} must point at doer-rules.md`,
    );
  }
});
