// The registry is ONE source of truth in two places: scripts/annotations-registry.json
// (read by the scripts lanes) and an inlined AXIS_ANNOTATIONS array in the Figma
// plugin, which runs in a sandbox with no filesystem. These tests are what keeps
// the copy honest — a ruling edited in one place and not the other would put the
// plugin and the checkers on different laws.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { loadAnnotationRegistry } from "./annotations.mjs";
import { AXIS_ANNOTATIONS, findAxisAnnotation } from "../figma-plugin/capture-figma/schema-v2-transform.mjs";

const REGISTRY_PATH = join(import.meta.dirname, "annotations-registry.json");

function axisLaneEntries() {
  return loadAnnotationRegistry(REGISTRY_PATH).filter((e) => e.lane === "axis");
}

test("the plugin's inlined AXIS_ANNOTATIONS matches the registry's axis lane, entry for entry", () => {
  const fromFile = axisLaneEntries()
    .map((e) => ({ id: e.id, component: e.match.component, axis: e.match.axis, classification: e.classification, ruling: e.ruling }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const fromPlugin = AXIS_ANNOTATIONS.map((e) => ({
    id: e.id,
    component: e.component,
    axis: e.axis,
    classification: e.classification,
    ruling: e.ruling,
  })).sort((a, b) => a.id.localeCompare(b.id));

  assert.deepEqual(fromPlugin, fromFile, "the plugin's inlined copy has drifted from scripts/annotations-registry.json");
});

test("code.js carries the same inlined registry as schema-v2-transform.mjs (the plugin's tested mirror)", () => {
  const extract = (path) => {
    const source = readFileSync(join(import.meta.dirname, "..", "figma-plugin", "capture-figma", path), "utf8");
    const start = source.indexOf("const AXIS_ANNOTATIONS = [");
    const end = source.indexOf("];", start);
    assert.ok(start > -1 && end > -1, `${path} has no AXIS_ANNOTATIONS table`);
    return source.slice(start, end);
  };

  assert.equal(extract("code.js"), extract("schema-v2-transform.mjs"));
});

test("findAxisAnnotation answers on (component, axis) and nothing else", () => {
  assert.equal(findAxisAnnotation("NavigationHeader", "layout").id, "navigationheader-mobile-layout-split");
  assert.equal(findAxisAnnotation("NavigationHeader", "height"), null, "an annotation never opens every axis on its component");
  assert.equal(findAxisAnnotation("LayoutGrid", "columns").id, "layoutgrid-columns-device-owned");
  assert.equal(findAxisAnnotation("DataTable", "columns"), null, "another component's same-named axis is a different question");
});
