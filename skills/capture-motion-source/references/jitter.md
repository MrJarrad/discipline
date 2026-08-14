# Playbook: Jitter (jitter.video share link)

A Jitter share link opens the full **editor**, read-only — layer tree, timeline, and
per-block animation inspector are all in the DOM. Everything is decodable as data;
never eyeball playback.

**1 — open and clear the chrome.** `preview_start` the share URL. Wait for "Loading
assets" to finish (several seconds; screenshot to confirm). A "Welcome to Jitter —
Sign up" banner overlays the editor and Escape does NOT dismiss it; hide the banner
card via JS (walk up from the "Welcome to Jitter!" text node while the ancestor stays
smaller than the viewport, then `display:none` on that card — hiding a too-large
ancestor blanks the whole app; if that happens, reload and re-hide).

**2 — inventory.** `read_page` (filter all). You get: the layer tree
(`role="treeitem"` — record names and stack order; playback order is usually the
reverse), and the timeline as one button per animation block labeled
`<layer> · <preset>` (e.g. "stick · Grow in"). Record every block.

**3 — frame anatomy.** Click the root frame in the layer tree, switch to the
**Design** tab, and read the inspector inputs by `aria-label` (`x`, `y`, `width`,
`height`, duration). The frame label on canvas also shows total duration — cross-
check the two. Background color: the canvas is CanvasKit/WebGL, so the DOM has no
fill value — sample from a screenshot and label approximate (a Lottie export gives
the exact value; see below).

**4 — decode the timeline geometry.** The core trick, via JS:
- Ruler labels (`0s`, `1s`, `2s`…) → x-positions give the **px-per-second scale**
  (e.g. 200px/s) and the x of t=0. Label rects are the *left* edge of a ~32px-wide
  label; t=0 sits at label center.
- Animation bars are `[role="timer"]` elements (class `_segment_*`) → each rect's
  `x`/`width` converts to start/duration: `t = (x − x₀) / pxPerSec`.
- Bars are listed in row order matching the block list from step 2 — zip them.
- The ruler scrolls horizontally; after any timeline scroll, **re-read the labels
  and recompute the scale** before converting more bars.

**5 — read each block's settings.** Click a timeline block, then read the Animate
inspector via JS (inputs + buttons matched by `aria-label` and text): preset name
(Grow / Move / Fade / …), Mode In/Out, Initial-or-Final scale %, Fade checkbox,
Duration input, Easing button text. Caveat: clicking layer-tree items does not
reliably re-target the inspector — click the timeline blocks themselves.

Easing alias table (resolve before anything crosses into a brief):

| Jitter name | Meaning | curve |
|---|---|---|
| Slow down | ease-out | **cubic-bezier(0, 0, 0, 1)** (Lottie-verified 2026-08-10; far snappier than CSS `ease-out`) |
| Accelerate | ease-in | **cubic-bezier(1, 0, 1, 1)** (Lottie-verified; hangs then collapses — stock `ease-in` too gradual) |
| Smooth | ease-in-out | unverified — confirm from a Lottie export before relying on it |
| Linear | linear | linear |
| Custom | read the handles via "Customise easing" | — |

**6 — see the artwork.** Scrub by clicking the ruler at each layer's fully-visible
moment and screenshot; `zoom` the canvas region. Describe each layer's composition.

## Lottie export — optional ground truth

Jitter exports Lottie JSON behind sign-in — ask the operator rather than assume; the
export supersedes steps 4–5 as the timing source. Parse per the `lottie.md` playbook.
Jitter-specific structure: grow-*outs* sit on top-level precomp layers; grow-*ins*
are nested inside the precomp assets. Cross-check the editor-measured table against
the keyframes and record that the check happened — frame-exact match expected; a
mismatch means the share link and export are different versions (say so, don't
average).
