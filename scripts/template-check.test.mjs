// Tests for template-check.mjs — vertical slices, one behavior per test.
// Run: node --test scripts/template-check.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  computeGridColumns,
  evaluateGridConformance,
  compareBlockGeometry,
  evaluateSpacerState,
  evaluateStyleProbes,
  evaluateDevicePairing,
  computeTemplateDefects,
  runTemplateCheck,
  parseArgs,
  findFreePort,
} from "./template-check.mjs";

function makeFixture({ spec, map }) {
  const root = mkdtempSync(join(tmpdir(), "template-check-test-"));
  const specPath = join(root, "template-spec.json");
  const mapPath = join(root, "figma-map.json");
  writeFileSync(specPath, JSON.stringify(spec), "utf8");
  writeFileSync(mapPath, JSON.stringify(map), "utf8");
  return { root, specPath, mapPath };
}

test("computeGridColumns: 1280 viewport, 32px margin/gap -> 12 evenly-snapped columns", () => {
  // contentWidth = 1280 - 2*32 = 1216; 11 gaps of 32 = 352; colWidth = (1216-352)/12 = 72
  const grid = computeGridColumns({ viewportWidth: 1280, margin: 32, gap: 32 });

  assert.equal(grid.colWidth, 72);
  assert.equal(grid.columns.length, 12);
  assert.deepEqual(grid.columns[0], { index: 0, x: 32, width: 72 });
  assert.deepEqual(grid.columns[1], { index: 1, x: 136, width: 72 });
  assert.deepEqual(grid.columns[11], { index: 11, x: 1176, width: 72 });
});

test("evaluateGridConformance: a cell exactly spanning columns 0-5 (6 cols) -> no defect", () => {
  const grid = computeGridColumns({ viewportWidth: 1280, margin: 32, gap: 32 });
  // 6 columns: x = col0.x = 32; width = 6*72 + 5*32 = 432 + 160 = 592
  const measuredCells = [{ role: "split-asymmetric", index: 0, x: 32, width: 592 }];
  const gridChecks = [{ role: "split-asymmetric" }];

  const defects = evaluateGridConformance({ gridChecks, measuredCells, grid, tolerancePx: 2 });

  assert.deepEqual(defects, []);
});

test("evaluateGridConformance: a cell 8px off the nearest column boundary -> grid-misaligned defect", () => {
  const grid = computeGridColumns({ viewportWidth: 1280, margin: 32, gap: 32 });
  const measuredCells = [{ role: "split-asymmetric", index: 0, x: 40, width: 592 }];
  const gridChecks = [{ role: "split-asymmetric" }];

  const defects = evaluateGridConformance({ gridChecks, measuredCells, grid, tolerancePx: 2 });

  assert.equal(defects.length, 1);
  assert.equal(defects[0].type, "grid-misaligned");
  assert.equal(defects[0].role, "split-asymmetric");
  assert.equal(defects[0].index, 0);
  assert.equal(defects[0].deltaXPx, 8);
});

test("compareBlockGeometry: measured within tolerance -> no defect", () => {
  const blocks = [{ role: "hero-text", y: 0, height: 648, tolerance: 6 }];
  const measuredBlocks = [{ role: "hero-text", index: 0, y: 0, height: 651 }];

  const defects = compareBlockGeometry({ blocks, measuredBlocks });

  assert.deepEqual(defects, []);
});

test("compareBlockGeometry: measured height beyond tolerance -> geometry-mismatch defect (the HeaderMedia +48 shape)", () => {
  const blocks = [{ role: "header-media", y: 0, height: 1549, tolerance: 4 }];
  const measuredBlocks = [{ role: "header-media", index: 0, y: 0, height: 1597 }];

  const defects = compareBlockGeometry({ blocks, measuredBlocks });

  assert.equal(defects.length, 1);
  assert.deepEqual(defects[0], {
    type: "geometry-mismatch",
    role: "header-media",
    index: 0,
    field: "height",
    expected: 1549,
    measured: 1597,
    deltaPx: 48,
    tolerance: 4,
  });
});

test("compareBlockGeometry: field marked 'content' is always skipped, even wildly divergent", () => {
  const blocks = [{ role: "split-asymmetric", index: 3, height: "content" }];
  const measuredBlocks = [{ role: "split-asymmetric", index: 3, height: 9999 }];

  const defects = compareBlockGeometry({ blocks, measuredBlocks });

  assert.deepEqual(defects, []);
});

test("compareBlockGeometry: spec block with no measured counterpart -> missing-block-instance defect", () => {
  const blocks = [{ role: "pagination-page", index: 0, height: 648, tolerance: 4 }];
  const measuredBlocks = [];

  const defects = compareBlockGeometry({ blocks, measuredBlocks });

  assert.deepEqual(defects, [{ type: "missing-block-instance", role: "pagination-page", index: 0 }]);
});

test("evaluateSpacerState: measured matches declared spacerTop/spacerBottom -> no defect", () => {
  const blocks = [{ role: "hero-text", spacerTop: false, spacerBottom: true }];
  const measuredBlocks = [{ role: "hero-text", index: 0, spacerTop: false, spacerBottom: true }];

  const defects = evaluateSpacerState({ blocks, measuredBlocks });

  assert.deepEqual(defects, []);
});

test("evaluateSpacerState: measured spacerTop on when spec declares it off -> spacer-state-mismatch defect", () => {
  const blocks = [{ role: "hero-text", spacerTop: false, spacerBottom: true }];
  const measuredBlocks = [{ role: "hero-text", index: 0, spacerTop: true, spacerBottom: true }];

  const defects = evaluateSpacerState({ blocks, measuredBlocks });

  assert.deepEqual(defects, [
    { type: "spacer-state-mismatch", role: "hero-text", index: 0, side: "spacerTop", expected: false, measured: true },
  ]);
});

test("evaluateSpacerState: side omitted from spec block -> not checked", () => {
  const blocks = [{ role: "hero-text", spacerBottom: true }];
  const measuredBlocks = [{ role: "hero-text", index: 0, spacerTop: true, spacerBottom: true }];

  const defects = evaluateSpacerState({ blocks, measuredBlocks });

  assert.deepEqual(defects, []);
});

test("evaluateStyleProbes: matching computed style -> no defect", () => {
  const probes = [{ role: "navigation-header", property: "background-color", expected: "transparent" }];
  const measuredStyles = [{ role: "navigation-header", index: 0, property: "background-color", value: "transparent" }];

  const defects = evaluateStyleProbes({ probes, measuredStyles });

  assert.deepEqual(defects, []);
});

test("evaluateStyleProbes: mismatched computed style -> style-mismatch defect", () => {
  const probes = [{ role: "navigation-header", property: "background-color", expected: "transparent" }];
  const measuredStyles = [{ role: "navigation-header", index: 0, property: "background-color", value: "rgb(255, 255, 255)" }];

  const defects = evaluateStyleProbes({ probes, measuredStyles });

  assert.equal(defects.length, 1);
  assert.deepEqual(defects[0], {
    type: "style-mismatch",
    role: "navigation-header",
    index: 0,
    property: "background-color",
    expected: "transparent",
    measured: "rgb(255, 255, 255)",
  });
});

test("evaluateStyleProbes: numeric expected within tolerance -> no defect", () => {
  const probes = [{ role: "hero-text", property: "font-size", expected: 48, tolerance: 1 }];
  const measuredStyles = [{ role: "hero-text", index: 0, property: "font-size", value: "48.5px" }];

  const defects = evaluateStyleProbes({ probes, measuredStyles });

  assert.deepEqual(defects, []);
});

test("evaluateStyleProbes: probe with no measured counterpart -> missing-style-probe defect", () => {
  const probes = [{ role: "pagination-page", property: "background-color", expected: "transparent" }];
  const measuredStyles = [];

  const defects = evaluateStyleProbes({ probes, measuredStyles });

  assert.deepEqual(defects, [{ type: "missing-style-probe", role: "pagination-page", index: 0, property: "background-color" }]);
});

test("evaluateDevicePairing: same block sequence, same shared style probes -> no defect", () => {
  const templateD = {
    blocks: [{ role: "navigation-header" }, { role: "hero-text" }],
    styleProbes: [{ role: "navigation-header", property: "background-color", expected: "transparent" }],
  };
  const templateM = {
    blocks: [{ role: "navigation-header" }, { role: "hero-text" }],
    styleProbes: [{ role: "navigation-header", property: "background-color", expected: "transparent" }],
  };

  const defects = evaluateDevicePairing({ templateD, templateM, templateId: "Home" });

  assert.deepEqual(defects, []);
});

test("evaluateDevicePairing: M drops a block D has -> device-pairing-sequence-mismatch defect", () => {
  const templateD = { blocks: [{ role: "navigation-header" }, { role: "hero-text" }] };
  const templateM = { blocks: [{ role: "navigation-header" }] };

  const defects = evaluateDevicePairing({ templateD, templateM, templateId: "Home" });

  assert.deepEqual(defects, [
    { type: "device-pairing-sequence-mismatch", templateId: "Home", d: ["navigation-header#0", "hero-text#0"], m: ["navigation-header#0"] },
  ]);
});

test("evaluateDevicePairing: a role shared by both D and M has a style probe on only one side -> device-pairing-style-probe-mismatch defect (the D-Home/M-Home nav-transparency gap)", () => {
  const templateD = {
    blocks: [{ role: "navigation-header" }],
    styleProbes: [{ role: "navigation-header", property: "background-color", expected: "transparent" }],
  };
  const templateM = { blocks: [{ role: "navigation-header" }] };

  const defects = evaluateDevicePairing({ templateD, templateM, templateId: "Home" });

  assert.deepEqual(defects, [
    {
      type: "device-pairing-style-probe-mismatch",
      templateId: "Home",
      role: "navigation-header",
      index: 0,
      property: "background-color",
      d: "transparent",
      m: undefined,
    },
  ]);
});

test("evaluateDevicePairing: a block marked deviceOnly is excluded from the sequence comparison (mobile-nav's own device chrome)", () => {
  const templateD = { blocks: [{ role: "navigation-header" }] };
  const templateM = { blocks: [{ role: "navigation-header" }, { role: "mobile-nav", deviceOnly: true }] };

  const defects = evaluateDevicePairing({ templateD, templateM, templateId: "Home" });

  assert.deepEqual(defects, []);
});

test("evaluateDevicePairing: a content-driven block (repeating case-study section) is excluded from the sequence comparison even when its count differs across the pair", () => {
  const templateD = {
    blocks: [
      { role: "navigation-header" },
      { role: "feature-text-block", index: 0, height: "content" },
      { role: "feature-text-block", index: 1, height: "content" },
      { role: "feature-text-block", index: 2, height: "content" },
    ],
  };
  const templateM = {
    blocks: [{ role: "navigation-header" }, { role: "feature-text-block", index: 0, height: "content" }],
  };

  const defects = evaluateDevicePairing({ templateD, templateM, templateId: "Project" });

  assert.deepEqual(defects, []);
});

test("evaluateDevicePairing: no M side for a D-only template (e.g. hidden future page) -> not this check's job", () => {
  const defects = evaluateDevicePairing({ templateD: { blocks: [] }, templateM: undefined, templateId: "About" });

  assert.deepEqual(defects, []);
});

test("computeTemplateDefects: composes geometry + grid + style defects, tagged with templateId/route/viewport", () => {
  const template = {
    viewport: "D",
    blocks: [
      { role: "header-media", y: 0, height: 1549, tolerance: 4 },
      { role: "split-asymmetric", index: 0, height: "content" },
    ],
    gridChecks: [{ role: "header-media" }],
    styleProbes: [{ role: "navigation-header", property: "background-color", expected: "transparent" }],
  };
  const measured = {
    viewportWidth: 1280,
    gridVars: { margin: 32, gap: 32 },
    blocks: [
      { role: "header-media", index: 0, x: 0, y: 0, width: 1280, height: 1597 },
      { role: "split-asymmetric", index: 0, x: 0, y: 1597, width: 1280, height: 822 },
    ],
    gridCells: [{ role: "header-media", index: 0, x: 40, width: 1200 }],
    styles: [{ role: "navigation-header", index: 0, property: "background-color", value: "transparent" }],
  };

  const defects = computeTemplateDefects({ template, templateId: "D-Project", route: "/projects/yardsale", viewportName: "D", measured });

  assert.equal(defects.length, 2);
  assert.deepEqual(defects[0], {
    type: "geometry-mismatch",
    role: "header-media",
    index: 0,
    field: "height",
    expected: 1549,
    measured: 1597,
    deltaPx: 48,
    tolerance: 4,
    templateId: "D-Project",
    route: "/projects/yardsale",
    viewport: "D",
  });
  assert.equal(defects[1].type, "grid-misaligned");
  assert.equal(defects[1].templateId, "D-Project");
  assert.equal(defects[1].route, "/projects/yardsale");
  assert.equal(defects[1].viewport, "D");
});

const SIMPLE_SPEC = {
  $schema: "template-spec/v1",
  templates: {
    "D-Home": { viewport: "D", blocks: [{ role: "hero-text", y: 0, height: 648, tolerance: 6 }] },
  },
};
const SIMPLE_MAP = {
  templates: {
    viewports: [{ name: "D", width: 1280, height: 720 }],
    routes: [{ route: "/", templates: { D: "D-Home" } }],
  },
};

function okMeasured() {
  return { viewportWidth: 1280, gridVars: { margin: 32, gap: 32 }, blocks: [{ role: "hero-text", index: 0, x: 0, y: 0, width: 1280, height: 648 }], gridCells: [], styles: [] };
}

test("runTemplateCheck: aligned measurement -> ok:true, zero defects", async () => {
  const { specPath, mapPath } = makeFixture({ spec: SIMPLE_SPEC, map: SIMPLE_MAP });

  const result = await runTemplateCheck({
    specPath,
    mapPath,
    baseUrl: "http://localhost:9999",
    measureImpl: async () => okMeasured(),
    appendEnvelope: false,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.defects, []);
});

test("runTemplateCheck: drifted measurement -> ok:false, tagged defect", async () => {
  const { specPath, mapPath } = makeFixture({ spec: SIMPLE_SPEC, map: SIMPLE_MAP });

  const result = await runTemplateCheck({
    specPath,
    mapPath,
    baseUrl: "http://localhost:9999",
    measureImpl: async () => ({ ...okMeasured(), blocks: [{ role: "hero-text", index: 0, x: 0, y: 0, width: 1280, height: 700 }] }),
    appendEnvelope: false,
  });

  assert.equal(result.ok, false);
  assert.equal(result.defects.length, 1);
  assert.equal(result.defects[0].type, "geometry-mismatch");
  assert.equal(result.defects[0].templateId, "D-Home");
  assert.equal(result.defects[0].route, "/");
  assert.equal(result.defects[0].viewport, "D");
});

test("runTemplateCheck: templateId absent from spec -> missing-template-spec defect, no crash", async () => {
  const { specPath, mapPath } = makeFixture({
    spec: { $schema: "template-spec/v1", templates: {} },
    map: SIMPLE_MAP,
  });

  const result = await runTemplateCheck({
    specPath,
    mapPath,
    baseUrl: "http://localhost:9999",
    measureImpl: async () => okMeasured(),
    appendEnvelope: false,
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.defects, [{ type: "missing-template-spec", templateId: "D-Home", route: "/", viewport: "D" }]);
});

test("runTemplateCheck: measureImpl throws for one route -> measurement-failed defect, other routes still checked", async () => {
  const twoRouteMap = {
    templates: {
      viewports: [{ name: "D", width: 1280, height: 720 }],
      routes: [
        { route: "/broken", templates: { D: "D-Home" } },
        { route: "/", templates: { D: "D-Home" } },
      ],
    },
  };
  const { specPath, mapPath } = makeFixture({ spec: SIMPLE_SPEC, map: twoRouteMap });

  const result = await runTemplateCheck({
    specPath,
    mapPath,
    baseUrl: "http://localhost:9999",
    measureImpl: async ({ url }) => {
      if (url.includes("/broken")) throw new Error("navigation timeout");
      return okMeasured();
    },
    appendEnvelope: false,
  });

  assert.equal(result.ok, false);
  assert.equal(result.defects.length, 1);
  assert.deepEqual(result.defects[0], {
    type: "measurement-failed",
    templateId: "D-Home",
    route: "/broken",
    viewport: "D",
    detail: "navigation timeout",
  });
});

test("runTemplateCheck: appends a `templates`-keyed envelope to conformance.jsonl, never throwing on write", async () => {
  const { specPath, mapPath } = makeFixture({ spec: SIMPLE_SPEC, map: SIMPLE_MAP });
  const liveDir = mkdtempSync(join(tmpdir(), "template-check-live-"));
  const conformancePath = join(liveDir, "conformance.jsonl");

  await runTemplateCheck({
    specPath,
    mapPath,
    baseUrl: "http://localhost:9999",
    measureImpl: async () => ({ ...okMeasured(), blocks: [{ role: "hero-text", index: 0, x: 0, y: 0, width: 1280, height: 700 }] }),
    conformancePath,
  });

  assert.equal(existsSync(conformancePath), true);
  const record = JSON.parse(readFileSync(conformancePath, "utf8").trim().split("\n").pop());
  assert.equal(record.templates.ok, false);
  assert.equal(record.templates.defects.length, 1);
  assert.match(record.templates.summary, /1 defect/);
});

test("runTemplateCheck: a spec's D/M pair diverging on a shared-role style probe surfaces a device-pairing defect, even with an aligned live measurement", async () => {
  const pairedSpec = {
    $schema: "template-spec/v1",
    templates: {
      "D-Home": {
        viewport: "D",
        blocks: [{ role: "hero-text", y: 0, height: 648, tolerance: 6 }],
        styleProbes: [{ role: "hero-text", property: "background-color", expected: "transparent" }],
      },
      "M-Home": { viewport: "M", blocks: [{ role: "hero-text", y: 0, height: 648, tolerance: 6 }] },
    },
  };
  const pairedMap = {
    templates: {
      viewports: [{ name: "D", width: 1280, height: 720 }],
      routes: [{ route: "/", templates: { D: "D-Home" } }],
    },
  };
  const { specPath, mapPath } = makeFixture({ spec: pairedSpec, map: pairedMap });

  const measured = {
    ...okMeasured(),
    styles: [{ role: "hero-text", index: 0, property: "background-color", value: "transparent" }],
  };
  const result = await runTemplateCheck({
    specPath,
    mapPath,
    baseUrl: "http://localhost:9999",
    measureImpl: async () => measured,
    appendEnvelope: false,
  });

  assert.equal(result.ok, false);
  assert.deepEqual(
    result.defects.filter((d) => d.type === "device-pairing-style-probe-mismatch"),
    [
      {
        type: "device-pairing-style-probe-mismatch",
        templateId: "Home",
        role: "hero-text",
        index: 0,
        property: "background-color",
        d: "transparent",
        m: undefined,
        route: "(spec)",
        viewport: "D+M",
      },
    ]
  );
});

test("parseArgs: reads --map/--spec/--base-url/--start-server/--port, with defaults", () => {
  const parsed = parseArgs(["node", "template-check.mjs", "--map", "/a/map.json", "--spec", "/a/spec.json", "--base-url", "http://x:1", "--start-server", "/a/dir", "--port", "4000"]);

  assert.equal(parsed.mapPath, "/a/map.json");
  assert.equal(parsed.specPath, "/a/spec.json");
  assert.equal(parsed.baseUrl, "http://x:1");
  assert.equal(parsed.startServerDir, "/a/dir");
  assert.equal(parsed.portRangeStart, 4000);
});

test("parseArgs: --port defaults to 3230 when omitted", () => {
  const parsed = parseArgs(["node", "template-check.mjs"]);
  assert.equal(parsed.portRangeStart, 3230);
});

test("findFreePort: returns a listening-free port at or after the requested start", async () => {
  const { createServer } = await import("node:net");
  const occupied = await new Promise((resolve) => {
    const srv = createServer();
    srv.listen(0, "127.0.0.1", () => resolve(srv));
  });
  const occupiedPort = occupied.address().port;

  const port = await findFreePort(occupiedPort);

  assert.notEqual(port, occupiedPort);
  assert.ok(port >= occupiedPort);
  await new Promise((resolve) => occupied.close(resolve));
});
