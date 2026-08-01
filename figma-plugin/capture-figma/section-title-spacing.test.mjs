// Tests for section-title -> chips spacing (operator verdict 2026-08-01,
// Addendum 6 item 4: add space between each section title row ("576
// VARIABLES", "79 STYLES", "136 COMPONENTS", "873 FIGMA HYGIENE" — and the
// drift section's "N DESIGN↔CODE DRIFT" once populated) and the chip/
// group rows beneath it, matching the 6px rhythm f4777c1 established between
// a status line and its button row (4px flex gap + a 2px margin-bottom).
//
// .count-heading is the one shared element behind every section title in
// the panel (VARIABLES/STYLES/COMPONENTS via countSection(), FIGMA HYGIENE
// via warningSection(), DESIGN<->CODE DRIFT in the static drift-row markup)
// — a single CSS rule fixes all of them, so this pins the rule itself rather
// than reimplementing per-section checks.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function readUi() {
  return readFileSync(join(import.meta.dirname, "ui.html"), "utf8");
}

function readCountHeadingRule() {
  const css = /<style>([\s\S]*)<\/style>/.exec(readUi())[1];
  const rule = /\.count-heading \{([\s\S]*?)\}/.exec(css);
  assert.ok(rule, ".count-heading rule not found");
  return rule[1];
}

test("section-title spacing: .count-heading declares a margin-bottom, same idiom as .status-row-top", () => {
  const css = /<style>([\s\S]*)<\/style>/.exec(readUi())[1];
  const statusRowTopRule = /\.status-row-top \{([\s\S]*?)\}/.exec(css)[1];
  assert.match(statusRowTopRule, /margin-bottom:\s*2px/, "sanity: .status-row-top's own 2px margin (f4777c1) must still be present");
  assert.match(readCountHeadingRule(), /margin-bottom:\s*2px/, ".count-heading must carry the same 2px margin-bottom");
});

test("section-title spacing: the drift section reuses .count-heading, not a bespoke heading class", () => {
  const html = readUi();
  const driftHeading = /<section class="row" id="drift-row"[\s\S]*?<div class="count-heading">/.exec(html);
  assert.ok(driftHeading, "drift-row's heading must use the count-heading class so it gets the same spacing");
});

test("section-title spacing: it's declared once as a shared rule, not duplicated per section", () => {
  const css = /<style>([\s\S]*)<\/style>/.exec(readUi())[1];
  const matches = css.match(/\.count-heading \{[\s\S]*?\}/g) || [];
  assert.equal(matches.length, 1, "expected exactly one .count-heading rule (a single shared spacing fix)");
});
