// Tests for root-cause grouping of hygiene warnings (operator, 2026-08-01
// Addendum 9c + live feedback: "62 warnings" was really ~2 problems echoed
// once per variant, and "the way you explained in the thread I understand,
// how it's presented in the plugin doesn't make any sense").
//
// The warnings ARRAY in the export is untouched — this is presentation. The
// grouping is a pure block inside ui.html's script, extracted by its markers
// and evaluated here, and the fixtures below are taken verbatim from the
// operator's 2026-08-01 sync (captures/live/latest-warnings.json) so the
// assertions are about real data, not an imagined shape.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(file) {
  return readFileSync(join(import.meta.dirname, file), "utf8");
}

function extractBlock(marker, returns) {
  const re = new RegExp(`=== ${marker}[\\s\\S]*?===\\n([\\s\\S]*?)\\n {4}\\/\\/ === END ${marker} ===`);
  const match = re.exec(read("ui.html"));
  if (!match) throw new Error(`${marker} markers not found in ui.html`);
  return new Function(`${match[1]}\nreturn ${returns};`)();
}

const { groupWarningsByRootCause, createVariantOwnerResolver } = extractBlock(
  "WARNING ROOT CAUSES",
  "{ groupWarningsByRootCause, createVariantOwnerResolver }"
);

// Two component sets shaped like the real ones: SplitContent is identified by
// its (device, layout) axes, HeaderSection by (layout, size).
const COMPONENT_SETS = [
  {
    name: "SplitContent",
    properties: {
      device: { type: "VARIANT", variantOptions: ["sm", "md", "lg", "xl"] },
      layout: { type: "VARIANT", variantOptions: ["split-media-text", "split-media-text-reversed"] },
      "has-spacer#1": { type: "BOOLEAN", defaultValue: true },
    },
  },
  {
    name: "HeaderSection",
    properties: {
      layout: { type: "VARIANT", variantOptions: ["split", "stacked"] },
      size: { type: "VARIANT", variantOptions: ["100", "200", "300"] },
    },
  },
  {
    name: "HeaderText",
    properties: { device: { type: "VARIANT", variantOptions: ["lg+", "sm"] } },
  },
  {
    name: "HeroSlideshow",
    properties: { device: { type: "VARIANT", variantOptions: ["lg+", "sm"] } },
  },
];

function dup(context, nodeName) {
  return {
    type: "duplicate_sibling_name",
    nodeId: "N:" + context + "/" + nodeName,
    nodeName: nodeName,
    context: context,
    message: `Duplicate sibling name "${nodeName}" under ${context} — layer names must be unique.`,
  };
}

// The operator's actual SplitContent echoes: the same two-layers-named-primary
// problem, restated once per variant of the set.
const SPLIT_CONTENT_ECHOES = [
  dup("device=lg, layout=split-media-text/content", "primary"),
  dup("device=md, layout=split-media-text/content", "primary"),
  dup("device=xl, layout=split-media-text/content", "primary"),
  dup("device=sm, layout=split-media-text/content", "primary"),
  dup("device=lg, layout=split-media-text-reversed/content", "primary"),
  dup("device=md, layout=split-media-text-reversed/content", "primary"),
];

const resolver = () => createVariantOwnerResolver(COMPONENT_SETS);

test("root causes: one problem echoed across a set's variants collapses to a single group", () => {
  const groups = groupWarningsByRootCause(SPLIT_CONTENT_ECHOES, resolver());
  assert.equal(groups.length, 1);
  assert.equal(groups[0].count, 6);
  assert.equal(groups[0].componentName, "SplitContent");
  assert.equal(groups[0].container, "content");
  assert.equal(groups[0].layerName, "primary");
});

// The operator's second root cause: .ControlSlider's own internals collide,
// and every instance of it — inside HeaderSection, inside LayoutGrid, inside
// Slider — restates the same problem at a longer path.
const CONTROL_SLIDER_ECHOES = [
  dup("device=lg+/content/HeaderSection/content/actions/.ControlSlider", "ActionButtonIcon"),
  dup("device=sm/content/HeaderSection/content/actions/.ControlSlider", "ActionButtonIcon"),
  dup("layout=split, size=300/content/actions/.ControlSlider", "ActionButtonIcon"),
  dup("layout=md+/HeaderSection/content/actions/.ControlSlider", "ActionButtonIcon"),
  dup("LayoutGrid/content/HeaderSection/content/actions/.ControlSlider", "ActionButtonIcon"),
];

test("root causes: the same problem seen through instances lands on the component that owns it", () => {
  const groups = groupWarningsByRootCause(CONTROL_SLIDER_ECHOES, resolver());
  assert.equal(groups.length, 1, "five paths, one component definition at fault");
  assert.equal(groups[0].componentName, ".ControlSlider");
  assert.equal(groups[0].count, 5);
});

test("root causes: a component's own variants and its instance echoes are the same root cause", () => {
  const groups = groupWarningsByRootCause(
    [dup("state=middle", "ActionButtonIcon")].concat(CONTROL_SLIDER_ECHOES),
    createVariantOwnerResolver(
      COMPONENT_SETS.concat([{ name: ".ControlSlider", properties: { state: { type: "VARIANT", variantOptions: ["default", "middle", "end"] } } }])
    )
  );
  assert.equal(groups.length, 1, "the set's own walk and the instance echoes must not split into two rows");
  assert.equal(groups[0].count, 6);
});

test("root causes: an axis signature shared by several sets names no component rather than guessing", () => {
  // "device=lg+" alone fits HeaderText and HeroSlideshow both.
  const groups = groupWarningsByRootCause([dup("device=lg+", "ActionButtonIcon")], resolver());
  assert.equal(groups[0].componentName, null);
});

test("root causes: two different problems stay two rows", () => {
  const groups = groupWarningsByRootCause(SPLIT_CONTENT_ECHOES.concat(CONTROL_SLIDER_ECHOES), resolver());
  assert.deepEqual(groups.map((g) => g.layerName), ["primary", "ActionButtonIcon"]);
  assert.deepEqual(groups.map((g) => g.count), [6, 5]);
});

test("root causes: every echoed variant is kept under its row, deduped and in capture order", () => {
  const groups = groupWarningsByRootCause(SPLIT_CONTENT_ECHOES.concat([SPLIT_CONTENT_ECHOES[0]]), resolver());
  assert.equal(groups[0].count, 7);
  assert.equal(groups[0].variants.length, 6, "the repeat must not add a seventh variant");
  assert.equal(groups[0].variants[0], "device=lg, layout=split-media-text");
  assert.equal(groups[0].occurrences.length, 7);
  assert.equal(groups[0].occurrences[0].path, "device=lg, layout=split-media-text/content");
});

test("root causes: warnings that address the node itself group by where it lives, not by itself", () => {
  const spacer = (path) => ({
    type: "malformed_spacer_name",
    nodeId: "N:" + path,
    nodeName: "SpaceVertical",
    context: path,
    message: "malformed",
  });
  const groups = groupWarningsByRootCause(
    [
      spacer("device=sm/.CardMedia/content/SpaceVertical"),
      spacer("device=md/.CardMedia/content/SpaceVertical"),
    ],
    resolver()
  );
  assert.equal(groups.length, 1);
  assert.equal(groups[0].componentName, ".CardMedia");
  assert.equal(groups[0].container, "content", "the node's own name is not its container");
});

test("root causes: different layer names under one container never merge", () => {
  const groups = groupWarningsByRootCause(
    [dup("Examples", "M - Project"), dup("Examples", "M - Project - Landing")],
    resolver()
  );
  assert.equal(groups.length, 2);
});

test("root causes: no warnings is an empty list, not a crash", () => {
  assert.deepEqual(groupWarningsByRootCause([], resolver()), []);
  assert.deepEqual(groupWarningsByRootCause(undefined, resolver()), []);
});

test("root causes: a warning with no context at all still gets a row", () => {
  const groups = groupWarningsByRootCause([{ type: "duplicate_sibling_name", nodeName: "x" }], resolver());
  assert.equal(groups.length, 1);
  assert.equal(groups[0].componentName, null);
});

// RATIFIED AXIS COLLAPSE (operator-approved presentation change, 2026-08-01):
// NavigationHeader's ratified layout-axis exception fires once per M-/D-
// template pair (compareInstancePair's context is "<template>/<axis>"), so
// six template pairs produce six rows of the SAME finding under the old
// per-path grouping. They must collapse to ONE row per (component, axis),
// independent of which template it was seen on.
function ratified(templateBase, axis, nodeName) {
  return {
    type: "ratified_axis_exception",
    nodeId: "N:" + templateBase + "/" + axis,
    nodeName: nodeName,
    context: templateBase + "/" + axis,
    message: `${templateBase}: instance "${nodeName}" has divergent ${axis} — ratified exception.`,
  };
}

test("root causes: ratified_axis_exception rows for the SAME component+axis collapse to ONE row across templates", () => {
  const warnings = [
    ratified("Home", "layout", "NavigationHeader"),
    ratified("Home", "layout", "NavigationHeader"),
    ratified("Projects", "layout", "NavigationHeader"),
    ratified("Projects", "layout", "NavigationHeader"),
    ratified("Projects - Landing", "layout", "NavigationHeader"),
    ratified("Projects - Landing", "layout", "NavigationHeader"),
    ratified("About", "layout", "NavigationHeader"),
    ratified("About", "layout", "NavigationHeader"),
    ratified("Contact", "layout", "NavigationHeader"),
    ratified("Contact", "layout", "NavigationHeader"),
    ratified("Blog", "layout", "NavigationHeader"),
    ratified("Blog", "layout", "NavigationHeader"),
  ];

  const groups = groupWarningsByRootCause(warnings, resolver());

  assert.equal(groups.length, 1, "six templates x 2 occurrences must collapse to one row, not six");
  assert.equal(groups[0].type, "ratified_axis_exception");
  assert.equal(groups[0].componentName, "NavigationHeader");
  assert.equal(groups[0].container, "layout");
  assert.equal(groups[0].count, 12, "every occurrence is kept — 12 places");
  assert.equal(groups[0].templates.length, 6, "6 distinct templates");
  assert.deepEqual(groups[0].templates, ["Home", "Projects", "Projects - Landing", "About", "Contact", "Blog"]);
  assert.equal(groups[0].occurrences.length, 12, "the per-template list stays available underneath, expandable");
});

test("root causes: a ratified exception on a DIFFERENT axis of the same component stays a separate row", () => {
  const warnings = [ratified("Home", "layout", "NavigationHeader"), ratified("Home", "density", "NavigationHeader")];
  const groups = groupWarningsByRootCause(warnings, resolver());
  assert.equal(groups.length, 2);
});

test("root causes: a ratified exception on a DIFFERENT component stays a separate row from NavigationHeader's", () => {
  const warnings = [ratified("Home", "layout", "NavigationHeader"), ratified("Home", "layout", "LayoutGrid")];
  const groups = groupWarningsByRootCause(warnings, resolver());
  assert.equal(groups.length, 2);
});
