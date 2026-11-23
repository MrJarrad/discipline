# What Stage 1 banks

Moved verbatim from `skills/capture-website/SKILL.md` (DISC-351 step 8); the skill points here.

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
