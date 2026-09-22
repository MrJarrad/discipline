// lane-end — the one deterministic parent call per lane-completion
// notification (`spend-levers` rule 5, 2026-09-22 addendum). Tests the pure
// row-lookup/replace logic only — no disk, git or gh in this file.
// Run: node --test hooks/scripts/lane-end.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { findRow, replaceRow, parseArgs } from "./lane-end.mjs";

test("parseArgs reads flag/value pairs", () => {
  const args = parseArgs(["--session-dir", "/tmp/x", "--row", "9", "--text", "hello world"]);
  assert.equal(args["session-dir"], "/tmp/x");
  assert.equal(args.row, "9");
  assert.equal(args.text, "hello world");
});

test("findRow locates a numbered row and names its section", () => {
  const queue = "## Portfolio\n1. first row\n## Discipline\n9. ninth row\n";
  const found = findRow(queue, "9");
  assert.equal(found.section, "Discipline");
});

test("findRow returns null when the row number does not exist", () => {
  const queue = "## Discipline\n1. only row\n";
  assert.equal(findRow(queue, "9"), null);
});

test("replaceRow refuses when the row is absent", () => {
  const queue = "## Discipline\n1. only row\n";
  const result = replaceRow(queue, "9", "9. new text");
  assert.equal(result.ok, false);
  assert.match(result.reason, /not found/);
});

test("replaceRow refuses when the row's section does not match the expected section", () => {
  const queue = "## Portfolio\n9. wrong section row\n## Discipline\n1. other row\n";
  const result = replaceRow(queue, "9", "9. new text", "Discipline");
  assert.equal(result.ok, false);
  assert.match(result.reason, /another section/);
});

test("replaceRow replaces only the named row's line, leaving the rest untouched", () => {
  const queue = "## Discipline\n9. old row text\n10. unrelated row\n";
  const result = replaceRow(queue, "9", "9. new row text", "Discipline");
  assert.equal(result.ok, true);
  assert.match(result.text, /9\. new row text/);
  assert.match(result.text, /10\. unrelated row/);
  assert.doesNotMatch(result.text, /old row text/);
});
