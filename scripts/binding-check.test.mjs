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
function makeFixture({ sets = [], standalone = [], componentSets = [], templateFrames = [], mapping, code = {} }) {
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
  return { root, capturePath, mappingPath };
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

  const result = runBindingCheck({ capturePath, mappingPath });

  assert.equal(result.ok, true);
  assert.deepEqual(result.defects, []);
  assert.match(result.summary, /0 defects/);
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

  const result = runBindingCheck({ capturePath, mappingPath });

  assert.equal(result.ok, false);
  assert.equal(result.defects.length, 1);
  assert.deepEqual(result.defects[0], {
    component: "HeroText",
    layer: "wrapper/Content/Title/Title",
    property: "textStyle",
    codeLocation: "src/app/page.tsx",
    old: "title-style1/300",
    new: "title-style1-300",
    type: "binding_mismatch",
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

  const result = runBindingCheck({ capturePath, mappingPath });

  assert.equal(result.ok, true);
  assert.deepEqual(result.defects, []);
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

  const result = runBindingCheck({ capturePath, mappingPath });

  assert.equal(result.ok, true);
  assert.deepEqual(result.defects, []);
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

  const result = runBindingCheck({ capturePath, mappingPath });

  assert.equal(result.ok, false);
  assert.equal(result.defects.length, 1);
  assert.equal(result.defects[0].type, "binding_mismatch");
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

  const result = runBindingCheck({ capturePath, mappingPath });

  assert.equal(result.ok, false);
  assert.deepEqual(result.defects, [
    {
      component: "HeroText",
      layer: "HeroText",
      property: "has-spacer-bottom#153:1",
      codeLocation: "src/components/hero-text.tsx",
      type: "missing-figma-binding",
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

  const result = runBindingCheck({ capturePath, mappingPath });

  assert.equal(result.ok, true);
  assert.deepEqual(result.defects, []);
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

  const result = runBindingCheck({ capturePath, mappingPath });

  assert.equal(result.ok, false);
  assert.deepEqual(result.defects, [
    {
      component: "HeroText",
      layer: "HeroText",
      property: "has-spacer-bottom#153:1",
      codeLocation: "src/components/hero-text.tsx",
      old: true,
      new: false,
      type: "figma-value-mismatch",
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

  const result = runBindingCheck({ capturePath, mappingPath });

  assert.equal(result.ok, false);
  assert.equal(result.defects.length, 1);
  assert.equal(result.defects[0].type, "binding_mismatch");
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

  const result = runBindingCheck({ capturePath, mappingPath });

  assert.equal(result.ok, true);
  assert.deepEqual(result.defects, []);
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

  const result = runBindingCheck({ capturePath, mappingPath });

  assert.equal(result.ok, false);
  assert.equal(result.defects.length, 1);
  assert.equal(result.defects[0].type, "binding_mismatch");
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

  const result = runBindingCheck({ capturePath, mappingPath });

  assert.equal(result.ok, false);
  assert.deepEqual(result.defects, [
    {
      component: "PaginationPage",
      layer: "PaginationPage",
      property: "boundVariables.height",
      variant: "device=sm",
      codeLocation: "src/app/globals.css",
      type: "missing-figma-binding",
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

  const result = runBindingCheck({ capturePath, mappingPath });

  assert.equal(result.ok, false);
  assert.deepEqual(result.defects, [
    {
      component: "HeroText",
      layer: "wrapper/Content/Title/Title",
      property: "textStyle",
      codeLocation: "src/app/page.tsx",
      type: "missing-figma-component",
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

  const result = runBindingCheck({ capturePath, mappingPath });

  assert.equal(result.ok, false);
  assert.deepEqual(result.defects, [
    {
      component: "HeroText",
      layer: "wrapper/Content/Title/Title",
      property: "textStyle",
      codeLocation: "does-not-exist.tsx",
      type: "missing-code-location",
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

  const result = runBindingCheck({ capturePath, mappingPath });

  assert.equal(result.ok, false);
  assert.equal(result.defects.length, 1);
  assert.equal(result.defects[0].type, "variant-divergence");
});

test("ratifiedVariants match -> no defect, informational ratified[] row instead", () => {
  const { capturePath, mappingPath } = makeFixture({
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
            ratifiedVariants: [
              {
                variant: "device=sm, layout=split-text",
                value: "layout/grid/gap-lg",
                citation: "operator ruling 2026-08-02: two stacked text blocks need more space",
              },
            ],
          },
        ],
      },
    },
    code: { "src/components/split-content.tsx": `className="layout-grid-gap"` },
  });

  const result = runBindingCheck({ capturePath, mappingPath });

  assert.equal(result.ok, true);
  assert.deepEqual(result.defects, []);
  assert.equal(result.ratified.length, 1);
  assert.deepEqual(result.ratified[0], {
    component: "SplitContent",
    layer: "layout/grid",
    property: "gap",
    variant: "device=sm, layout=split-text",
    value: "layout/grid/gap-lg",
    citation: "operator ruling 2026-08-02: two stacked text blocks need more space",
  });
});

test("ratifiedVariants mismatch (reality changed again) -> ratified-mismatch defect", () => {
  const { capturePath, mappingPath } = makeFixture({
    sets: [
      {
        name: "SplitContent",
        key: "sc",
        variants: [
          {
            name: "device=sm, layout=split-text",
            key: "v1",
            // Figma now says something OTHER than the ratified value —
            // the ratification no longer describes reality.
            bindings: [{ layer: "layout/grid", property: "gap", value: "layout/grid/gap-xl" }],
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
            ratifiedVariants: [
              {
                variant: "device=sm, layout=split-text",
                value: "layout/grid/gap-lg",
                citation: "operator ruling 2026-08-02: two stacked text blocks need more space",
              },
            ],
          },
        ],
      },
    },
    code: { "src/components/split-content.tsx": `className="layout-grid-gap"` },
  });

  const result = runBindingCheck({ capturePath, mappingPath });

  assert.equal(result.ok, false);
  assert.equal(result.defects.length, 1);
  assert.deepEqual(result.defects[0], {
    component: "SplitContent",
    layer: "layout/grid",
    property: "gap",
    variant: "device=sm, layout=split-text",
    codeLocation: "src/components/split-content.tsx",
    old: "layout/grid/gap-lg",
    new: "layout/grid/gap-xl",
    citation: "operator ruling 2026-08-02: two stacked text blocks need more space",
    type: "ratified-mismatch",
  });
  assert.deepEqual(result.ratified, []);
});

test("ratifiedVariants item missing a citation -> map-lint error, thrown before any check", () => {
  const { capturePath, mappingPath } = makeFixture({
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
            ratifiedVariants: [
              { variant: "device=sm, layout=split-text", value: "layout/grid/gap-lg" },
            ],
          },
        ],
      },
    },
    code: { "src/components/split-content.tsx": `className="layout-grid-gap"` },
  });

  assert.throws(() => runBindingCheck({ capturePath, mappingPath }), /missing a citation/);
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

  const result = runBindingCheck({ capturePath, mappingPath });

  assert.equal(result.ok, true);
  assert.deepEqual(result.defects, []);
});
