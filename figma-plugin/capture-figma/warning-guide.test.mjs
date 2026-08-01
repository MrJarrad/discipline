// Tests for the actionable-warnings guide (operator verdict 2026-08-01,
// Addendum 2 item 5: 904 warnings the operator can't act on — every type
// needs "why this fires" and "how to fix it").
//
// Revised 2026-08-01 after the operator read it live: "the way you explained
// in the thread I understand, how it's presented in the plugin doesn't make
// any sense". The copy now LEADS with the concrete finding built from the
// warning's own data — which layer, in which component, how many variants —
// and the generic diff-correlation rationale is demoted to an expandable
// aside. Every entry is therefore a function of its root-cause group, not a
// fixed paragraph.
//
// The guide is a pure catalog inside ui.html's script, extracted by its
// markers and evaluated here. The load-bearing test is still the LAST one:
// the catalog's keys must equal the warning types code.js actually emits, so
// a new emitter can't ship without its remediation copy.
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

// A root-cause group as groupWarningsByRootCause produces it — the operator's
// real SplitContent finding.
function group(overrides) {
  return Object.assign(
    {
      type: "duplicate_sibling_name",
      componentName: "SplitContent",
      container: "content",
      layerName: "primary",
      count: 12,
      variants: ["device=lg, layout=split-media-text", "device=sm, layout=split-media-text"],
      occurrences: [],
    },
    overrides
  );
}

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

test("warning guide: every entry states the finding, the remedy, and (demoted) the rationale", () => {
  for (const [type, entry] of Object.entries(WARNING_GUIDE)) {
    const g = group({ type: type });
    assert.equal(typeof entry.headline, "function", `${type} has no headline builder`);
    assert.equal(typeof entry.fix, "function", `${type} has no fix builder`);
    assert.ok(entry.headline(g).length > 10, `${type} produces no substantive headline`);
    assert.ok(entry.fix(g).length > 20, `${type} produces no substantive fix`);
    assert.ok(entry.why && entry.why.length > 20, `${type} has no substantive "why"`);
  }
});

test("warning guide: the headline is the concrete finding — layer, component, and how far it echoes", () => {
  const headline = warningGuideFor("duplicate_sibling_name").headline(group());
  assert.match(headline, /primary/, "the offending layer name must lead");
  assert.match(headline, /SplitContent/, "the component the operator has to open must be named");
  assert.match(headline, /content/, "where inside the component must be named");
  assert.match(headline, /2 variants/, "the echo count is the point of grouping");
  assert.equal(/correlat|fallback|node id/i.test(headline), false, "no diff-machinery jargon in the headline");
});

test("warning guide: a finding that echoes nowhere else says so plainly instead of claiming variants", () => {
  const headline = warningGuideFor("duplicate_sibling_name").headline(
    group({ componentName: "Examples", container: "Examples", layerName: "M - Project", count: 1, variants: [] })
  );
  assert.equal(/variants/.test(headline), false);
  assert.match(headline, /M - Project/);
});

test("warning guide: a root cause at a component's own top level reads as that, not as a repeated name", () => {
  const headline = warningGuideFor("duplicate_sibling_name").headline(
    group({ componentName: ".ControlSlider", container: ".ControlSlider", layerName: "ActionButtonIcon", count: 39 })
  );
  assert.equal(/\.ControlSlider's \.ControlSlider/.test(headline), false, "never says a component is inside itself");
  assert.match(headline, /\.ControlSlider/);
});

test("warning guide: duplicate-sibling's fix asks for the correct ROLE, never a position or a content type", () => {
  const fix = warningGuideFor("duplicate_sibling_name").fix(group());
  assert.match(fix, /secondary/, "the role vocabulary is what this system renames to");
  assert.match(fix, /primary/);
  assert.equal(/left|right|top of|bottom of|media|image|text\b/i.test(fix), false, "positional/content suffixes are wrong here");
  assert.equal(fix.includes("/"), false, "renames use the operator's ' - ' convention, never a '/' path");
});

test("warning guide: any rename example anywhere in the guide uses ' - ', never a '/' path", () => {
  for (const [type, entry] of Object.entries(WARNING_GUIDE)) {
    const text = entry.fix(group({ type: type })) + " " + entry.why;
    assert.equal(/"[^"]*\/[^"]*"/.test(text), false, `${type} shows a '/'-separated name example`);
  }
});

test("warning guide: malformed-spacer-name's fix names the four canonical spacer names code.js accepts", () => {
  const fix = warningGuideFor("malformed_spacer_name").fix(group({ type: "malformed_spacer_name", layerName: "SpaceVertical" }));
  for (const name of ["SpacerTop", "SpacerBottom", "SpacerHorizontal", "SpacerVertical"]) {
    assert.ok(fix.includes(name), `fix copy omits ${name}`);
  }
});

test("warning guide: malformed-spacer-name leads with the offending name and where it lives", () => {
  const headline = warningGuideFor("malformed_spacer_name").headline(
    group({ type: "malformed_spacer_name", componentName: ".CardMedia", container: "content", layerName: "SpaceVertical", count: 8, variants: [] })
  );
  assert.match(headline, /SpaceVertical/);
  assert.match(headline, /\.CardMedia/);
  assert.match(headline, /8/, "the eight echoes are one rename, and the count says so");
});

test("warning guide: ratified-axis-exception is described as policy, not as something to fix in the file", () => {
  const entry = warningGuideFor("ratified_axis_exception");
  assert.match(entry.fix(group({ type: "ratified_axis_exception" })), /nothing to fix|no action|ratified/i);
});

test("warning guide: the diff-correlation rationale is available but never the leading line", () => {
  const entry = warningGuideFor("duplicate_sibling_name");
  assert.match(entry.why, /correlat/i, "the rationale is kept, just demoted");
  assert.equal(/correlat/i.test(entry.headline(group())), false);
  assert.equal(/correlat/i.test(entry.fix(group())), false);
});

test("warning guide: an unknown type still yields usable copy rather than blank UI", () => {
  const entry = warningGuideFor("some_future_type");
  assert.ok(entry.headline(group({ type: "some_future_type" })));
  assert.ok(entry.fix(group({ type: "some_future_type" })));
  assert.ok(entry.why);
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

test("warnings UI: the section renders one expandable row per root cause, paths last", () => {
  const script = /<script>([\s\S]*)<\/script>/.exec(read("ui.html"))[1];
  assert.match(script, /function warningSection\(/);
  assert.match(script, /WARNING_SAMPLE_LIMIT/);
  assert.match(script, /groupWarningsByRootCause/, "the section must render root-cause rows, not raw per-type counts");
  // Order inside a row: headline (summary) -> fix -> demoted why -> paths.
  const body = /function warningSection\(([\s\S]*?)\n {4}\}/.exec(script)[1];
  const order = ["warn-fix", "warn-why", "warn-samples"];
  let cursor = -1;
  for (const cls of order) {
    const at = body.indexOf(cls);
    assert.ok(at > cursor, `${cls} must come after the element before it in the row`);
    cursor = at;
  }
});

test("warnings UI: the heading leads with the number of problems and keeps the raw count secondary", () => {
  const script = /<script>([\s\S]*)<\/script>/.exec(read("ui.html"))[1];
  const body = /function warningSection\(([\s\S]*?)\n {4}\}/.exec(script)[1];
  assert.match(body, /occurrence/, "the raw warning count must still be shown, as the secondary figure");
  assert.match(body, /count-secondary/);
});

// Caught by rendering the operator's real sync: the role advice was being
// pasted onto every duplicate, so ".ControlSlider"'s ActionButtonIcon was
// told its twin "is likely secondary". The primary/secondary pair is only
// the answer when the colliding name IS one of those roles.
test("warning guide: the primary/secondary pair is suggested only when the name is that role", () => {
  const onRole = warningGuideFor("duplicate_sibling_name").fix(group({ layerName: "primary" }));
  assert.match(onRole, /secondary/);
  const offRole = warningGuideFor("duplicate_sibling_name").fix(group({ layerName: "ActionButtonIcon" }));
  assert.equal(
    /likely "secondary"|is likely secondary/.test(offRole),
    false,
    "an ActionButtonIcon is not secretly a secondary"
  );
  assert.match(offRole, /role/i, "it still has to ask for role names");
  assert.match(offRole, / - /, "and still shows the operator's separator convention");
});

// An axis warning's context is "<template>/<axis>", so the container is the
// AXIS NAME — reading it as a container produced "in Home's layout", which
// sounds like a layer.
test("warning guide: an axis divergence names the axis and the template, not a possessive layer", () => {
  const g = group({
    type: "axis_ownership_violation",
    componentName: "Home - Landing",
    container: "layout",
    layerName: "NavigationHeader",
    count: 2,
    variants: [],
  });
  const headline = warningGuideFor("axis_ownership_violation").headline(g);
  assert.match(headline, /layout axis/);
  assert.match(headline, /Home - Landing/);
  assert.equal(/Home - Landing's layout/.test(headline), false);
});

// RATIFIED AXIS COLLAPSE (operator-approved presentation change, 2026-08-01):
// groupWarningsByRootCause now collapses a ratified exception to ONE row per
// (component, axis) — componentName IS the component (e.g. NavigationHeader,
// the axisPlace/template shape ratified_axis_exception used to share with
// axis_ownership_violation no longer applies), and `templates` carries the
// distinct template names the finding was seen on.
test("warning guide: a collapsed ratified-axis-exception row states the component, the axis, and both counts (templates and places)", () => {
  const g = group({
    type: "ratified_axis_exception",
    componentName: "NavigationHeader",
    container: "layout",
    layerName: "NavigationHeader",
    count: 12,
    variants: [],
    templates: ["Home", "Projects", "Projects - Landing", "About", "Contact", "Blog"],
  });
  const headline = warningGuideFor("ratified_axis_exception").headline(g);
  assert.match(headline, /NavigationHeader/);
  assert.match(headline, /layout axis/);
  assert.match(headline, /6 templates/);
  assert.match(headline, /12 places/);
});

test("warning guide: an unresolvable component says which variant it saw, not a bare axis string", () => {
  const headline = warningGuideFor("duplicate_sibling_name").headline(
    group({
      componentName: null,
      container: null,
      layerName: "ActionButtonIcon",
      count: 1,
      variants: ["state=default"],
      occurrences: [{ variant: "state=default", path: "state=default", nodeId: "N:1" }],
    })
  );
  assert.match(headline, /state=default variant/);
});

// Caught by rendering: with "why this matters" collapsed, the path list sat
// directly beneath its summary and read as the fold's contents.
test("warnings UI: the path list is captioned, so it can't be misread as the collapsed why", () => {
  const script = /<script>([\s\S]*)<\/script>/.exec(read("ui.html"))[1];
  const body = /function warningSection\(([\s\S]*?)\n {4}\}/.exec(script)[1];
  assert.match(body, /warn-samples-caption/);
  assert.ok(body.indexOf("warn-samples-caption") < body.indexOf('className = "warn-samples"'));
});
