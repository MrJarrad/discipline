---
name: media-loading
description: >-
  The standing bar and method for shipping images/video that are never blank
  or half-painted. Use on any lane that touches media on screen — a strip's
  first hover, a grid's entrance, a holding-page tile's first load, dragging
  on phones, a route change. Not for generating or editing an image's
  content — that's banana/qwen-edit; not for motion's easing/timing feel —
  that's motion; not lab Core Web Vitals numbers — that's quality/design-craft
  Law 9.
---

# Media loading

**The bar.** Every media element visible on screen shows at least its
still/poster from first paint, and throughout every motion (scroll, drag,
hover, route change) — never a blank or half-painted tile. Video takes over
once it's ready; the poster is the fast-loading fallback, never an
afterthought (operator: *"posters are there as fallbacks if videos really
take too long to load — they should load first for a fast page load
speed"*; *"the first visit needs to be perfect"*). This is a build standard,
not a taste call — apply it on every lane in scope, no exceptions argued per
surface.

## Method — the pattern, not one stack's code

1. **Still/poster first, prioritised by what's on screen.** The slots visible
   at first paint load their still/poster at high priority; everything else
   queues at lower priority, in page order — never a flat fetch-everything-
   at-once, never a random order.
2. **Pre-sized static variants per slot × DPR.** Pick the still/poster sized
   for its actual rendered slot and the device's pixel ratio — never a
   full-res source scaled down client-side, never a smaller-than-needed
   asset stretched up.
3. **Entrance never plays before its media is decoded.** An element's
   choreographed entrance (fade/reveal/slide-in) waits on that element's own
   still/poster decode — a transform that reveals an empty tile is the
   defect this bar exists to stop.
4. **Lookahead sized to the fastest motion in scope.** A fling-scroll or a
   fast drag moves content into view faster than a lazy-load default assumes
   — size the load-ahead window (in slots or pixels) to the fastest gesture
   the surface allows, so media is ready before it enters, not after.
5. **Cap concurrent video decode to what's visible.** Don't decode more
   videos than are on screen at once — a strip with ten video tiles decodes
   the visible two or three, not all ten, or the visible ones starve.
6. **Poster from the video's own first frame.** Generate the poster from
   frame 0 (or the intended cover frame) of the same video — a mismatched
   poster makes the video-takes-over swap visibly jump.

## Done-when — the probe, not a look

**Mechanical over AI** (`code-minimalism`): the check is a deterministic
script, not a judgement call. `hooks/scripts/media-load-probe.mjs` loads the
deployed build at a phone viewport + DPR, under CPU + network throttling, in
**Chromium and WebKit**, drives a named interaction (`load` / `scroll` /
`drag`), samples every on-screen `<img>`/`<video>`'s paint state per frame,
and prints the summed **empty-visible-media count**. The bar is that number
at **0** — any lane that touches media carries this as its done-when,
measured on the deployed build, not a local preview (`load-numbers-only-on-
deployed-and-device`). CPU throttling and true bandwidth shaping are
Chromium-only (Playwright has no CDP on WebKit) — the WebKit number is a
documented lower bound, name the gap rather than claim parity.

```
node hooks/scripts/media-load-probe.mjs <deployed-url> \
  --viewport 390x844 --dpr 3 --interaction scroll \
  --browser chromium --network fast3g
```

- **DO:** run the probe for every interaction the surface exposes (at least
  `load`; add `scroll`/`drag` when the surface scrolls or drags) on both
  browsers, and attach all counts to the evidence return.
- **DON'T:** "it looked fine when I scrolled it" — the exact unfalsifiable
  claim the probe exists to replace; a look pass is not evidence of zero.
- **DON'T:** run the probe once on `load` and call a scrolling/draggable
  surface covered — an interaction the probe didn't drive is an interaction
  the bar doesn't know about yet.

## Where this is enforced (pointer, not restated)

`design-craft` Law 11 names the acceptance criterion; `quality` § Standing
tech checks and its done-checklist gate on it; `agents/reviewer.md` re-runs
the probe as its evidence check; `dispatch-brief`'s done-when names it for
any media-touching lane; `routing`'s work-type and domain-library tables
require the brief to name this skill whenever images/video are on screen.
