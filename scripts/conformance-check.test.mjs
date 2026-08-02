// Tests for conformance-check.mjs — vertical slices, one behavior per test.
// Run: node --test scripts/conformance-check.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { runConformanceCheck } from "./conformance-check.mjs";

const CLI_PATH = join(import.meta.dirname, "conformance-check.mjs");

// Builds a fixture repo: <root>/design/figma-map.json (the mapping) +
// <root>/<codeLocation> (the CSS), matching the real convention where
// codeLocation is relative to the mapping file's grandparent directory
// (~/JHD/portfolio-v2/design/figma-map.json -> repo root ~/JHD/portfolio-v2).
function makeFixture({ collections, mapping, css }) {
  const root = mkdtempSync(join(tmpdir(), "conformance-check-test-"));
  mkdirSync(join(root, "design"), { recursive: true });
  const capturePath = join(root, "capture.json");
  writeFileSync(
    capturePath,
    JSON.stringify({ header: { fileName: "Test", pluginVersion: "1.0", exportedAt: 0, counts: {} }, collections }),
    "utf8"
  );
  const mappingPath = join(root, "design", "figma-map.json");
  writeFileSync(mappingPath, JSON.stringify(mapping), "utf8");
  if (css !== undefined) writeFileSync(join(root, "styles.css"), css, "utf8");
  return { root, capturePath, mappingPath };
}

test("aligned entry -> ok:true, zero defects", () => {
  const { capturePath, mappingPath } = makeFixture({
    collections: [
      { name: "color", modes: ["light", "dark"], variables: [{ name: "content/primary", valuesByMode: { light: "#000000", dark: "#ffffff" } }] },
    ],
    mapping: {
      $schema: "conformance-map/v1",
      entries: {
        "color/content/primary": { codeLocation: "styles.css", tokenName: "--content-primary", extraction: "css-root-dark" },
      },
    },
    css: `:root {\n  --content-primary: #000000;\n}\n.dark {\n  --content-primary: #ffffff;\n}\n`,
  });

  const result = runConformanceCheck({ capturePath, mappingPath });

  assert.equal(result.ok, true);
  assert.deepEqual(result.defects, []);
  assert.match(result.summary, /0 defects/);
});

test("dark-mode value mismatch -> one value_mismatch defect, ok:false", () => {
  const { capturePath, mappingPath } = makeFixture({
    collections: [
      { name: "color", modes: ["light", "dark"], variables: [{ name: "content/primary", valuesByMode: { light: "#000000", dark: "#ffffff" } }] },
    ],
    mapping: {
      $schema: "conformance-map/v1",
      entries: {
        "color/content/primary": { codeLocation: "styles.css", tokenName: "--content-primary", extraction: "css-root-dark" },
      },
    },
    // light matches, dark drifted to a stale value in code.
    css: `:root {\n  --content-primary: #000000;\n}\n.dark {\n  --content-primary: #cccccc;\n}\n`,
  });

  const result = runConformanceCheck({ capturePath, mappingPath });

  assert.equal(result.ok, false);
  assert.equal(result.defects.length, 1);
  assert.deepEqual(result.defects[0], {
    path: "color/content/primary",
    mode: "dark",
    old: "#ffffff",
    new: "#cccccc",
    codeLocation: "styles.css",
    tokenName: "--content-primary",
    type: "value_mismatch",
  });
});

test("codeLocation file missing -> missing-code-location defect, does not throw", () => {
  const { capturePath, mappingPath } = makeFixture({
    collections: [{ name: "color", modes: ["light"], variables: [{ name: "content/primary", valuesByMode: { light: "#000000" } }] }],
    mapping: {
      $schema: "conformance-map/v1",
      entries: {
        "color/content/primary": { codeLocation: "does-not-exist.css", tokenName: "--content-primary", extraction: "css-root-dark" },
      },
    },
    // no css written — codeLocation deliberately points nowhere.
  });

  const result = runConformanceCheck({ capturePath, mappingPath });

  assert.equal(result.ok, false);
  assert.deepEqual(result.defects, [
    { path: "color/content/primary", codeLocation: "does-not-exist.css", tokenName: "--content-primary", type: "missing-code-location" },
  ]);
});

test("css-scalar: aligned rem value converts to px and matches figma's raw number", () => {
  const { capturePath, mappingPath } = makeFixture({
    collections: [{ name: "core", modes: ["default"], variables: [{ name: "radius/action-radius-round", valuesByMode: { default: 4 } }] }],
    mapping: {
      $schema: "conformance-map/v1",
      entries: {
        "core/radius/action-radius-round": { codeLocation: "styles.css", tokenName: "--action-radius-round", extraction: "css-scalar" },
      },
    },
    css: `@theme inline {\n  --action-radius-round: 0.25rem;\n}\n`,
  });

  const result = runConformanceCheck({ capturePath, mappingPath });

  assert.equal(result.ok, true);
  assert.deepEqual(result.defects, []);
});

test("css-scalar: tolerates Figma's float export noise (0.10000000149011612 vs 0.1s)", () => {
  const { capturePath, mappingPath } = makeFixture({
    collections: [{ name: "motion", modes: ["Mode 1"], variables: [{ name: "duration/100", valuesByMode: { "Mode 1": 0.10000000149011612 } }] }],
    mapping: {
      $schema: "conformance-map/v1",
      entries: {
        "motion/duration/100": { codeLocation: "styles.css", tokenName: "--duration-100", extraction: "css-scalar" },
      },
    },
    css: `@theme inline {\n  --duration-100: 0.1s;\n}\n`,
  });

  const result = runConformanceCheck({ capturePath, mappingPath });

  assert.equal(result.ok, true);
  assert.deepEqual(result.defects, []);
});

test("css-scalar: bezier-object figma value normalizes to a cubic-bezier() string for comparison", () => {
  const { capturePath, mappingPath } = makeFixture({
    collections: [
      {
        name: "motion",
        modes: ["Mode 1"],
        variables: [
          {
            name: "easing/circ-in-out",
            valuesByMode: { "Mode 1": { easingType: 7, bezierValues: { p1x: 0.8500000238418579, p1y: 0, p2x: 0.15000000596046448, p2y: 1 } } },
          },
        ],
      },
    ],
    mapping: {
      $schema: "conformance-map/v1",
      entries: {
        "motion/easing/circ-in-out": { codeLocation: "styles.css", tokenName: "--easing-circ-in-out", extraction: "css-scalar" },
      },
    },
    css: `@theme inline {\n  --easing-circ-in-out: cubic-bezier(0.85, 0, 0.15, 1);\n}\n`,
  });

  const result = runConformanceCheck({ capturePath, mappingPath });

  assert.equal(result.ok, true);
  assert.deepEqual(result.defects, []);
});

test("css-scalar: resolves one level of var(--x) indirection before comparing", () => {
  const { capturePath, mappingPath } = makeFixture({
    collections: [{ name: "core", modes: ["default"], variables: [{ name: "border/border-200", valuesByMode: { default: 1.5 } }] }],
    mapping: {
      $schema: "conformance-map/v1",
      entries: {
        "core/border/border-200": { codeLocation: "styles.css", tokenName: "--button-border-100", extraction: "css-scalar" },
      },
    },
    css: `@theme inline {\n  --border-200: 0.09375rem;\n  --button-border-100: var(--border-200);\n}\n`,
  });

  const result = runConformanceCheck({ capturePath, mappingPath });

  assert.equal(result.ok, true);
  assert.deepEqual(result.defects, []);
});

test("css-scale: drifted mode-200 value -> one value_mismatch defect naming that mode", () => {
  const { capturePath, mappingPath } = makeFixture({
    collections: [
      {
        name: "action",
        modes: ["100", "200", "300", "400"],
        variables: [{ name: "dimension/button-height", valuesByMode: { "100": 24, "200": 32, "300": 56, "400": 72 } }],
      },
    ],
    mapping: {
      $schema: "conformance-map/v1",
      entries: {
        "action/dimension/button-height": { codeLocation: "styles.css", tokenName: "--button-height-{mode}", extraction: "css-scale" },
      },
    },
    css: `@theme inline {\n  --button-height-100: 1.5rem;\n  --button-height-200: 2.5rem;\n  --button-height-300: 3.5rem;\n  --button-height-400: 4.5rem;\n}\n`,
  });

  const result = runConformanceCheck({ capturePath, mappingPath });

  assert.equal(result.ok, false);
  assert.equal(result.defects.length, 1);
  assert.equal(result.defects[0].mode, "200");
  assert.equal(result.defects[0].type, "value_mismatch");
  assert.equal(result.defects[0].old, 32);
  assert.equal(result.defects[0].new, 40);
});

test("css-root-dark: figma RGB-object color matches an identical code hex string (no defect)", () => {
  const { capturePath, mappingPath } = makeFixture({
    collections: [
      {
        name: "color",
        modes: ["light", "dark"],
        variables: [
          {
            name: "background/default/primary",
            valuesByMode: {
              light: { r: 1, g: 1, b: 1, a: 1 },
              dark: { r: 0.03921568766236305, g: 0.03921568766236305, b: 0.03921568766236305, a: 1 },
            },
          },
        ],
      },
    ],
    mapping: {
      $schema: "conformance-map/v1",
      entries: {
        "color/background/default/primary": { codeLocation: "styles.css", tokenName: "--background-default-primary", extraction: "css-root-dark" },
      },
    },
    css: `:root {\n  --background-default-primary: #ffffff;\n}\n.dark {\n  --background-default-primary: #0a0a0a;\n}\n`,
  });

  const result = runConformanceCheck({ capturePath, mappingPath });

  assert.equal(result.ok, true);
  assert.deepEqual(result.defects, []);
});

test("css-root-dark: genuinely different figma RGB-object color vs code hex still produces a value_mismatch", () => {
  const { capturePath, mappingPath } = makeFixture({
    collections: [
      {
        name: "color",
        modes: ["light", "dark"],
        variables: [
          {
            name: "border/focused/dark",
            valuesByMode: {
              // light resolves to #3a96cf (matches code) — dark resolves to
              // #2582bb (genuine drift from code, which has no .dark override).
              light: { r: 0.22745098173618317, g: 0.5882353186607361, b: 0.8117647171020508, a: 1 },
              dark: { r: 0.14509804546833038, g: 0.5098039507865906, b: 0.7333333492279053, a: 1 },
            },
          },
        ],
      },
    ],
    mapping: {
      $schema: "conformance-map/v1",
      entries: {
        "color/border/focused/dark": { codeLocation: "styles.css", tokenName: "--state-focused", extraction: "css-root-dark" },
      },
    },
    css: `:root {\n  --state-focused: #3a96cf;\n}\n`,
  });

  const result = runConformanceCheck({ capturePath, mappingPath });

  assert.equal(result.ok, false);
  assert.deepEqual(result.defects, [
    {
      path: "color/border/focused/dark",
      mode: "dark",
      old: "#2582bb",
      new: "#3a96cf",
      codeLocation: "styles.css",
      tokenName: "--state-focused",
      type: "value_mismatch",
    },
  ]);
});

test("CLI exits 0 when ok:true, nonzero when ok:false", () => {
  const aligned = makeFixture({
    collections: [{ name: "color", modes: ["light"], variables: [{ name: "content/primary", valuesByMode: { light: "#000000" } }] }],
    mapping: {
      $schema: "conformance-map/v1",
      entries: { "color/content/primary": { codeLocation: "styles.css", tokenName: "--content-primary", extraction: "css-root-dark" } },
    },
    css: `:root {\n  --content-primary: #000000;\n}\n`,
  });
  const drifted = makeFixture({
    collections: [{ name: "color", modes: ["light"], variables: [{ name: "content/primary", valuesByMode: { light: "#000000" } }] }],
    mapping: {
      $schema: "conformance-map/v1",
      entries: { "color/content/primary": { codeLocation: "styles.css", tokenName: "--content-primary", extraction: "css-root-dark" } },
    },
    css: `:root {\n  --content-primary: #111111;\n}\n`,
  });

  const okRun = spawnSync("node", [CLI_PATH, "--capture", aligned.capturePath, "--map", aligned.mappingPath]);
  assert.equal(okRun.status, 0);

  const failRun = spawnSync("node", [CLI_PATH, "--capture", drifted.capturePath, "--map", drifted.mappingPath]);
  assert.notEqual(failRun.status, 0);
});
