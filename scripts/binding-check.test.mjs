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
function makeFixture({ sets = [], standalone = [], mapping, code = {} }) {
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
