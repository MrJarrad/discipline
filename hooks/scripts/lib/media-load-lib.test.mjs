// Unit tests for the pure media-paint logic — fixture DOM snapshots, no
// browser launched. The CLI wrapper (media-load-probe.mjs) is what drives a
// real page; this file is what decides "empty and visible" from its samples.
// Run: node --test hooks/scripts/lib/media-load-lib.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isPainted,
  isPaintedFromDomState,
  isPixelPainted,
  isTransparentPaint,
  isStuckOpacityZero,
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

// --- isPainted: DOM-state fallback (no `samples` field on the state) -------
// 1.96.0: this heuristic is now the FALLBACK path only (tainted-canvas
// elements) — kept and tested unchanged so every pre-1.96.0 caller/fixture
// still works. The primary, pixel-based path is tested further below.

test("an img is painted once complete with a decoded non-zero frame", () => {
  assert.equal(isPainted({ tag: "img", complete: true, naturalWidth: 200 }), true);
  assert.equal(isPaintedFromDomState({ tag: "img", complete: true, naturalWidth: 200 }), true);
});

test("an img mid-decode (not complete, or 0-width) is not painted", () => {
  assert.equal(isPainted({ tag: "img", complete: false, naturalWidth: 200 }), false);
  assert.equal(isPainted({ tag: "img", complete: true, naturalWidth: 0 }), false);
});

test("a video with its poster loaded is painted even before any frame decodes", () => {
  assert.equal(isPainted({ tag: "video", posterLoaded: true, readyState: 0, videoWidth: 0 }), true);
});

test("a video with no poster is painted once it reaches HAVE_CURRENT_DATA with real dimensions", () => {
  assert.equal(isPainted({ tag: "video", posterLoaded: false, readyState: 2, videoWidth: 640 }), true);
  assert.equal(isPainted({ tag: "video", posterLoaded: false, readyState: 1, videoWidth: 640 }), false);
  assert.equal(isPainted({ tag: "video", posterLoaded: false, readyState: 2, videoWidth: 0 }), false);
});

test("a non-media tag is never counted as unpainted (defaults true)", () => {
  assert.equal(isPainted({ tag: "div" }), true);
});

// --- isPainted: pixel-based path (primary signal, 1.96.0) -------------------

const opaquePoint = { r: 10, g: 20, b: 30, a: 255 };
const transparentPoint = { r: 0, g: 0, b: 0, a: 0 };

test("isTransparentPaint is true only when every sampled point has zero alpha", () => {
  assert.equal(isTransparentPaint([transparentPoint, transparentPoint]), true);
  assert.equal(isTransparentPaint([transparentPoint, opaquePoint]), false);
  assert.equal(isTransparentPaint([]), false, "no samples at all is not itself a transparent verdict");
});

test("isStuckOpacityZero: real pixels behind an element stuck at opacity 0 is the fade-race failure", () => {
  assert.equal(isStuckOpacityZero([opaquePoint], 0), true);
  assert.equal(isStuckOpacityZero([opaquePoint], 0.005), true, "near-zero counts as stuck");
  assert.equal(isStuckOpacityZero([opaquePoint], 1), false);
});

test("isStuckOpacityZero: a transparent element is the 'hole' failure, not the fade-race one", () => {
  assert.equal(isStuckOpacityZero([transparentPoint], 0), false);
});

test("isPixelPainted: opaque pixels at full opacity is the passing shape", () => {
  assert.equal(isPixelPainted([opaquePoint], 1), true);
});

test("isPixelPainted: transparent samples fail regardless of opacity", () => {
  assert.equal(isPixelPainted([transparentPoint], 1), false);
});

test("isPixelPainted: real pixels stuck at opacity 0 fail (the round-17 fade-race)", () => {
  assert.equal(isPixelPainted([opaquePoint], 0), false);
});

test("isPainted dispatches to the pixel path when a state carries `samples`", () => {
  assert.equal(isPainted({ tag: "img", samples: [opaquePoint], opacity: 1 }), true);
  assert.equal(isPainted({ tag: "img", samples: [transparentPoint], opacity: 1 }), false);
  assert.equal(isPainted({ tag: "img", samples: [opaquePoint], opacity: 0 }), false);
});

test("isPainted dispatches to the DOM-state fallback when a state carries no `samples` (paintUnmeasurable)", () => {
  assert.equal(
    isPainted({ tag: "img", paintUnmeasurable: true, complete: true, naturalWidth: 200 }),
    true,
  );
  assert.equal(
    isPainted({ tag: "img", paintUnmeasurable: true, complete: false, naturalWidth: 0 }),
    false,
  );
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
    { tag: "img", rect: onscreen(), complete: false, naturalWidth: 0 },
    { tag: "img", rect: onscreen(), complete: true, naturalWidth: 200 },
  ];
  assert.equal(countEmptyVisibleMedia(states, VIEWPORT), 1);
  assert.equal(emptyVisibleMedia(states, VIEWPORT)[0].complete, false);
});

test("an unpainted but off-screen element never counts — only on-screen tiles matter", () => {
  const states = [{ tag: "video", rect: offscreen, posterLoaded: false, readyState: 0, videoWidth: 0 }];
  assert.equal(countEmptyVisibleMedia(states, VIEWPORT), 0);
});

test("an empty frame (no media at all) counts zero", () => {
  assert.equal(countEmptyVisibleMedia([], VIEWPORT), 0);
});

// --- totalEmptyVisibleMediaAcrossFrames ---------------------------------------

test("the total sums every sampled frame's count, not just the worst one", () => {
  const unpainted = { tag: "img", rect: onscreen(), complete: false, naturalWidth: 0 };
  const painted = { tag: "img", rect: onscreen(), complete: true, naturalWidth: 200 };
  const frames = [[unpainted], [unpainted, unpainted], [painted]];
  assert.equal(totalEmptyVisibleMediaAcrossFrames(frames, VIEWPORT), 3);
});

test("an all-painted, all-frames interaction totals zero — the passing shape", () => {
  const painted = { tag: "video", rect: onscreen(), posterLoaded: true, readyState: 0, videoWidth: 0 };
  const frames = [[painted], [painted], [painted]];
  assert.equal(totalEmptyVisibleMediaAcrossFrames(frames, VIEWPORT), 0);
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
