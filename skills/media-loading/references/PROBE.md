# media-load-probe.mjs — flag reference

`hooks/scripts/media-load-probe.mjs` (+ `hooks/scripts/lib/media-load-lib.mjs`)
is `media-loading`'s done-when script. This file is the flag reference and
worked examples; the rule and the bar are in `SKILL.md`.

## What it measures (1.96.0, fix round 1)

Two independent counts, both must be **0**:

- **paint** — a visible media slot whose crop of that frame's **screenshot**
  classifies as empty: either the page background or a named placeholder
  colour, past classification tolerances (below). The signal is what's
  actually **composited on screen**, not the element's own source bitmap —
  the probe's first cut drew the element into an offscreen canvas and read
  its pixels back (`drawImage` + `getImageData`); that samples the SOURCE, so
  it still read "painted" on a slot that's clipped by an `overflow:hidden`
  ancestor, covered by an opaque sibling, `visibility:hidden`, or at
  `opacity:0` behind a parent (round 1's finding, against the holding-page
  round 13 precedent: "screenshot + pixel region-stats"). The fixed method,
  per sampled frame:
  1. Take a full-page screenshot (`page.screenshot()`), decoded by
     `lib/png-lib.mjs` (Node's built-in `zlib` only — no image-processing
     dependency added to consuming repos).
  2. For each on-screen `<img>`/`<video>`, intersect its own rect with the
     viewport and every ancestor whose computed `overflow-x`/`overflow-y` is
     `hidden`/`clip`/`auto`/`scroll` (`clippedVisibleRect`, `lib/media-load-
     lib.mjs`) — `null` (nothing left visible) or a `visibility:hidden`
     element counts as empty immediately, no pixels sampled.
  3. Crop that rect (scaled to the screenshot's own pixel size) out of the
     decoded image (`cropRegionPixels`).
  4. Classify the crop: painted once more than `--min-painted-fraction`
     (default `0.05`, i.e. 5%) of its pixels differ, past
     `--color-tolerance` (default `8` per RGB channel), from every named
     empty colour — the page's own computed `background-color` plus any
     `--placeholder-colors` (a not-yet-painted skeleton/loading swatch a
     covering overlay paints, distinct from the page background).
  Never `.complete`/`readyState` either — those DOM flags read PASS on a
  stuck-at-opacity-0 element whose bytes already decoded (round 13's
  original finding, still true of DOM state generally).
- **gaps** — a visible region with **no covering DOM element at all**
  (round 17: a windowed-mount state update skipped a render during a fast
  pan, leaving a hole with nothing to read paint state from). Found by
  scanning horizontal lines across the sampled viewport and looking for an
  uncovered run strictly between two covered spans, wider than
  `--gap-tolerance` — never the outer margin before the first or after the
  last tile, which is real layout whitespace, not a defect.

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
| `--gap-tolerance PX` | `24` | Minimum uncovered-run width the gap scan counts as a real hole (past any anti-aliasing seam, under a real tile's width). |
| `--placeholder-colors "#eee,#f2f2f2"` | (none) | Comma-separated extra "not-yet-painted" colours (a skeleton/loading swatch) the paint classifier treats as empty alongside the page's own computed background colour. |
| `--color-tolerance N` | `8` | Per-RGB-channel slack when matching a cropped pixel against the background/placeholder colours — past PNG anti-aliasing at a tile's own edge. |
| `--min-painted-fraction 0-1` | `0.05` | Share of a slot's cropped pixels that must differ from every empty colour before the slot counts as painted. |

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
