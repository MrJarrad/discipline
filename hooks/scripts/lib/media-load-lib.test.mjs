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
  regionLumaStdDev,
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
  median,
  groupRectsIntoColumns,
  columnInternalGaps,
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
// Same luma neighbourhood as WHITE (differs only ~3 in luma) but past the
// 8-per-channel colour-match tolerance on the red channel — an
// anti-aliasing-scale colour difference, not real content: fraction reads
// "differs" but there's no real structure either.
const NEAR_WHITE = { r: 246, g: 255, b: 255 };

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
});

test("isRegionPainted stays empty below both the fraction and the structure floor (anti-aliasing seam, not content)", () => {
  // 4% of pixels differ from WHITE past colour tolerance, but they're in the
  // same luma neighbourhood — no real structure, same as before this round.
  assert.equal(isRegionPainted([...pixelsOf(WHITE, 96), ...pixelsOf(NEAR_WHITE, 4)], [WHITE]), false);
});

// --- Structure signal (1.96.0 fix round 2: variance alongside background ----
// match — see media-load-lib.mjs's own comment for the two false-EMPTY
// shapes this fixes: a white-heavy real photo, and a dark-framed video.)

test("regionLumaStdDev is 0 for a perfectly flat crop, whatever its colour", () => {
  assert.ok(regionLumaStdDev(pixelsOf(WHITE, 20)) < 1e-9);
  assert.ok(regionLumaStdDev(pixelsOf(GREY_SKELETON, 20)) < 1e-9);
});

test("regionLumaStdDev is 0 for an empty crop, not NaN", () => {
  assert.equal(regionLumaStdDev([]), 0);
});

test("regionLumaStdDev is high when a crop mixes very different lumas", () => {
  const pixels = [...pixelsOf(WHITE, 96), ...pixelsOf({ r: 0, g: 0, b: 0 }, 4)];
  assert.ok(regionLumaStdDev(pixels) > 20);
});

test("isRegionPainted rescues a white-heavy real photo: below the fraction floor, but real structure (a small high-contrast region) crosses the variance floor", () => {
  // 97% pure white, 3% a near-black region — e.g. a product shot's own
  // shadow/edge on an otherwise white page background. Old rule (fraction
  // only) called this empty; the composited page shows a real photo.
  const pixels = [...pixelsOf(WHITE, 97), ...pixelsOf({ r: 0, g: 0, b: 0 }, 3)];
  assert.equal(regionPaintedFraction(pixels, [WHITE]) < 0.05, true, "fraction alone stays under the 5% floor");
  assert.equal(isRegionPainted(pixels, [WHITE]), true, "variance rescues it — this is real content, not a blank tile");
});

test("isRegionPainted still reads a flat, uniform crop as empty even when its colour isn't the exact background — a flat swatch has no structure either way", () => {
  const flatOther = { r: 128, g: 40, b: 40 };
  assert.equal(regionPaintedFraction(pixelsOf(flatOther, 20), [WHITE]), 1, "every pixel differs from the background by fraction");
  assert.ok(regionLumaStdDev(pixelsOf(flatOther, 20)) < 1e-9, "but the crop is perfectly flat — no structure");
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

// --- Trivial-sliver exemption (1.96.0 fix round 2, verified live: a tile ---
// scrolled almost entirely past the viewport edge during a fast drag, with
// only a hairline of its OWN natural rect still on screen, reading blank —
// the holding canvas's own operator-approved edge fade (round 11: "the fade
// looks good"), not a paint bug. Distinct from the round-1 "clipped tile"
// fixture above (an ancestor removes the WHOLE element — zero area — still
// caught, unchanged.)

test("a tile that's mostly scrolled off-screen, with only a trivial sliver of its own natural rect on screen, is never counted — even if that sliver reads blank", () => {
  const mostlyOffscreen = {
    // Natural rect 100x100, but only the bottom 5px overlaps the viewport —
    // 5% of its own area, well under the default 12% floor.
    rect: { left: 0, top: -95, right: 100, bottom: 5, width: 100, height: 100 },
    clipRects: [],
    visibility: "visible",
    pixels: pixelsOf(WHITE),
  };
  assert.equal(countEmptyVisibleMedia([mostlyOffscreen], VIEWPORT, [WHITE]), 0);
});

test("a substantially on-screen tile (well past the sliver floor) that's genuinely blank is still caught", () => {
  const mostlyOnscreen = {
    // 80 of its own 100px height is on screen — 80%, well past the floor.
    rect: { left: 0, top: -20, right: 100, bottom: 80, width: 100, height: 100 },
    clipRects: [],
    visibility: "visible",
    pixels: pixelsOf(WHITE),
  };
  assert.equal(countEmptyVisibleMedia([mostlyOnscreen], VIEWPORT, [WHITE]), 1);
});

test("a fully ancestor-clipped element (zero visible area — the round-1 fixture) is never exempted as a 'sliver' — it's still caught", () => {
  const fullyClipped = {
    rect: onscreen(),
    clipRects: [{ left: 500, top: 500, right: 600, bottom: 600 }],
    visibility: "visible",
    pixels: [],
  };
  assert.equal(countEmptyVisibleMedia([fullyClipped], VIEWPORT, [WHITE]), 1);
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

test("median: odd and even-length lists, and 0 for empty", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(median([]), 0);
});

test("groupRectsIntoColumns groups overlapping-x rects together, keeps non-overlapping ones apart", () => {
  const rects = [tileAt(0, 0), tileAt(0, 200), tileAt(300, 0)];
  const columns = groupRectsIntoColumns(rects);
  assert.equal(columns.length, 2);
  assert.equal(columns.find((c) => c.length === 2).every((r) => r.left === 0), true);
});

test("groupRectsIntoColumns drops zero-size rects", () => {
  assert.deepEqual(groupRectsIntoColumns([{ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }]), []);
});

test("columnInternalGaps finds gaps only between adjacent (sorted) tiles, never outer margin", () => {
  const column = [tileAt(0, 500, 100, 100), tileAt(0, 0, 100, 100)]; // unsorted input
  const gaps = columnInternalGaps(column);
  assert.equal(gaps.length, 1);
  assert.deepEqual(gaps[0], { top: 100, bottom: 500, height: 400, left: 0, right: 100 });
});

test("columnInternalGaps is empty for a single tile (no adjacent pair) or touching tiles (0-height gap)", () => {
  assert.deepEqual(columnInternalGaps([tileAt(0, 0)]), []);
  assert.deepEqual(columnInternalGaps([tileAt(0, 0), tileAt(0, 100)]), []);
});

// 1.96.0 fix round 2 (verified live: `preview.jarrad.design/holding`, 390
// viewport, fast3g drag): round 1's horizontal-line scan merged every
// column's x-span at each scanline and flagged the run BETWEEN merged spans
// — but the holding canvas is INDEPENDENT COLUMNS, each tiling its own media
// vertically. Whenever one column's own real row-gap (`--grid-gap-lg`) is
// exposed at a line where its neighbours still have TALLER tiles covering
// that same line — ordinary masonry, nothing wrong — the merge collapsed the
// untouched neighbours into one gap spanning the gapped column's own width
// plus both real gutters, wrongly read as a hole. The fix drops cross-column
// merging and compares each column's OWN internal gaps against the frame's
// pooled rhythm instead.

test("scanFrameForColumnGaps stays zero for the exact live false-positive shape: three columns whose own row-gaps land at DIFFERENT heights", () => {
  // Three independent columns, each with its own single 64px row-gap at a
  // different y — at any one scanline, at most one column is "gapped" while
  // its neighbours still have coverage there. The old horizontal-scan
  // merge read this as one wide hole; per-column, every gap is the same
  // healthy 64px rhythm.
  const rects = [
    tileAt(0, 0, 100, 300), tileAt(0, 364, 100, 436), // column 1: gap 300-364 (64px)
    tileAt(164, 0, 100, 200), tileAt(164, 264, 100, 536), // column 2: gap 200-264 (64px)
    tileAt(328, 0, 100, 400), tileAt(328, 464, 100, 336), // column 3: gap 400-464 (64px)
  ];
  const gaps = scanFrameForColumnGaps(rects, { width: 428, height: 800 });
  assert.equal(gaps.length, 0, "every column's own row-gap is the same healthy 64px rhythm — nothing is a hole");
});

test("scanFrameForColumnGaps finds the round-17 shape: one column's own gap markedly taller than the frame's recurring row-gap", () => {
  const rects = [
    tileAt(0, 0, 100, 300), tileAt(0, 364, 100, 436), // column 1: healthy 64px gap
    tileAt(164, 0, 100, 200), tileAt(164, 264, 100, 136), tileAt(164, 600, 100, 200), // column 2: healthy 64px gap, then a 200px HOLE (400-600) — a missing tile
    tileAt(328, 0, 100, 400), tileAt(328, 464, 100, 336), // column 3: healthy 64px gap
  ];
  const gaps = scanFrameForColumnGaps(rects, { width: 428, height: 800 });
  assert.equal(gaps.length, 1, "only the anomalous 200px hole is caught, never the three healthy 64px row-gaps");
  assert.equal(gaps[0].height, 200);
});

test("scanFrameForColumnGaps is zero with no candidate gaps at all (single column, nothing to compare against)", () => {
  const rects = [tileAt(0, 0, 300, 800)];
  assert.equal(scanFrameForColumnGaps(rects, { width: 300, height: 800 }).length, 0);
});

test("scanFrameForColumnGaps respects a caller-supplied widthRatio", () => {
  // A dominant 48px rhythm (columns A/B, each with one 48px gap) plus one
  // 90px gap elsewhere (column C) — 1.875x the rhythm, under the default 2x
  // ratio but past a lower one.
  const rects = [
    tileAt(0, 0, 100, 300), tileAt(0, 348, 100, 452), // column A: 48px gap
    tileAt(164, 0, 100, 500), tileAt(164, 548, 100, 252), // column B: 48px gap
    tileAt(328, 0, 100, 300), tileAt(328, 390, 100, 410), // column C: 90px gap
  ];
  const withDefault = scanFrameForColumnGaps(rects, { width: 428, height: 800 });
  const withLowerRatio = scanFrameForColumnGaps(rects, { width: 428, height: 800 }, { widthRatio: 1.5 });
  assert.equal(withDefault.length, 0, "the 90px gap stays under the default 2x-of-48px (96px) threshold");
  assert.ok(withLowerRatio.length > 0, "a lower ratio (1.5x, 72px threshold) catches the same gap");
});

test("totalColumnGapsAcrossFrames sums every sampled frame, the probe's second headline number", () => {
  const gapFrame = [
    tileAt(0, 0, 100, 300), tileAt(0, 364, 100, 436),
    tileAt(164, 0, 100, 200), tileAt(164, 264, 100, 136), tileAt(164, 600, 100, 200),
    tileAt(328, 0, 100, 400), tileAt(328, 464, 100, 336),
  ];
  const cleanFrame = [
    tileAt(0, 0, 100, 300), tileAt(0, 364, 100, 436),
    tileAt(164, 0, 100, 200), tileAt(164, 264, 100, 536),
    tileAt(328, 0, 100, 400), tileAt(328, 464, 100, 336),
  ];
  const frames = [gapFrame, cleanFrame];
  const withGap = totalColumnGapsAcrossFrames([gapFrame], { width: 428, height: 800 });
  const clean = totalColumnGapsAcrossFrames([cleanFrame], { width: 428, height: 800 });
  assert.ok(withGap > 0);
  assert.equal(clean, 0);
  assert.equal(
    totalColumnGapsAcrossFrames(frames, { width: 428, height: 800 }),
    withGap + clean,
  );
});
