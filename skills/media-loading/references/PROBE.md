# media-load-probe.mjs — flag reference

`hooks/scripts/media-load-probe.mjs` (+ `hooks/scripts/lib/media-load-lib.mjs`)
is `media-loading`'s done-when script. This file is the flag reference and
worked examples; the rule and the bar are in `SKILL.md`.

## What it measures (1.96.0)

Two independent counts, both must be **0**:

- **paint** — a visible media element with no painted pixels at all
  (`isTransparentPaint`), or one with real pixels ready but stuck at zero
  computed opacity (`isStuckOpacityZero` — the round-17 fade-race). Measured
  by drawing the element's own rendered output into an offscreen canvas and
  reading its pixels back (`drawImage` + `getImageData`), never `.complete`/
  `readyState` — those DOM flags read PASS on a stuck-at-opacity-0 element
  whose bytes already decoded (round 13's finding). Cross-origin media with
  no CORS header taints the canvas; the probe catches that per element,
  falls back to the DOM-state heuristic for that one element, and names it
  `paintUnmeasurable: true` in the raw sample rather than silently trusting
  it.
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
