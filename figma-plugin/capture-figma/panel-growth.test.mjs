// Tests for content-hugging growth (operator verdict 2026-08-01, Addendum 2
// item 3: the window must GROW to fit its content — warnings were getting
// cut off — and only scroll internally past a sane maximum).
//
// code.js can't be imported (top-level figma.showUI), so this reads the real
// source for the constants and re-uses the same extracted clampResizeHeight()
// technique resize-dedup.test.mjs established.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function readCode() {
  return readFileSync(join(import.meta.dirname, "code.js"), "utf8");
}

function readConstant(name) {
  const match = new RegExp(`const ${name} = (\\d+);`).exec(readCode());
  if (!match) throw new Error(`${name} not found in code.js`);
  return Number(match[1]);
}

function loadClampResizeHeight() {
  const match = /=== RESIZE DEDUP[\s\S]*?===\n([\s\S]*?)\n\/\/ === END RESIZE DEDUP ===/.exec(readCode());
  if (!match) throw new Error("RESIZE DEDUP markers not found in code.js");
  return new Function(`${match[1]}\nreturn clampResizeHeight;`)();
}

const clampResizeHeight = loadClampResizeHeight();
const PANEL_HEIGHT_IDLE = readConstant("PANEL_HEIGHT_IDLE");
const PANEL_HEIGHT_MAX = readConstant("PANEL_HEIGHT_MAX");

test("panel growth: the max height leaves real room for expanded content, not the old synced-mockup cap", () => {
  // 394 (the synced-state mockup's own height) cut off the warnings section
  // the moment it expanded — the operator's reported defect.
  assert.ok(
    PANEL_HEIGHT_MAX >= 600,
    `PANEL_HEIGHT_MAX is ${PANEL_HEIGHT_MAX}; expanded warnings need substantially more than the mockup's idle/synced height`
  );
});

test("panel growth: the max stays inside a realistic laptop viewport so Figma never clamps it away", () => {
  // Figma clamps the plugin iframe to the user's viewport; a max taller than
  // the shortest realistic laptop viewport (minus Figma's own toolbar/tab
  // chrome) would be silently truncated by the host, which is exactly the
  // cut-off symptom being fixed. 950 leaves margin below a 13" MacBook's
  // ~900px logical viewport height and well below a 1080p external
  // display's ~1000px+ working area (operator verdict 2026-08-01 Addendum 6
  // item 2: raise the cap to what Figma practically allows).
  assert.ok(PANEL_HEIGHT_MAX <= 950, `PANEL_HEIGHT_MAX is ${PANEL_HEIGHT_MAX}; too tall for a realistic laptop viewport`);
});

test("panel growth: the max was actually raised past the prior 640 cap, not left in place", () => {
  // The 640 cap (raised from 394) was itself reported insufficient for real
  // content (873 warnings in 3 groups + drift + Raw JSON) — this pins that
  // the fix moved the number, not just the comment above it.
  assert.ok(PANEL_HEIGHT_MAX > 640, `PANEL_HEIGHT_MAX is ${PANEL_HEIGHT_MAX}; still at or below the cap the operator reported as insufficient`);
});

test("panel growth: a tall expanded-warnings measurement grows the window instead of being cut to the old cap", () => {
  assert.equal(clampResizeHeight(560, PANEL_HEIGHT_IDLE, PANEL_HEIGHT_MAX), 560);
});

test("panel growth: past the max, the height stops growing (content scrolls internally)", () => {
  assert.equal(clampResizeHeight(2000, PANEL_HEIGHT_IDLE, PANEL_HEIGHT_MAX), PANEL_HEIGHT_MAX);
});

test("panel growth: the resize-dedup cache still suppresses only genuinely unchanged heights", () => {
  const reports = [PANEL_HEIGHT_IDLE, 300, 300, 300, 560, 560, 2000, 2000];
  let lastApplied = null;
  const applied = [];
  for (const measured of reports) {
    const height = clampResizeHeight(measured, PANEL_HEIGHT_IDLE, PANEL_HEIGHT_MAX);
    if (height === lastApplied) continue;
    lastApplied = height;
    applied.push(height);
  }
  assert.deepEqual(applied, [PANEL_HEIGHT_IDLE, 300, 560, PANEL_HEIGHT_MAX]);
});
