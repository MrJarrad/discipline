// Tests for technical-design-check.mjs — vertical slices, one behavior per test.
// Run: node --test scripts/technical-design-check.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkTechnicalDesign } from "./technical-design-check.mjs";

const CLEAN_CSS = `
:root {
  color-scheme: light;
  scrollbar-gutter: stable;
  -webkit-text-size-adjust: 100%;
}
@media print {
  nav { display: none; }
}
@media (forced-colors: active) {
  .action { outline: 2px solid CanvasText; }
}
.action {
  transition: opacity 150ms, transform 150ms;
}
`;
const CLEAN_META = `
<meta name="color-scheme" content="light">
<meta name="theme-color" content="#111" media="(prefers-color-scheme: dark)">
<meta name="theme-color" content="#fff" media="(prefers-color-scheme: light)">
`;

test("a fixture with every grep-lane check satisfied reports ok with zero warnings", () => {
  const result = checkTechnicalDesign({
    cssFiles: [{ path: "src/app/globals.css", text: CLEAN_CSS }],
    metaFiles: [{ path: "src/app/layout.tsx", text: CLEAN_META }],
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.warnings, []);
});

test("a CSS file missing scrollbar-gutter warns keyed to spectrum-6", () => {
  const css = CLEAN_CSS.replace("scrollbar-gutter: stable;\n", "");
  const result = checkTechnicalDesign({
    cssFiles: [{ path: "src/app/globals.css", text: css }],
    metaFiles: [{ path: "src/app/layout.tsx", text: CLEAN_META }],
  });
  assert.equal(result.ok, false);
  assert.ok(result.warnings.some((w) => w.id === "spectrum-6-scrollbar-gutter"));
});

test("transition-all present is itself the violation, warns keyed to spectrum-7", () => {
  const css = CLEAN_CSS + `.badge { transition: all 200ms; }\n`;
  const result = checkTechnicalDesign({
    cssFiles: [{ path: "src/app/globals.css", text: css }],
    metaFiles: [{ path: "src/app/layout.tsx", text: CLEAN_META }],
  });
  assert.equal(result.ok, false);
  const warning = result.warnings.find((w) => w.id === "spectrum-7-transition-all");
  assert.ok(warning);
  assert.equal(warning.file, "src/app/globals.css");
  assert.ok(warning.line > 0);
});

test("a Tailwind transition-all utility class is also caught", () => {
  const css = CLEAN_CSS + `.badge { @apply transition-all duration-200; }\n`;
  const result = checkTechnicalDesign({
    cssFiles: [{ path: "src/app/globals.css", text: css }],
    metaFiles: [{ path: "src/app/layout.tsx", text: CLEAN_META }],
  });
  assert.equal(result.ok, false);
  assert.ok(result.warnings.some((w) => w.id === "spectrum-7-transition-all"));
});

test("missing theme-color meta warns keyed to spectrum-5, independent of color-scheme", () => {
  const meta = `<meta name="color-scheme" content="light">`;
  const result = checkTechnicalDesign({
    cssFiles: [{ path: "src/app/globals.css", text: CLEAN_CSS }],
    metaFiles: [{ path: "src/app/layout.tsx", text: meta }],
  });
  assert.equal(result.ok, false);
  assert.ok(result.warnings.some((w) => w.id === "spectrum-5-theme-color"));
  assert.ok(!result.warnings.some((w) => w.id === "spectrum-5-color-scheme"));
});

test("color-scheme declared in CSS alone (no meta) still satisfies the color-scheme check", () => {
  const result = checkTechnicalDesign({
    cssFiles: [{ path: "src/app/globals.css", text: CLEAN_CSS }],
    metaFiles: [{ path: "src/app/layout.tsx", text: "" }],
  });
  assert.ok(!result.warnings.some((w) => w.id === "spectrum-5-color-scheme"));
});

test("a synthetic violation fixture missing every presence check plus a transition-all ban warns on all seven rows", () => {
  const css = `.card { transition: all 300ms; }\n`;
  const result = checkTechnicalDesign({
    cssFiles: [{ path: "src/app/globals.css", text: css }],
    metaFiles: [{ path: "src/app/layout.tsx", text: "" }],
  });
  assert.equal(result.ok, false);
  const ids = result.warnings.map((w) => w.id).sort();
  assert.deepEqual(ids, [
    "spectrum-2-forced-colors",
    "spectrum-4-print-stylesheet",
    "spectrum-5-color-scheme",
    "spectrum-5-theme-color",
    "spectrum-6-scrollbar-gutter",
    "spectrum-7-transition-all",
    "spectrum-8-text-size-adjust",
  ]);
  assert.match(result.summary, /WARN/);
});

test("no css or meta files given still returns a well-formed result with only presence warnings, no crash", () => {
  const result = checkTechnicalDesign({ cssFiles: [], metaFiles: [] });
  assert.equal(result.ok, false);
  assert.ok(result.warnings.length > 0);
});
