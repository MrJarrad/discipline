---
name: capture-website
description: Capture a live website design reference into a self-contained local folder — pixels, computed tokens, geometry, code, motion, art-direction — that non-browsing agents can Read as ground truth. Trigger on "look at this site", "like pentagram does", any external URL offered as a design reference, or when a layout/motion claim needs verifying rather than inferred from a markdown fetch. Not for Figma files — that's capture-figma; not for motion-tool sources (Jitter, AE, Lottie, motion videos) — that's capture-motion-source; not for auditing your own build — that's audit-build.
---

# Design Reference Capture

A design reference is not its text. An agent fed a markdown fetch of a page *infers* the
grid, the motion, the type — confidently and wrong. Subagents can't browse, but they can
**Read local files, including images**. So: capture once, bank the artifacts, and every
downstream agent works from pixels and numbers.

## Pipeline: skeleton → extract → interpret → verify → package

**Step 0 — site anatomy, before capture.** Walk the site's navigable routes (nav bar,
footer, sitemap if present) and record page inventory + intent (home / pricing / docs /
blog post, etc.). For the target page(s), skim once and record section order top-to-
bottom by name (hero, logo-strip, feature-grid, testimonial, footer). This is the
skeleton — capture.mjs's geometry.json rects get read against it, not the reverse.
Values captured against no skeleton are noise.

**Stage 1 — deterministic extraction (scripted, one command per script):**

```
node scripts/capture.mjs <url> <out-dir>          # screenshots, tokens, geometry, scroll video
node scripts/capture-code.mjs <url> <out-dir>     # page.html, styles/, scripts.json, design-system.json
node scripts/capture-motion.mjs <url> <out-dir>   # motion-samples.json + motion-environment.json
```

Requires `playwright` (`npm i -D playwright` anywhere; scripts resolve it from cwd).
`capture-motion.mjs` is mandatory, not optional, whenever the reference has any hover
state, entrance choreography, or scroll-linked effect — this is capture-website's one
axis capture-figma structurally cannot see (Figma has no runtime): it drives real
load/hover/press/scroll interactions and samples `document.getAnimations()` (CSS/WAAPI) and
**GSAP tweens when `gsap` is on the page** via rAF polling. Also writes
`motion-environment.json` — canvas/WebGL detection and whether **tape is required** before
motion law can be marked complete. CSS-only sampling misreads canvas/GSAP sites (hard cut,
wrong overlap); Stage 2 must not finish motion law from clocks alone when
`tapeRequired: true`. Skip capture-motion only for zero observed motion (rare — record
that absence explicitly).
What Stage 1 banks:

- **Screenshots** — desktop 1440 + mobile 390, every viewport-height scroll position
  (`desktop-NN.png`, `mobile-NN.png`). Record the full mode vector per artifact:
  `viewport: desktop|mobile, theme: light|dark|no-toggle-observed`. If the site exposes
  a theme toggle or respects `prefers-color-scheme`, capture both theme states the same
  way desktop/mobile are both captured — an unrecorded theme axis is a gap, not an
  absence of the axis.
- **Computed tokens** (`tokens.json`) — `getComputedStyle` per representative element:
  tag, text, font, size, weight, tracking, leading, color, bg, radius. Rendered truth,
  not static CSS. Where feasible, also record the *declared* value alongside the
  *computed* one (e.g. via `element.style` / stylesheet lookup for `var(--x)` refs), not
  just `getComputedStyle`'s resolved pixel. A value traceable to a custom property is a
  system value; a literal in the cascade with no var() behind it is the notable finding
  — flag it the same way a raw Figma property is flagged. Serialize in a stable order
  (see "Re-capture — diff by layer" below).
- **Geometry** (`geometry.json`) — bounding rects of key modules. A dozen rects describe
  a grid better than a paragraph. Serialize in a stable order (see "Re-capture — diff by
  layer" below).
- **Motion** (`scroll.webm` + `motion-samples.json` + `motion-environment.json`) —
  `scroll.webm` is the scroll-through for human eyes and **required tape** when
  `motion-environment.json` reports `tapeRequired: true` (canvas/WebGL). `motion-samples.json`
  holds measured clocks — one row per observed animation: `construction` (`css` | `gsap`),
  `property`, `trigger`, `duration`, `curve`, `stagger`, `target`. Without samples **and**
  tape where required, motion gets invented or reduced to adjectives ("smooth", "snappy").
- **Code** — full rendered `page.html`, all stylesheets in `styles/`, script inventory
  `scripts.json`, and `design-system.json` (custom properties, breakpoints, keyframes,
  easings, font faces). The markup and CSS *are* the design system; the stack is legible
  from asset URLs.
- **Interaction states** — hover/open/active screenshots via forced CSS class injection
  (`hover-*.png`) when the reference's interactivity matters.

**Stage 2 — interpretation (you, with the evidence open):**

**Classify the reference before writing `<slug>-analysis.md`**: MARKETING (hero-led, heavy art
direction/copy-voice, sparse interaction states) vs APP/PRODUCT (dense components,
interaction states matter, thin art-direction) vs DOCS/CONTENT (typography-led, low
component variety, navigation structure matters most). Record the classification — it
decides which of the 11 layers gets the deepest read, not which layers are skipped.

Write `<slug>-analysis.md` (never `analysis.md` — ruling unique-note-names) covering the 11-layer decision stack. A reference is understood only
when every layer is read or explicitly marked *unobserved*:

1. Typography · 2. Color/surfaces (record the mode vector — `viewport: desktop|mobile,
theme: light|dark|no-toggle-observed` — each color/surface row was captured under) ·
3. Spacing · 4. Radius (observe theirs as data; we hold radius 0) · 5. Motion/transitions
(clocks from `motion-samples.json`/`style-roles.json`'s `motionVocabulary` **plus**
**motion law** in `motion-law.md` — sequencing grammar, overlap/pile, raster, type enter;
not adjectives — property, duration, curve, trigger, stagger, per entry; cite
`motion-environment.json` for engine and tape gate) · 6. Primitives ·
7. Components · 8. Patterns · 9. Blocks/sections · 10. Layout/grid (cite geometry.json
rects) · 11. Stack — framework/meta-framework/animation-library/scroll-tech, recorded as
`style-roles.json`'s `stack` object (from scripts.json bundle URLs + design-system.json),
not just named in prose

Reconstruct the **style layer**, not just flat tokens: group the raw computed values in
tokens.json into the site's *roles* — its text styles (which size/leading/tracking
combinations recur as "title", "body", "caption") and effect styles (shadows, blurs) —
and note which pairings are sanctioned vs one-off. A capture that stops at a flat token
list loses the system's intent; the styles are how its tokens are *meant* to combine.
Class names in page.html and custom-property names in design-system.json usually reveal
the site's own role names — prefer their vocabulary to invented labels.

**Serialize the style layer as `style-roles.json`, not just prose — this is mandatory,
not optional.** Run:

```
node scripts/build-reference-tokens.mjs <capture-dir> <capture-dir>/style-roles.json <name> <source-url> [MARKETING|APP|DOCS]
```

This reads the Stage 1 artifacts already banked in `<capture-dir>` (`tokens.json`,
`geometry.json`, `scripts.json`, `styles/*.css`, `motion-samples.json`) and assembles them
into `schemas/reference-tokens.schema.json` (v1) — typed rows for `typeRoles`,
`spacingScale`, `palette`, `radii`, `motionVocabulary` (declared CSS transitions/animations
merged with `motion-samples.json`'s measured ones — `observed: true` when live sampling
actually caught it firing, `declared: true` when the cascade merely states it, both when
proven), and `stack` (framework/meta-framework/animation-library/scroll-tech detection from
`scripts.json`'s bundle URLs — Next/Nuxt/Astro, React/Vue, GSAP/Framer Motion/Lenis/
ScrollMagick, or a plain CMS stack — another axis capture-figma has no equivalent of, since
it never sees a runtime or a script tag). `<slug>-analysis.md`'s prose still carries the narrative
(why it matters, the honest gaps, the soft layers) — `style-roles.json` is what lets a
script gap-compare this reference against another token set without an LLM re-reading that
prose. A capture without a `style-roles.json` sidecar is not Stage-2-complete.

**Bank `motion-law.md` — mandatory for Stage 2 when motion exists or is inferred.** Use
[references/motion-law-template.md](references/motion-law-template.md) — same shape as
[`motion`](../motion/references/LAW.md). This is **the site's design law for motion**,
not house law. Do not score the reference against JHD house motion law unless the brief
is an adopt/adapt decision. When `motion-environment.json` has `tapeRequired: true`, law
rows must cite tape; CSS-only law on a canvas site is a **defect**.

To compare a reference against JHD's own tokens (or against another reference) once both
sides have a `style-roles.json`:

```
node scripts/reference-compare.mjs <reference>/style-roles.json <jhd>/style-roles.json <out>.json [<out>.md]
```

Emits a typed gap table — type-role/spacing/palette/radius deltas plus a stack summary —
the capture-website analogue of capture-figma's `changes.jsonl` diff engine.

Work both directions and cross-check. **Top-down:** the site's declared system —
custom properties, named classes, @font-face, keyframes (design-system.json). **Bottom-up:**
the system *induced* from the rendered result — cluster tokens.json's computed values and
geometry.json's rects into recurring type roles, a spacing rhythm, component anatomies.
Where the two disagree (a declared variable never used; a rendered value with no token
behind it), that's a finding: it separates what the site's designers *intended* from what
actually ships — and bottom-up is the only direction available when a site declares no
token layer at all.

**Component anatomy** applies to captured websites too. Infer the composition tree from
repeated DOM structures — the same media-block markup recurring inside different cards/sections
signals a shared primitive. For each inferred component, record its slots/props/states and note
reuse. A reference is only fully understood when its repeating parts are named as components,
not just its pages described.

Plus the two soft layers, as data not vibes:

- **Art direction** (per key asset): lighting (hard/soft, direction), color palette *and*
  grade (separately), composition, lens/DOF, texture, mood/genre, styling level — one row
  per image/shot, with confidence.
- **Copy voice** (per page type): NN/g four tone continua scored 1–5 (funny↔serious,
  formal↔casual, respectful↔irreverent, enthusiastic↔matter-of-fact), register notes
  (who's talking to whom, written-like vs speech-like), case register, and 2–3 verbatim
  exemplar lines.

**Stage 3 — verify:** every claim in `<slug>-analysis.md` cites an artifact (screenshot name,
geometry rect, token row, CSS line). Mark each value `observed` or `inferred`; never
promote an inferred value into a system decision silently.

**Stage 4 — package:** `vault/references/<name>/` = the artifacts + `style-roles.json` +
`motion-law.md` + `<name>-analysis.md`; a sibling `<name>.md` vault reference note whose "Why it's here" cites the
folder. Brief downstream agents with the **folder path** — never a URL.

## Re-capture — diff by layer

When re-capturing a previously captured reference, diff against the banked folder rather than starting fresh. Classify each delta by the same layer logic: token value moved / role re-mapped / component re-bound / anatomy changed / one-off. A redesign and a token tweak look identical in a screenshot but demand different analysis depth. Supersede the prior `<slug>-analysis.md`, don't overwrite it silently.

Scripted artifacts (`tokens.json`, `geometry.json`) must serialize in a stable order —
sort by selector/DOM-path, not walk order — so `git diff` on a recapture shows only real
deltas from reorder churn. If capture.mjs doesn't already guarantee this, treat
non-deterministic ordering as a script defect to fix before trusting a diff.

## Division of labor

- **Orchestrator** (real browser / can run scripts): runs Stage 1, writes Stages 2–3.
- **Designer/engineer agents**: consume the folder; never asked to "look at" a URL.
- **Researcher**: only when the question is about the market/tools — research ≠ rendering.

## House rules that survive every capture

- Their radius/system values are *observations*, never precedents — no radius exceptions.
- No provenance in downstream specs: the spec states the rule ("UI screens sit inset on
  black panels"), the reference note holds the attribution.
- Verbatim copy is extracted, not paraphrased.
