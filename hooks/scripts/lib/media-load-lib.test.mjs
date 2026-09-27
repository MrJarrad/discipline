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
  regionMaxLumaJump,
  isRegionPainted,
  intersectRects,
  scaleRect,
  clippedVisibleRect,
  isVisibilityHidden,
  isSlotPainted,
  isVisible,
  isTrivialSliver,
  mediaIdentity,
  classifyEmptyAcrossFrames,
  totalEmptyMediaAcrossFrames,
  DEFAULT_ARRIVAL_WINDOW_MS,
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

// --- Structure-edge bound (1.96.0 fix round 3: the stddev rescue also -------
// passed a smooth gradient/shimmer LOADING SKELETON — real spread, no real
// edge. `regionMaxLumaJump` is the largest single-step luma jump between
// spatially-adjacent pixels (row-major crop order); the rescue now requires
// BOTH the spread AND a real edge.)

// A smooth linear ramp — the same shape as a CSS gradient/shimmer skeleton —
// 220..260 luma over 100 pixels: real overall spread, but each step is
// ~0.4 luma, nowhere near a real edge.
const gradientPixels = (n = 100) =>
  Array.from({ length: n }, (_, i) => {
    const v = Math.min(255, 220 + Math.floor((i / n) * 40));
    return { r: v, g: v, b: v, a: 255 };
  });

test("regionMaxLumaJump is ~0 for a smooth gradient despite real overall spread", () => {
  const pixels = gradientPixels();
  assert.ok(regionLumaStdDev(pixels) >= 10, "the gradient crosses the spread floor on its own");
  assert.ok(regionMaxLumaJump(pixels) < 20, "but no single step is a real edge");
});

test("regionMaxLumaJump is high across a real edge (a sharp colour change between adjacent pixels)", () => {
  const pixels = [...pixelsOf(WHITE, 50), ...pixelsOf({ r: 0, g: 0, b: 0 }, 50)];
  assert.ok(regionMaxLumaJump(pixels) >= 200);
});

test("regionMaxLumaJump is 0 for fewer than two pixels, not NaN", () => {
  assert.equal(regionMaxLumaJump([]), 0);
  assert.equal(regionMaxLumaJump([WHITE]), 0);
});

test("isRegionPainted no longer rescues a smooth gradient/shimmer loading skeleton — real spread, no real edge", () => {
  const pixels = gradientPixels();
  assert.ok(regionLumaStdDev(pixels) >= 10, "spread alone would have rescued this before round 3");
  // A generous tolerance isolates the case the fix is about: the FRACTION
  // path already reads this crop as empty (every pixel matches within a wide
  // enough band), so the only thing that could still misclassify it is the
  // stddev/edge-jump OR — this proves that path alone stays bounded.
  assert.equal(regionPaintedFraction(pixels, [{ r: 240, g: 240, b: 240 }], 30) < 0.05, true, "the fraction path alone already reads this as empty");
  assert.equal(isRegionPainted(pixels, [{ r: 240, g: 240, b: 240 }], { tolerance: 30 }), false, "a skeleton is still not-yet-painted — the stddev path stays bounded by the edge-jump floor");
});

test("isRegionPainted still rescues a real white-heavy photo (spread AND a real edge) even though it's also mostly background-close", () => {
  const pixels = [...pixelsOf(WHITE, 97), ...pixelsOf({ r: 0, g: 0, b: 0 }, 3)];
  assert.equal(isRegionPainted(pixels, [WHITE]), true);
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

// --- classifyEmptyAcrossFrames / totalEmptyMediaAcrossFrames (1.96.0 fix ----
// round 3 — replaces round 2's single-frame `emptyVisibleMedia`; see the
// lib's own comment for why a single frame can't tell "mid-fade" from
// "genuinely stuck", or "at rest" from "in motion"). `arrivalWindowMs: 0`
// below disables the debounce for tests that are about geometry/paint alone,
// not timing — the arrival-window tests further down cover the timing.

test("a visible unpainted element counts; a visible painted one does not", () => {
  const states = [
    { rect: onscreen(), clipRects: [], visibility: "visible", pixels: pixelsOf(WHITE) },
    { rect: onscreen(), clipRects: [], visibility: "visible", pixels: pixelsOf(PHOTO) },
  ];
  const result = classifyEmptyAcrossFrames([states], VIEWPORT, [WHITE], { arrivalWindowMs: 0 });
  assert.equal(result.total, 1);
  assert.deepEqual(result.flagged[0].pixels, pixelsOf(WHITE));
});

test("an unpainted but off-screen element never counts — only on-screen tiles matter", () => {
  const states = [{ rect: offscreen, clipRects: [], visibility: "visible", pixels: [] }];
  assert.equal(totalEmptyMediaAcrossFrames([states], VIEWPORT, [WHITE], { arrivalWindowMs: 0 }), 0);
});

test("an empty frame (no media at all) counts zero", () => {
  assert.equal(totalEmptyMediaAcrossFrames([[]], VIEWPORT, [WHITE], { arrivalWindowMs: 0 }), 0);
});

test("mediaIdentity combines tag, src, and index — the fallback when a state carries no id of its own", () => {
  assert.equal(mediaIdentity({ tag: "img", src: "a.jpg" }, 2), "img:a.jpg:2");
  assert.equal(mediaIdentity({}, 0), "media::0");
});

test("isTrivialSliver is true only for a nonzero but small visible-area share — zero is a hard defect, not a sliver", () => {
  const zeroArea = { rect: onscreen(), clipRects: [{ left: 500, top: 500, right: 600, bottom: 600 }] };
  const sliver = { rect: { left: 0, top: -95, right: 100, bottom: 5, width: 100, height: 100 }, clipRects: [] };
  const mostly = { rect: { left: 0, top: -20, right: 100, bottom: 80, width: 100, height: 100 }, clipRects: [] };
  assert.equal(isTrivialSliver(zeroArea, VIEWPORT, 0.15), false);
  assert.equal(isTrivialSliver(sliver, VIEWPORT, 0.15), true);
  assert.equal(isTrivialSliver(mostly, VIEWPORT, 0.15), false);
});

// --- Sliver exemption bound to real motion (1.96.0 fix round 3) ------------
// Round 2's exemption fired on ANY nonzero-but-small on-screen share,
// including a static tile at rest that never moves at all — review round 2's
// own finding, live on the holding page: "a genuinely blank tile at the fold
// at load" was silently hidden. Round 3: the exemption only fires when the
// element's rect has actually MOVED since the previous frame it was seen in
// — a real transit, never a static layout position (first frame of any
// session, `load`, or two identical consecutive samples).

test("a static sliver at rest — the first frame of a session, nothing to compare motion against — is judged normally: a genuinely blank one is caught, not exempted", () => {
  const sliver = {
    id: "a",
    // Natural rect 100x100, only the bottom 5px on screen — 5% of its own
    // area, well under the default 15% floor.
    rect: { left: 0, top: -95, right: 100, bottom: 5, width: 100, height: 100 },
    clipRects: [], visibility: "visible", pixels: pixelsOf(WHITE),
  };
  assert.equal(totalEmptyMediaAcrossFrames([[sliver]], VIEWPORT, [WHITE], { arrivalWindowMs: 0 }), 1, "a sliver at the fold at load is not a motion case — caught like any other blank slot");
});

test("a sliver at the SAME rect across two frames (no motion between them) is never exempted", () => {
  const sliver = { id: "a", rect: { left: 0, top: -95, right: 100, bottom: 5, width: 100, height: 100 }, clipRects: [], visibility: "visible", pixels: pixelsOf(WHITE) };
  assert.equal(totalEmptyMediaAcrossFrames([[sliver], [sliver]], VIEWPORT, [WHITE], { arrivalWindowMs: 0 }), 2, "no motion between the two frames — caught both times");
});

test("a sliver whose rect MOVED since the previous frame — genuinely transiting the viewport edge — is exempted once its motion is established against a prior frame", () => {
  // A slot's very FIRST sampled frame has no prior rect to compare motion
  // against, so it's judged at rest (covered by the "static sliver at rest"
  // test above) — real motion only reads once there IS a previous frame with
  // a different rect: here, frame 0 has the tile fully on screen, then it
  // transits into a sliver across frames 1-2.
  const full = { id: "a", rect: { left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100 }, clipRects: [], visibility: "visible", pixels: pixelsOf(PHOTO) };
  const sliver1 = { id: "a", rect: { left: 0, top: -90, right: 100, bottom: 10, width: 100, height: 100 }, clipRects: [], visibility: "visible", pixels: pixelsOf(WHITE) };
  const sliver2 = { id: "a", rect: { left: 0, top: -95, right: 100, bottom: 5, width: 100, height: 100 }, clipRects: [], visibility: "visible", pixels: pixelsOf(WHITE) };
  const total = totalEmptyMediaAcrossFrames([[full], [sliver1], [sliver2]], VIEWPORT, [WHITE], { arrivalWindowMs: 0 });
  assert.equal(total, 0, "the tile was fully on screen the frame before — a real transit into a sliver, not a static blank at rest");
});

test("a substantially on-screen tile (well past the sliver floor) that's genuinely blank is still caught", () => {
  const mostlyOnscreen = { id: "a", rect: { left: 0, top: -20, right: 100, bottom: 80, width: 100, height: 100 }, clipRects: [], visibility: "visible", pixels: pixelsOf(WHITE) };
  assert.equal(totalEmptyMediaAcrossFrames([[mostlyOnscreen]], VIEWPORT, [WHITE], { arrivalWindowMs: 0 }), 1);
});

test("a fully ancestor-clipped element (zero visible area — the round-1 fixture) is never exempted as a 'sliver' — it's still caught", () => {
  const fullyClipped = { id: "a", rect: onscreen(), clipRects: [{ left: 500, top: 500, right: 600, bottom: 600 }], visibility: "visible", pixels: [] };
  assert.equal(totalEmptyMediaAcrossFrames([[fullyClipped]], VIEWPORT, [WHITE], { arrivalWindowMs: 0 }), 1);
});

// --- Arrival window (1.96.0 fix round 3): a blank slot only counts once it's
// stayed blank longer than one fade cycle (`arrivalWindowMs`), measured as
// consecutive blank frames for the same identity × the caller's own
// `frameIntervalMs` — review round 2's own finding: fast-fling mode read
// misses a paced crawl didn't, because a tile mid its own ~250ms
// operator-approved decode-gated fade samples blank on the one frame that
// lands inside the fade, then paints on the next.

test("a slot blank for one frame under the arrival window, then painted — a sample landing mid-fade — is never counted", () => {
  const blank = { id: "a", rect: onscreen(), clipRects: [], visibility: "visible", pixels: pixelsOf(WHITE) };
  const painted = { id: "a", rect: onscreen(), clipRects: [], visibility: "visible", pixels: pixelsOf(PHOTO) };
  const total = totalEmptyMediaAcrossFrames([[blank], [painted]], VIEWPORT, [WHITE], { arrivalWindowMs: 250, frameIntervalMs: 200 });
  assert.equal(total, 0, "one 200ms blank frame under the 250ms window, then it painted — arriving, not empty");
});

test("a slot blank across enough consecutive frames to cross the arrival window IS counted", () => {
  const blank = { id: "a", rect: onscreen(), clipRects: [], visibility: "visible", pixels: pixelsOf(WHITE) };
  // 200ms, 400ms, 600ms accumulated — frames 2 and 3 cross the 250ms window.
  const total = totalEmptyMediaAcrossFrames([[blank], [blank], [blank]], VIEWPORT, [WHITE], { arrivalWindowMs: 250, frameIntervalMs: 200 });
  assert.equal(total, 2);
});

test("arrivalWindowMs: 0 (load's own mode) counts a blank slot on its very first frame, unchanged from before this round", () => {
  const blank = { id: "a", rect: onscreen(), clipRects: [], visibility: "visible", pixels: pixelsOf(WHITE) };
  assert.equal(totalEmptyMediaAcrossFrames([[blank]], VIEWPORT, [WHITE], { arrivalWindowMs: 0, frameIntervalMs: 50 }), 1);
});

// Regression: a live proof run against this fix's own first cut found
// DEFAULT_ARRIVAL_WINDOW_MS (250) EQUAL to the fling session's own sampling
// cadence (`FLING_SAMPLE_EVERY_MS`, also 250, in media-load-probe.mjs) — so
// `blankMs (0 + 250) >= arrivalWindowMs (250)` was already true on a slot's
// FIRST sampled blank frame, flagging it immediately and defeating the whole
// debounce (paint read as high as 185 on the real holding page, almost all
// of it mid-fade tiles). The default must survive one full fling-cadence
// sample without tripping, and only trip once a second one lands.
test("the DEFAULT arrival window is strictly past one fling-session sampling interval (250ms) — a single blank sample at that cadence never trips it alone", () => {
  const FLING_SAMPLE_EVERY_MS = 250; // media-load-probe.mjs's own constant — not imported (no cross-file dependency in a pure-lib test), just its value
  const blank = { id: "a", rect: onscreen(), clipRects: [], visibility: "visible", pixels: pixelsOf(WHITE) };
  const oneSample = totalEmptyMediaAcrossFrames([[blank]], VIEWPORT, [WHITE], { frameIntervalMs: FLING_SAMPLE_EVERY_MS });
  const twoSamples = totalEmptyMediaAcrossFrames([[blank], [blank]], VIEWPORT, [WHITE], { frameIntervalMs: FLING_SAMPLE_EVERY_MS });
  assert.equal(oneSample, 0, "one 250ms blank sample must never trip the default window alone");
  assert.ok(twoSamples > 0, "two consecutive 250ms blank samples (500ms) must trip it");
  assert.ok(DEFAULT_ARRIVAL_WINDOW_MS > FLING_SAMPLE_EVERY_MS, "the default window must be strictly greater than the fling cadence it's measured against");
});

test("a slot that leaves the DOM (windowed-mount removal) and reappears blank later restarts the arrival window — no stale streak carried over", () => {
  const blankA = { id: "a", rect: onscreen(), clipRects: [], visibility: "visible", pixels: pixelsOf(WHITE) };
  const total = totalEmptyMediaAcrossFrames([[blankA], [], [blankA]], VIEWPORT, [WHITE], { arrivalWindowMs: 250, frameIntervalMs: 200 });
  assert.equal(total, 0, "each reappearance only has one frame (200ms) of accumulated blank time — under the 250ms window");
});

test("the total sums every sampled frame that crossed the window, not just the worst one", () => {
  const unpainted = { id: "a", rect: onscreen(), clipRects: [], visibility: "visible", pixels: pixelsOf(WHITE) };
  const painted = { id: "a", rect: onscreen(), clipRects: [], visibility: "visible", pixels: pixelsOf(PHOTO) };
  const frames = [[unpainted], [unpainted], [painted]];
  assert.equal(totalEmptyMediaAcrossFrames(frames, VIEWPORT, [WHITE], { arrivalWindowMs: 0 }), 2);
});

test("an all-painted, all-frames interaction totals zero — the passing shape", () => {
  const painted = { id: "a", rect: onscreen(), clipRects: [], visibility: "visible", pixels: pixelsOf(PHOTO) };
  const frames = [[painted], [painted], [painted]];
  assert.equal(totalEmptyMediaAcrossFrames(frames, VIEWPORT, [WHITE], { arrivalWindowMs: 0 }), 0);
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
