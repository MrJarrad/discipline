# Technical design — laws below the design system

**Source:** `~/JHD/vault/references/technical-design-spectrum-2026-08-11.md` (ratified,
spectrum r2 PASS, `spectrum-ratified-2026-08-11`) — the browser/rendering-pipeline layer
that sits *below* tokens/components: font shaping, paint, compositing, viewport/platform
chrome, print. Read the source report for full evidence and citations; this file distills
its §6 ranked gaps into laws an agent can apply and a reviewer can check.

**Hard fence (do not touch):** the report names five things already best-in-class and
explicitly says not to re-litigate them: reduced-motion (per-effect, not blanket),
scroll-driven animation behind `@supports` with a complete no-support path, `will-change`
scoping/reset, viewport-gated video autoplay, hydration determinism. A law below never
overrides this fence.

Each law below states the **acceptance criterion verbatim from the report** (measured, not
eyeballed) plus a DO/DON'T pair in the `2026-08-10-do-dont-pairs.md` style: the DO is the
compliant move in a real scenario, the DON'T is phrased as the reasoning that talks an
agent into shipping the gap anyway.

---

### Law 1 — LCP hero image priority (§6 #1, §E "LCP image priority")

**Acceptance criterion:** throttled mobile trace — the hero request starts in the first
wave; LCP ≤2.5s at p75. `priority` alone does not set `fetchPriority` on `next/image`
(version-checked against the installed `next@15.5.20`) — both must be set explicitly.

- **DO:** pass `priority` **and** `fetchPriority="high"` explicitly on the single
  above-the-fold hero image (case-study header, first home tile) — nowhere else.
- **DON'T:** *"`next/image` is already optimized, so the defaults are fine"* — the
  reasoning that ships every route's hero lazy-loaded, directly worsening LCP for every
  first-time mobile visitor.
- **Needs a runtime lane** (throttled trace / Lighthouse) — not grep-checkable this round.

### Law 2 — Focus ring survives forced-colors (§6 #2, §G "Focus ring visibility")

**Acceptance criterion:** tab through every control with `forced-colors: active` emulated
in DevTools Rendering — a ring is visible on all of them.

- **DO:** make `outline` + `outline-offset` the baseline focus indicator (rounded outlines
  are supported everywhere in the current support matrix); keep `box-shadow`/`ring` as a
  visual enhancement layered on top, never the only mechanism; add a
  `@media (forced-colors: active)` block using system colour keywords.
- **DON'T:** *"`box-shadow` respects the border-radius and outline doesn't"* — the
  superseded reasoning (obsolete since Firefox 88 / Chrome 94 / Safari 16.4) that ships
  zero visible focus indication for every keyboard user in Windows High Contrast mode.
- **Grep-checkable:** presence of a `forced-colors: active` block. The outline-vs-shadow
  mechanism itself is a code-review call, not grep-able this round.

### Law 3 — Font smoothing: RATIFIED-KEEP (§6 row 3, §5)

**Status:** RATIFIED-KEEP, not operator-call-pending. Source: operator ruling
`~/JHD/vault/fleet/rulings/2026-08-11-technical-design-craft-callout.md`, section
"RULING — font smoothing STAYS" (2026-08-12). The report's original framing (§5, §6
row 3) treated this as a contested aesthetic call for the operator to decide; the
operator has since decided: "Operator: 'let's use font smoothing.' Spectrum report §6
item 3 CLOSED — global `-webkit-font-smoothing: antialiased` (globals.css:2070-2071) is
ratified design, kept as-is." The audience prior (designers/industry professionals ≈
retina macOS) and the type ramp having been authored and judged *with* smoothing on
informed the call; the field-canon counterargument (thin body copy on non-retina macOS)
was named and accepted as a deliberate trade.

- **DO:** keep the global declaration; audits treat its presence as ratified, never flag
  it; re-judge only if real post-launch telemetry contradicts the retina-heavy audience
  prior.
- **DON'T:** *"the Vercel/industry checklists dropped font-smoothing so I removed it in a
  cleanup"* — this is an operator aesthetic ruling; canon does not override it.
- **Grep-checkable:** presence of `-webkit-font-smoothing: antialiased` is never a
  warning — ratified-keep means the grep lane must never flag it, so no `forbid`/`require`
  check exists for this row.

### Law 4 — Print stylesheet (§6 #4, §K)

**Acceptance criterion:** Cmd-P on every route — the output is a document, not a
screenshot of a website; dark-ground sections invert to ink-on-paper; no figure/card/
heading splits across a page break; external link URLs are exposed in print.

- **DO:** ship a `@media print` block that hides chrome (nav, controls), applies
  `print-color-adjust: exact` (or inverts) to dark-ground sections, sets
  `break-inside: avoid` on figures/cards, and appends `attr(href)` to external links.
- **DON'T:** *"printing isn't a real user path for a portfolio"* — the reasoning that ships
  a page recruiters and clients plausibly print or PDF with white text landing on white
  paper, invisible.
- **Grep-checkable:** presence of `@media print` at all.

### Law 5 — `color-scheme`, `theme-color`, `viewport-fit` (§6 #5, §H)

**Acceptance criterion:** on a dark-preferring OS, the overscroll canvas/scrollbar/native
controls match the page; iOS/Android chrome shows no colour seam; on a notched device,
content reaches edge-to-edge with nothing important in an unsafe area.

- **DO:** declare `color-scheme` both as `<meta name="color-scheme">` (before stylesheets)
  and the CSS property; ship two `theme-color` tags gated by
  `media="(prefers-color-scheme: …)"`; add an explicit `viewport` export with
  `viewportFit: 'cover'` (frameworks like Next.js do not emit this by default).
- **DON'T:** *"the site is light-only, so none of this applies"* — the reasoning that
  leaves a dark-preferring device with a mismatched UA canvas and a white address-bar seam
  above a dark hero, on a site that's light-only *by omission*, not by declaration.
- **Grep-checkable:** presence of `color-scheme` (CSS or meta) and at least one
  `theme-color` meta tag. `viewport-fit`/`env()` safe-area usage is not grepped this round.

### Law 6 — `scrollbar-gutter: stable` (§6 #6, §C)

**Acceptance criterion:** on Windows/Linux Chrome, navigate short-page → long-page —
centred content must not shift horizontally.

- **DO:** set `scrollbar-gutter: stable` on the scroll root.
- **DON'T:** *"I checked on macOS and nothing moved"* — the reasoning that ships a ~15px
  horizontal jump for every Windows/Linux visitor, invisible in the overlay-scrollbar
  environment the author actually tested in.
- **Grep-checkable:** presence of `scrollbar-gutter:` in CSS.

### Law 7 — Ban `transition: all` (§6 #7, §D)

**Acceptance criterion:** grep for `transition-all` / `transition: all` — zero matches;
every transition enumerates its properties explicitly.

- **DO:** list the transitioned properties explicitly (`transition: opacity 150ms,
  transform 150ms`).
- **DON'T:** *"`transition: all` is simpler and I'll narrow it if it becomes a problem"* —
  the reasoning that silently transitions layout properties nobody intended to animate.
- **Grep-checkable:** presence of `transition-all` / `transition:\s*all` is a hard ban —
  this is the one law where the grep hit itself IS the violation.

### Law 8 — iOS text-inflation guard (§6 #8, §A "text-size-adjust")

**Acceptance criterion:** iOS Safari portrait → landscape → portrait — no font-size or
wrapping change; user zoom still works.

- **DO:** set `-webkit-text-size-adjust: 100%` on the shell, then verify with an actual
  rotation test.
- **DON'T:** *"text inflation is an edge case, nobody rotates a portfolio site"* — the
  reasoning that lets a rotation silently resize and rewrap a layout built to be
  Figma-exact.
- **Grep-checkable:** presence of `text-size-adjust:` in CSS.

### Law 9 — Core Web Vitals are measured, not assumed (§6 #9, §I)

**Acceptance criterion:** `onLCP`/`onCLS`/`onINP` reporting wired, with a budget line in
the release gate — LCP ≤2.5s, CLS ≤0.10, INP ≤200ms at p75 becomes a falsifiable claim
instead of a vibe.

- **DO:** wire `web-vitals` reporting and add a CWV budget check to the release gate.
- **DON'T:** *"the site feels fast"* — the exact unfalsifiable-performance-claim reasoning
  the report calls out; without measurement, every performance claim on the surface is
  unverifiable by construction.
- **Needs a runtime lane** (field/lab CWV measurement) — not grep-checkable this round.

### Law 10 — Video colour metadata + audio loudness (§6 #10, §E)

**Acceptance criterion:** `ffprobe -show_entries stream=color_space,color_transfer,
color_primaries,color_range` asserted per case-study film; `ffmpeg -af loudnorm`
measurement keeps every film within ±1 LU of the target integrated loudness.

- **DO:** add an `ffprobe` colour-tag assertion and an `ffmpeg loudnorm` measurement pass
  to the media pipeline before a film ships.
- **DON'T:** *"it looked fine in the export"* — the reasoning that ships a film Safari may
  render flatter than Chrome (guessed BT.709-vs-sRGB conversion) and that may blow out a
  user's ears on unmute relative to the rest of the web.
- **Needs a runtime lane** (`ffprobe`/`ffmpeg` pipeline step) — not grep-checkable this
  round.

---

## Runtime-lane TODO

Laws 1, 9, 10 need a **runtime measurement lane** (throttled trace / Lighthouse, field CWV
reporting, `ffprobe`/`ffmpeg` pipeline assertions respectively) that does not exist yet.
This round intentionally does not build it — see `scripts/technical-design-check.mjs` for
the grep-lane that covers laws 2 (partial), 4, 5 (partial), 6, 7, 8. Building the runtime
lane is follow-up work, not silently deferred: track it before claiming laws 1/9/10 as
enforced rather than merely documented.
