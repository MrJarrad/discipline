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
hover, route change) — never a blank or half-painted tile, and never a hole
where a tile should be. Video takes over once it's ready; the poster is the
fast-loading fallback, never an afterthought (operator: *"posters are there
as fallbacks if videos really take too long to load — they should load first
for a fast page load speed"*; *"the first visit needs to be perfect"*). This
is a build standard, not a taste call — apply it on every lane in scope, no
exceptions argued per surface.

## Method — the pattern, not one stack's code

1. **Still/poster first, prioritised by what's on screen.** The slots visible
   at first paint load their still/poster at high priority; everything else
   queues at lower priority, in page order — never a flat fetch-everything-
   at-once, never a random order.
2. **Pre-sized static variants per slot × DPR.** Pick the still/poster sized
   for its actual rendered slot and the device's pixel ratio — never a
   full-res source scaled down client-side, never a smaller-than-needed
   asset stretched up.
3. **Entrance never plays before its media is decoded, and can never be
   cancelled mid-wait.** An element's choreographed entrance (fade/reveal/
   slide-in) waits on that element's own still/poster decode; a prop change
   that arrives while the wait is pending must never both refuse a retry (a
   guard blocking a duplicate call) AND drop the pending resolution — that
   combination sticks the element at its hidden state permanently, visually
   identical to never loading.
4. **Lookahead sized to the fastest motion in scope.** A fling-scroll or a
   fast drag moves content into view faster than a lazy-load default assumes
   — size the load-ahead window (in slots or pixels) to the fastest gesture
   the surface allows, so media is ready before it enters, not after.
5. **Cap concurrent video decode to what's visible, tighter still on phones.**
   Don't decode more videos than are on screen at once; on a phone, bound it
   further to a measured budget (nearest-on-screen first) — a hardware
   decoder pool is far smaller than "however many tiles are visible", and
   `fetchPriority` has **no effect on `<video>`** (it's only defined for
   `<img>`/`<link>`/`<script>`/`<iframe>`) — a load-order gate plus a
   concurrency cap is the only lever that works.
6. **Poster from the video's own first frame**, generated at build time — a
   mismatched poster makes the video-takes-over swap visibly jump.
7. **A video's poster stays painted until the video is actually playing, not
   just until `src` is set.** WebKit drops the native `poster` attribute the
   instant `src` triggers the load algorithm, before any frame decodes — the
   element paints **black**, not the poster, for however long the decode
   takes. Render the poster as a real image element layered on top of a
   hidden `<video>`, and only reveal the video on its own `playing` event —
   never rely on the native attribute alone once `src` is assigned.
8. **Stills/posters get the connection first; video decode waits for
   `window.load` plus a short defer.** Gating video `src` behind the page's
   own load event (not "as soon as it's visible") means the byte-heavier,
   decode-heavier asset never starves the cheaper one that has to paint
   first regardless.
9. **A repeating layout (a tiled/wrapped canvas reusing a small unique media
   pool) warms and holds every unique tile once the first screen settles** —
   nearest-first, one decode at a time (not a parallel burst — a browser can
   silently ignore `fetchPriority` on a script-created element, so an
   unthrottled batch just contends bandwidth with the reader's own drag),
   paused outright while the reader is actively panning. A later-visited copy
   of an already-seen tile then never re-blanks.
10. **Windowed mounting keeps only near-screen tiles in the DOM, with stable
    keys, and every mounted-set change commits before the next paint.** A
    bare state update inside a scroll/drag animation loop only guarantees the
    *latest* state eventually renders, not every intermediate one — during a
    sustained fast pan a newly-needed tile's element can go missing for
    several frames (or the rest of a fling), a genuine hole with no DOM node
    behind it, not a paint-timing issue. Flush that state update
    synchronously inside the same animation-frame callback.
11. **`sizes` replays the slot's real rendered-width formula, not an
    estimate.** A `sizes` guess left over from an earlier layout, once the
    slot's own tile-width formula changes, makes the image loader request a
    much larger bucket than the slot needs — multiplying bytes on every
    near/visible tile. Bind `sizes` to the exact CSS expression that sizes
    the slot (e.g. `calc(100vw/N - gap)`), per breakpoint, and re-check it
    whenever the layout's own column math changes.
12. **Phone checks target the view mobile actually shows** — a desktop grid
    narrowed to a phone viewport width is a different experience than
    mobile's own layout; verify against what mobile actually renders, never
    a shrunk desktop capture.

Full source citations (which round found which defect, and the operator
wording that closed each one) are in `references/PATTERNS.md`.

## Done-when — the probe, not a look

**Mechanical over AI** (`code-minimalism`): two deterministic counts, not a
judgement call. `hooks/scripts/media-load-probe.mjs` loads the deployed build
at a phone viewport + DPR, drives a named interaction (`load` / `scroll` /
`drag`), and measures every on-screen media element's **actual composited
pixels** for the duration — never `.complete`/DOM presence, which reads PASS
on a stuck-at-opacity-0 element with its bytes already decoded (the exact
failure method 3 exists to stop), and never a canvas read of the element's
own source bitmap either (a fix round's own finding: that samples the
SOURCE, not the composited page, so it still reads PASS on a slot that's
clipped by an `overflow:hidden` ancestor, covered by an opaque sibling,
`visibility:hidden`, or at `opacity:0` behind a parent). The paint signal is
a full-page screenshot, cropped per slot to its rect intersected with the
viewport and every clipping ancestor, classified against the page background
and any named placeholder colours **plus internal structure** (a fix round's
own finding: a white-heavy real photo or a dark-framed video can be mostly
background-close by colour alone — real content almost always has edges/
shading a flat swatch never does). A slot that's mostly scrolled past the
viewport edge, showing only a trivial sliver of its own natural rect, is
excluded from judgment entirely (never a slot that's fully clipped/hidden —
that stays a hard defect). It prints two numbers:

- **paint** — a visible, non-trivial-sliver slot whose screenshot crop reads
  as the page background/a placeholder colour AND shows no internal
  structure: fully clipped away, covered, `visibility:hidden`, at
  `opacity:0`, or simply never loaded.
- **gaps** — a visible region with **no covering DOM element at all**
  (method 10's failure mode). Grouped **per column** (x-overlapping rects,
  the shape a masonry/independent-column layout actually has) — a column's
  own internal gaps compared against the frame's own recurring row-gap
  height, never merged across columns (a fix round's own finding: merging
  across columns reads a real, everyday column gutter as a hole whenever one
  column's own row-gap is briefly exposed next to a taller neighbour).

Both must be **0**. The probe supports a short fixed-frame mode (for `load`)
and a long realistic session (`--duration`, a genuine fling/drag loop, not a
single smooth crawl, plus a `--settle` dwell before a final sample) for
`scroll`/`drag` — round 10's own finding was that a short synthetic drag
didn't disagree with the operator's phone until the session ran long and
real. Run `--reps` more than once and report every rep, not just one.
Full flag reference and worked examples: `references/PROBE.md`.

- **DO:** run the probe for every interaction the surface exposes, on both
  browsers, at the realistic session length the surface allows, and attach
  every rep's numbers to the evidence return.
- **DO:** treat a headless/default-launch result as a **floor, not proof** —
  confirm with `--headed --channel chrome` (a real installed Chrome) or a
  real device before closing a lane; Playwright's bundled WebKit has no real
  iOS decoder cap (round 14), so a WebKit pass never substitutes for a real
  iPhone check on video.
- **DON'T:** "it looked fine when I dragged it" — the exact unfalsifiable
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
