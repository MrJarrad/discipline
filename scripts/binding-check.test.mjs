// Tests for binding-check.mjs — vertical slices, one behavior per test.
// Run: node --test scripts/binding-check.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { runBindingCheck } from "./binding-check.mjs";

const CLI_PATH = join(import.meta.dirname, "binding-check.mjs");

// Builds a fixture repo: <root>/design/figma-map.json (the mapping) +
// <root>/<codeLocation> (the code file) + a capture with a components section,
// matching the real convention where codeLocation is relative to the mapping
// file's grandparent directory.
function makeFixture({ sets = [], standalone = [], componentSets = [], templateFrames = [], mapping, code = {}, annotations }) {
  const root = mkdtempSync(join(tmpdir(), "binding-check-test-"));
  mkdirSync(join(root, "design"), { recursive: true });
  const capturePath = join(root, "capture.json");
  writeFileSync(
    capturePath,
    JSON.stringify({
      header: { fileName: "Test", pluginVersion: "1.0", exportedAt: 0, counts: {} },
      collections: [],
      styles: [],
      components: { standalone, sets },
      componentSets,
      templateFrames,
    }),
    "utf8"
  );
  const mappingPath = join(root, "design", "figma-map.json");
  writeFileSync(mappingPath, JSON.stringify(mapping), "utf8");
  for (const [relPath, contents] of Object.entries(code)) {
    const fullPath = join(root, relPath);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, contents, "utf8");
  }
  // The annotation registry is a fixture input like any other — tests that
  // don't pass one run with `annotationsPath: null` so they see the lane's
  // raw output, never the shipped fleet registry.
  let annotationsPath;
  if (annotations) {
    annotationsPath = join(root, "design", "annotations-registry.json");
    writeFileSync(annotationsPath, JSON.stringify(annotations), "utf8");
  }
  return { root, capturePath, mappingPath, annotationsPath };
}

function heroSet(textStyle = "title-style1/300") {
  return {
    name: "HeroText",
    key: "abc",
    variants: [
      {
        name: "device=desktop, height=half",
        key: "v1",
        bindings: [{ layer: "wrapper/Content/Title/Title", property: "textStyle", value: textStyle }],
      },
      {
        name: "device=mobile, height=half",
        key: "v2",
        bindings: [{ layer: "wrapper/Content/Title/Title", property: "textStyle", value: textStyle }],
      },
    ],
  };
}

test("css-class assertion, aligned binding -> ok:true, zero defects", () => {
  const { capturePath, mappingPath } = makeFixture({
    sets: [heroSet("title-style1/300")],
    mapping: {
      $schema: "conformance-map/v1",
      components: {
        entries: [
          {
            component: "HeroText",
            layer: "wrapper/Content/Title/Title",
            property: "textStyle",
            codeLocation: "src/app/page.tsx",
            assertion: { kind: "css-class" },
          },
        ],
      },
    },
    code: { "src/app/page.tsx": `<HeroText titleStep="title-style1-300" />` },
  });

  const result = runBindingCheck({ capturePath, mappingPath, annotationsPath: null });

  assert.equal(result.ok, true);
  assert.deepEqual(result.needs_action, []);
  assert.match(result.summary, /0 needing action, 0 annotated/);
});

test("css-class assertion, drifted binding (the hero bug) -> one binding_mismatch defect", () => {
  const { capturePath, mappingPath } = makeFixture({
    // Figma still binds the hero title to step 300...
    sets: [heroSet("title-style1/300")],
    mapping: {
      $schema: "conformance-map/v1",
      components: {
        entries: [
          {
            component: "HeroText",
            layer: "wrapper/Content/Title/Title",
            property: "textStyle",
            codeLocation: "src/app/page.tsx",
            assertion: { kind: "css-class" },
          },
        ],
      },
    },
    // ...but the page drifted to step 500 — invisible to a value-only checker
    // since title-style1-500 is itself a perfectly valid, correctly-valued
    // token; it's just the WRONG one for this layer.
    code: { "src/app/page.tsx": `<HeroText titleStep="title-style1-500" />` },
  });

  const result = runBindingCheck({ capturePath, mappingPath, annotationsPath: null });

  assert.equal(result.ok, false);
  assert.equal(result.needs_action.length, 1);
  assert.deepEqual(result.needs_action[0], {
    component: "HeroText",
    layer: "wrapper/Content/Title/Title",
    property: "textStyle",
    codeLocation: "src/app/page.tsx",
    old: "title-style1/300",
    new: "title-style1-300",
    type: "binding_mismatch",
    lane: "binding",
    classification: "drift",
  });
});

test("literal assertion, aligned -> ok:true", () => {
  const { capturePath, mappingPath } = makeFixture({
    sets: [
      {
        name: ".NavigationHeaderActions",
        key: "nha",
        variants: [
          {
            name: "device=sm",
            key: "v1",
            bindings: [{ layer: "feed/ActionButton", property: "instance", value: "layout=primary, size=300, state=default" }],
          },
        ],
      },
    ],
    mapping: {
      $schema: "conformance-map/v1",
      components: {
        entries: [
          {
            component: ".NavigationHeaderActions",
            layer: "feed/ActionButton",
            property: "instance",
            variant: "device=sm",
            codeLocation: "src/components/navigation-header.tsx",
            assertion: { kind: "literal", value: 'size="300"' },
          },
        ],
      },
    },
    code: { "src/components/navigation-header.tsx": `<Action size="300" className="flex-1">` },
  });

  const result = runBindingCheck({ capturePath, mappingPath, annotationsPath: null });

  assert.equal(result.ok, true);
  assert.deepEqual(result.needs_action, []);
});

test("component-set property default: aligned -> ok:true, zero defects", () => {
  const { capturePath, mappingPath } = makeFixture({
    componentSets: [
      {
        name: "HeroText",
        id: "153:64",
        properties: {
          "has-spacer-bottom#153:1": { type: "BOOLEAN", defaultValue: true },
        },
      },
    ],
    mapping: {
      $schema: "conformance-map/v1",
      components: {
        entries: [
          {
            component: "HeroText",
            layer: "HeroText",
            property: "has-spacer-bottom#153:1",
            codeLocation: "src/components/hero-text.tsx",
            assertion: { kind: "literal", value: "hasSpacerBottom = true" },
          },
        ],
      },
    },
    code: { "src/components/hero-text.tsx": `export function HeroText({\n  hasSpacerBottom = true,\n}) {}` },
  });

  const result = runBindingCheck({ capturePath, mappingPath, annotationsPath: null });

  assert.equal(result.ok, true);
  assert.deepEqual(result.needs_action, []);
});

test("component-set property default: code drifted from the figma default -> one binding_mismatch defect", () => {
  const { capturePath, mappingPath } = makeFixture({
    componentSets: [
      {
        name: "HeroText",
        id: "153:64",
        properties: {
          "has-spacer-bottom#153:1": { type: "BOOLEAN", defaultValue: true },
        },
      },
    ],
    mapping: {
      $schema: "conformance-map/v1",
      components: {
        entries: [
          {
            component: "HeroText",
            layer: "HeroText",
            property: "has-spacer-bottom#153:1",
            codeLocation: "src/components/hero-text.tsx",
            assertion: { kind: "literal", value: "hasSpacerBottom = true" },
          },
        ],
      },
    },
    // code drifted to a false default
    code: { "src/components/hero-text.tsx": `export function HeroText({\n  hasSpacerBottom = false,\n}) {}` },
  });

  const result = runBindingCheck({ capturePath, mappingPath, annotationsPath: null });

  assert.equal(result.ok, false);
  assert.equal(result.needs_action.length, 1);
  assert.equal(result.needs_action[0].type, "binding_mismatch");
});

test("component-set property missing from the capture -> missing-figma-binding defect", () => {
  const { capturePath, mappingPath } = makeFixture({
    componentSets: [{ name: "HeroText", id: "153:64", properties: {} }],
    mapping: {
      $schema: "conformance-map/v1",
      components: {
        entries: [
          {
            component: "HeroText",
            layer: "HeroText",
            property: "has-spacer-bottom#153:1",
            codeLocation: "src/components/hero-text.tsx",
            assertion: { kind: "literal", value: "hasSpacerBottom = true" },
          },
        ],
      },
    },
    code: { "src/components/hero-text.tsx": `hasSpacerBottom = true,` },
  });

  const result = runBindingCheck({ capturePath, mappingPath, annotationsPath: null });

  assert.equal(result.ok, false);
  assert.deepEqual(result.needs_action, [
    {
      component: "HeroText",
      layer: "HeroText",
      property: "has-spacer-bottom#153:1",
      codeLocation: "src/components/hero-text.tsx",
      type: "missing-figma-binding",
      lane: "binding",
      classification: "drift",
    },
  ]);
});

test("component-set property default: figmaExpected present and code aligned -> ok:true, zero defects", () => {
  const { capturePath, mappingPath } = makeFixture({
    componentSets: [
      {
        name: "HeroText",
        id: "153:64",
        properties: {
          "has-spacer-bottom#153:1": { type: "BOOLEAN", defaultValue: true },
        },
      },
    ],
    mapping: {
      $schema: "conformance-map/v1",
      components: {
        entries: [
          {
            component: "HeroText",
            layer: "HeroText",
            property: "has-spacer-bottom#153:1",
            codeLocation: "src/components/hero-text.tsx",
            assertion: { kind: "literal", value: "hasSpacerBottom = true", figmaExpected: true },
          },
        ],
      },
    },
    code: { "src/components/hero-text.tsx": `export function HeroText({\n  hasSpacerBottom = true,\n}) {}` },
  });

  const result = runBindingCheck({ capturePath, mappingPath, annotationsPath: null });

  assert.equal(result.ok, true);
  assert.deepEqual(result.needs_action, []);
});

test("component-set property default: FIGMA-side flip (defaultValue true->false) with code unchanged -> one figma-value-mismatch defect (the reviewer's reproduced blind spot)", () => {
  const { capturePath, mappingPath } = makeFixture({
    // The designer flips the default in Figma...
    componentSets: [
      {
        name: "HeroText",
        id: "153:64",
        properties: {
          "has-spacer-bottom#153:1": { type: "BOOLEAN", defaultValue: false },
        },
      },
    ],
    mapping: {
      $schema: "conformance-map/v1",
      components: {
        entries: [
          {
            component: "HeroText",
            layer: "HeroText",
            property: "has-spacer-bottom#153:1",
            codeLocation: "src/components/hero-text.tsx",
            assertion: { kind: "literal", value: "hasSpacerBottom = true", figmaExpected: true },
          },
        ],
      },
    },
    // ...but code never changed. A plain "literal" check (code text still
    // contains "hasSpacerBottom = true") would report zero defects here —
    // figmaExpected is what catches the Figma-side drift.
    code: { "src/components/hero-text.tsx": `export function HeroText({\n  hasSpacerBottom = true,\n}) {}` },
  });

  const result = runBindingCheck({ capturePath, mappingPath, annotationsPath: null });

  assert.equal(result.ok, false);
  assert.deepEqual(result.needs_action, [
    {
      component: "HeroText",
      layer: "HeroText",
      property: "has-spacer-bottom#153:1",
      codeLocation: "src/components/hero-text.tsx",
      old: true,
      new: false,
      type: "figma-value-mismatch",
      lane: "binding",
      classification: "drift",
    },
  ]);
});

test("component-set property default: figmaExpected satisfied but CODE drifted -> still one binding_mismatch defect (both directions covered)", () => {
  const { capturePath, mappingPath } = makeFixture({
    componentSets: [
      {
        name: "HeroText",
        id: "153:64",
        properties: {
          "has-spacer-bottom#153:1": { type: "BOOLEAN", defaultValue: true },
        },
      },
    ],
    mapping: {
      $schema: "conformance-map/v1",
      components: {
        entries: [
          {
            component: "HeroText",
            layer: "HeroText",
            property: "has-spacer-bottom#153:1",
            codeLocation: "src/components/hero-text.tsx",
            assertion: { kind: "literal", value: "hasSpacerBottom = true", figmaExpected: true },
          },
        ],
      },
    },
    // Figma's default still matches figmaExpected — but the code drifted.
    code: { "src/components/hero-text.tsx": `export function HeroText({\n  hasSpacerBottom = false,\n}) {}` },
  });

  const result = runBindingCheck({ capturePath, mappingPath, annotationsPath: null });

  assert.equal(result.ok, false);
  assert.equal(result.needs_action.length, 1);
  assert.equal(result.needs_action[0].type, "binding_mismatch");
});

function paginationFrame({ frameName, deviceVariant, variableId }) {
  return {
    id: `${frameName}-id`,
    name: frameName,
    instances: [
      {
        id: `${frameName}-instance`,
        name: "PaginationPage",
        component: "PaginationPage",
        variantProps: { device: deviceVariant },
        overrides: [
          {
            id: `${frameName}-instance/PaginationPage`,
            property: "boundVariables",
            value: { height: { type: "VARIABLE_ALIAS", id: variableId } },
          },
        ],
      },
    ],
  };
}

test("instance boundVariables alias target: matching id present under the variant filter -> ok:true, zero defects", () => {
  const { capturePath, mappingPath } = makeFixture({
    templateFrames: [
      paginationFrame({ frameName: "M - Project", deviceVariant: "sm", variableId: "VariableID:163:90" }),
      paginationFrame({ frameName: "D - Home", deviceVariant: "md+", variableId: "VariableID:163:91" }),
    ],
    mapping: {
      $schema: "conformance-map/v1",
      components: {
        entries: [
          {
            component: "PaginationPage",
            layer: "PaginationPage",
            property: "boundVariables.height",
            variant: "device=sm",
            codeLocation: "src/app/globals.css",
            assertion: { kind: "literal", value: "VariableID:163:90 (expected device/screen-height/500)" },
          },
        ],
      },
    },
    code: { "src/app/globals.css": `:root { --screen-height-500: 70dvh; }` },
  });

  const result = runBindingCheck({ capturePath, mappingPath, annotationsPath: null });

  assert.equal(result.ok, true);
  assert.deepEqual(result.needs_action, []);
});

test("instance boundVariables alias target: no matching instance carries the expected id -> one binding_mismatch defect", () => {
  const { capturePath, mappingPath } = makeFixture({
    // The capture drifted back to the OLD id under device=sm — nothing
    // matches VariableID:163:90 anymore, so the repoint the map asserts is
    // gone.
    templateFrames: [paginationFrame({ frameName: "M - Project", deviceVariant: "sm", variableId: "VariableID:163:91" })],
    mapping: {
      $schema: "conformance-map/v1",
      components: {
        entries: [
          {
            component: "PaginationPage",
            layer: "PaginationPage",
            property: "boundVariables.height",
            variant: "device=sm",
            codeLocation: "src/app/globals.css",
            assertion: { kind: "literal", value: "VariableID:163:90 (expected device/screen-height/500)" },
          },
        ],
      },
    },
    code: { "src/app/globals.css": `:root { --screen-height-500: 70dvh; }` },
  });

  const result = runBindingCheck({ capturePath, mappingPath, annotationsPath: null });

  assert.equal(result.ok, false);
  assert.equal(result.needs_action.length, 1);
  assert.equal(result.needs_action[0].type, "binding_mismatch");
});

test("instance boundVariables alias target: no instance of the component at all -> missing-figma-binding defect", () => {
  const { capturePath, mappingPath } = makeFixture({
    templateFrames: [],
    mapping: {
      $schema: "conformance-map/v1",
      components: {
        entries: [
          {
            component: "PaginationPage",
            layer: "PaginationPage",
            property: "boundVariables.height",
            variant: "device=sm",
            codeLocation: "src/app/globals.css",
            assertion: { kind: "literal", value: "VariableID:163:90 (expected device/screen-height/500)" },
          },
        ],
      },
    },
    code: { "src/app/globals.css": `:root { --screen-height-500: 70dvh; }` },
  });

  const result = runBindingCheck({ capturePath, mappingPath, annotationsPath: null });

  assert.equal(result.ok, false);
  assert.deepEqual(result.needs_action, [
    {
      component: "PaginationPage",
      layer: "PaginationPage",
      property: "boundVariables.height",
      variant: "device=sm",
      codeLocation: "src/app/globals.css",
      type: "missing-figma-binding",
      lane: "binding",
      classification: "drift",
    },
  ]);
});

test("CLI exits 0 when ok:true, nonzero when ok:false", () => {
  const aligned = makeFixture({
    sets: [heroSet("title-style1/300")],
    mapping: {
      $schema: "conformance-map/v1",
      components: {
        entries: [
          { component: "HeroText", layer: "wrapper/Content/Title/Title", property: "textStyle", codeLocation: "src/app/page.tsx", assertion: { kind: "css-class" } },
        ],
      },
    },
    code: { "src/app/page.tsx": `titleStep="title-style1-300"` },
  });
  const drifted = makeFixture({
    sets: [heroSet("title-style1/300")],
    mapping: {
      $schema: "conformance-map/v1",
      components: {
        entries: [
          { component: "HeroText", layer: "wrapper/Content/Title/Title", property: "textStyle", codeLocation: "src/app/page.tsx", assertion: { kind: "css-class" } },
        ],
      },
    },
    code: { "src/app/page.tsx": `titleStep="title-style1-500"` },
  });

  const okRun = spawnSync("node", [CLI_PATH, "--capture", aligned.capturePath, "--map", aligned.mappingPath]);
  assert.equal(okRun.status, 0);

  const failRun = spawnSync("node", [CLI_PATH, "--capture", drifted.capturePath, "--map", drifted.mappingPath]);
  assert.notEqual(failRun.status, 0);
});

test("missing figma component -> missing-figma-component defect", () => {
  const { capturePath, mappingPath } = makeFixture({
    sets: [],
    mapping: {
      $schema: "conformance-map/v1",
      components: {
        entries: [
          {
            component: "HeroText",
            layer: "wrapper/Content/Title/Title",
            property: "textStyle",
            codeLocation: "src/app/page.tsx",
            assertion: { kind: "css-class" },
          },
        ],
      },
    },
  });

  const result = runBindingCheck({ capturePath, mappingPath, annotationsPath: null });

  assert.equal(result.ok, false);
  assert.deepEqual(result.needs_action, [
    {
      component: "HeroText",
      layer: "wrapper/Content/Title/Title",
      property: "textStyle",
      codeLocation: "src/app/page.tsx",
      type: "missing-figma-component",
      lane: "binding",
      classification: "drift",
    },
  ]);
});

test("codeLocation file missing -> missing-code-location defect, does not throw", () => {
  const { capturePath, mappingPath } = makeFixture({
    sets: [heroSet("title-style1/300")],
    mapping: {
      $schema: "conformance-map/v1",
      components: {
        entries: [
          {
            component: "HeroText",
            layer: "wrapper/Content/Title/Title",
            property: "textStyle",
            codeLocation: "does-not-exist.tsx",
            assertion: { kind: "css-class" },
          },
        ],
      },
    },
  });

  const result = runBindingCheck({ capturePath, mappingPath, annotationsPath: null });

  assert.equal(result.ok, false);
  assert.deepEqual(result.needs_action, [
    {
      component: "HeroText",
      layer: "wrapper/Content/Title/Title",
      property: "textStyle",
      codeLocation: "does-not-exist.tsx",
      type: "missing-code-location",
      lane: "binding",
      classification: "drift",
    },
  ]);
});

test("variants disagree with no variant filter -> variant-divergence defect", () => {
  const { capturePath, mappingPath } = makeFixture({
    sets: [
      {
        name: "ActionButton",
        key: "ab",
        variants: [
          { name: "size=200", key: "v1", bindings: [{ layer: ".ActionButtonTitle", property: "instance", value: "size=100" }] },
          { name: "size=300", key: "v2", bindings: [{ layer: ".ActionButtonTitle", property: "instance", value: "size=200" }] },
        ],
      },
    ],
    mapping: {
      $schema: "conformance-map/v1",
      components: {
        entries: [
          {
            component: "ActionButton",
            layer: ".ActionButtonTitle",
            property: "instance",
            codeLocation: "src/components/ui/action.tsx",
            assertion: { kind: "literal", value: "size=100" },
          },
        ],
      },
    },
    code: { "src/components/ui/action.tsx": `whatever` },
  });

  const result = runBindingCheck({ capturePath, mappingPath, annotationsPath: null });

  assert.equal(result.ok, false);
  assert.equal(result.needs_action.length, 1);
  assert.equal(result.needs_action[0].type, "variant-divergence");
});

// ---- ANNOTATE, NEVER SUPPRESS (operator ruling 2026-08-14, vault
// fleet/rulings/2026-08-14-rulings-annotate-never-suppress.md) ------------
//
// These tests replace the ratifiedVariants suppression tests that stood here.
// The old contract was "a ratified match produces NO defect"; that silence is
// the defect the ruling exists to prevent. The new contract: the difference is
// emitted either way, and a ruling only decides which side of the
// needs-action / annotated split it lands on.

const RATIFIED_SPLIT_TEXT_FIXTURE = {
  sets: [
    {
      name: "SplitContent",
      key: "sc",
      variants: [
        {
          name: "device=sm, layout=split-text",
          key: "v1",
          bindings: [{ layer: "layout/grid", property: "gap", value: "layout/grid/gap-lg" }],
        },
        {
          name: "device=lg, layout=split-text",
          key: "v2",
          bindings: [{ layer: "layout/grid", property: "gap", value: "layout/grid/gap" }],
        },
      ],
    },
  ],
  mapping: {
    $schema: "conformance-map/v1",
    components: {
      entries: [
        {
          component: "SplitContent",
          layer: "layout/grid",
          property: "gap",
          codeLocation: "src/components/split-content.tsx",
          assertion: { kind: "css-class" },
        },
      ],
    },
  },
  code: { "src/components/split-content.tsx": `className="layout-grid-gap"` },
};

const SPLIT_TEXT_ANNOTATION = {
  annotations: [
    {
      id: "splitcontent-split-text-row-gap",
      lane: "binding",
      classification: "ratified-exception",
      ruling: "operator ruling 2026-08-02: two stacked text blocks need more space",
      match: {
        component: "SplitContent",
        layer: "layout/grid",
        property: "gap",
        variantIncludes: "device=sm, layout=split-text",
      },
    },
  ],
};

test("REGRESSION (annotate-never-suppress): a ratified divergence is EMITTED — the item exists whether or not a ruling covers it", () => {
  const { capturePath, mappingPath } = makeFixture(RATIFIED_SPLIT_TEXT_FIXTURE);

  const result = runBindingCheck({ capturePath, mappingPath, annotationsPath: null });

  assert.equal(result.items.length, 1, "the divergence reaches the output with no ruling in play");
  assert.equal(result.items[0].type, "variant-divergence");
  assert.match(result.items[0].detail, /device=sm, layout=split-text=layout\/grid\/gap-lg/);
  assert.equal(result.needs_action.length, 1, "unannotated, it needs action");
});

test("REGRESSION (annotate-never-suppress): the ruling moves that same item to ANNOTATED — it is never removed", () => {
  const { capturePath, mappingPath, annotationsPath } = makeFixture({
    ...RATIFIED_SPLIT_TEXT_FIXTURE,
    annotations: SPLIT_TEXT_ANNOTATION,
  });

  const result = runBindingCheck({ capturePath, mappingPath, annotationsPath });

  assert.equal(result.items.length, 1, "the SAME item is still emitted");
  assert.equal(result.items[0].type, "variant-divergence");
  assert.equal(result.needs_action.length, 0, "a ruling that still holds means no action");
  assert.equal(result.annotated.length, 1, "annotated is visible one level down, never gone");
  assert.equal(result.annotated[0].classification, "ratified-exception");
  assert.equal(
    result.annotated[0].annotation.ruling,
    "operator ruling 2026-08-02: two stacked text blocks need more space"
  );
  assert.match(result.summary, /ANNOTATED/);
  assert.equal(result.ok, true, "an annotated-only run still passes the gate");
});

test("CLOSURE FLIP: an anticipated update stays annotated while its condition is open, and returns to needs-action the sync it is met", () => {
  const anticipated = (variableId) => ({
    templateFrames: [
      {
        name: "M - Project",
        instances: [
          {
            component: "PaginationPage",
            variantProps: { device: "sm" },
            overrides: [{ property: "boundVariables", value: { height: { type: "VARIABLE_ALIAS", id: variableId } } }],
          },
        ],
      },
    ],
    mapping: {
      $schema: "conformance-map/v1",
      components: {
        entries: [
          {
            component: "PaginationPage",
            layer: "PaginationPage",
            property: "boundVariables.height",
            variant: "device=sm",
            codeLocation: "src/app/globals.css",
            assertion: { kind: "literal", value: "VariableID:163:90" },
          },
        ],
      },
    },
    code: { "src/app/globals.css": "--screen-height-500" },
    annotations: {
      annotations: [
        {
          id: "paginationpage-sm-height-screen-height-500",
          lane: "binding",
          classification: "anticipated-update",
          ruling: "code leads; the file is expected to catch up",
          match: { component: "PaginationPage", property: "boundVariables.height" },
          closure: {
            kind: "instance_bound_variable",
            description: "closes when a device=sm PaginationPage instance binds height to VariableID:163:90",
            component: "PaginationPage",
            variantIncludes: "device=sm",
            subProperty: "height",
            variableId: "VariableID:163:90",
          },
        },
      ],
    },
  });

  const open = makeFixture(anticipated("VariableID:163:91"));
  const openResult = runBindingCheck({
    capturePath: open.capturePath,
    mappingPath: open.mappingPath,
    annotationsPath: open.annotationsPath,
  });
  assert.equal(openResult.annotated.length, 1, "condition open -> annotated, stated every sync");
  assert.equal(openResult.annotated[0].annotation.closure.state, "open");
  assert.equal(openResult.needs_action.length, 0);
  assert.equal(openResult.ok, true);

  const met = makeFixture(anticipated("VariableID:163:90"));
  const metResult = runBindingCheck({
    capturePath: met.capturePath,
    mappingPath: met.mappingPath,
    annotationsPath: met.annotationsPath,
  });
  // The file caught up, so the difference itself is gone — and the annotation
  // is the only thing left to say so. It must not go quiet: closure met is
  // needs-action whether or not an item survives to carry it.
  assert.equal(metResult.annotated.length, 0);
  assert.equal(metResult.needs_action.length, 1, "the sync the file catches up, the closure announces itself");
  assert.equal(metResult.needs_action[0].annotation.state, "closure-condition-met");
  assert.equal(metResult.needs_action[0].annotation.closure.state, "met");
  assert.match(metResult.summary, /reconcile now/);
  assert.equal(metResult.ok, false, "closure met is work: the gate fails until it is reconciled");
});

test("a map still carrying the RETIRED ratifiedVariants field suppresses nothing and says so", () => {
  const withRetiredField = JSON.parse(JSON.stringify(RATIFIED_SPLIT_TEXT_FIXTURE));
  withRetiredField.code = RATIFIED_SPLIT_TEXT_FIXTURE.code;
  withRetiredField.mapping.components.entries[0].ratifiedVariants = [
    {
      variant: "device=sm, layout=split-text",
      value: "layout/grid/gap-lg",
      citation: "operator ruling 2026-08-02: two stacked text blocks need more space",
    },
  ];
  const { capturePath, mappingPath } = makeFixture(withRetiredField);

  const result = runBindingCheck({ capturePath, mappingPath, annotationsPath: null });

  const divergence = result.items.filter((i) => i.type === "variant-divergence");
  assert.equal(divergence.length, 1, "the field no longer pulls the divergence out of the comparison");
  const lint = result.needs_action.filter((i) => i.type === "retired_map_field");
  assert.equal(lint.length, 1);
  assert.match(lint[0].detail, /annotations-registry\.json/);
});

test("variant filter narrows to the matching variant only", () => {
  const { capturePath, mappingPath } = makeFixture({
    sets: [
      {
        name: "ActionButton",
        key: "ab",
        variants: [
          { name: "size=200", key: "v1", bindings: [{ layer: ".ActionButtonTitle", property: "instance", value: "size=100" }] },
          { name: "size=300", key: "v2", bindings: [{ layer: ".ActionButtonTitle", property: "instance", value: "size=200" }] },
        ],
      },
    ],
    mapping: {
      $schema: "conformance-map/v1",
      components: {
        entries: [
          {
            component: "ActionButton",
            layer: ".ActionButtonTitle",
            property: "instance",
            variant: "size=200",
            codeLocation: "src/components/ui/action.tsx",
            assertion: { kind: "literal", value: "title-style1-100" },
          },
        ],
      },
    },
    code: { "src/components/ui/action.tsx": `title-style1-100` },
  });

  const result = runBindingCheck({ capturePath, mappingPath, annotationsPath: null });

  assert.equal(result.ok, true);
  assert.deepEqual(result.needs_action, []);
});

// ---- REPRESENTATION MAPPING: name projection ---------------------------
// The one class of rule allowed to make this lane read two forms as EQUAL
// (operator ruling 2026-08-14, scope-sharpening section): Figma's "/" step
// separator and the CSS class "-" convention are the SAME name in two media.
// Audited in references/representation-mappings-audit-2026-08-14.md (A1);
// this is that row's fixture, stated as a two-way mapping rather than a
// one-off assertion.

test("REPRESENTATION MAPPING (name projection): figma \"a/b\" and code \"a-b\" are the same name, in both directions", () => {
  const cases = [
    { figma: "title-style1/300", code: "title-style1-300" },
    { figma: "body-style1/200", code: "body-style1-200" },
    { figma: "layout/grid/gap-lg", code: "layout-grid-gap-lg" },
  ];

  for (const { figma, code } of cases) {
    const { capturePath, mappingPath } = makeFixture({
      sets: [
        {
          name: "HeroText",
          key: "abc",
          variants: [{ name: "device=sm", key: "v1", bindings: [{ layer: "title", property: "textStyle", value: figma }] }],
        },
      ],
      mapping: {
        $schema: "conformance-map/v1",
        components: {
          entries: [
            {
              component: "HeroText",
              layer: "title",
              property: "textStyle",
              codeLocation: "src/app/page.tsx",
              assertion: { kind: "css-class" },
            },
          ],
        },
      },
      code: { "src/app/page.tsx": `<HeroText className="${code}" />` },
    });

    const result = runBindingCheck({ capturePath, mappingPath, annotationsPath: null });
    assert.deepEqual(result.needs_action, [], `${figma} should read equal to ${code}`);
  }
});

test("REPRESENTATION MAPPING (name projection): it maps the separator and NOTHING else — a different step is still a difference", () => {
  const { capturePath, mappingPath } = makeFixture({
    sets: [
      {
        name: "HeroText",
        key: "abc",
        variants: [{ name: "device=sm", key: "v1", bindings: [{ layer: "title", property: "textStyle", value: "title-style1/300" }] }],
      },
    ],
    mapping: {
      $schema: "conformance-map/v1",
      components: {
        entries: [
          {
            component: "HeroText",
            layer: "title",
            property: "textStyle",
            codeLocation: "src/app/page.tsx",
            assertion: { kind: "css-class" },
          },
        ],
      },
    },
    // Same name, different STEP — a real binding difference, not a
    // representation of the same truth.
    code: { "src/app/page.tsx": `<HeroText className="title-style1-500" />` },
  });

  const result = runBindingCheck({ capturePath, mappingPath, annotationsPath: null });

  assert.equal(result.needs_action.length, 1);
  assert.equal(result.needs_action[0].type, "binding_mismatch");
});
