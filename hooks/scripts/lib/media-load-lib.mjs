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

// --- Structure signal (1.96.0 fix round 2: variance alongside background
// match) ----------------------------------------------------------------
//
// The background-match fraction alone misreads two real shapes:
// - A white-heavy product/UI shot on a near-white page: most of its pixels
//   are within `--color-tolerance` of the page background, so the fraction
//   of "differs from background" pixels can sit under `--min-painted-fraction`
//   even though the crop is real, structured content (an edge, a shadow, a
//   logo) — a false EMPTY read.
// - A dark-framed video letterboxed against a named placeholder colour has
//   the same shape: mostly matches an "empty" colour, real content in a
//   minority of pixels.
// Real media almost always has internal structure — edges, shading, detail
// — that a flat background/placeholder swatch never does, even where that
// structure covers only a small share of the crop's area (a small
// high-contrast region moves the variance a lot more than it moves the
// area-fraction). This is an OR alongside the fraction rule, never a
// replacement: a crop counts as painted once EITHER most of its pixels
// visibly differ from every named empty colour, OR the crop's luma has
// enough spread to mean it isn't a flat swatch. A genuinely flat region
// (uniform colour, whatever that colour is) has ~0 spread either way, so it
// still reads unpainted under the added check — this only ever turns an
// existing false EMPTY into PAINTED, never the reverse.
export const MIN_PAINTED_STDDEV = 10;

export function regionLumaStdDev(pixels) {
  if (pixels.length === 0) return 0;
  const lumas = pixels.map((p) => 0.299 * p.r + 0.587 * p.g + 0.114 * p.b);
  const mean = lumas.reduce((sum, l) => sum + l, 0) / lumas.length;
  const variance = lumas.reduce((sum, l) => sum + (l - mean) ** 2, 0) / lumas.length;
  return Math.sqrt(variance);
}

export function isRegionPainted(
  pixels,
  emptyColors,
  { tolerance = DEFAULT_COLOR_TOLERANCE, minPaintedFraction = MIN_PAINTED_FRACTION, minPaintedStddev = MIN_PAINTED_STDDEV } = {},
) {
  if (pixels.length === 0) return false;
  if (regionPaintedFraction(pixels, emptyColors, tolerance) >= minPaintedFraction) return true;
  return regionLumaStdDev(pixels) >= minPaintedStddev;
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

// 1.96.0 fix round 2: a tile that's almost entirely scrolled past the
// viewport edge during a fast drag, with only a hairline sliver of its own
// natural rect still on screen, is a different shape from the round-1
// "clipped tile" fixture (an `overflow:hidden` ANCESTOR removing the WHOLE
// element — `clippedVisibleRect` returns `null`, zero area, still a real
// defect, unchanged below). A thin natural-edge sliver is geometry, not a
// paint bug: real holding-canvas tiles carry their own edge fade (round 11,
// operator-approved: "the fade looks good"), so the one or two CSS px still
// on screen right at a tile's own top/bottom edge legitimately read as
// background — that's not "half the tile is blank", it's "a hair of the
// tile's own faded edge is visible". `minVisibleAreaFraction` (default
// `0.15` — verified live against every edge-sliver shape the holding canvas
// produces during a fast drag, comfortably past anti-aliasing-scale slivers,
// comfortably under "half painted") gates judgment on the on-screen share of
// the element's OWN natural rect; `0` (fully clipped/hidden) is never
// exempted by this — only a NONZERO-but-tiny visible share is.
export const MIN_VISIBLE_AREA_FRACTION = 0.15;

export function visibleAreaFraction(state, viewport) {
  const naturalArea = state.rect.width * state.rect.height;
  if (naturalArea <= 0) return 0;
  const clipped = isVisibilityHidden(state) ? null : clippedVisibleRect(state, viewport);
  if (!clipped) return 0;
  return (clipped.width * clipped.height) / naturalArea;
}

function isTrivialSliver(state, viewport, minVisibleAreaFraction) {
  const fraction = visibleAreaFraction(state, viewport);
  return fraction > 0 && fraction < minVisibleAreaFraction;
}

// One frame's empty-visible-media set: on screen, not a trivial edge sliver,
// and not painted. Each state carries its own pre-cropped `pixels` (set by
// media-load-probe.mjs from that frame's screenshot); this function does no
// image decoding.
export function emptyVisibleMedia(states, viewport, emptyColors, options = {}) {
  const minVisibleAreaFraction = options.minVisibleAreaFraction ?? MIN_VISIBLE_AREA_FRACTION;
  return states.filter(
    (s) =>
      isVisible(s.rect, viewport) &&
      !isTrivialSliver(s, viewport, minVisibleAreaFraction) &&
      !isSlotPainted(s, s.pixels, emptyColors, options),
  );
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
//
// 1.96.0 fix round 2: round 1's scan merged every rect's x-span at each
// horizontal scanline and flagged the uncovered run BETWEEN two merged
// spans — but the holding canvas is INDEPENDENT COLUMNS, each tiling its own
// media vertically (`.holding-canvas-column`, "each wrapped in Y against ITS
// OWN measured height"), with each column's own real row-gap
// (`--grid-gap-lg`) between its OWN adjacent tiles. Whenever one column's
// own row-gap is exposed at a scanline where its NEIGHBOURING columns still
// have taller tiles covering that same line (ordinary masonry — nothing
// wrong at all), the merge collapses the untouched neighbours' spans into
// ONE gap that spans the gapped column's own width plus both its real
// gutters either side — numerically much wider than any single gutter, and
// wrongly read as a hole (verified live: `preview.jarrad.design/holding`,
// 390 viewport, fast3g drag — every flagged "gap" was exactly this shape,
// one column's own row-gap merged across into its healthy neighbours).
//
// The fix drops cross-column merging entirely and looks WITHIN each column
// instead: group visible rects into columns by x-range overlap (the natural
// column a masonry stacks vertically), then for each column, the gaps
// between its OWN adjacent tiles (never before the first or after the last —
// real layout whitespace, not a hole, same exclusion as before). A column's
// own real row-gap recurs at close to the SAME height every time (the design
// token); a genuine missing/hidden tile swallows an entire tile's worth of
// extra height on top of that — so, same principle as the old width-ratio
// idea, just on the right axis: compare each candidate gap's HEIGHT against
// the frame's own recurring row-gap height (median, pooled across every
// column — they share the same token), not an absolute number.

// Groups a frame's visible rects into columns — any two rects whose x-ranges
// overlap are the same column (a masonry stacks each column's own tiles at
// a shared x-position, one above the next).
export function groupRectsIntoColumns(rects) {
  const columns = [];
  for (const r of rects) {
    if (r.width <= 0 || r.height <= 0) continue;
    const column = columns.find((col) => col.some((cr) => cr.left < r.right && r.left < cr.right));
    if (column) column.push(r);
    else columns.push([r]);
  }
  return columns;
}

// One column's own internal vertical gaps — between ADJACENT tiles only
// (sorted top-to-bottom), never before the first or after the last.
export function columnInternalGaps(column) {
  const sorted = [...column].sort((a, b) => a.top - b.top);
  const gaps = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const top = sorted[i].bottom;
    const bottom = sorted[i + 1].top;
    const height = bottom - top;
    if (height > 0) {
      gaps.push({
        top,
        bottom,
        height,
        left: Math.max(sorted[i].left, sorted[i + 1].left),
        right: Math.min(sorted[i].right, sorted[i + 1].right),
      });
    }
  }
  return gaps;
}

// The median of a list of numbers (linear interpolation is unnecessary here
// — an approximate middle is all `scanFrameForColumnGaps` needs). `0` for an
// empty list (nothing to compare against).
export function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

// `tolerancePx` (default 24) screens trivial candidate gaps (anti-aliasing
// seams) before the rhythm is measured. `widthRatio` (default 2 — a genuine
// hole already has to swallow roughly a whole extra tile's height on top of
// the row-gap itself, comfortably past normal token-to-token variance) sets
// how much taller than that rhythm a column's own gap must be before it
// counts as a real hole, never a real row-gap.
export function scanFrameForColumnGaps(rects, viewport, { tolerancePx = 24, widthRatio = 2 } = {}) {
  const gapsByColumn = groupRectsIntoColumns(rects).map((column) => columnInternalGaps(column));
  const candidateHeights = gapsByColumn.flatMap((gaps) => gaps.map((g) => g.height)).filter((h) => h > tolerancePx);
  if (candidateHeights.length === 0) return [];
  const rhythm = median(candidateHeights);
  const threshold = rhythm * widthRatio;
  return gapsByColumn.flatMap((gaps) => gaps.filter((g) => g.height > tolerancePx && g.height > threshold));
}

// Across every sampled frame of the driven interaction — the probe's second
// headline number alongside the paint count. Zero is the passing value.
export function totalColumnGapsAcrossFrames(framesOfRects, viewport, options) {
  return framesOfRects.reduce((sum, rects) => sum + scanFrameForColumnGaps(rects, viewport, options).length, 0);
}
