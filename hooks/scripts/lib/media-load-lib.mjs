// Pure media-paint arithmetic, isolated from Playwright so it's unit-testable
// without a browser — the same split `capture-website/scripts/lib/*` uses.
// A media-loading DONE means: every media element visible on screen shows at
// least its still/poster from first paint, throughout scroll/drag/hover/route
// change — never a blank or half-painted tile, and never a hole where a tile
// should be. This file decides, from a plain sampled DOM snapshot plus a
// screenshot-cropped pixel region, whether one element counts as "empty and
// visible", and separately whether a visible region has no covering element
// at all.

// --- Paint state (primary signal: what's actually composited on screen) ----
//
// 1.96.0 round 1: the previous primary signal drew the `<img>`/`<video>`
// element's OWN bitmap into an offscreen canvas (`drawImage` + `getImageData`)
// — that samples the SOURCE, not the composited page, so it reads "painted"
// on a slot that's clipped by an `overflow:hidden` ancestor, covered by an
// opaque sibling, `visibility:hidden`, or at `opacity:0` behind a parent.
// The fix round moved the signal to a full-page screenshot (`page.screenshot`
// in media-load-probe.mjs, decoded by `png-lib.mjs`), cropped to each slot's
// on-screen rect intersected with the viewport and every clipping ancestor,
// and classified against the page background (and any named not-yet-painted
// placeholder colours) — this file owns that classification, and never calls
// `drawImage` (see media-load-probe.test.mjs's law-test assertion).

// A colour string from `getComputedStyle` — `rgb(r, g, b)`, `rgba(r, g, b, a)`,
// `#rgb`, or `#rrggbb` — parsed to `{r,g,b}`. Alpha is ignored: an opaque
// composited screenshot never carries a background alpha channel.
export function parseCssColor(value) {
  const rgbMatch = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/.exec(value);
  if (rgbMatch) {
    return { r: Number(rgbMatch[1]), g: Number(rgbMatch[2]), b: Number(rgbMatch[3]) };
  }
  const shortHex = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(value);
  if (shortHex) {
    return { r: parseInt(shortHex[1] + shortHex[1], 16), g: parseInt(shortHex[2] + shortHex[2], 16), b: parseInt(shortHex[3] + shortHex[3], 16) };
  }
  const longHex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value);
  if (longHex) {
    return { r: parseInt(longHex[1], 16), g: parseInt(longHex[2], 16), b: parseInt(longHex[3], 16) };
  }
  throw new Error(`Unrecognised CSS colour: ${value}`);
}

// Two colours are "the same" for classification purposes when every channel
// is within `tolerance` — past PNG anti-aliasing/sub-pixel blending at a
// tile's own edge, well under a real photo/video frame's variance.
export const DEFAULT_COLOR_TOLERANCE = 8;

export function colorsMatch(a, b, tolerance = DEFAULT_COLOR_TOLERANCE) {
  return Math.abs(a.r - b.r) <= tolerance && Math.abs(a.g - b.g) <= tolerance && Math.abs(a.b - b.b) <= tolerance;
}

export function matchesAnyColor(pixel, colors, tolerance = DEFAULT_COLOR_TOLERANCE) {
  return colors.some((c) => colorsMatch(pixel, c, tolerance));
}

// A region counts as painted once more than this fraction of its sampled
// pixels differ from every named empty colour (page background + any
// placeholder swatches) — past a thin anti-aliased border, well under a real
// tile's own coverage of its slot.
export const MIN_PAINTED_FRACTION = 0.05;

export function regionPaintedFraction(pixels, emptyColors, tolerance = DEFAULT_COLOR_TOLERANCE) {
  if (pixels.length === 0) return 0;
  const nonEmpty = pixels.filter((p) => !matchesAnyColor(p, emptyColors, tolerance));
  return nonEmpty.length / pixels.length;
}

export function isRegionPainted(pixels, emptyColors, { tolerance = DEFAULT_COLOR_TOLERANCE, minPaintedFraction = MIN_PAINTED_FRACTION } = {}) {
  return regionPaintedFraction(pixels, emptyColors, tolerance) >= minPaintedFraction;
}

// --- Rect clipping (viewport + every overflow-clipping ancestor) -----------

export function intersectRects(a, b) {
  const left = Math.max(a.left, b.left);
  const top = Math.max(a.top, b.top);
  const right = Math.min(a.right, b.right);
  const bottom = Math.min(a.bottom, b.bottom);
  if (right <= left || bottom <= top) return null;
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

export function scaleRect(rect, scale) {
  return {
    left: rect.left * scale,
    top: rect.top * scale,
    right: rect.right * scale,
    bottom: rect.bottom * scale,
    width: rect.width * scale,
    height: rect.height * scale,
  };
}

// The element's rect intersected with the viewport and every ancestor clip
// rect supplied by the in-page sampler (an `overflow:hidden`/`clip`/`auto`/
// `scroll` ancestor's own bounding rect). `null` means nothing of the
// element is left on screen after clipping — the "clipped tile" false-pass
// case: geometrically inside the viewport, but invisible.
export function clippedVisibleRect(state, viewport) {
  let visible = intersectRects(state.rect, { left: 0, top: 0, right: viewport.width, bottom: viewport.height, width: viewport.width, height: viewport.height });
  for (const clip of state.clipRects ?? []) {
    if (!visible) return null;
    visible = intersectRects(visible, clip);
  }
  return visible;
}

export function isVisibilityHidden(state) {
  return state.visibility === "hidden";
}

// The pixel-based verdict for one sampled element: `pixels` is the
// screenshot crop of its clipped-visible rect (already computed by the
// caller — `[]`/`null` when clipping or `visibility:hidden` left nothing to
// sample). `visibility:hidden` and an empty crop both fail regardless of any
// pixel content, closing the two false-pass cases geometry alone can decide.
export function isSlotPainted(state, pixels, emptyColors, options) {
  if (isVisibilityHidden(state)) return false;
  if (!pixels || pixels.length === 0) return false;
  return isRegionPainted(pixels, emptyColors, options);
}

// On screen means the element's own (unclipped) rect overlaps the viewport
// at all — zero-size rects (display:none, not yet laid out) never count as
// visible. This is the "should this slot be counted at all" gate; whether it
// actually painted is `isSlotPainted`, above.
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

// One frame's empty-visible-media set: on screen, and not painted. Each
// state carries its own pre-cropped `pixels` (set by media-load-probe.mjs
// from that frame's screenshot); this function does no image decoding.
export function emptyVisibleMedia(states, viewport, emptyColors, options) {
  return states.filter((s) => isVisible(s.rect, viewport) && !isSlotPainted(s, s.pixels, emptyColors, options));
}

export function countEmptyVisibleMedia(states, viewport, emptyColors, options) {
  return emptyVisibleMedia(states, viewport, emptyColors, options).length;
}

// The probe's paint number: summed across every sampled frame of the driven
// interaction. Zero is the only passing value — `media-loading`'s done-when.
export function totalEmptyVisibleMediaAcrossFrames(frames, viewport, emptyColors, options) {
  return frames.reduce((sum, states) => sum + countEmptyVisibleMedia(states, viewport, emptyColors, options), 0);
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
