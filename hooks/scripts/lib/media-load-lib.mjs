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

// Round 3: the stddev rescue above (path b) also passed a smooth CSS
// gradient/shimmer LOADING SKELETON — real content hasn't arrived yet, but a
// slow linear ramp across a crop has enough overall spread (stddev ~11,
// crossing the `10` floor) to misread as "real structure". A gradient/
// shimmer changes luma smoothly, one tiny step per pixel; real content (a
// product shot's own edge, a video frame's letterbox line) has at least one
// SHARP jump between spatially-adjacent pixels — `cropRegionPixels` returns
// pixels in row-major screenshot order, so "adjacent in the array" is
// "adjacent on screen" (barring one wrap-around seam per row, negligible at
// any crop wider than a few px). `regionMaxLumaJump` is the largest such
// single-step jump; the stddev rescue below only fires once BOTH the spread
// AND a real edge are present — a flat swatch still fails both, a smooth
// gradient/shimmer still fails the edge check even once it clears the spread
// floor, and a genuine edge/shadow/highlight clears both.
export const MIN_STRUCTURE_EDGE_JUMP = 20;

export function regionMaxLumaJump(pixels) {
  if (pixels.length < 2) return 0;
  const lumas = pixels.map((p) => 0.299 * p.r + 0.587 * p.g + 0.114 * p.b);
  let max = 0;
  for (let i = 1; i < lumas.length; i++) {
    const jump = Math.abs(lumas[i] - lumas[i - 1]);
    if (jump > max) max = jump;
  }
  return max;
}

export function isRegionPainted(
  pixels,
  emptyColors,
  {
    tolerance = DEFAULT_COLOR_TOLERANCE,
    minPaintedFraction = MIN_PAINTED_FRACTION,
    minPaintedStddev = MIN_PAINTED_STDDEV,
    minStructureEdgeJump = MIN_STRUCTURE_EDGE_JUMP,
  } = {},
) {
  if (pixels.length === 0) return false;
  if (regionPaintedFraction(pixels, emptyColors, tolerance) >= minPaintedFraction) return true;
  return regionLumaStdDev(pixels) >= minPaintedStddev && regionMaxLumaJump(pixels) >= minStructureEdgeJump;
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

export function isTrivialSliver(state, viewport, minVisibleAreaFraction) {
  const fraction = visibleAreaFraction(state, viewport);
  return fraction > 0 && fraction < minVisibleAreaFraction;
}

// --- Cross-frame classification (1.96.0 fix round 3) ------------------------
//
// Round 2's aggregate judged one frame in isolation, no memory of the frame
// before it. That produced two false-pass shapes review round 2 caught live
// on `preview.jarrad.design/holding`:
// - The sliver exemption fired unconditionally on ANY nonzero-but-small
//   on-screen share, including a tile sitting at the fold at first paint
//   that never moves at all — geometry alone can't tell "transiting the
//   viewport edge mid-drag" (the round-11 operator-approved edge fade this
//   exemption exists for) from "just genuinely small on screen and blank".
//   Fixed below: the exemption only fires when the element's rect has
//   actually MOVED since the last frame it was seen in — real motion, not a
//   static layout position.
// - Fast-fling mode (the real test, per `--duration`) read paint misses a
//   short paced crawl didn't, because a tile mid its own operator-approved
//   decode-gated fade (~250ms, round 11) samples blank on the ONE frame that
//   happens to land inside the fade, then paints on the next — a real
//   arrival, not a defect. Fixed below: a blank slot only counts once it has
//   stayed blank for `arrivalWindowMs` of running wall-clock time (tracked
//   as consecutive blank frames for the same identity × the caller's own
//   `frameIntervalMs`) — past one fade cycle, not during it.
//
// `arrivalWindowMs` defaults to the page's own approved fade duration
// (round 11, ~250ms) PLUS one full sampling margin, so a slot stuck blank
// past one full fade cycle is a real miss, never a sample that landed
// mid-arrival. It must be STRICTLY GREATER than the fling session's own
// sampling cadence (`FLING_SAMPLE_EVERY_MS`, `media-load-probe.mjs`, also
// `250`) — a live proof run against this fix's own first cut found the
// window EQUAL to the cadence: `blankMs (0 + 250) >= arrivalWindowMs (250)`
// was already true on a slot's very FIRST sampled blank frame, flagging it
// immediately and defeating the whole debounce (paint read as high as 185 on
// `preview.jarrad.design/holding`, almost all of it mid-fade tiles, not
// defects). `300` needs two consecutive blank samples (500ms) before it
// counts, comfortably past one ~250ms fade. `load`'s single fixed-frame
// check passes `arrivalWindowMs: 0` (there is no session to fade across —
// the bar is real from first paint) so every load-time defect is still
// caught on its very first blank frame, exactly as before this round.
export const DEFAULT_ARRIVAL_WINDOW_MS = 300;

// Best-effort identity for tracking one element across frames when the
// caller doesn't supply its own `state.id` — `src`/`currentSrc` (attached by
// the probe's in-page sampler) plus the element's position in that frame's
// own element list as a tie-break. Not a perfect identity under a windowed-
// mount reorder (round 17's own failure mode is a DIFFERENT bug, the gap
// scan's problem, not this one) — a mismatch here only resets a blank streak
// early (a false negative, never a false positive), and every real photo/
// video on a real page carries its own distinct URL.
export function mediaIdentity(state, index) {
  return `${state.tag ?? "media"}:${state.src ?? ""}:${index}`;
}

function rectMoved(a, b, epsilonPx = 1) {
  if (!a || !b) return false;
  return Math.abs(a.left - b.left) > epsilonPx || Math.abs(a.top - b.top) > epsilonPx;
}

// The one classifier: walks every sampled frame in order, tracking each
// element's on-screen rect and running blank duration by identity. Returns
// `{ total, flagged }` — `total` is the probe's paint number (zero is the
// only passing value); `flagged` is one entry per frame a slot crossed the
// arrival window (`{ frameIndex, id, rect, pixels }`), for evidence capture
// (screenshot the flagged rect, classify by eye) without re-deriving the
// same walk.
export function classifyEmptyAcrossFrames(framesOfStates, viewport, emptyColors, options = {}) {
  const minVisibleAreaFraction = options.minVisibleAreaFraction ?? MIN_VISIBLE_AREA_FRACTION;
  const arrivalWindowMs = options.arrivalWindowMs ?? DEFAULT_ARRIVAL_WINDOW_MS;
  const frameIntervalMs = options.frameIntervalMs ?? 0;

  const tracked = new Map(); // identity -> { rect, blankMs }
  const flagged = [];
  // Diagnosis-only (row 151 a/b lane): the max blank streak ever reached per
  // identity across the whole session, whether or not it crossed
  // `arrivalWindowMs` — the probe's own pass/fail stays the `flagged` count
  // above; this is additive, read by callers that want "which tile, how
  // long" rather than only "zero or not".
  const maxBlankMsById = new Map();

  framesOfStates.forEach((states, frameIndex) => {
    const seen = new Set();
    states.forEach((state, i) => {
      const id = state.id ?? mediaIdentity(state, i);
      seen.add(id);
      const prev = tracked.get(id);
      const onScreen = isVisible(state.rect, viewport);
      const sliver = isTrivialSliver(state, viewport, minVisibleAreaFraction);
      // Only exempt a sliver that's actually IN MOTION (moved since the last
      // frame it was seen in) — a static tile at rest, on load or otherwise,
      // is never exempted, whatever share of its own rect is on screen.
      const sliverExempt = sliver && rectMoved(prev?.rect, state.rect);
      const painted = isSlotPainted(state, state.pixels, emptyColors, options);
      const blankNow = onScreen && !sliverExempt && !painted;

      if (blankNow) {
        const blankMs = (prev?.blankMs ?? 0) + frameIntervalMs;
        tracked.set(id, { rect: state.rect, blankMs });
        if (blankMs > (maxBlankMsById.get(id) ?? 0)) maxBlankMsById.set(id, blankMs);
        if (blankMs >= arrivalWindowMs) {
          flagged.push({ frameIndex, id, rect: state.rect, pixels: state.pixels });
        }
      } else {
        tracked.set(id, { rect: state.rect, blankMs: 0 });
      }
    });
    // An identity absent from this frame (windowed-mount removal) loses its
    // streak — reappearing later starts the arrival window fresh, never
    // carries over a stale blank duration from before it left the DOM.
    for (const id of [...tracked.keys()]) {
      if (!seen.has(id)) tracked.delete(id);
    }
  });

  return { total: flagged.length, flagged, maxBlankMsById };
}

// The probe's paint number: `classifyEmptyAcrossFrames(...).total`. Zero is
// the only passing value — `media-loading`'s done-when.
export function totalEmptyMediaAcrossFrames(framesOfStates, viewport, emptyColors, options) {
  return classifyEmptyAcrossFrames(framesOfStates, viewport, emptyColors, options).total;
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
