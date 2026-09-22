// lane-end — the one deterministic parent call per lane-completion
// notification (`spend-levers` rule 5, 2026-09-22; round 2 fix same day:
// row lookup/replace is scoped to `--section`'s own line range, never a
// whole-file search — a same-numbered row in a different section must
// neither falsely refuse nor be silently overwritten).
// Tests the pure row-lookup/replace logic only — no disk, git or gh here.
// Run: node --test hooks/scripts/lane-end.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { findRow, replaceRow, sectionRange, parseArgs } from "./lane-end.mjs";

const TWO_SECTION_QUEUE = "## Portfolio\n9. portfolio row nine\n## Discipline\n9. discipline row nine\n10. discipline row ten\n";

test("parseArgs reads flag/value pairs", () => {
  const args = parseArgs(["--session-dir", "/tmp/x", "--row", "9", "--text", "hello world"]);
  assert.equal(args["session-dir"], "/tmp/x");
  assert.equal(args.row, "9");
  assert.equal(args.text, "hello world");
});

test("parseArgs reads the --dry-run flag with no value", () => {
  const args = parseArgs(["--row", "9", "--dry-run"]);
  assert.equal(args["dry-run"], true);
});

test("sectionRange spans a section's own body only, not neighbouring sections", () => {
  const range = sectionRange(TWO_SECTION_QUEUE, "Portfolio");
  const lines = TWO_SECTION_QUEUE.split("\n");
  const body = lines.slice(range.start, range.end).join("\n");
  assert.match(body, /portfolio row nine/);
  assert.doesNotMatch(body, /discipline/);
});

test("sectionRange returns null for a section that does not exist", () => {
  assert.equal(sectionRange(TWO_SECTION_QUEUE, "Nope"), null);
});

// --- Round 2: row 9 exists in TWO sections ----------------------------------

test("findRow scoped to Discipline finds Discipline's row 9, not Portfolio's", () => {
  const found = findRow(TWO_SECTION_QUEUE, "9", "Discipline");
  const lines = TWO_SECTION_QUEUE.split("\n");
  assert.match(lines[found.lineIndex], /discipline row nine/);
});

test("findRow scoped to Portfolio finds Portfolio's row 9, not Discipline's", () => {
  const found = findRow(TWO_SECTION_QUEUE, "9", "Portfolio");
  const lines = TWO_SECTION_QUEUE.split("\n");
  assert.match(lines[found.lineIndex], /portfolio row nine/);
});

test("replaceRow with --section Discipline is NOT falsely refused when row 9 also exists in Portfolio", () => {
  const result = replaceRow(TWO_SECTION_QUEUE, "9", "9. discipline row nine, replaced", "Discipline");
  assert.equal(result.ok, true, result.reason);
});

test("replaceRow with --section Discipline never touches Portfolio's same-numbered row", () => {
  const result = replaceRow(TWO_SECTION_QUEUE, "9", "9. discipline row nine, replaced", "Discipline");
  assert.match(result.text, /portfolio row nine/); // Portfolio's row 9 survives untouched
  assert.match(result.text, /discipline row nine, replaced/);
  assert.doesNotMatch(result.text, /^9\. discipline row nine$/m);
});

test("replaceRow with --section Portfolio replaces Portfolio's row 9 only, leaving Discipline's row 9 untouched", () => {
  const result = replaceRow(TWO_SECTION_QUEUE, "9", "9. portfolio row nine, replaced", "Portfolio");
  assert.equal(result.ok, true);
  assert.match(result.text, /portfolio row nine, replaced/);
  assert.match(result.text, /discipline row nine/);
  assert.doesNotMatch(result.text, /^9\. discipline row nine, replaced$/m);
});

// --- Required --section, no whole-file fallback -----------------------------

test("replaceRow refuses with no --section at all — no whole-file fallback", () => {
  const result = replaceRow(TWO_SECTION_QUEUE, "9", "9. x");
  assert.equal(result.ok, false);
  assert.match(result.reason, /--section is required/);
});

test("replaceRow refuses when --section names a section that does not exist", () => {
  const result = replaceRow(TWO_SECTION_QUEUE, "9", "9. x", "Nope");
  assert.equal(result.ok, false);
  assert.match(result.reason, /not found in the queue file/);
});

test("replaceRow refuses when the row is absent from the named section, even though it exists elsewhere", () => {
  const result = replaceRow(TWO_SECTION_QUEUE, "10", "10. x", "Portfolio"); // row 10 only exists in Discipline
  assert.equal(result.ok, false);
  assert.match(result.reason, /not found in section "Portfolio"/);
});

test("replaceRow replaces only the named row's line within its section, leaving sibling rows untouched", () => {
  const result = replaceRow(TWO_SECTION_QUEUE, "9", "9. discipline row nine, replaced", "Discipline");
  assert.match(result.text, /10\. discipline row ten/);
});
