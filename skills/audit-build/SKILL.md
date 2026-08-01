---
name: audit-build
description: Verify a built page matches its design source by measuring the live DOM numerically against design symbols and producing a defect list — rects, font sizes, positions, not impressions. Use when "the blocks are off", after porting a design to code, or before visual sign-off. Not for reading the design source itself — that's capture-figma; not for capturing external references — that's capture-website.
---

# Block Fidelity Audit

"The blocks are off" rounds converge only when the comparison is numeric. Eyeballing a
screenshot against a Figma frame produces vague feedback and repeat rounds; measuring
both sides produces a defect list that closes in one pass.

## The loop

### 1. Bank the design-side numbers first
For every block under audit, from the design source (via capture-figma if not already
logged): frame dimensions, element positions within the frame (title y-offset, margins),
type sizes/leading/tracking, media aspect or height rule, alignment rules. If a design
value is unknown, mark it **unmeasured** — don't audit against a guess.

### Template frame pairs — canonical vs landing

A design template can exist as a PAIR of frames sharing a base name. Don't treat the
second frame as a duplicate to ignore — it carries facts the first frame structurally
cannot:

- **Content-hugging frame (canonical, clean name — e.g. "M - Home")**: the full-layout
  spec, sized to its content. Audit document flow, full layout, and block geometry
  against THIS frame.
- **Device-height frame (suffixed — e.g. "M - Home / landing")**: cropped to a real
  viewport height. It exists to show what the hugging frame can't render: elements
  fixed/sticky to the viewport (a mobile nav pinned to the bottom of the screen) and
  landing-fold composition (what's actually visible before scrolling).

**Name the failure mode explicitly**: an audit that reads only the canonical frame will
PASS a build whose fixed nav isn't pinned at all — the canonical frame has no viewport to
pin against, so nothing there can catch the defect. Whenever a suffixed device-height
frame exists for the template under audit, verify fixed/sticky positioning and fold
composition against IT, in addition to flow/geometry against the canonical frame. Treat
this as a required comparison, not an optional cross-check.

Capture exports carry `width`/`height` on `templateFrames`, so hugging vs device-height
frames are distinguishable straight from the artifact — the suffix is the intended
signal, the dimensions confirm it.

### 2. Measure the live DOM at the design's canonical width
Load the built page in the browser pane at the design width (e.g. 1440 desktop, 390
mobile). Extract numbers, not impressions — `getBoundingClientRect` +
`getComputedStyle` per audited element. Use the canonical measurement function below — copy
it into the browser console as-is and call it with your selector list:

```js
// Canonical measurement function — copy into browser console verbatim
const measureElements = (selectors) => {
  return selectors.flatMap(sel =>
    [...document.querySelectorAll(sel)].map(el => {
      const r = el.getBoundingClientRect(), s = getComputedStyle(el);
      return {
        selector: sel, className: el.className,
        rect: { x: Math.round(r.x), y: Math.round(r.y + scrollY), w: Math.round(r.width), h: Math.round(r.height) },
        type: { fontSize: s.fontSize, lineHeight: s.lineHeight, letterSpacing: s.letterSpacing },
        box: { padding: `${s.paddingTop} ${s.paddingRight} ${s.paddingBottom} ${s.paddingLeft}`, gap: s.gap }
      };
    })
  );
};
// Usage: copy the list of selectors and call measureElements(['.card-title', '.section-header', '.card-image'])
```

Reuse this function across audits — no need to rewrite it each time. Screenshots are for
composition checks only, after the numbers agree.

### 3. Diff into a defect list
One row per mismatch: **block · property · design value · built value · fix**. Convert
design px to the system's tokens when stating the fix (64px title → text-800, not
`font-size: 64px`). Rules that recur across blocks get promoted to a cross-cutting entry
(e.g. "subtitles sit at the 50% column on desktop", "blocks bleed, cards don't") so the
fix lands once, in the system.

### 4. Fix, then re-measure
Apply fixes, reload, re-run the same extraction, confirm each defect row reads within
tolerance (±2px for positions, exact for tokens/type steps). A defect is closed by a
number, not by "looks right now". Anything intentionally divergent from the design is
recorded as a flagged deviation, not silently left.

## Tolerances and traps

- **Scale first**: confirm viewport width and zoom before comparing — a mismatched width
  invalidates every number.
- **Percent line-heights**: design tools state leading as % (105 = 1.05); compare against
  computed px, converting explicitly.
- **Aspect vs height rule**: a media block may be governed by an aspect ratio *or* a
  viewport-height stop — check which before calling its size wrong.
- **Restraint check**: if the built value uses a larger ramp step than any design template
  uses, that's a defect even if it "looks fine" — templates set the ceiling.

## Mechanism, not lookalike

Pixel-identical values are necessary but insufficient for fidelity. Audit **how** a value is
produced — whether it's a spacer component vs baked padding, a style binding vs hardcoded size,
a grid span vs computed width. A build can render pixel-identical while encoding the wrong
mechanism; the divergence surfaces at the next design change. **Real case:** split rows measured
correctly via baked padding, but the design's mechanism was spacer components as data — when
the next composition reused those rows, the encoded padding broke the composition's spacing
logic. **Record mechanism mismatches in the defect table** as "design mechanism · code mechanism
· refactor target" — fixes are structural, not cosmetic.

## Names are audited too

Fidelity includes vocabulary — audit component names, prop/variant names, and token names
against the design source, one row per mismatch (design name · code name · rename target),
same defect table treatment as pixel values; a value-perfect build with renamed parts still
fails the audit because renames hide future drift and break the 1:1 designer-developer language.

## Output

The defect list (with fix column) plus the re-measured confirmation. If the audit is part
of a review, unresolved deviations route to the operator as creative calls — never
self-approved.
