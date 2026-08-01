// Tests for the actionable-warnings guide (operator verdict 2026-08-01,
// Addendum 2 item 5: 904 warnings the operator can't act on — every type
// needs "why this fires" and "how to fix it").
//
// The guide is a pure catalog inside ui.html's script, extracted by its
// markers and evaluated here. The load-bearing test is the LAST one: the
// catalog's keys must equal the warning types code.js actually emits, so a
// new emitter can't ship without its remediation copy.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(file) {
  return readFileSync(join(import.meta.dirname, file), "utf8");
}

function loadWarningGuide() {
  const match = /=== WARNING GUIDE[\s\S]*?===\n([\s\S]*?)\n {4}\/\/ === END WARNING GUIDE ===/.exec(read("ui.html"));
  if (!match) throw new Error("WARNING GUIDE markers not found in ui.html");
  return new Function(`${match[1]}\nreturn { WARNING_GUIDE, warningGuideFor };`)();
}

const { WARNING_GUIDE, warningGuideFor } = loadWarningGuide();

// Every `type: "..."` literal pushed by code.js's warning builders. Read from
// the source rather than hand-listed, so a new emitter shows up here.
function emittedWarningTypes() {
  const source = read("code.js");
  const block = /function buildMalformedSpacerNameWarnings[\s\S]*?function buildWarnings/.exec(source);
  if (!block) throw new Error("warning builders not found in code.js");
  const types = new Set();
  for (const m of block[0].matchAll(/type: "([a-z_]+)"/g)) types.add(m[1]);
  return types;
}

test("warning guide: every entry states why it fires and how to fix it", () => {
  for (const [type, entry] of Object.entries(WARNING_GUIDE)) {
    assert.ok(entry.why && entry.why.length > 20, `${type} has no substantive "why"`);
    assert.ok(entry.fix && entry.fix.length > 20, `${type} has no substantive "fix"`);
  }
});

test("warning guide: duplicate-sibling-name's fix names the actual remedy — unique sibling layer names", () => {
  const entry = warningGuideFor("duplicate_sibling_name");
  assert.match(entry.why, /sibling/i);
  assert.match(entry.fix, /rename/i);
});

test("warning guide: malformed-spacer-name's fix names the four canonical spacer names code.js accepts", () => {
  const entry = warningGuideFor("malformed_spacer_name");
  for (const name of ["SpacerTop", "SpacerBottom", "SpacerHorizontal", "SpacerVertical"]) {
    assert.ok(entry.fix.includes(name), `fix copy omits ${name}`);
  }
});

test("warning guide: ratified-axis-exception is described as policy, not as something to fix in the file", () => {
  const entry = warningGuideFor("ratified_axis_exception");
  assert.match(entry.fix, /nothing to fix|no action|ratified/i);
});

test("warning guide: an unknown type still yields usable copy rather than blank UI", () => {
  const entry = warningGuideFor("some_future_type");
  assert.ok(entry.why && entry.fix);
});

test("warning guide: covers exactly the warning types code.js emits", () => {
  const emitted = emittedWarningTypes();
  assert.ok(emitted.size > 0, "no warning types parsed out of code.js");
  for (const type of emitted) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(WARNING_GUIDE, type),
      `code.js emits "${type}" but the UI has no why/fix copy for it`
    );
  }
  for (const type of Object.keys(WARNING_GUIDE)) {
    assert.ok(emitted.has(type), `the UI documents "${type}" but code.js never emits it`);
  }
});

test("warnings UI: the warnings section renders expandable per-type groups with sample node names", () => {
  const script = /<script>([\s\S]*)<\/script>/.exec(read("ui.html"))[1];
  assert.match(script, /function warningSection\(/);
  assert.match(script, /WARNING_SAMPLE_LIMIT/);
  assert.match(script, /\+" \+ .*more|\+" \+ /);
});
