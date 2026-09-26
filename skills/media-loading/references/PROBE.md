# media-load-probe.mjs — flag reference

`hooks/scripts/media-load-probe.mjs` (+ `hooks/scripts/lib/media-load-lib.mjs`)
is `media-loading`'s done-when script. This file is the flag reference and
worked examples; the rule and the bar are in `SKILL.md`.

## What it measures (1.96.0, fix round 2)

Two independent counts, both must be **0**:

- **paint** — a visible media slot whose crop of that frame's **screenshot**
  classifies as empty. The signal is what's actually **composited on
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
  3. **Skip a trivial edge sliver** (fix round 2): if the on-screen (clipped)
     area is a NONZERO but small share (under `--min-visible-area`, default
     `0.15`, i.e. 15%) of the element's own natural rect, it's excluded from
     judgment entirely — a tile scrolled almost fully past the viewport edge
     during a fast drag shows only a hair of its own operator-approved edge
     fade, not a real half-painted tile. An element with **zero** visible
     area (fully clipped by an ancestor, or `visibility:hidden`) is never
     exempted by this — that's still a hard defect (round 1's own fixture).
  4. Crop that rect (scaled to the screenshot's own pixel size) out of the
     decoded image (`cropRegionPixels`).
  5. Classify the crop painted once EITHER (a) more than
     `--min-painted-fraction` (default `0.05`, i.e. 5%) of its pixels differ,
     past `--color-tolerance` (default `8` per RGB channel), from every named
     empty colour — the page's own computed `background-color` plus any
     `--placeholder-colors` — OR (b) the crop's luma standard deviation
     crosses `--min-painted-stddev` (default `10`, fix round 2): real media
     almost always has internal structure (edges, shading, detail) a flat
     swatch never does, even when most of its area happens to be close to
     the background (a white product shot, a dark-framed video) — this is an
     OR, so it only ever rescues a false EMPTY, never masks a real one.
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
| `--network fast3g\|slow3g\|none` | `none` | Throttle profile (real CDP bandwidth shaping on Chromium; latency-only approximation on WebKit — no CDP there). |
| `--frames N` | `24` | Sample count for the short fixed-frame mode (`--duration` not given). |
| `--duration MS` | `0` (off) | Switches to a long, realistic fling/drag **session** — repeated varied-distance gestures, not one smooth crawl — for at least this many milliseconds. Round 10's own finding: a short synthetic drag didn't disagree with the operator's real phone until the session ran 60s+. |
| `--settle MS` | `0` | After the session ends, wait this long and take one final sample — round 13's "first screen settled" check (does a background warm/decode task ever actually resolve once the reader stops moving). |
| `--reps N` | `1` | Repeat the whole run this many times; every rep is printed, never averaged away. |
| `--gap-tolerance PX` | `24` | Minimum candidate gap height (anti-aliasing seam floor) before it's even considered against the frame's own rhythm. |
| `--gap-width-ratio N` | `2` | How much taller than the frame's own recurring row-gap (median, pooled across every column) a column's own internal gap must be before it counts as a genuine hole (fix round 2). |
| `--placeholder-colors "#eee,#f2f2f2"` | (none) | Comma-separated extra "not-yet-painted" colours (a skeleton/loading swatch) the paint classifier treats as empty alongside the page's own computed background colour. |
| `--color-tolerance N` | `8` | Per-RGB-channel slack when matching a cropped pixel against the background/placeholder colours — past PNG anti-aliasing at a tile's own edge. |
| `--min-painted-fraction 0-1` | `0.05` | Share of a slot's cropped pixels that must differ from every empty colour before the slot counts as painted (path a — background-match). |
| `--min-painted-stddev N` | `10` | Luma standard deviation a crop must cross to count as painted via structure alone (path b — fix round 2), rescuing real content that's mostly background-close. |
| `--min-visible-area 0-1` | `0.15` | Share of an element's own natural (unclipped) area that must be on screen before its paint state is judged at all (fix round 2) — below this AND above 0, it's a trivial edge sliver, exempted; exactly `0` (fully clipped/hidden) is never exempted. |
| `--help`, `-h` | — | Print usage and exit `0`. Recognised anywhere in argv, including as the URL slot — never navigated to as a URL (fix round 2). |

## Worked examples

Quick load check, both engines:
```
node hooks/scripts/media-load-probe.mjs https://example.com --interaction load --browser chromium
node hooks/scripts/media-load-probe.mjs https://example.com --interaction load --browser webkit
```

Realistic long drag session with a settle dwell, repeated 3 times, on a real
installed Chrome (not just the bundled one) — the shape that actually caught
the holding-page regressions:
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

## Proving the classification/gap rules against a live fixture

`hooks/scripts/lib/fixtures/media-load-probe-fixture.html` is a static page
covering every round-1/round-17 false-pass shape at once — three healthy
columns (a consistent row-gap rhythm) with one genuine missing tile, plus six
isolated paint cases (opacity-0, covered by a registered placeholder colour,
clipped, `visibility:hidden`, a uniform-colour placeholder equal to the page
background, and a white-heavy true negative that must still read painted).
Serve it on a real URL (never `file://`) and run the probe against it:
```
node hooks/scripts/lib/fixtures/serve-fixture.mjs 3241 &
node hooks/scripts/media-load-probe.mjs http://localhost:3241 \
  --viewport 1250x750 --dpr 1 --interaction load --frames 1 \
  --placeholder-colors "#eeeeee"
```
Expect exactly `paint=5 gaps=1` on both `--browser chromium` and
`--browser webkit` — 5 real defects caught (never the white-heavy true
negative), 1 genuine hole caught (never the healthy 20px rhythm elsewhere on
the page). Kill the server (`pkill -f serve-fixture.mjs`) when done.
