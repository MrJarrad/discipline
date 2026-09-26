// Unit tests for the pure media-paint logic — fixture DOM snapshots + already
// screenshot-cropped pixel arrays, no browser and no PNG decode. The CLI
// wrapper (media-load-probe.mjs) is what drives a real page, screenshots it,
// and crops each slot's pixels via png-lib.mjs; this file is what decides
// "empty and visible" from those crops.
// Run: node --test hooks/scripts/lib/media-load-lib.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseCssColor,
  colorsMatch,
  matchesAnyColor,
  regionPaintedFraction,
  isRegionPainted,
  intersectRects,
  scaleRect,
  clippedVisibleRect,
  isVisibilityHidden,
  isSlotPainted,
  isVisible,
  emptyVisibleMedia,
  countEmptyVisibleMedia,
  totalEmptyVisibleMediaAcrossFrames,
  coveredIntervalsAtY,
  gapSegmentsAtY,
  scanFrameForColumnGaps,
  totalColumnGapsAcrossFrames,
} from "./media-load-lib.mjs";

const VIEWPORT = { width: 390, height: 844 };
const onscreen = (over = {}) => ({ left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100, ...over });
const offscreen = { left: -500, top: -500, right: -400, bottom: -400, width: 100, height: 100 };
const zeroSize = { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };

const WHITE = { r: 255, g: 255, b: 255 };
const GREY_SKELETON = { r: 230, g: 230, b: 230 };
const PHOTO = { r: 10, g: 120, b: 200, a: 255 };

const pixelsOf = (color, n = 16) => Array.from({ length: n }, () => ({ ...color, a: 255 }));

// --- parseCssColor -----------------------------------------------------------

test("parseCssColor reads rgb() and rgba()", () => {
  assert.deepEqual(parseCssColor("rgb(255, 255, 255)"), { r: 255, g: 255, b: 255 });
  assert.deepEqual(parseCssColor("rgba(10, 20, 30, 0.5)"), { r: 10, g: 20, b: 30 });
});

test("parseCssColor reads short and long hex", () => {
  assert.deepEqual(parseCssColor("#fff"), { r: 255, g: 255, b: 255 });
  assert.deepEqual(parseCssColor("#0a141e"), { r: 10, g: 20, b: 30 });
});

test("parseCssColor throws on an unrecognised value", () => {
  assert.throws(() => parseCssColor("papayawhip"), /Unrecognised CSS colour/);
});

// --- colour matching / region fraction ---------------------------------------

test("colorsMatch is true within tolerance, false past it", () => {
  assert.equal(colorsMatch({ r: 250, g: 250, b: 250 }, WHITE, 8), true);
  assert.equal(colorsMatch({ r: 200, g: 200, b: 200 }, WHITE, 8), false);
});

test("matchesAnyColor checks every named colour", () => {
  assert.equal(matchesAnyColor(GREY_SKELETON, [WHITE, GREY_SKELETON]), true);
  assert.equal(matchesAnyColor(PHOTO, [WHITE, GREY_SKELETON]), false);
});

test("regionPaintedFraction is the share of pixels that are NOT an empty colour", () => {
  const pixels = [...pixelsOf(WHITE, 9), ...pixelsOf(PHOTO, 1)];
  assert.equal(regionPaintedFraction(pixels, [WHITE]), 0.1);
});

test("regionPaintedFraction of an empty pixel list is 0, not NaN", () => {
  assert.equal(regionPaintedFraction([], [WHITE]), 0);
});

test("isRegionPainted crosses the default 5% threshold", () => {
  assert.equal(isRegionPainted([...pixelsOf(WHITE, 94), ...pixelsOf(PHOTO, 6)], [WHITE]), true);
  assert.equal(isRegionPainted([...pixelsOf(WHITE, 96), ...pixelsOf(PHOTO, 4)], [WHITE]), false);
});

// --- rect clipping -------------------------------------------------------

test("intersectRects returns the overlap, or null when there is none", () => {
  assert.deepEqual(intersectRects({ left: 0, top: 0, right: 100, bottom: 100 }, { left: 50, top: 50, right: 150, bottom: 150 }), {
    left: 50, top: 50, right: 100, bottom: 100, width: 50, height: 50,
  });
  assert.equal(intersectRects({ left: 0, top: 0, right: 10, bottom: 10 }, { left: 20, top: 20, right: 30, bottom: 30 }), null);
});

test("scaleRect multiplies every edge by the given scale (CSS px -> screenshot px)", () => {
  assert.deepEqual(scaleRect({ left: 1, top: 2, right: 3, bottom: 4, width: 2, height: 2 }, 3), {
    left: 3, top: 6, right: 9, bottom: 12, width: 6, height: 6,
  });
});

test("clippedVisibleRect intersects the element rect with the viewport and every clip ancestor", () => {
  const state = { rect: onscreen({ left: 0, top: 0, right: 200, bottom: 200, width: 200, height: 200 }), clipRects: [{ left: 50, top: 50, right: 150, bottom: 150 }] };
  assert.deepEqual(clippedVisibleRect(state, VIEWPORT), { left: 50, top: 50, right: 150, bottom: 150, width: 100, height: 100 });
});

test("clippedVisibleRect returns null when a clip ancestor leaves nothing visible", () => {
  const state = { rect: onscreen(), clipRects: [{ left: 500, top: 500, right: 600, bottom: 600 }] };
  assert.equal(clippedVisibleRect(state, VIEWPORT), null);
});

test("clippedVisibleRect with no clip ancestors is just the viewport intersection", () => {
  const state = { rect: onscreen(), clipRects: [] };
  assert.deepEqual(clippedVisibleRect(state, VIEWPORT), onscreen());
});

test("isVisibilityHidden reads the sampled computed style", () => {
  assert.equal(isVisibilityHidden({ visibility: "hidden" }), true);
  assert.equal(isVisibilityHidden({ visibility: "visible" }), false);
});

// --- isSlotPainted: the six named fixtures (round 1 fix — false-pass cases) --

test("fixture: painted tile — real photo pixels, on screen, unclipped, visible", () => {
  const state = { rect: onscreen(), clipRects: [], visibility: "visible" };
  assert.equal(isSlotPainted(state, pixelsOf(PHOTO), [WHITE]), true);
});

test("fixture: blank background — the crop is nothing but the page background", () => {
  const state = { rect: onscreen(), clipRects: [], visibility: "visible" };
  assert.equal(isSlotPainted(state, pixelsOf(WHITE), [WHITE]), false);
});

test("fixture: opacity-0 tile — composited crop shows only what's behind it (the background)", () => {
  // opacity:0 contributes nothing to the composite; the screenshot crop is
  // indistinguishable from a blank background — no separate opacity read
  // needed once the signal is the actual composited pixels.
  const state = { rect: onscreen(), clipRects: [], visibility: "visible", opacity: 0 };
  assert.equal(isSlotPainted(state, pixelsOf(WHITE), [WHITE]), false);
});

test("fixture: covered tile — an opaque sibling paints its own placeholder swatch over the slot", () => {
  const state = { rect: onscreen(), clipRects: [], visibility: "visible" };
  assert.equal(isSlotPainted(state, pixelsOf(GREY_SKELETON), [WHITE, GREY_SKELETON]), false);
});

test("fixture: clipped tile — an overflow:hidden ancestor leaves no visible area to sample", () => {
  const state = { rect: onscreen(), clipRects: [{ left: 500, top: 500, right: 600, bottom: 600 }], visibility: "visible" };
  const clipped = clippedVisibleRect(state, VIEWPORT);
  assert.equal(clipped, null);
  // No pixels were ever cropped (clipped away) — the probe passes null/[].
  assert.equal(isSlotPainted(state, clipped, [WHITE]), false);
});

test("fixture: visibility:hidden tile — real painted-looking pixels still read empty", () => {
  const state = { rect: onscreen(), clipRects: [], visibility: "hidden" };
  assert.equal(isSlotPainted(state, pixelsOf(PHOTO), [WHITE]), false);
});

// --- isVisible ---------------------------------------------------------------

test("a rect fully inside the viewport is visible", () => {
  assert.equal(isVisible(onscreen(), VIEWPORT), true);
});

test("a rect entirely off the top/left/right/bottom is not visible", () => {
  assert.equal(isVisible(offscreen, VIEWPORT), false);
  assert.equal(isVisible({ ...offscreen, left: 5000, right: 5100 }, VIEWPORT), false);
});

test("a zero-size rect (display:none, unlaid-out) is never visible", () => {
  assert.equal(isVisible(zeroSize, VIEWPORT), false);
});

test("a rect only partially overlapping the viewport still counts as visible", () => {
  assert.equal(isVisible({ left: -50, top: -50, right: 50, bottom: 50, width: 100, height: 100 }, VIEWPORT), true);
});

// --- emptyVisibleMedia / countEmptyVisibleMedia -------------------------------

test("a visible unpainted element counts; a visible painted one does not", () => {
  const states = [
    { rect: onscreen(), clipRects: [], visibility: "visible", pixels: pixelsOf(WHITE) },
    { rect: onscreen(), clipRects: [], visibility: "visible", pixels: pixelsOf(PHOTO) },
  ];
  assert.equal(countEmptyVisibleMedia(states, VIEWPORT, [WHITE]), 1);
  assert.deepEqual(emptyVisibleMedia(states, VIEWPORT, [WHITE])[0].pixels, pixelsOf(WHITE));
});

test("an unpainted but off-screen element never counts — only on-screen tiles matter", () => {
  const states = [{ rect: offscreen, clipRects: [], visibility: "visible", pixels: [] }];
  assert.equal(countEmptyVisibleMedia(states, VIEWPORT, [WHITE]), 0);
});

test("an empty frame (no media at all) counts zero", () => {
  assert.equal(countEmptyVisibleMedia([], VIEWPORT, [WHITE]), 0);
});

// --- totalEmptyVisibleMediaAcrossFrames ---------------------------------------

test("the total sums every sampled frame's count, not just the worst one", () => {
  const unpainted = { rect: onscreen(), clipRects: [], visibility: "visible", pixels: pixelsOf(WHITE) };
  const painted = { rect: onscreen(), clipRects: [], visibility: "visible", pixels: pixelsOf(PHOTO) };
  const frames = [[unpainted], [unpainted, unpainted], [painted]];
  assert.equal(totalEmptyVisibleMediaAcrossFrames(frames, VIEWPORT, [WHITE]), 3);
});

test("an all-painted, all-frames interaction totals zero — the passing shape", () => {
  const painted = { rect: onscreen(), clipRects: [], visibility: "visible", pixels: pixelsOf(PHOTO) };
  const frames = [[painted], [painted], [painted]];
  assert.equal(totalEmptyVisibleMediaAcrossFrames(frames, VIEWPORT, [WHITE]), 0);
});

// --- Column-gap scan (round 17: a missing DOM node, not a paint state) ------

const tileAt = (left, top, width = 100, height = 100) => ({ left, top, right: left + width, bottom: top + height, width, height });

test("coveredIntervalsAtY merges overlapping/adjacent rect spans crossing the line", () => {
  const rects = [tileAt(0, 0), tileAt(100, 0), tileAt(300, 0)];
  assert.deepEqual(coveredIntervalsAtY(rects, 50), [[0, 200], [300, 400]]);
});

test("coveredIntervalsAtY ignores rects that don't cross the line", () => {
  const rects = [tileAt(0, 0, 100, 100), tileAt(0, 500, 100, 100)];
  assert.deepEqual(coveredIntervalsAtY(rects, 50), [[0, 100]]);
});

test("gapSegmentsAtY finds a hole strictly between two covered spans, past the tolerance", () => {
  const rects = [tileAt(0, 0), tileAt(300, 0)]; // 200px hole between them
  const gaps = gapSegmentsAtY(rects, 50, 24);
  assert.equal(gaps.length, 1);
  assert.deepEqual(gaps[0], { y: 50, left: 100, right: 300, width: 200 });
});

test("gapSegmentsAtY never flags the outer margin before the first or after the last tile", () => {
  const rects = [tileAt(50, 0)]; // margin left of 50 and right of 150 — real layout whitespace
  assert.deepEqual(gapSegmentsAtY(rects, 50, 24), []);
});

test("gapSegmentsAtY ignores a gap at or under the tolerance (anti-aliasing seam, not a real hole)", () => {
  const rects = [tileAt(0, 0), tileAt(110, 0)]; // 10px seam
  assert.deepEqual(gapSegmentsAtY(rects, 50, 24), []);
});

test("scanFrameForColumnGaps finds the round-17 shape: a full-height vertical gap in one column", () => {
  // Two full-height columns with a 250px-wide hole between them the whole way down.
  const rects = [tileAt(0, 0, 100, 800), tileAt(350, 0, 100, 800)];
  const gaps = scanFrameForColumnGaps(rects, { width: 450, height: 800 }, { stepPx: 40, tolerancePx: 24 });
  assert.ok(gaps.length > 0, "a full-height hole must be caught on multiple scanlines");
  assert.ok(gaps.every((g) => g.width === 250));
});

test("scanFrameForColumnGaps is zero when the mosaic has no holes", () => {
  const rects = [tileAt(0, 0, 100, 800), tileAt(100, 0, 100, 800), tileAt(200, 0, 100, 800)];
  assert.equal(scanFrameForColumnGaps(rects, { width: 300, height: 800 }).length, 0);
});

test("totalColumnGapsAcrossFrames sums every sampled frame, the probe's second headline number", () => {
  const gapFrame = [tileAt(0, 0, 100, 800), tileAt(350, 0, 100, 800)];
  const cleanFrame = [tileAt(0, 0, 100, 800), tileAt(100, 0, 100, 800)];
  const frames = [gapFrame, cleanFrame];
  const withGap = totalColumnGapsAcrossFrames([gapFrame], { width: 450, height: 800 });
  const clean = totalColumnGapsAcrossFrames([cleanFrame], { width: 200, height: 800 });
  assert.ok(withGap > 0);
  assert.equal(clean, 0);
  assert.equal(
    totalColumnGapsAcrossFrames(frames, { width: 450, height: 800 }),
    withGap + clean,
  );
});
