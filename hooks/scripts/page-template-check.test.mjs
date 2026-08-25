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
function makeFixture({ templateFrames = [], mapping, annotations }) {
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
  let annotationsPath;
  if (annotations) {
    annotationsPath = join(root, "annotations-registry.json");
    writeFileSync(annotationsPath, JSON.stringify(annotations), "utf8");
  }
  return { root, capturePath, mappingPath, annotationsPath };
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

  const result = runPageTemplateCheck({ capturePath, mappingPath, annotationsPath: null });

  assert.equal(result.ok, false);
  assert.equal(result.needs_action.length, 1);
  assert.equal(result.needs_action[0].type, "page_template_mismatch");
  assert.equal(result.needs_action[0].old, "large");
  assert.equal(result.needs_action[0].new, "medium");
});

test("a page call-site expectation that matches the template's resolved variantProp passes clean", () => {
  const { capturePath, mappingPath } = makeFixture({
    templateFrames: [readyFrame()],
    mapping: {
      entries: [{ template: "D - Projects", instance: "ProjectsGrid", prop: "height", expect: "medium" }],
    },
  });

  const result = runPageTemplateCheck({ capturePath, mappingPath, annotationsPath: null });

  assert.equal(result.ok, true);
  assert.equal(result.needs_action.length, 0);
});

test("a template that exists but isn't READY_FOR_DEV is exempt from the lane — no defect even when the map's expectation disagrees", () => {
  const { capturePath, mappingPath } = makeFixture({
    templateFrames: [readyFrame({ devStatus: null })],
    mapping: {
      entries: [{ template: "D - Projects", instance: "ProjectsGrid", prop: "height", expect: "large" }],
    },
  });

  const result = runPageTemplateCheck({ capturePath, mappingPath, annotationsPath: null });

  assert.equal(result.ok, true);
  assert.equal(result.needs_action.length, 0);
});

test("a map entry naming a template that doesn't exist in the capture at all is a missing-figma-template defect, distinct from 'not ready'", () => {
  const { capturePath, mappingPath } = makeFixture({
    templateFrames: [readyFrame()],
    mapping: {
      entries: [{ template: "D - Nonexistent", instance: "X", prop: "height", expect: "large" }],
    },
  });

  const result = runPageTemplateCheck({ capturePath, mappingPath, annotationsPath: null });

  assert.equal(result.ok, false);
  assert.equal(result.needs_action[0].type, "missing-figma-template");
});

test("a map entry naming an instance that doesn't exist on the ready template is a missing-figma-instance defect", () => {
  const { capturePath, mappingPath } = makeFixture({
    templateFrames: [readyFrame()],
    mapping: {
      entries: [{ template: "D - Projects", instance: "NoSuchInstance", prop: "height", expect: "large" }],
    },
  });

  const result = runPageTemplateCheck({ capturePath, mappingPath, annotationsPath: null });

  assert.equal(result.ok, false);
  assert.equal(result.needs_action[0].type, "missing-figma-instance");
});

// ---- ANNOTATE, NEVER SUPPRESS (operator ruling 2026-08-14) -------------
// These replace the two ratifiedVariants suppression tests that stood here.
// The mismatch is emitted either way; a registry annotation only decides
// which side of the needs-action / annotated split it lands on.

test("REGRESSION (annotate-never-suppress): a mismatch a ruling covers is still EMITTED, annotated with its ruling", () => {
  const { capturePath, mappingPath, annotationsPath } = makeFixture({
    templateFrames: [readyFrame()],
    mapping: {
      entries: [
        {
          template: "D - Projects",
          instance: "ProjectsGrid",
          prop: "height",
          expect: "large",
        },
      ],
    },
    annotations: {
      annotations: [
        {
          id: "projectsgrid-height-medium",
          lane: "page-template",
          classification: "ratified-exception",
          ruling: "operator ruling 2026-08-02",
          match: { template: "D - Projects", instance: "ProjectsGrid", prop: "height" },
        },
      ],
    },
  });

  const result = runPageTemplateCheck({ capturePath, mappingPath, annotationsPath });

  assert.equal(result.items.length, 1, "the mismatch reaches the output");
  assert.equal(result.items[0].type, "page_template_mismatch");
  assert.equal(result.needs_action.length, 0);
  assert.equal(result.annotated.length, 1);
  assert.equal(result.annotated[0].annotation.ruling, "operator ruling 2026-08-02");
  assert.equal(result.ok, true);
});

test("REGRESSION (annotate-never-suppress): with no annotation, that same mismatch needs action", () => {
  const { capturePath, mappingPath } = makeFixture({
    templateFrames: [readyFrame()],
    mapping: {
      entries: [{ template: "D - Projects", instance: "ProjectsGrid", prop: "height", expect: "large" }],
    },
  });

  const result = runPageTemplateCheck({ capturePath, mappingPath, annotationsPath: null });

  assert.equal(result.needs_action.length, 1);
  assert.equal(result.needs_action[0].type, "page_template_mismatch");
  assert.equal(result.ok, false);
});

test("a map still carrying the RETIRED ratifiedVariants field suppresses nothing and says so", () => {
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

  const result = runPageTemplateCheck({ capturePath, mappingPath, annotationsPath: null });

  assert.equal(result.needs_action.filter((i) => i.type === "page_template_mismatch").length, 1, "the ruling no longer diverts the mismatch");
  const lint = result.needs_action.filter((i) => i.type === "retired_map_field");
  assert.equal(lint.length, 1);
  assert.match(lint[0].detail, /annotations-registry\.json/);
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

  const result = runPageTemplateCheck({ capturePath, mappingPath, annotationsPath: null });

  assert.equal(result.needs_action.length, 5);
  assert.deepEqual(
    result.needs_action.map((d) => d.type),
    Array(5).fill("page_template_mismatch")
  );
});
