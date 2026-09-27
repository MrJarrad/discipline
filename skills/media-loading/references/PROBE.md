# media-load-probe.mjs — flag reference

`hooks/scripts/media-load-probe.mjs` (+ `hooks/scripts/lib/media-load-lib.mjs`)
is `media-loading`'s done-when script. This file is the flag reference and
worked examples; the rule and the bar are in `SKILL.md`.

## What it measures (1.96.0, fix round 3)

Two independent counts, both must be **0**:

- **paint** — a visible media slot whose crop of that frame's **screenshot**
  classifies as empty, once it's stayed that way long enough to rule out a
  sample landing mid-fade. The signal is what's actually **composited on
  screen**, not the element's own source bitmap — the probe's first cut drew
  the element into an offscreen canvas and read its pixels back (`drawImage`
  + `getImageData`); that samples the SOURCE, so it still read "painted" on a
  slot that's clipped by an `overflow:hidden` ancestor, covered by an opaque
  sibling, `visibility:hidden`, or at `opacity:0` behind a parent (round 1's
  finding, against the holding-page round 13 precedent: "screenshot + pixel
  region-stats"). The method, per sampled frame:
  1. Take a full-page screenshot (`page.screenshot()`), decoded by
     `lib/png-lib.mjs` (Node's built-in `zlib` only — no image-processing
     dependency added to consuming repos).
  2. For each on-screen `<img>`/`<video>`, intersect its own rect with the
     viewport and every ancestor whose computed `overflow-x`/`overflow-y` is
     `hidden`/`clip`/`auto`/`scroll` (`clippedVisibleRect`, `lib/media-load-
     lib.mjs`) — `null` (nothing left visible) or a `visibility:hidden`
     element counts as empty immediately, no pixels sampled.
  3. **Skip a trivial edge sliver, but only when it's actually in motion**
     (fix round 2, bounded in round 3): if the on-screen (clipped) area is a
     NONZERO but small share (under `--min-visible-area`, default `0.15`,
     i.e. 15%) of the element's own natural rect, AND the element's rect has
     actually MOVED since the previous frame it was seen in, it's excluded
     from judgment — a tile transiting the viewport edge during a fast drag
     shows only a hair of its own operator-approved edge fade, not a real
     half-painted tile. A **static** sliver — the first frame of any session,
     `load`, or an unchanged rect — is never exempted: review round 2's own
     finding was a genuinely blank tile sitting at the fold at load being
     silently hidden by this exemption. An element with **zero** visible area
     (fully clipped by an ancestor, or `visibility:hidden`) is never exempted
     by this either way — that's still a hard defect (round 1's own fixture).
  4. Crop that rect (scaled to the screenshot's own pixel size) out of the
     decoded image (`cropRegionPixels`).
  5. Classify the crop painted once EITHER (a) more than
     `--min-painted-fraction` (default `0.05`, i.e. 5%) of its pixels differ,
     past `--color-tolerance` (default `8` per RGB channel), from every named
     empty colour — the page's own computed `background-color` plus any
     `--placeholder-colors` — OR (b) the crop's luma standard deviation
     crosses `--min-painted-stddev` (default `10`, fix round 2) AND its
     largest single-step luma jump between spatially-adjacent pixels crosses
     `--min-structure-edge` (default `20`, fix round 3): real media almost
     always has internal structure (edges, shading, detail) a flat swatch
     never does, even when most of its area happens to be close to the
     background (a white product shot, a dark-framed video) — but a smooth
     gradient/shimmer LOADING SKELETON also has real spread without being
     real content, so path (b) requires a genuine edge too, never spread
     alone. This is an OR alongside (a), so it only ever rescues a false
     EMPTY, never masks a real one.
  6. **Debounce against the page's own entrance fade** (fix round 3): a
     blank, non-sliver-exempt slot only counts once it's stayed that way for
     `--arrival-window-ms` (default `250`, the page's own approved
     decode-gated fade) of running wall-clock time — tracked per element
     across frames (`classifyEmptyAcrossFrames`, keyed by `src`/`currentSrc`)
     — never on the single frame that happens to land mid-fade. `load`'s
     fixed-frame check always debounces at `0` (no session to fade across —
     the bar is real from first paint), so every load-time defect is still
     caught on its very first blank frame.
  Never `.complete`/`readyState` either — those DOM flags read PASS on a
  stuck-at-opacity-0 element whose bytes already decoded (round 13's
  original finding, still true of DOM state generally).
- **gaps** — a visible region with **no covering DOM element at all**
  (round 17: a windowed-mount state update skipped a render during a fast
  pan, leaving a hole with nothing to read paint state from). Fix round 2
  rewrote this from a horizontal-line scan (which merged spans ACROSS
  independent columns, wrongly flagging the holding canvas's own real
  column gutter whenever one column's row-gap was briefly exposed while its
  neighbours still had coverage) to a **per-column** model:
  1. Group the frame's visible rects into columns by x-range overlap
     (`groupRectsIntoColumns`) — a masonry stacks each column's own tiles at
     a shared x-position, one above the next.
  2. Within each column (sorted top-to-bottom), the gaps between ADJACENT
     tiles only (`columnInternalGaps`) — never before the first or after the
     last, which is real layout whitespace, not a hole — past
     `--gap-tolerance` (default `24`, anti-aliasing seam floor).
  3. Compare each candidate gap's HEIGHT against the frame's own recurring
     row-gap height — the median across every column's candidate gaps
     (they share the same design token) — via `--gap-width-ratio` (default
     `2`, i.e. a gap must be more than twice the frame's own rhythm to count
     as a genuine hole, never a real row-gap).

## Flags

| Flag | Default | Meaning |
|---|---|---|
| `--viewport WxH` | `390x844` | CSS viewport size. |
| `--dpr N` | `2` | Device scale factor. |
| `--interaction load\|scroll\|drag` | `load` | What drives the session. |
| `--browser chromium\|webkit` | `chromium` | Engine. |
| `--channel chrome` | (bundled) | Launch a real installed Chrome instead of Playwright's bundled Chromium — closer to what a reader's own browser does. |
| `--headed` | off (headless) | Show the browser window. Combine with `--channel chrome` for the closest-to-real run this probe supports. |
| `--paced` | off | (fix round 3) Opts `scroll`/`drag` BACK INTO the old short, evenly-spaced crawl (`STEP_PACE_MS`, 500ms/step) — never the default any more, and never proof of fast-motion behaviour on its own (it gives the page's own decode pipeline time to keep up that a real fast fling never grants — review round 2's own finding, live on `preview.jarrad.design/holding`: a paced run read 0 misses where the same session at real fling speed read 16-36). Prints its own caveat note whenever used. |
| `--network fast3g\|slow3g\|none` | `none` | Throttle profile (real CDP bandwidth shaping on Chromium; latency-only approximation on WebKit — no CDP there). |
| `--frames N` | `24` | Sample count for `load`'s fixed-frame mode, or `--paced`'s. |
| `--duration MS` | `0` (off, meaning the default fling length) | For `scroll`/`drag` (not `--paced`), extends the realistic fling/drag **session** — repeated varied-distance gestures, not one smooth crawl — past the default `8000`ms. Round 10's own finding: a short synthetic drag didn't disagree with the operator's real phone until the session ran 60s+ — use `--duration 60000` or longer for the run that closes a lane. |
| `--settle MS` | `0` | After the session ends, wait this long and take one final sample — round 13's "first screen settled" check (does a background warm/decode task ever actually resolve once the reader stops moving). |
| `--reps N` | `1` | Repeat the whole run this many times; every rep is printed, never averaged away. |
| `--gap-tolerance PX` | `24` | Minimum candidate gap height (anti-aliasing seam floor) before it's even considered against the frame's own rhythm. |
| `--gap-width-ratio N` | `2` | How much taller than the frame's own recurring row-gap (median, pooled across every column) a column's own internal gap must be before it counts as a genuine hole (fix round 2). |
| `--placeholder-colors "#eee,#f2f2f2"` | (none) | Comma-separated extra "not-yet-painted" colours (a skeleton/loading swatch) the paint classifier treats as empty alongside the page's own computed background colour. |
| `--color-tolerance N` | `8` | Per-RGB-channel slack when matching a cropped pixel against the background/placeholder colours — past PNG anti-aliasing at a tile's own edge. |
| `--min-painted-fraction 0-1` | `0.05` | Share of a slot's cropped pixels that must differ from every empty colour before the slot counts as painted (path a — background-match). |
| `--min-painted-stddev N` | `10` | Luma standard deviation a crop must cross to count as painted via structure alone (path b), rescuing real content that's mostly background-close. |
| `--min-structure-edge N` | `20` | (fix round 3) Largest single-step luma jump between spatially-adjacent pixels a crop must ALSO cross before path (b) rescues it — a smooth gradient/shimmer skeleton has real spread but no real edge, so spread alone no longer counts as structure. |
| `--arrival-window-ms MS` | `250` | (fix round 3) How long a slot must stay blank (consecutive sampled frames × the drive mode's own cadence) before it counts — the page's own approved entrance fade duration, so a sample landing mid-fade isn't a defect. Forced to `0` for `--interaction load` (no session to fade across). |
| `--min-visible-area 0-1` | `0.15` | Share of an element's own natural (unclipped) area that must be on screen before its paint state is judged at all — below this AND above 0 AND the element is in MOTION since the previous frame (fix round 3), it's a trivial edge sliver, exempted; a static tile (at rest, on load) at the same small share is judged normally, and exactly `0` visible area (fully clipped/hidden) is never exempted either way. |
| `--help`, `-h` | — | Print usage and exit `0`. Recognised anywhere in argv, including as the URL slot — never navigated to as a URL (fix round 2). |

## Worked examples

Quick load check, both engines:
```
node hooks/scripts/media-load-probe.mjs https://example.com --interaction load --browser chromium
node hooks/scripts/media-load-probe.mjs https://example.com --interaction load --browser webkit
```

Realistic drag session (the DEFAULT shape as of fix round 3 — no `--paced`
needed) with a settle dwell, repeated 3 times, on a real installed Chrome
(not just the bundled one) — the shape that actually caught the holding-page
regressions:
```
node hooks/scripts/media-load-probe.mjs https://example.com \
  --viewport 390x844 --dpr 3 --interaction drag \
  --browser chromium --channel chrome --headed \
  --duration 90000 --settle 3000 --reps 3
```

A headless/bundled-browser run (no `--channel`, no `--headed`) is still worth
running — it's fast and catches the same code-level regressions — but the
probe prints a floor-not-proof note on every such run; don't close a lane on
that note alone.

The old short, evenly-spaced crawl is still available (`--paced`), but it is
NOT proof of fast-motion behaviour — review round 2's own finding was that it
read 0 paint misses on the same page/session where the default fling read
16-36. Only use it for a quick smoke check between real fling runs; the probe
prints its own caveat whenever a rep used it.

## Proving the classification/gap rules against a live fixture

`hooks/scripts/lib/fixtures/media-load-probe-fixture.html` is a static page
covering every round-1/round-17/round-3 false-pass shape at once — three
healthy columns (a consistent row-gap rhythm) with one genuine missing tile,
plus eight isolated paint cases (opacity-0, covered by a registered
placeholder colour, clipped, `visibility:hidden`, a uniform-colour
placeholder equal to the page background, a white-heavy true negative that
must still read painted, and — fix round 3 — a smooth gradient loading
skeleton and a shimmer sweep, both real spread with no real edge, that must
both still read empty). Serve it on a real URL (never `file://`) and run the
probe against it:
```
node hooks/scripts/lib/fixtures/serve-fixture.mjs 3241 &
node hooks/scripts/media-load-probe.mjs http://localhost:3241 \
  --viewport 1250x750 --dpr 1 --interaction load --frames 1 \
  --placeholder-colors "#eeeeee" --color-tolerance 40
```
`--color-tolerance 40` here is deliberately generous — it isolates exactly
what the structure-edge bound (`--min-structure-edge`) is for: with this
tolerance, the two skeleton tiles already read empty via the fraction path
alone (mirroring `media-load-lib.test.mjs`'s own isolation of the same OR
condition), so the only thing standing between them and a false PAINTED is
the edge-jump floor. Expect exactly `paint=7 gaps=1` on both
`--browser chromium` and `--browser webkit` (verified live, both engines,
2026-09-27) — 5 real defects plus the 2 skeleton tiles caught (never the
white-heavy true negative), 1 genuine hole caught (never the healthy 20px
rhythm elsewhere on the page). Kill the server (`pkill -f serve-fixture.mjs`)
when done.
