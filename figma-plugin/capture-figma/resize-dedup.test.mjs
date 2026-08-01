// Tests for code.js's resize-dedup fix (lag diagnosis finding 2: ~8
// figma.ui.resize() IPC calls per Sync click, most at an unchanged height).
// code.js can't be imported directly — it calls figma.showUI(...) at module
// top level and throws outside the plugin sandbox (no `figma` global in
// Node) — so this extracts the pure clampResizeHeight() function by its
// "RESIZE DEDUP" markers and evals it standalone, same technique
// version-sync.test.mjs and schema-v2-transform.test.mjs already use for
// source-embedded logic.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function extractResizeDedupBlock(source) {
  const match = /=== RESIZE DEDUP[\s\S]*?===\n([\s\S]*?)\n\/\/ === END RESIZE DEDUP ===/.exec(source);
  if (!match) throw new Error("RESIZE DEDUP markers not found in code.js");
  return match[1];
}

function loadClampResizeHeight() {
  const codeJs = readFileSync(join(import.meta.dirname, "code.js"), "utf8");
  const block = extractResizeDedupBlock(codeJs);
  const fn = new Function(`${block}\nreturn clampResizeHeight;`);
  return fn();
}

const clampResizeHeight = loadClampResizeHeight();

test("clampResizeHeight: passes a measured height through unchanged when within bounds", () => {
  assert.equal(clampResizeHeight(300, 210, 394), 300);
});

test("clampResizeHeight: rounds a fractional measurement", () => {
  assert.equal(clampResizeHeight(299.6, 210, 394), 300);
});

test("clampResizeHeight: clamps a measurement above PANEL_HEIGHT_MAX", () => {
  assert.equal(clampResizeHeight(900, 210, 394), 394);
});

test("clampResizeHeight: clamps a measurement below 1 up to 1", () => {
  assert.equal(clampResizeHeight(-5, 210, 394), 1);
});

test("clampResizeHeight: a non-finite measurement falls back to idleHeight", () => {
  assert.equal(clampResizeHeight(NaN, 210, 394), 210);
  assert.equal(clampResizeHeight(undefined, 210, 394), 210);
});

test("resize dedup: repeated clamped heights across a simulated Sync click collapse to one distinct value", () => {
  // Six export-progress phases + a terminal sync-status report, all
  // measuring the same row height mid-sync (the bug this fixes) — mirrors
  // code.js's onmessage "resize" handler's dedup guard: skip when the
  // clamped height equals the last one applied.
  const reports = [210, 300, 342, 342, 342, 342, 342, 342];
  let lastApplied = null;
  const appliedCalls = [];
  for (const measured of reports) {
    const height = clampResizeHeight(measured, 210, 394);
    if (height === lastApplied) continue;
    lastApplied = height;
    appliedCalls.push(height);
  }
  assert.deepEqual(appliedCalls, [210, 300, 342]);
});
