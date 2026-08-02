// Tests for page-template-check.mjs — vertical slices, one behavior per test.
// Run: node --test scripts/page-template-check.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runPageTemplateCheck } from "./page-template-check.mjs";

// Fixture: <root>/capture.json (templateFrames) + <root>/page-template-map.json
// (the mapping) — mirrors binding-check.mjs's fixture convention, minus the
// code-location half (this lane compares map-asserted literals against the
// capture directly, no code file to read).
function makeFixture({ templateFrames = [], mapping }) {
  const root = mkdtempSync(join(tmpdir(), "page-template-check-test-"));
  const capturePath = join(root, "capture.json");
  writeFileSync(
    capturePath,
    JSON.stringify({
      header: { fileName: "Test", pluginVersion: "1.0", exportedAt: 0, counts: {} },
      templateFrames,
    }),
    "utf8"
  );
  const mappingPath = join(root, "page-template-map.json");
  writeFileSync(mappingPath, JSON.stringify(mapping), "utf8");
  return { root, capturePath, mappingPath };
}

function readyFrame(overrides = {}) {
  return {
    id: "tf-1",
    name: "D - Projects",
    width: 1280,
    height: 720,
    devStatus: { type: "READY_FOR_DEV" },
    instances: [
      {
        id: "3983:63358",
        name: "ProjectsGrid",
        component: "CardGrid",
        variantProps: { height: "medium" },
        properties: {},
        overrides: [],
      },
    ],
    ...overrides,
  };
}

test("a page call-site expectation that disagrees with the template's resolved variantProp is a page_template_mismatch defect", () => {
  const { capturePath, mappingPath } = makeFixture({
    templateFrames: [readyFrame()],
    mapping: {
      entries: [{ template: "D - Projects", instance: "ProjectsGrid", prop: "height", expect: "large" }],
    },
  });

  const result = runPageTemplateCheck({ capturePath, mappingPath });

  assert.equal(result.ok, false);
  assert.equal(result.defects.length, 1);
  assert.equal(result.defects[0].type, "page_template_mismatch");
  assert.equal(result.defects[0].old, "large");
  assert.equal(result.defects[0].new, "medium");
});

test("a page call-site expectation that matches the template's resolved variantProp passes clean", () => {
  const { capturePath, mappingPath } = makeFixture({
    templateFrames: [readyFrame()],
    mapping: {
      entries: [{ template: "D - Projects", instance: "ProjectsGrid", prop: "height", expect: "medium" }],
    },
  });

  const result = runPageTemplateCheck({ capturePath, mappingPath });

  assert.equal(result.ok, true);
  assert.equal(result.defects.length, 0);
});

test("a template that exists but isn't READY_FOR_DEV is exempt from the lane — no defect even when the map's expectation disagrees", () => {
  const { capturePath, mappingPath } = makeFixture({
    templateFrames: [readyFrame({ devStatus: null })],
    mapping: {
      entries: [{ template: "D - Projects", instance: "ProjectsGrid", prop: "height", expect: "large" }],
    },
  });

  const result = runPageTemplateCheck({ capturePath, mappingPath });

  assert.equal(result.ok, true);
  assert.equal(result.defects.length, 0);
});

test("a map entry naming a template that doesn't exist in the capture at all is a missing-figma-template defect, distinct from 'not ready'", () => {
  const { capturePath, mappingPath } = makeFixture({
    templateFrames: [readyFrame()],
    mapping: {
      entries: [{ template: "D - Nonexistent", instance: "X", prop: "height", expect: "large" }],
    },
  });

  const result = runPageTemplateCheck({ capturePath, mappingPath });

  assert.equal(result.ok, false);
  assert.equal(result.defects[0].type, "missing-figma-template");
});

test("a map entry naming an instance that doesn't exist on the ready template is a missing-figma-instance defect", () => {
  const { capturePath, mappingPath } = makeFixture({
    templateFrames: [readyFrame()],
    mapping: {
      entries: [{ template: "D - Projects", instance: "NoSuchInstance", prop: "height", expect: "large" }],
    },
  });

  const result = runPageTemplateCheck({ capturePath, mappingPath });

  assert.equal(result.ok, false);
  assert.equal(result.defects[0].type, "missing-figma-instance");
});

test("an operator-ratified divergence (ratifiedVariants) downgrades a matching value out of defects into ratified[], but requires a citation", () => {
  const { capturePath, mappingPath } = makeFixture({
    templateFrames: [readyFrame()],
    mapping: {
      entries: [
        {
          template: "D - Projects",
          instance: "ProjectsGrid",
          prop: "height",
          expect: "large",
          ratifiedVariants: [{ value: "medium", citation: "operator ruling 2026-08-02" }],
        },
      ],
    },
  });

  const result = runPageTemplateCheck({ capturePath, mappingPath });

  assert.equal(result.ok, true);
  assert.equal(result.defects.length, 0);
  assert.equal(result.ratified.length, 1);
  assert.equal(result.ratified[0].citation, "operator ruling 2026-08-02");
});

test("a ratifiedVariants item missing a citation is a map-lint error thrown before any check runs", () => {
  const { capturePath, mappingPath } = makeFixture({
    templateFrames: [readyFrame()],
    mapping: {
      entries: [
        {
          template: "D - Projects",
          instance: "ProjectsGrid",
          prop: "height",
          expect: "large",
          ratifiedVariants: [{ value: "medium" }],
        },
      ],
    },
  });

  assert.throws(() => runPageTemplateCheck({ capturePath, mappingPath }), /missing a citation/);
});

test("reproduces the /projects audit's five defect shapes: a template height mismatch, two LayoutGrid columns mismatches (D and M), and two has-spacer-* boolean mismatches", () => {
  const dProjects = {
    id: "tf-d-projects",
    name: "D - Projects",
    width: 1280,
    height: 720,
    devStatus: { type: "READY_FOR_DEV" },
    instances: [
      { id: "3983:63358", name: "ProjectsGrid", component: "CardGrid", variantProps: { height: "medium" }, properties: {}, overrides: [] },
      { id: "3495:39193", name: "LayoutGrid", component: "LayoutGrid", variantProps: { columns: "1" }, properties: {}, overrides: [] },
      { id: "3983:63400", name: "ProjectsGridSpacer", component: "CardGrid", variantProps: {}, properties: { "has-spacer-top": false }, overrides: [] },
    ],
  };
  const mProjects = {
    id: "tf-m-projects",
    name: "M - Projects",
    width: 375,
    height: 812,
    devStatus: { type: "READY_FOR_DEV" },
    instances: [
      { id: "3496:42268", name: "LayoutGrid", component: "LayoutGrid", variantProps: { columns: "4" }, properties: {}, overrides: [] },
      { id: "3496:42300", name: "ProjectsGridSpacer", component: "CardGrid", variantProps: {}, properties: { "has-spacer-bottom": true }, overrides: [] },
    ],
  };
  const { capturePath, mappingPath } = makeFixture({
    templateFrames: [dProjects, mProjects],
    mapping: {
      entries: [
        { template: "D - Projects", instance: "ProjectsGrid", prop: "height", expect: "large" },
        { template: "D - Projects", instance: "LayoutGrid", prop: "columns", expect: "4" },
        { template: "M - Projects", instance: "LayoutGrid", prop: "columns", expect: "1" },
        { template: "D - Projects", instance: "ProjectsGridSpacer", prop: "has-spacer-top", expect: true },
        { template: "M - Projects", instance: "ProjectsGridSpacer", prop: "has-spacer-bottom", expect: false },
      ],
    },
  });

  const result = runPageTemplateCheck({ capturePath, mappingPath });

  assert.equal(result.defects.length, 5);
  assert.deepEqual(
    result.defects.map((d) => d.type),
    Array(5).fill("page_template_mismatch")
  );
});
