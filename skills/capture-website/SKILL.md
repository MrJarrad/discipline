---
name: capture-website
description: Capture a live website design reference into a self-contained local folder (pixels + computed tokens + geometry + code + motion + art-direction/copy-voice analysis) that non-browsing agents can Read. Use when adding a design reference, when an agent needs to "look at" a URL, or when a layout/motion claim needs ground truth. Not for Figma files — that's capture-figma; not for auditing your own build — that's audit-build.
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
node scripts/capture.mjs <url> <out-dir>        # screenshots, tokens, geometry, motion
node scripts/capture-code.mjs <url> <out-dir>   # page.html, styles/, scripts.json, design-system.json
```

Requires `playwright` (`npm i -D playwright` anywhere; scripts resolve it from cwd).
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
- **Motion** (`scroll.webm`) — recorded scroll-through; without it, motion gets invented.
- **Code** — full rendered `page.html`, all stylesheets in `styles/`, script inventory
  `scripts.json`, and `design-system.json` (custom properties, breakpoints, keyframes,
  easings, font faces). The markup and CSS *are* the design system; the stack is legible
  from asset URLs.
- **Interaction states** — hover/open/active screenshots via forced CSS class injection
  (`hover-*.png`) when the reference's interactivity matters.

**Stage 2 — interpretation (you, with the evidence open):**

**Classify the reference before writing analysis.md**: MARKETING (hero-led, heavy art
direction/copy-voice, sparse interaction states) vs APP/PRODUCT (dense components,
interaction states matter, thin art-direction) vs DOCS/CONTENT (typography-led, low
component variety, navigation structure matters most). Record the classification — it
decides which of the 11 layers gets the deepest read, not which layers are skipped.

Write `analysis.md` covering the 11-layer decision stack. A reference is understood only
when every layer is read or explicitly marked *unobserved*:

1. Typography · 2. Color/surfaces (record the mode vector — `viewport: desktop|mobile,
theme: light|dark|no-toggle-observed` — each color/surface row was captured under) ·
3. Spacing · 4. Radius (observe theirs as data; we hold radius 0) · 5. Motion/transitions
(durations + easings from design-system.json, not adjectives) · 6. Primitives ·
7. Components · 8. Patterns · 9. Blocks/sections · 10. Layout/grid (cite geometry.json
rects) · 11. Stack (from scripts.json/asset URLs)

Reconstruct the **style layer**, not just flat tokens: group the raw computed values in
tokens.json into the site's *roles* — its text styles (which size/leading/tracking
combinations recur as "title", "body", "caption") and effect styles (shadows, blurs) —
and note which pairings are sanctioned vs one-off. A capture that stops at a flat token
list loses the system's intent; the styles are how its tokens are *meant* to combine.
Class names in page.html and custom-property names in design-system.json usually reveal
the site's own role names — prefer their vocabulary to invented labels.

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

**Stage 3 — verify:** every claim in `analysis.md` cites an artifact (screenshot name,
geometry rect, token row, CSS line). Mark each value `observed` or `inferred`; never
promote an inferred value into a system decision silently.

**Stage 4 — package:** `vault/references/<name>/` = the artifacts + `analysis.md`;
a sibling `<name>.md` vault reference note whose "Why it's here" cites the folder. Brief
downstream agents with the **folder path** — never a URL.

## Re-capture — diff by layer

When re-capturing a previously captured reference, diff against the banked folder rather than starting fresh. Classify each delta by the same layer logic: token value moved / role re-mapped / component re-bound / anatomy changed / one-off. A redesign and a token tweak look identical in a screenshot but demand different analysis depth. Supersede the prior analysis.md, don't overwrite it silently.

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
