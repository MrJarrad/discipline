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

## How the probe decides "painted", "empty" and "gap" (current behaviour)
The rules `media-load-probe.mjs` holds today. Each one exists because a cheaper
signal read a false pass or a false fail against a real page; the lib tests and
the live fixture pin them.

- **Paint is read from the composited page, never the element's own bitmap.** A
  per-frame `page.screenshot()` is decoded with the built-in-`zlib` PNG decoder
  (`lib/png-lib.mjs`, no `sharp`/`pngjs` dependency), cropped per slot to its rect
  intersected with the viewport and every clipping ancestor (`clippedVisibleRect`),
  and classified against the page background plus any `--placeholder-colors`
  (`isRegionPainted`). A canvas `drawImage` of the element reads "painted" on a
  clipped, covered, `visibility:hidden` or opacity-0 slot, so a law test forbids
  it. `visibility:hidden` and a fully clipped rect are decided by geometry before
  any pixel is sampled.
- **Gaps are judged within one column, never across columns.** Independent columns
  (`groupRectsIntoColumns`, x-overlap) are scanned for adjacent-tile gaps
  (`columnInternalGaps`); a gap counts only when it is `--gap-width-ratio` (default 2x,
  `widthRatio`) taller than the frame-pooled median rhythm, because a column's own
  row-gap is by construction its most common gap. Merging spans across columns
  reads ordinary masonry as one huge gap.
- **Real structure rescues a false EMPTY; a flat swatch never does.** A tile whose
  non-background pixels are a small high-contrast minority passes via
  `regionLumaStdDev`, but only if `regionMaxLumaJump` also crosses
  `--min-structure-edge` (default 20): a smooth gradient or shimmer skeleton has
  luma spread but no edge, and must still read empty.
- **A blank slot counts only after it stays blank.** `classifyEmptyAcrossFrames`
  tracks each element (`src`/`currentSrc` identity) across frames and counts it
  once blank for `--arrival-window-ms` (default 300), so a tile caught mid its
  approved ~250ms decode-gated fade is never a defect. The window is forced to 0
  for `--interaction load`.
- **The edge-sliver exemption applies only to a tile that moved.** A nonzero but
  under-15%-visible element (`visibleAreaFraction`) is exempt only when its rect
  moved since the previous frame it was seen in; a static tile at the fold is
  judged on its crop. A fully clipped or hidden element (area exactly 0) is
  always a defect.
- **Interactions run at real speed.** `scroll`/`drag` run the fling session by
  default (`DEFAULT_FLING_DURATION_MS`, extend with `--duration`). The paced crawl
  (`--paced`, `STEP_PACE_MS`) is opt-in and prints a "not proof of fast-motion
  behaviour" note, because it hands the decode pipeline time a real fling never
  grants (paced read 0 where a real fling on the same page read 16-36).
- **Probe timing and CLI.** `page.goto(..., { waitUntil: "load" })` plus a bounded
  `networkidle` wait precede the interaction (`domcontentloaded` samples in-flight
  requests). `--help`/`-h` prints usage and exits 0 before touching Playwright.
- **Fixture.** `hooks/scripts/lib/fixtures/media-load-probe-fixture.html` +
  `serve-fixture.mjs` prove both directions on a real page: three healthy columns
  plus one missing tile (gaps=1, never 0) and eight isolated paint cases (opacity-0,
  covered by a registered placeholder colour, clipped, `visibility:hidden`, a
  uniform placeholder equal to the page background, a white-heavy true negative that
  must read painted, a gradient skeleton, a shimmer sweep): paint=7, gaps=1 on
  chromium and WebKit.

The per-round story (which review found which defect, the live numbers, the operator
wording) lives in the git history of this file at 8da7e38 and in the 1.111.0 entry
of `CHANGED.txt`; it is not loadable context.
