# Media-loading patterns — source citations

Each method item in `SKILL.md` was found and fixed against a live production
build, not designed on paper. Evidence lives in
`vault/main/projects/portfolio/evidence/2026-09-25-holding-page/` (rounds
5-18), `.../2026-09-25-grid-media-scroll/`, and `.../2026-09-25-media-audit/`.
This file is the "which round, why" — the rule itself stays in `SKILL.md`.

## Method 3 — entrance can't be cancelled mid-wait
Round 17 (`round17-drag-gaps/progress.md`): a per-tile fade effect re-ran on
every `visibility` prop change; its cleanup set `cancelled=true`, silently
dropping the in-flight `waitForMediaReady` resolution, while a
`dataset.holdingFade` guard blocked any retry. The tile stuck at
`opacity: 0` permanently — not live-reproduced under test, but a real,
provable race removed on inspection: the dataset guard alone already
prevented a duplicate call, so the cancellation flag was pure downside.

## Method 5 / 7 / 8 — video poster + concurrency + fetchPriority
Round 14 (`round14-video/progress.md`, "Video method" section): WebKit drops
`<video poster>` the instant `src` triggers load, before any frame decodes —
paints black. Fixed by generalising the one existing priority-tile
poster-overlay pattern to every autoplay video. `capVideoBand` bounds mobile
concurrent video `src` to a small nearest-first budget (desktop uncapped);
`stillsSettledRef` gates video start behind `window.load` + 500ms.
Playwright's bundled WebKit has no real iOS decoder cap — the black-frame bug
itself could not be forced to reproduce locally; the budget and
poster-never-drops mechanism were verified directly instead.

## Method 9 — warm-and-hold the unique pool
Round 13 (`round13/progress.md`): a repeating 3×3-wrapped canvas holds a
40-tile unique pool; after first paint, warm every unique tile, nearest-first,
one at a time, pinned in a Map that's never GC'd. First attempt (idle batches
of 3, `fetchPriority=low`) made things WORSE on WebKit — WebKit ignores
`fetchPriority` on a script-created `Image`, so an unthrottled batch competed
with the reader's own in-flight drag. Fixed by reusing the existing
priority-queue's `walkQueue` (one task at a time, yields every task) with a
`shouldPause` gate wired to the live drag/velocity state — the warm halts
outright while the reader is panning.

## Method 10 — windowed mount + flushSync
Round 12 (`round12/progress.md`) built the windowed mount (only near/visible
tiles exist in the DOM, stable un-wrapped keys, imperative per-tile position
writes). Round 17 (`round17-drag-gaps/progress.md`) found the real gap: a
bare `setMountedCells(...)` inside the rAF pan loop is a React state update
that only guarantees the *latest* state eventually renders, not every
intermediate one — during a sustained fast pan a newly-needed tile's `<li>`
could go missing for several frames or the rest of a fling. Fixed by wrapping
that `setState` in `flushSync` inside the same rAF callback. Validated: 4
consecutive clean 90-130s aggressive-drag sessions (0 violations) vs 5-8
violations per 60-90s session before the fix, real Chrome, desktop and
mobile touch emulation. Operator sign-off: *"gaps are gone and fade looks
good."*

## Method 11 — sizes must match the real slot
Round 10 (`round10-mobile-smooth/progress.md`): a `sizes="...34vw"` estimate
from an earlier layout round went stale once the tile-width formula changed
to an exact `calc(100vw/N - gap)` — measured, a mobile column rendered 105.7
CSS px (needs 317 physical px at DPR3) but `34vw` resolved to 132.6 CSS px
(397.8 physical), crossing into the next size bucket and requesting ~2.8x the
bytes for every near/visible mobile tile. Fixed by replaying the exact
tile-width formula literally in `sizes`, per breakpoint. Confirmed via direct
network-payload measurement (23% fewer bytes, same window). The same
oversized-request class also showed up in the initial media audit's
`imageSizes` inventory as the thing that was *already* correct on other
pages — this is the counter-example that shows what "correct" looks like
when the formula is kept in sync.

## Cross-cutting — probe method (round 10, round 11, round 13)
Round 10 built `tools/flash-probe.mjs` because round 8's own fps/empty-tile
harness disagreed with the operator's real phone — it measured continuous
counters, not discrete pop-in events on an already-on-screen tile. Round 13
built a genuine pixel-paint probe (screenshot + region pixel stats, not
`.complete`) after a first warm-cache design made the plugin's own DOM-state
probe read *worse* while the true user-facing paint was fine — the two
signals disagreed, and the pixel-paint one was the one that matched the
operator's eye. This is why `media-load-probe.mjs`'s primary signal is
painted pixels, never DOM state (`.complete`/`readyState`).

## Discipline PR #52 fix round 1 — the paint signal must be the composited page, not the element's own bitmap
1.96.0's first cut of `media-load-probe.mjs` measured "painted pixels" by
drawing the `<img>`/`<video>` element itself into an offscreen canvas
(`drawImage` + `getImageData`) and reading that back. A live-fixture review
found this samples the element's own SOURCE bitmap, not what's actually
composited on screen — it reads "painted" on a slot that's clipped by an
`overflow:hidden` ancestor, covered by an opaque sibling, `visibility:hidden`,
or at `opacity:0` behind a parent, contradicting the very precedent this
skill already cited (round 13, above: "screenshot + region pixel-stats").
Fixed by moving the signal to a per-frame `page.screenshot()`, decoded with a
small built-in-`zlib`-only PNG decoder (`lib/png-lib.mjs` — no `sharp`/
`pngjs` dependency added to every consuming repo), cropped per slot to its
rect intersected with the viewport and every clipping ancestor
(`clippedVisibleRect`, `lib/media-load-lib.mjs`), and classified against the
page's own background colour plus any named `--placeholder-colors`
(`lib/media-load-lib.mjs`'s `isRegionPainted`). `visibility:hidden` and a
fully-clipped-away rect are decided by geometry alone, before any pixel is
sampled. Six pixel fixtures cover the shape directly (`media-load-lib.test.
mjs`): a painted tile, a blank background, an opacity-0 tile, a covered tile,
a clipped tile, and a `visibility:hidden` tile — the last four are exactly
the false-pass cases the canvas-based signal could not detect, and all four
now read empty. A law test (`media-load-probe.test.mjs`) asserts the file
never uses a canvas read of the element's own bitmap for the paint signal.

## Discipline PR #52 fix round 2 — the probe over-fired on the operator-approved page
Round 1's own classifier, run for real against `preview.jarrad.design/holding`
(390x844 dpr3, fast3g, drag), read `paint=37 gaps=233` on a page the operator
had just confirmed clean on their iPhone and in Chrome ("gaps are gone and
fade looks good") — both causes verified live, not assumed, against the real
page and its real CSS (`globals.css`'s `.holding-canvas-row { column-gap: var
(--grid-gap-lg) }`, 64-96px measured):

- **Gap scan.** Round 1's scan (`scanFrameForColumnGaps`, now removed) merged
  every rect's x-span at each horizontal scanline and flagged the uncovered
  run BETWEEN merged spans, past a fixed 24px tolerance. But the holding
  canvas is INDEPENDENT COLUMNS (`.holding-canvas-column`, each tiling its own
  media vertically against its own measured height) — whenever one column's
  own real row-gap (`--grid-gap-lg`) was exposed at a scanline where its
  neighbours still had taller tiles covering that same line (ordinary
  masonry, nothing wrong), the merge collapsed the untouched neighbours into
  ONE gap spanning the gapped column's own width plus both real gutters —
  live-measured at 234px against a 24px tolerance, on almost every drag
  frame. Fixed by dropping cross-column merging entirely:
  `groupRectsIntoColumns` (x-overlap) + `columnInternalGaps` (adjacent-tile
  gaps within one column only) + a frame-pooled median rhythm compared via
  `widthRatio` (default 2x, `lib/media-load-lib.mjs`) — a column's own real
  row-gap is, by construction, the single most common gap height across the
  scan; a genuine missing/hidden tile is markedly taller. Verified live: 0
  gaps, chromium and WebKit, 3 reps each, both `load` and `drag`.
- **Paint classification.** The background-match-fraction rule alone
  misreads two real shapes: a white-heavy tile whose non-background pixels
  are a small, high-contrast minority (fraction stays under the 5% floor even
  though the page shows real content), and thin edge-slivers of tiles almost
  entirely scrolled past the viewport during a fast drag, showing only a hair
  of the holding canvas's own operator-approved entrance/edge fade (round 11,
  operator: "the fade looks good") — never a real half-painted tile. Fixed
  with two additions in `lib/media-load-lib.mjs`: `regionLumaStdDev` (an OR
  alongside the fraction rule — real structure rescues a false EMPTY, a flat
  swatch never does, so this only ever adds true positives) and
  `visibleAreaFraction` (a NONZERO-but-under-15%-of-the-element's-own-natural-
  area exemption — never applies to a fully clipped/hidden element, area
  exactly 0, which stays a hard defect unchanged from round 1).
- **Probe timing.** `domcontentloaded` fires before a throttled connection
  has even started fetching priority images — sampling "first paint" that
  early caught real in-flight network requests, not a defect. Fixed:
  `page.goto(..., { waitUntil: "load" })` + a bounded `networkidle` wait
  before the interaction begins. Separately, `driveInteraction`'s drag/scroll
  loops sampled with ZERO delay between steps — faster than any real gesture,
  which Chromium's decode pipeline tolerated but Playwright's bundled WebKit
  did not (round 14's own "bundled WebKit is not real iOS" caveat, extended
  past video to image decode under a zero-delay synthetic loop). Fixed with
  `STEP_PACE_MS` (500ms) between steps.
- **`--help`.** Was parsed as the URL positional argument and crashed
  attempting to navigate to it. Fixed: `--help`/`-h` anywhere in argv prints
  usage and exits 0 before touching Playwright.

A live static fixture (`hooks/scripts/lib/fixtures/media-load-probe-fixture.
html` + `serve-fixture.mjs`) proves both directions at once on a real page:
three healthy columns plus one genuine missing tile (gaps=1, never 0 — the
scan must still catch a real hole), and (as of fix round 3) eight isolated
paint cases (opacity-0, covered-by-a-registered-placeholder-colour, clipped,
`visibility:hidden`, a uniform-colour placeholder equal to the page
background, a white-heavy true negative that must read painted, a smooth
gradient loading skeleton, and a shimmer sweep) — verified paint=7, gaps=1
exactly, on both chromium and WebKit.

## Discipline PR #52 fix round 3 — fast-fling paint misses, a sliver exemption that fired at rest, and a rescue that passed a skeleton
Review round 2 re-ran fix round 2's own probe for real against
`preview.jarrad.design/holding` and found three more reds, all reproduced
live before any code changed:

- **Fast-fling mode disagreed sharply with the paced crawl.** `--duration`
  (the docs' own "real test" mode) read `paint=16-36`; the short, evenly-
  paced `STEP_PACE_MS` crawl read `0`, on the same page and session shape.
  Diagnosis (screenshot crops of every flagged slot, classified by eye):
  every flagged slot was a tile mid its own operator-approved ~250ms
  decode-gated fade — real content arriving, sampled on the one frame that
  happened to land inside the fade — never a slot genuinely stuck blank
  longer than a fade cycle. The paced crawl's own artificial per-step pause
  gives the page's decode pipeline time to keep up that a real fast fling
  never grants, masking the same real defect class round 14 already named
  for video decode. Fixed two ways: (1) `classifyEmptyAcrossFrames`
  (`lib/media-load-lib.mjs`) only counts a blank slot once it's stayed blank
  for `--arrival-window-ms` (default 250ms) of running time, tracked per
  element (`src`/`currentSrc` identity) across frames — never on a single
  mid-fade sample; (2) `scroll`/`drag` now run the realistic fling session
  by DEFAULT (`DEFAULT_FLING_DURATION_MS`, 8s, extend with `--duration`) —
  the old paced crawl is opt-in only (`--paced`), printing its own "not proof
  of fast-motion behaviour" note whenever used, so it can never again pass as
  the default evidence for a lane.
- **The sliver exemption fired at rest, not just in motion.** Round 2's
  exemption (`visibleAreaFraction` + a nonzero-but-under-15% check) applied
  unconditionally, so a tile sitting at the fold at first paint — never
  moving, never mid-transit — read exempt if it happened to be small enough
  on screen, hiding a genuinely blank tile. Fixed: the exemption only fires
  when the element's rect has actually MOVED since the previous frame it was
  seen in (`classifyEmptyAcrossFrames`'s own motion check) — a static tile,
  whatever share of its own rect is on screen, is judged on its crop like any
  other slot.
- **The luma-stddev rescue passed a gradient/shimmer loading skeleton.** A
  smooth CSS gradient/shimmer placeholder has real overall luma spread
  (stddev ~11, crossing the round-2 `10` floor) without being real content —
  the rescue's own "never the reverse" comment broke. Fixed:
  `regionMaxLumaJump` (largest single-step luma jump between spatially-
  adjacent pixels, `cropRegionPixels`'s own row-major crop order) must ALSO
  cross `--min-structure-edge` (default 20) before the stddev path rescues a
  crop — a smooth ramp has real spread but no real edge; a genuine
  edge/shadow/highlight has both. Two new fixture tiles (a gradient skeleton,
  a shimmer sweep — both VERTICAL gradients, avoiding a false row-wrap seam a
  horizontal one-way ramp introduces in row-major crop order) prove both
  still read empty; the pre-existing white-heavy true negative still reads
  painted (its real edge is large — luma jump ~208 in the live fixture,
  comfortably past the 20 floor).

Verified live against the fixture (paint=7, gaps=1, both engines) and against
`preview.jarrad.design/holding` per the fix's own evidence return.
