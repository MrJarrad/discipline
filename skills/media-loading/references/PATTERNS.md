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
