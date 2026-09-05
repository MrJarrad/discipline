// Tests for conformance-check.mjs — vertical slices, one behavior per test.
// Run: node --test scripts/conformance-check.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { runConformanceCheck, runCoverageReport } from "./conformance-check.mjs";

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

test("hex8 alpha: figma hex8 export and code rgb()-with-percent-alpha at the SAME quantized percentage match (no defect)", () => {
  const { capturePath, mappingPath } = makeFixture({
    collections: [
      {
        name: "color",
        modes: ["light"],
        // 0x0d / 255 = 5.098% -> rounds to 5%, matching code's stated 5%.
        variables: [{ name: "background/action/primary", valuesByMode: { light: "#0a0a0a0d" } }],
      },
    ],
    mapping: {
      $schema: "conformance-map/v1",
      entries: {
        "color/background/action/primary": { codeLocation: "styles.css", tokenName: "--background-action-primary", extraction: "css-root-dark" },
      },
    },
    css: `:root {\n  --background-action-primary: rgb(10 10 10 / 5%);\n}\n`,
  });

  const result = runConformanceCheck({ capturePath, mappingPath });

  assert.equal(result.ok, true);
  assert.deepEqual(result.defects, []);
});

test("hex8 alpha: a genuinely different quantized alpha percentage still produces a value_mismatch", () => {
  const { capturePath, mappingPath } = makeFixture({
    collections: [
      {
        // 0x26 / 255 = 14.9% -> rounds to 15%, but code still states 5% — a
        // real 10-point drift, not quantization noise.
        name: "color",
        modes: ["light"],
        variables: [{ name: "background/action/primary", valuesByMode: { light: "#ffffff26" } }],
      },
    ],
    mapping: {
      $schema: "conformance-map/v1",
      entries: {
        "color/background/action/primary": { codeLocation: "styles.css", tokenName: "--background-action-primary", extraction: "css-root-dark" },
      },
    },
    css: `:root {\n  --background-action-primary: rgb(255 255 255 / 5%);\n}\n`,
  });

  const result = runConformanceCheck({ capturePath, mappingPath });

  assert.equal(result.ok, false);
  assert.equal(result.defects.length, 1);
  assert.equal(result.defects[0].type, "value_mismatch");
});

test("easing: figma's live CUSTOM_CUBIC_BEZIER export shape normalizes for comparison against a cubic-bezier() code string", () => {
  const { capturePath, mappingPath } = makeFixture({
    collections: [
      {
        name: "motion",
        modes: ["Mode 1"],
        variables: [
          {
            name: "easing/circ-in-out",
            valuesByMode: {
              "Mode 1": {
                type: "CUSTOM_CUBIC_BEZIER",
                easingFunctionCubicBezier: { x1: 0.8500000238418579, y1: 0, x2: 0.15000000596046448, y2: 1 },
              },
            },
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

test("easing: a genuinely different curve still produces a value_mismatch", () => {
  const { capturePath, mappingPath } = makeFixture({
    collections: [
      {
        name: "motion",
        modes: ["Mode 1"],
        variables: [
          {
            name: "easing/circ-in-out",
            valuesByMode: {
              "Mode 1": {
                type: "CUSTOM_CUBIC_BEZIER",
                easingFunctionCubicBezier: { x1: 0.85, y1: 0, x2: 0.15, y2: 1 },
              },
            },
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
    // code drifted to a different curve entirely
    css: `@theme inline {\n  --easing-circ-in-out: cubic-bezier(0.2, 0, 0.8, 1);\n}\n`,
  });

  const result = runConformanceCheck({ capturePath, mappingPath });

  assert.equal(result.ok, false);
  assert.equal(result.defects.length, 1);
  assert.equal(result.defects[0].type, "value_mismatch");
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

// ---- @media scoping -------------------------------------------------------
// Regression: the 2026-08-13 sync reported six dark-mode "defects" that were
// not defects. parseCssCustomProps walked the selector stack but ignored
// at-rule ancestry, so the print stylesheet's `@media print { .dark { ... } }`
// paper overrides (white ground, black ink) were recorded as THE .dark values
// under last-write-wins and compared against Figma's screen dark mode. The
// fixture below is that block verbatim from ~/JHD/portfolio/src/app/globals.css.

// The six properties the print block re-declares, with their real screen-dark
// values (what Figma exports) and the paper values that were clobbering them.
const PRINT_BLOCK_TOKENS = [
  { token: "--background-default-primary", screenDark: "#0a0a0a", paper: "#ffffff" },
  { token: "--background-default-secondary", screenDark: "#141414", paper: "#f3efed" },
  { token: "--background-default-tertiary", screenDark: "#1f1f1f", paper: "#e9e2df" },
  { token: "--content-default-primary", screenDark: "#ffffff", paper: "#0a0a0a" },
  { token: "--content-default-secondary", screenDark: "#a0a0a0", paper: "#696969" },
  { token: "--content-action-primary", screenDark: "#ffffff", paper: "#0a0a0a" },
];

function printBlockFixture({ driftedToken } = {}) {
  const decl = (list, pick) => list.map((t) => `  ${t.token}: ${pick(t)};`).join("\n");
  return makeFixture({
    collections: [
      {
        name: "color",
        modes: ["light", "dark"],
        variables: PRINT_BLOCK_TOKENS.map((t) => ({
          name: t.token.replace(/^--/, "").replace(/-/g, "/"),
          valuesByMode: { light: "#ffffff", dark: t.screenDark },
        })),
      },
    ],
    mapping: {
      $schema: "conformance-map/v1",
      entries: Object.fromEntries(
        PRINT_BLOCK_TOKENS.map((t) => [
          `color/${t.token.replace(/^--/, "").replace(/-/g, "/")}`,
          { codeLocation: "styles.css", tokenName: t.token, extraction: "css-root-dark" },
        ])
      ),
    },
    css:
      `:root {\n${decl(PRINT_BLOCK_TOKENS, () => "#ffffff")}\n}\n` +
      `.dark {\n${decl(PRINT_BLOCK_TOKENS, (t) => (t.token === driftedToken ? "#cccccc" : t.screenDark))}\n}\n` +
      // ...and the print stylesheet, verbatim in shape from globals.css —
      // including the block comment that precedes `@media print` there. That
      // comment is load-bearing for this regression: a comment sitting in a
      // selector prelude gets swallowed into the selector token unless it's
      // stripped first, which hid the `@media` marker from the scanner.
      `/* ============================================================\n` +
      `   12. PRINT (technical-design-spectrum-2026-08-11.md §6 item 4)\n` +
      `   ============================================================\n` +
      `   THE REAL RISK: dark-ground sections set white text on a dark\n` +
      `   background via CSS custom properties. Printers default to\n` +
      `   background graphics OFF, so a printed dark section would keep\n` +
      `   white text with no dark fill behind it — invisible on paper. */\n` +
      `@media print {\n` +
      `  @page {\n    margin: 2cm;\n  }\n` +
      `  .navigation-header,\n  .nav-mobile,\n  .control-media {\n    display: none !important;\n  }\n` +
      `  .dark {\n${decl(PRINT_BLOCK_TOKENS, (t) => t.paper).replace(/^ {2}/gm, "    ")}\n  }\n` +
      `  h1, h2, h3, h4, h5, h6 {\n    break-after: avoid;\n  }\n` +
      `}\n`,
  });
}

test("@media print's .dark paper overrides do not clobber the screen .dark values", () => {
  const { capturePath, mappingPath } = printBlockFixture();

  const result = runConformanceCheck({ capturePath, mappingPath });

  assert.deepEqual(result.defects, []);
  assert.equal(result.ok, true);
});

test("a real .dark screen drift still flags even with the print block present", () => {
  const { capturePath, mappingPath } = printBlockFixture({ driftedToken: "--content-default-secondary" });

  const result = runConformanceCheck({ capturePath, mappingPath });

  assert.equal(result.ok, false);
  assert.equal(result.defects.length, 1);
  assert.equal(result.defects[0].tokenName, "--content-default-secondary");
  assert.equal(result.defects[0].mode, "dark");
  assert.equal(result.defects[0].old, "#a0a0a0");
  assert.equal(result.defects[0].new, "#cccccc");
});

test("a :root override inside a breakpoint @media does not clobber the base :root value", () => {
  // globals.css:244-256 — the type ramp's md breakpoint re-declares
  // --title-style1-400-size inside `@media (min-width: 768px) { :root { } }`.
  // Figma exports the BASE (mobile) value; the breakpoint value is a
  // different fact, not an override of it.
  const { capturePath, mappingPath } = makeFixture({
    collections: [
      { name: "type", modes: ["light"], variables: [{ name: "title/style1/400/size", valuesByMode: { light: "56px" } }] },
    ],
    mapping: {
      $schema: "conformance-map/v1",
      entries: {
        "type/title/style1/400/size": { codeLocation: "styles.css", tokenName: "--title-style1-400-size", extraction: "css-root-dark" },
      },
    },
    css:
      `:root {\n  --title-style1-400-size: 56px;\n}\n` +
      `@media (min-width: 768px) {\n  :root {\n    --title-style1-400-size: clamp(3.5rem, calc(4.6875vw + 1.25rem), 5rem);\n  }\n}\n`,
  });

  const result = runConformanceCheck({ capturePath, mappingPath });

  assert.deepEqual(result.defects, []);
});

// ---- coverage --------------------------------------------------------------
// "0 defects" and "nobody looked" produce the same output unless coverage is
// reported. On the live pipeline 55 of 580 captured variables are mapped, so
// silence covered 90% of the surface.

test("coverage: reports counts and the names of captured variables the map doesn't cover", () => {
  const { capturePath, mappingPath } = makeFixture({
    collections: [
      {
        name: "color",
        modes: ["light"],
        variables: [
          { name: "content/primary", valuesByMode: { light: "#000000" } },
          { name: "content/secondary", valuesByMode: { light: "#666666" } },
        ],
      },
      { name: "motion", modes: ["default"], variables: [{ name: "duration/fast", valuesByMode: { default: 0.12 } }] },
    ],
    mapping: {
      $schema: "conformance-map/v1",
      entries: {
        "color/content/primary": { codeLocation: "styles.css", tokenName: "--content-primary", extraction: "css-root-dark" },
      },
    },
    css: `:root {\n  --content-primary: #000000;\n}\n`,
  });

  const coverage = runCoverageReport({ capturePath, mappingPath });

  assert.equal(coverage.total, 3);
  assert.equal(coverage.mapped, 1);
  assert.equal(coverage.unmapped, 2);
  assert.deepEqual(coverage.unmappedPaths, ["color/content/secondary", "motion/duration/fast"]);
  assert.deepEqual(coverage.unmappedByCollection, { color: 1, motion: 1 });
});

test("coverage: a map entry pointing at a path the capture doesn't carry is reported, not counted as covered", () => {
  const { capturePath, mappingPath } = makeFixture({
    collections: [{ name: "color", modes: ["light"], variables: [{ name: "content/primary", valuesByMode: { light: "#000000" } }] }],
    mapping: {
      $schema: "conformance-map/v1",
      entries: {
        "color/content/primary": { codeLocation: "styles.css", tokenName: "--content-primary", extraction: "css-root-dark" },
        "color/content/long-gone": { codeLocation: "styles.css", tokenName: "--content-long-gone", extraction: "css-root-dark" },
      },
    },
    css: `:root {\n  --content-primary: #000000;\n}\n`,
  });

  const coverage = runCoverageReport({ capturePath, mappingPath });

  assert.equal(coverage.total, 1);
  assert.equal(coverage.mapped, 1);
  assert.equal(coverage.unmapped, 0);
  assert.deepEqual(coverage.mappedPathsMissingFromCapture, ["color/content/long-gone"]);
});

// ---- css-fluid (clamp-aware) ----------------------------------------------
// Commissioned by the text-ramp verdict: mapping layout/text/title/font-size-400
// as a checked `css-scalar` entry against ALREADY-CORRECT css produced 10/10
// modes flagged value_mismatch (clamp() expression vs Figma's scalar) — a
// guaranteed false positive — so all 8 font-size variables were filed
// entriesUnmappable and the lane stayed blind to size drift. css-fluid resolves
// the cascade at each mode's own anchor viewport width instead of string-
// comparing the last declaration.
//
// The capture fixture below is the real one, values read from
// ~/JHD/figma-plugins/main/capture-figma/captures/live/jhd-spec-designsystem-variables-styles.json: the `layout`
// collection's ten modes, `layout/device/width` (sm 375 / md 768 / lg 1280 /
// xl 1920, mirrored by the -flush and -sidebar-main variants), and
// layout/text/title/font-size-400's alias chain into text-primitives/size/*
// (56 / 56 / 80 / 96 for sm/md/lg/xl).
const LAYOUT_MODES = ["lg", "sm", "md", "xl", "lg-flush", "sm-flush", "md-flush", "xl-flush", "lg-sidebar-main", "lg-sidebar-main-flush"];

const DEVICE_WIDTH_BY_MODE = {
  lg: 1280,
  sm: 375,
  md: 768,
  xl: 1920,
  "lg-flush": 1280,
  "sm-flush": 375,
  "md-flush": 768,
  "xl-flush": 1920,
  "lg-sidebar-main": 1280,
  "lg-sidebar-main-flush": 1280,
};

// layout/text/title/font-size-400's real per-mode aliases.
const TITLE_400_ALIASES = {
  lg: "→ text-primitives/size/1200",
  sm: "→ text-primitives/size/1000",
  md: "→ text-primitives/size/1000",
  xl: "→ text-primitives/size/1400",
  "lg-flush": "→ text-primitives/size/1200",
  "sm-flush": "→ text-primitives/size/1000",
  "md-flush": "→ text-primitives/size/1000",
  "xl-flush": "→ text-primitives/size/1400",
  "lg-sidebar-main": "→ text-primitives/size/1200",
  "lg-sidebar-main-flush": "→ text-primitives/size/1200",
};

// layout/text/title/font-size-300: 28 / 32 / 40 / 48 (sm/md/lg/xl) — the step
// whose md value only exists because the ten-modes ruling forced a md-distinct
// fluid segment, and therefore the step an interior-mode check has to catch.
const TITLE_300_ALIASES = {
  lg: "→ text-primitives/size/800",
  sm: "→ text-primitives/size/600",
  md: "→ text-primitives/size/700",
  xl: "→ text-primitives/size/900",
  "lg-flush": "→ text-primitives/size/800",
  "sm-flush": "→ text-primitives/size/600",
  "md-flush": "→ text-primitives/size/700",
  "xl-flush": "→ text-primitives/size/900",
  "lg-sidebar-main": "→ text-primitives/size/800",
  "lg-sidebar-main-flush": "→ text-primitives/size/800",
};

const TEXT_PRIMITIVES = {
  name: "text-primitives",
  modes: ["value"],
  variables: [
    { name: "size/600", valuesByMode: { value: 28 } },
    { name: "size/700", valuesByMode: { value: 32 } },
    { name: "size/800", valuesByMode: { value: 40 } },
    { name: "size/900", valuesByMode: { value: 48 } },
    { name: "size/1000", valuesByMode: { value: 56 } },
    { name: "size/1200", valuesByMode: { value: 80 } },
    { name: "size/1400", valuesByMode: { value: 96 } },
  ],
};

function layoutCollection(extraVariables) {
  return {
    name: "layout",
    modes: LAYOUT_MODES,
    variables: [{ name: "device/width", valuesByMode: { ...DEVICE_WIDTH_BY_MODE } }, ...extraVariables],
  };
}

// The title ramp verbatim from ~/JHD/portfolio/src/app/globals.css (:root:245,
// @768:260-261, @1280:271-272) — unperturbed, already-correct code. This is the
// exact CSS that produced 10/10 false positives under css-scalar.
const TITLE_RAMP_CSS = `:root {
  --title-style1-300-size: 1.75rem;  /* 28px, sm (size/600) */
  --title-style1-400-size: 3.5rem;  /* 56px, sm/md (size/1000) */
}
@media (min-width: 768px) {
  :root {
    --title-style1-300-size: clamp(2rem, calc(1.5625vw + 1.25rem), 2.5rem);
    --title-style1-400-size: clamp(3.5rem, calc(4.6875vw + 1.25rem), 5rem);
  }
}
@media (min-width: 1280px) {
  :root {
    --title-style1-300-size: clamp(2.5rem, calc(1.25vw + 1.5rem), 3rem);
    --title-style1-400-size: clamp(5rem, calc(2.5vw + 3rem), 6rem);
  }
}
`;

test("css-fluid: the real title-400 clamp cascade matches its capture at all ten modes (the false-positive case, now green)", () => {
  const { capturePath, mappingPath } = makeFixture({
    collections: [layoutCollection([{ name: "text/title/font-size-400", valuesByMode: { ...TITLE_400_ALIASES } }]), TEXT_PRIMITIVES],
    mapping: {
      $schema: "conformance-map/v1",
      entries: {
        "layout/text/title/font-size-400": { codeLocation: "styles.css", tokenName: "--title-style1-400-size", extraction: "css-fluid" },
      },
    },
    css: TITLE_RAMP_CSS,
  });

  const result = runConformanceCheck({ capturePath, mappingPath });

  assert.deepEqual(result.defects, []);
  assert.equal(result.ok, true);
  // Coverage, not silence: all ten modes were evaluated, not skipped.
  assert.equal(result.modesEvaluated, 10);
});

test("css-fluid: size drift injected at the INTERIOR md mode flags, while sm/lg/xl stay green", () => {
  // The 768 segment's floor moved 2rem -> 2.25rem: 36px where the capture says
  // 32px. sm reads the base declaration, lg/xl read the 1280 block — all three
  // are untouched, so only a check that evaluates md's own anchor catches this.
  const driftedCss = TITLE_RAMP_CSS.replace(
    "--title-style1-300-size: clamp(2rem, calc(1.5625vw + 1.25rem), 2.5rem);",
    "--title-style1-300-size: clamp(2.25rem, calc(1.5625vw + 1.25rem), 2.5rem);"
  );
  assert.notEqual(driftedCss, TITLE_RAMP_CSS, "fixture drift must actually be injected");

  const { capturePath, mappingPath } = makeFixture({
    collections: [layoutCollection([{ name: "text/title/font-size-300", valuesByMode: { ...TITLE_300_ALIASES } }]), TEXT_PRIMITIVES],
    mapping: {
      $schema: "conformance-map/v1",
      entries: {
        "layout/text/title/font-size-300": { codeLocation: "styles.css", tokenName: "--title-style1-300-size", extraction: "css-fluid" },
      },
    },
    css: driftedCss,
  });

  const result = runConformanceCheck({ capturePath, mappingPath });

  assert.equal(result.ok, false);
  assert.equal(result.modesEvaluated, 10);
  assert.deepEqual(
    result.defects.map((d) => d.mode),
    ["md", "md-flush"]
  );
  assert.deepEqual(result.defects[0], {
    path: "layout/text/title/font-size-300",
    mode: "md",
    old: 32,
    new: 36,
    atWidth: 768,
    codeLocation: "styles.css",
    tokenName: "--title-style1-300-size",
    type: "value_mismatch",
  });
});

test("css-fluid: the unperturbed title-300 ramp (md-distinct fluid segment) is green at all ten modes", () => {
  const { capturePath, mappingPath } = makeFixture({
    collections: [layoutCollection([{ name: "text/title/font-size-300", valuesByMode: { ...TITLE_300_ALIASES } }]), TEXT_PRIMITIVES],
    mapping: {
      $schema: "conformance-map/v1",
      entries: {
        "layout/text/title/font-size-300": { codeLocation: "styles.css", tokenName: "--title-style1-300-size", extraction: "css-fluid" },
      },
    },
    css: TITLE_RAMP_CSS,
  });

  const result = runConformanceCheck({ capturePath, mappingPath });

  assert.deepEqual(result.defects, []);
  assert.equal(result.modesEvaluated, 10);
});

// A single fluid segment spanning sm -> xl, so md and lg anchors land STRICTLY
// INSIDE the curve rather than on a breakpoint boundary. clamp(1.125rem,
// calc(1.5625vw + 0.75rem), 2.5rem) resolves 18 / 24 / 32 / 40 at
// 375 / 768 / 1280 / 1920 — the first and last from the clamp's own bounds, the
// middle two from the interpolation.
const INTERIOR_ANCHOR_VALUES = { sm: 18, md: 24, lg: 32, xl: 40 };
const INTERIOR_VALUES_BY_MODE = Object.fromEntries(
  LAYOUT_MODES.map((mode) => [mode, INTERIOR_ANCHOR_VALUES[mode.split("-")[0]]])
);
const INTERIOR_CSS = `:root {\n  --demo-size: clamp(1.125rem, calc(1.5625vw + 0.75rem), 2.5rem);\n}\n`;

function interiorFixture(css) {
  return makeFixture({
    collections: [layoutCollection([{ name: "text/demo/font-size", valuesByMode: { ...INTERIOR_VALUES_BY_MODE } }])],
    mapping: {
      $schema: "conformance-map/v1",
      entries: {
        "layout/text/demo/font-size": { codeLocation: "styles.css", tokenName: "--demo-size", extraction: "css-fluid" },
      },
    },
    css,
  });
}

test("css-fluid: a fluid segment whose md/lg anchors fall inside the curve is green at every mode", () => {
  const { capturePath, mappingPath } = interiorFixture(INTERIOR_CSS);

  const result = runConformanceCheck({ capturePath, mappingPath });

  assert.deepEqual(result.defects, []);
  assert.equal(result.modesEvaluated, 10);
});

test("css-fluid: slope drift inside IDENTICAL clamp bounds flags the interior anchors — min/max alone would pass it", () => {
  // Same lower (1.125rem) and upper (2.5rem) bounds, different preferred slope.
  // sm still saturates at the floor (18) and xl at the ceiling (40), so a check
  // that compared only the clamp's endpoints would call this conformant; md
  // drifts 24 -> 21.44 and lg 32 -> 30.4.
  const { capturePath, mappingPath } = interiorFixture(
    INTERIOR_CSS.replace("calc(1.5625vw + 0.75rem)", "calc(1.75vw + 0.5rem)")
  );

  const result = runConformanceCheck({ capturePath, mappingPath });

  assert.equal(result.ok, false);
  assert.equal(result.modesEvaluated, 10);
  assert.deepEqual(
    result.defects.map((d) => d.mode).sort(),
    ["lg", "lg-flush", "lg-sidebar-main", "lg-sidebar-main-flush", "md", "md-flush"]
  );
  const md = result.defects.find((d) => d.mode === "md");
  assert.equal(md.old, 24);
  assert.equal(Number(md.new.toFixed(2)), 21.44);
  assert.equal(md.atWidth, 768);
});

test("css-fluid: anchor widths fall back to the map's declared table when the capture carries no device/width", () => {
  const { capturePath, mappingPath } = makeFixture({
    // Same layout collection minus device/width — a capture whose Figma file
    // has no device-width variable to read the anchors from.
    collections: [{ name: "layout", modes: LAYOUT_MODES, variables: [{ name: "text/demo/font-size", valuesByMode: { ...INTERIOR_VALUES_BY_MODE } }] }],
    mapping: {
      $schema: "conformance-map/v1",
      anchorWidths: { modes: DEVICE_WIDTH_BY_MODE },
      entries: {
        "layout/text/demo/font-size": { codeLocation: "styles.css", tokenName: "--demo-size", extraction: "css-fluid" },
      },
    },
    css: INTERIOR_CSS,
  });

  const result = runConformanceCheck({ capturePath, mappingPath });

  assert.deepEqual(result.defects, []);
  assert.equal(result.modesEvaluated, 10);
});

test("css-fluid: a mode with no anchor width anywhere is reported, not silently skipped", () => {
  const { capturePath, mappingPath } = makeFixture({
    collections: [{ name: "layout", modes: ["sm", "md"], variables: [{ name: "text/demo/font-size", valuesByMode: { sm: 18, md: 24 } }] }],
    mapping: {
      $schema: "conformance-map/v1",
      anchorWidths: { modes: { sm: 375 } }, // md deliberately absent
      entries: {
        "layout/text/demo/font-size": { codeLocation: "styles.css", tokenName: "--demo-size", extraction: "css-fluid" },
      },
    },
    css: INTERIOR_CSS,
  });

  const result = runConformanceCheck({ capturePath, mappingPath });

  assert.equal(result.ok, false);
  assert.equal(result.modesEvaluated, 1); // sm compared; md was NOT counted as examined
  assert.equal(result.defects.length, 1);
  assert.equal(result.defects[0].type, "missing-anchor-width");
  assert.equal(result.defects[0].mode, "md");
  assert.match(result.summary, /missing-anchor-width/);
});

test("css-fluid: an expression outside the supported subset is reported as unevaluable, never as a match", () => {
  const { capturePath, mappingPath } = interiorFixture(
    // em needs a parent font-size this lane does not have.
    INTERIOR_CSS.replace("calc(1.5625vw + 0.75rem)", "calc(1.5625vw + 0.75em)")
  );

  const result = runConformanceCheck({ capturePath, mappingPath });

  assert.equal(result.ok, false);
  assert.equal(result.modesEvaluated, 0);
  assert.equal(result.defects.length, 10);
  assert.equal(result.defects[0].type, "unevaluable-expression");
  assert.match(result.defects[0].detail, /unsupported unit 'em'/);
});

test("css-fluid: a token the stylesheet never declares is one entry-level defect, not one per mode", () => {
  const { capturePath, mappingPath } = makeFixture({
    collections: [layoutCollection([{ name: "text/demo/font-size", valuesByMode: { ...INTERIOR_VALUES_BY_MODE } }])],
    mapping: {
      $schema: "conformance-map/v1",
      entries: {
        "layout/text/demo/font-size": { codeLocation: "styles.css", tokenName: "--never-declared", extraction: "css-fluid" },
      },
    },
    css: INTERIOR_CSS,
  });

  const result = runConformanceCheck({ capturePath, mappingPath });

  assert.equal(result.defects.length, 1);
  assert.equal(result.defects[0].type, "missing-token-declaration");
  assert.equal(result.defects[0].mode, undefined);
});

test("css-fluid: a @media print re-declaration does not enter the viewport-width cascade", () => {
  // Same shape as the print-stylesheet bug that produced six phantom dark-mode
  // defects: a conditional block, later in source order, that last-write-wins
  // would otherwise hand to the comparator.
  const { capturePath, mappingPath } = interiorFixture(`${INTERIOR_CSS}@media print {\n  :root {\n    --demo-size: 12px;\n  }\n}\n`);

  const result = runConformanceCheck({ capturePath, mappingPath });

  assert.deepEqual(result.defects, []);
  assert.equal(result.modesEvaluated, 10);
});

test("css-fluid: var() indirection is followed through the width cascade, not abandoned", () => {
  const { capturePath, mappingPath } = interiorFixture(
    `:root {\n  --demo-raw: 1.125rem;\n  --demo-size: var(--demo-raw);\n}\n@media (min-width: 768px) {\n  :root {\n    --demo-raw: clamp(1.5rem, calc(1.5625vw + 0.75rem), 2.5rem);\n  }\n}\n`
  );

  const result = runConformanceCheck({ capturePath, mappingPath });

  assert.deepEqual(result.defects, []);
  assert.equal(result.modesEvaluated, 10);
});

test("coverage: a fully covered capture reports zero unmapped and an empty name list", () => {
  const { capturePath, mappingPath } = makeFixture({
    collections: [{ name: "color", modes: ["light"], variables: [{ name: "content/primary", valuesByMode: { light: "#000000" } }] }],
    mapping: {
      $schema: "conformance-map/v1",
      entries: {
        "color/content/primary": { codeLocation: "styles.css", tokenName: "--content-primary", extraction: "css-root-dark" },
      },
    },
    css: `:root {\n  --content-primary: #000000;\n}\n`,
  });

  const coverage = runCoverageReport({ capturePath, mappingPath });

  assert.equal(coverage.unmapped, 0);
  assert.deepEqual(coverage.unmappedPaths, []);
});

// ---- runHandoffCheck: enumerates every export variable, not just a map -----

import { runHandoffCheck } from "./conformance-check.mjs";

function makeHandoffFixture({ collections, css }) {
  const root = mkdtempSync(join(tmpdir(), "handoff-check-test-"));
  const handoffPath = join(root, "handoff.json");
  writeFileSync(
    handoffPath,
    JSON.stringify({
      schema: "design-system-handoff",
      schemaVersion: 3,
      fingerprint: { designSystemStateHash: "test-hash-123" },
      collections,
    }),
    "utf8"
  );
  const cssPath = join(root, "styles.css");
  writeFileSync(cssPath, css, "utf8");
  return { root, handoffPath, cssPath };
}

function scalarVariable(name, webName, rawValue, modeId = "1:0", modeName = "default") {
  return {
    name,
    codeSyntax: { WEB: { value: webName } },
    modes: [{ modeId, modeName, raw: rawValue, effective: true }],
  };
}

test("handoff: DS value matches export default -> MATCH, ok:true", () => {
  const { handoffPath, cssPath } = makeHandoffFixture({
    collections: [
      {
        name: "core",
        defaultModeId: "1:0",
        modes: [{ id: "1:0", name: "default" }],
        variables: [scalarVariable("dimension/dimension-200", "--dimension-200", 2)],
      },
    ],
    css: `:root {\n  --dimension-200: 0.125rem; /* 2px */\n}\n`,
  });

  const result = runHandoffCheck({ handoffPath, cssPaths: [cssPath] });

  assert.equal(result.ok, true);
  assert.equal(result.counts.match, 1);
  assert.equal(result.counts.missingInDs, 0);
  assert.equal(result.counts.valueDrift, 0);
  assert.equal(result.designSystemStateHash, "test-hash-123");
});

test("handoff: WEB name absent from every CSS source -> MISSING-IN-DS defect, ok:false", () => {
  const { handoffPath, cssPath } = makeHandoffFixture({
    collections: [
      {
        name: "core",
        defaultModeId: "1:0",
        modes: [{ id: "1:0", name: "default" }],
        variables: [scalarVariable("dimension/dimension-1000", "--dimension-1000", 32)],
      },
    ],
    css: `:root {\n  --dimension-200: 0.125rem;\n}\n`,
  });

  const result = runHandoffCheck({ handoffPath, cssPaths: [cssPath] });

  assert.equal(result.ok, false);
  assert.equal(result.counts.missingInDs, 1);
  assert.equal(result.defects[0].type, "MISSING-IN-DS");
  assert.equal(result.defects[0].tokenName, "--dimension-1000");
});

test("handoff: DS value present but numerically different -> VALUE-DRIFT", () => {
  const { handoffPath, cssPath } = makeHandoffFixture({
    collections: [
      {
        name: "core",
        defaultModeId: "1:0",
        modes: [{ id: "1:0", name: "default" }],
        variables: [scalarVariable("dimension/dimension-1000", "--dimension-1000", 32)],
      },
    ],
    css: `:root {\n  --dimension-1000: 1rem; /* 16px, not 32 */\n}\n`,
  });

  const result = runHandoffCheck({ handoffPath, cssPaths: [cssPath] });

  assert.equal(result.ok, false);
  assert.equal(result.counts.valueDrift, 1);
  assert.equal(result.defects[0].type, "VALUE-DRIFT");
  assert.equal(result.defects[0].old, 32);
  assert.equal(result.defects[0].new, 16);
});

test("handoff: rem<->px at 16 and hex case are normalized before comparing (no false drift)", () => {
  const { handoffPath, cssPath } = makeHandoffFixture({
    collections: [
      {
        name: "core",
        defaultModeId: "1:0",
        modes: [{ id: "1:0", name: "default" }],
        variables: [scalarVariable("dimension/radius-full", "--radius-full", 999)],
      },
    ],
    css: `:root {\n  --radius-full: 62.4375rem; /* 999px, rem-authored */\n}\n`,
  });

  const result = runHandoffCheck({ handoffPath, cssPaths: [cssPath] });

  assert.equal(result.ok, true);
  assert.equal(result.counts.match, 1);
});

test("handoff: color light/dark axis checks both scopes, dark drift reported with mode:'dark'", () => {
  const { handoffPath, cssPath } = makeHandoffFixture({
    collections: [
      {
        name: "color",
        defaultModeId: "1:0",
        modes: [
          { id: "1:0", name: "light" },
          { id: "1:1", name: "dark" },
        ],
        variables: [
          {
            name: "color/content/primary",
            codeSyntax: { WEB: { value: "--color-content-primary" } },
            modes: [
              { modeId: "1:0", modeName: "light", raw: "#000000FF", effective: true },
              { modeId: "1:1", modeName: "dark", raw: "#FFFFFFFF", effective: true },
            ],
          },
        ],
      },
    ],
    css: `:root {\n  --color-content-primary: #000000;\n}\n.dark {\n  --color-content-primary: #eeeeee;\n}\n`,
  });

  const result = runHandoffCheck({ handoffPath, cssPaths: [cssPath] });

  assert.equal(result.ok, false);
  assert.equal(result.counts.valueDrift, 1);
  assert.equal(result.defects[0].mode, "dark");
});

test("handoff: alias resolves via the export's own terminalValue, no re-walk needed", () => {
  const { handoffPath, cssPath } = makeHandoffFixture({
    collections: [
      {
        name: "color",
        defaultModeId: "1:0",
        modes: [{ id: "1:0", name: "value" }],
        variables: [
          {
            name: "color/action/primary",
            codeSyntax: { WEB: { value: "--color-action-primary" } },
            modes: [
              {
                modeId: "1:0",
                modeName: "value",
                raw: { type: "VARIABLE_ALIAS", id: "VariableID:9:1" },
                alias: { terminalValue: "#A33001FF" },
                effective: true,
              },
            ],
          },
        ],
      },
    ],
    css: `:root {\n  --color-action-primary: #a33001;\n}\n`,
  });

  const result = runHandoffCheck({ handoffPath, cssPaths: [cssPath] });

  assert.equal(result.ok, true);
  assert.equal(result.counts.match, 1);
});

test("handoff: hand-authored CSS wins over generated when both declare the same property", () => {
  const genRoot = mkdtempSync(join(tmpdir(), "handoff-check-test-"));
  const genPath = join(genRoot, "generated.css");
  writeFileSync(genPath, `:root {\n  --dimension-200: 999rem;\n}\n`, "utf8"); // deliberately wrong
  const { handoffPath, cssPath } = makeHandoffFixture({
    collections: [
      {
        name: "core",
        defaultModeId: "1:0",
        modes: [{ id: "1:0", name: "default" }],
        variables: [scalarVariable("dimension/dimension-200", "--dimension-200", 2)],
      },
    ],
    css: `:root {\n  --dimension-200: 0.125rem;\n}\n`, // hand-authored, correct
  });

  const result = runHandoffCheck({ handoffPath, cssPaths: [genPath, cssPath] });

  assert.equal(result.ok, true);
  assert.equal(result.counts.match, 1);
});

test("handoff: a DS custom property with no matching export name -> EXTRA-IN-DS, excluded by allowlist", () => {
  const { handoffPath, cssPath } = makeHandoffFixture({
    collections: [
      {
        name: "core",
        defaultModeId: "1:0",
        modes: [{ id: "1:0", name: "default" }],
        variables: [scalarVariable("dimension/dimension-200", "--dimension-200", 2)],
      },
    ],
    css: `:root {\n  --dimension-200: 0.125rem;\n  --house-only-helper: 4px;\n}\n`,
  });

  const withoutAllowlist = runHandoffCheck({ handoffPath, cssPaths: [cssPath] });
  assert.deepEqual(withoutAllowlist.extraInDs, ["--house-only-helper"]);

  const withAllowlist = runHandoffCheck({ handoffPath, cssPaths: [cssPath], allowlist: ["--house-only-helper"] });
  assert.deepEqual(withAllowlist.extraInDs, []);
});

test("handoff: a scalar token declared inside @theme inline (Tailwind v4) counts as the default declaration, not MISSING-IN-DS", () => {
  const { handoffPath, cssPath } = makeHandoffFixture({
    collections: [
      {
        name: "core",
        defaultModeId: "1:0",
        modes: [{ id: "1:0", name: "default" }],
        variables: [scalarVariable("dimension/dimension-200", "--dimension-200", 2)],
      },
    ],
    css: `@theme inline {\n  --dimension-200: 0.125rem; /* 2px */\n}\n`,
  });

  const result = runHandoffCheck({ handoffPath, cssPaths: [cssPath] });

  assert.equal(result.ok, true);
  assert.equal(result.counts.match, 1);
});

// ---- @theme fold: conditional group at-rules must not hide a variable -----
// buildDsSurface's @theme fold widens beyond @media (see isConditionalGroupAtRule):
// a token declared only inside `@supports (...) { @theme inline {...} }` or
// `@container (...) { @theme inline {...} }` is exactly as conditional as one
// inside `@media`, and folding it into the unconditional root bucket would read
// as present (MATCH) when the DS package has no unconditional declaration at all.

test("handoff: a token declared only inside @supports { @theme inline {...} } is MISSING-IN-DS, not MATCH", () => {
  const { handoffPath, cssPath } = makeHandoffFixture({
    collections: [
      {
        name: "core",
        defaultModeId: "1:0",
        modes: [{ id: "1:0", name: "default" }],
        variables: [scalarVariable("dimension/dimension-900", "--dimension-900", 2)],
      },
    ],
    css: `@supports (gap: 1rem) {\n  @theme inline {\n    --dimension-900: 0.125rem;\n  }\n}\n`,
  });

  const result = runHandoffCheck({ handoffPath, cssPaths: [cssPath] });

  assert.equal(result.ok, false);
  assert.equal(result.counts.missingInDs, 1);
  assert.equal(result.defects[0].type, "MISSING-IN-DS");
  assert.equal(result.defects[0].tokenName, "--dimension-900");
});

test("handoff: a token declared only inside @container { @theme inline {...} } is MISSING-IN-DS, not MATCH", () => {
  const { handoffPath, cssPath } = makeHandoffFixture({
    collections: [
      {
        name: "core",
        defaultModeId: "1:0",
        modes: [{ id: "1:0", name: "default" }],
        variables: [scalarVariable("dimension/dimension-901", "--dimension-901", 2)],
      },
    ],
    css: `@container (min-width: 400px) {\n  @theme inline {\n    --dimension-901: 0.125rem;\n  }\n}\n`,
  });

  const result = runHandoffCheck({ handoffPath, cssPaths: [cssPath] });

  assert.equal(result.ok, false);
  assert.equal(result.counts.missingInDs, 1);
  assert.equal(result.defects[0].type, "MISSING-IN-DS");
  assert.equal(result.defects[0].tokenName, "--dimension-901");
});

// Pins the @media guard itself: deleting `stack.some(isConditionalGroupAtRule)`
// (or narrowing it back to bare isMediaAtRule minus @media) from buildDsSurface
// must turn this test red. A token declared only inside
// `@media { @theme inline {...} } ` must read MISSING-IN-DS, not MATCH.
test("handoff: a token declared only inside @media { @theme inline {...} } is MISSING-IN-DS, not MATCH (pins the @theme fold guard)", () => {
  const { handoffPath, cssPath } = makeHandoffFixture({
    collections: [
      {
        name: "core",
        defaultModeId: "1:0",
        modes: [{ id: "1:0", name: "default" }],
        variables: [scalarVariable("dimension/dimension-902", "--dimension-902", 2)],
      },
    ],
    css: `@media (min-width: 768px) {\n  @theme inline {\n    --dimension-902: 0.125rem;\n  }\n}\n`,
  });

  const result = runHandoffCheck({ handoffPath, cssPaths: [cssPath] });

  assert.equal(result.ok, false);
  assert.equal(result.counts.missingInDs, 1);
  assert.equal(result.defects[0].type, "MISSING-IN-DS");
  assert.equal(result.defects[0].tokenName, "--dimension-902");
});

test("handoff: a Figma-named color alias that points at a scope-split semantic name compares light against :root, not whichever declaration is last in the file", () => {
  const { handoffPath, cssPath } = makeHandoffFixture({
    collections: [
      {
        name: "color",
        defaultModeId: "1:0",
        modes: [
          { id: "1:0", name: "light" },
          { id: "1:1", name: "dark" },
        ],
        variables: [
          {
            name: "color/background/default/primary",
            codeSyntax: { WEB: { value: "--color-background-default-primary" } },
            modes: [
              { modeId: "1:0", modeName: "light", raw: "#FFFFFFFF", effective: true },
              { modeId: "1:1", modeName: "dark", raw: "#000000FF", effective: true },
            ],
          },
        ],
      },
    ],
    css: `@theme inline {\n  --color-background-default-primary: var(--background-default-primary);\n}\n:root {\n  --background-default-primary: #ffffff;\n}\n.dark {\n  --background-default-primary: #000000;\n}\n`,
  });

  const result = runHandoffCheck({ handoffPath, cssPaths: [cssPath] });

  assert.equal(result.ok, true);
  assert.equal(result.counts.match, 1);
  assert.equal(result.counts.valueDrift, 0);
});

test("handoff: a bare font-family string vs a CSS-quoted one are the same value, not VALUE-DRIFT", () => {
  const { handoffPath, cssPath } = makeHandoffFixture({
    collections: [
      {
        name: "text-primitives",
        defaultModeId: "1:0",
        modes: [{ id: "1:0", name: "value" }],
        variables: [scalarVariable("family/font-sans", "--family-font-sans", "Suisse Intl")],
      },
    ],
    css: `:root {\n  --family-font-sans: "Suisse Intl";\n}\n`,
  });

  const result = runHandoffCheck({ handoffPath, cssPaths: [cssPath] });

  assert.equal(result.ok, true);
  assert.equal(result.counts.match, 1);
});

// ---- CLI --handoff --ci --drift-threshold: must never fail open -----------
// `Number(getArg("--drift-threshold", "0"))` on a typo'd/missing value used to
// evaluate to NaN, and `valueDrift > NaN` is always false — so `--ci
// --drift-threshold abc` exited 0 (gate passed) even with real drift present.
// These pin: a valid threshold gates correctly (exit 1 below the drift count,
// exit 0 at/above it), and an invalid threshold is REJECTED (exit 2) rather
// than silently passing.

function makeThreeDriftHandoffFixture() {
  const root = mkdtempSync(join(tmpdir(), "handoff-cli-drift-test-"));
  const handoffPath = join(root, "handoff.json");
  const variables = [1, 2, 3].map((n) => scalarVariable(`dimension/dimension-${n}`, `--dimension-${n}`, n));
  writeFileSync(
    handoffPath,
    JSON.stringify({
      schema: "design-system-handoff",
      schemaVersion: 3,
      fingerprint: { designSystemStateHash: "test-hash-drift" },
      collections: [
        {
          name: "core",
          defaultModeId: "1:0",
          modes: [{ id: "1:0", name: "default" }],
          variables,
        },
      ],
    }),
    "utf8"
  );
  // Each DS value is off by 1 from its Figma value -> 3 VALUE-DRIFT, 0 MISSING.
  const cssPath = join(root, "styles.css");
  writeFileSync(
    cssPath,
    `:root {\n  --dimension-1: 990px;\n  --dimension-2: 990px;\n  --dimension-3: 990px;\n}\n`,
    "utf8"
  );
  return { handoffPath, cssPath };
}

test("CLI --handoff --ci with no --drift-threshold (3 drifts vs default 0) exits 1", () => {
  const { handoffPath, cssPath } = makeThreeDriftHandoffFixture();
  const run = spawnSync("node", [CLI_PATH, "--handoff", "--ci", "--handoff-path", handoffPath, "--css", cssPath]);
  assert.equal(run.status, 1);
});

test("CLI --handoff --ci --drift-threshold 2 (3 drifts > 2) exits 1", () => {
  const { handoffPath, cssPath } = makeThreeDriftHandoffFixture();
  const run = spawnSync("node", [
    CLI_PATH,
    "--handoff",
    "--ci",
    "--drift-threshold",
    "2",
    "--handoff-path",
    handoffPath,
    "--css",
    cssPath,
  ]);
  assert.equal(run.status, 1);
});

test("CLI --handoff --ci --drift-threshold 3 (3 drifts == threshold) exits 0", () => {
  const { handoffPath, cssPath } = makeThreeDriftHandoffFixture();
  const run = spawnSync("node", [
    CLI_PATH,
    "--handoff",
    "--ci",
    "--drift-threshold",
    "3",
    "--handoff-path",
    handoffPath,
    "--css",
    cssPath,
  ]);
  assert.equal(run.status, 0);
});

test("CLI --handoff --ci --drift-threshold abc (non-numeric) is rejected, exits 2, never fails open", () => {
  const { handoffPath, cssPath } = makeThreeDriftHandoffFixture();
  const run = spawnSync("node", [
    CLI_PATH,
    "--handoff",
    "--ci",
    "--drift-threshold",
    "abc",
    "--handoff-path",
    handoffPath,
    "--css",
    cssPath,
  ]);
  assert.equal(run.status, 2);
});

test("CLI --handoff --ci --drift-threshold with a missing value is rejected, exits 2", () => {
  const { handoffPath, cssPath } = makeThreeDriftHandoffFixture();
  // --drift-threshold is the LAST arg, so getArg's args[idx+1] lookup is undefined.
  const run = spawnSync("node", [
    CLI_PATH,
    "--handoff",
    "--ci",
    "--handoff-path",
    handoffPath,
    "--css",
    cssPath,
    "--drift-threshold",
  ]);
  assert.equal(run.status, 2);
});
