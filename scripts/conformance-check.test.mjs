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
