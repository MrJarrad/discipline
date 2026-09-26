// Pure media-paint arithmetic, isolated from Playwright so it's unit-testable
// without a browser — the same split `capture-website/scripts/lib/*` uses.
// A media-loading DONE means: every media element visible on screen shows at
// least its still/poster from first paint, throughout scroll/drag/hover/route
// change — never a blank or half-painted tile, and never a hole where a tile
// should be. This file decides, from a plain sampled DOM/pixel snapshot,
// whether one element counts as "empty and visible", and separately whether a
// visible region has no covering element at all (a genuine gap).

// --- Paint state (primary signal: pixels; DOM state is a documented fallback)

// 1.96.0: `.complete`/`readyState` reads PASS on a stuck-at-opacity-0 element
// whose bytes already decoded — the holding-page round-13 finding that moved
// this probe's primary signal to actual painted pixels. `state.samples` is a
// handful of {r,g,b,a} reads taken from the element's own rendered pixels
// (canvas drawImage + getImageData, sampled in-page); `state.opacity` is the
// element's own computed opacity. Both travel together — an element is only
// "pixel-measured" when both are present.

// Fully transparent paint (every sampled point alpha 0) is the literal "hole"
// failure — nothing painted at all, not even a swatch fallback.
export function isTransparentPaint(samples) {
  return samples.length > 0 && samples.every((p) => p.a === 0);
}

// A stuck-at-opacity-0 tile (the round-17 fade-race) has real pixels ready
// (non-transparent samples) but the element itself never reached visible
// opacity — the entrance fade got cancelled mid-wait and never resumed
// (method 3, SKILL.md). Indistinguishable from "never loaded" to a reader.
export function isStuckOpacityZero(samples, computedOpacity) {
  return !isTransparentPaint(samples) && Number(computedOpacity) <= 0.01;
}

// The pixel-based verdict for one sampled element.
export function isPixelPainted(samples, computedOpacity) {
  if (isTransparentPaint(samples)) return false;
  if (isStuckOpacityZero(samples, computedOpacity)) return false;
  return true;
}

// The DOM-state heuristic — FALLBACK ONLY, used solely when pixel sampling
// itself couldn't run (a tainted canvas: cross-origin media with no CORS
// header). Never the primary signal; a result that used this path is named
// (`paintUnmeasurable`) rather than silently trusted.
//
// An <img> is painted once the browser has decoded a non-zero frame.
// A <video> is painted once its poster has loaded, or once its own decode
// has reached HAVE_CURRENT_DATA (readyState >= 2) with a real frame size.
const HAVE_CURRENT_DATA = 2;

export function isPaintedFromDomState(state) {
  if (state.tag === "img") {
    return Boolean(state.complete && state.naturalWidth > 0);
  }
  if (state.tag === "video") {
    if (state.posterLoaded) return true;
    return Boolean(state.readyState >= HAVE_CURRENT_DATA && state.videoWidth > 0);
  }
  return true; // not a media tag this probe tracks
}

// Dispatcher: pixel signal when present, DOM-state fallback otherwise. Kept
// as `isPainted` (the pre-1.96.0 name) so every direct caller/fixture that
// only ever supplied DOM-state fields keeps working unchanged.
export function isPainted(state) {
  if (state.samples) {
    return isPixelPainted(state.samples, state.opacity);
  }
  return isPaintedFromDomState(state);
}

// On screen means the element's rect overlaps the viewport rect at all —
// zero-size rects (display:none, not yet laid out) never count as visible.
export function isVisible(rect, viewport) {
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    rect.right > 0 &&
    rect.bottom > 0 &&
    rect.left < viewport.width &&
    rect.top < viewport.height
  );
}

// One frame's empty-visible-media set: on screen, and not yet painted.
export function emptyVisibleMedia(states, viewport) {
  return states.filter((s) => isVisible(s.rect, viewport) && !isPainted(s));
}

export function countEmptyVisibleMedia(states, viewport) {
  return emptyVisibleMedia(states, viewport).length;
}

// The probe's paint number: summed across every sampled frame of the driven
// interaction. Zero is the only passing value — `media-loading`'s done-when.
export function totalEmptyVisibleMediaAcrossFrames(frames, viewport) {
  return frames.reduce((sum, states) => sum + countEmptyVisibleMedia(states, viewport), 0);
}

// --- Column-gap scan (round 17: a genuine DOM-node absence — not a paint
// state at all, a hole in the mosaic with no element covering it, caused by
// a windowed-mount state update that skipped a render during a fast pan).

// Merged x-intervals of every rect that crosses horizontal line y.
export function coveredIntervalsAtY(rects, y) {
  const spans = rects
    .filter((r) => r.width > 0 && r.height > 0 && r.top <= y && r.bottom >= y)
    .map((r) => [r.left, r.right])
    .sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [left, right] of spans) {
    const last = merged[merged.length - 1];
    if (last && left <= last[1]) last[1] = Math.max(last[1], right);
    else merged.push([left, right]);
  }
  return merged;
}

// A gap is an uncovered run STRICTLY BETWEEN two covered spans (never the
// outer margin before the first tile or after the last — that's real layout
// whitespace, not a missing tile) wider than `tolerancePx` (default 24 — well
// past any anti-aliasing seam, well under a real tile's width).
export function gapSegmentsAtY(rects, y, tolerancePx = 24) {
  const covered = coveredIntervalsAtY(rects, y);
  const gaps = [];
  for (let i = 0; i < covered.length - 1; i++) {
    const left = covered[i][1];
    const right = covered[i + 1][0];
    const width = right - left;
    if (width > tolerancePx) gaps.push({ y, left, right, width });
  }
  return gaps;
}

// Scans a set of horizontal lines (every `stepPx`) across the viewport height
// for one sampled frame's rects.
export function scanFrameForColumnGaps(rects, viewport, { stepPx = 40, tolerancePx = 24 } = {}) {
  const gaps = [];
  for (let y = stepPx / 2; y < viewport.height; y += stepPx) {
    gaps.push(...gapSegmentsAtY(rects, y, tolerancePx));
  }
  return gaps;
}

// Across every sampled frame of the driven interaction — the probe's second
// headline number alongside the paint count. Zero is the passing value.
export function totalColumnGapsAcrossFrames(framesOfRects, viewport, options) {
  return framesOfRects.reduce((sum, rects) => sum + scanFrameForColumnGaps(rects, viewport, options).length, 0);
}
