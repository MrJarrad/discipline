---
name: capture-figma
description: Read a Figma file into buildable truth — variables first, metadata second, screenshots last — without misreading sizes, aspects, or tracking. Use when extracting tokens, block anatomy, variant matrices, or copy from any Figma file, or when a Figma read needs to drive code. Not for capturing live websites — that's capture-website; not for auditing built pages against Figma — that's block-fidelity-audit.
---

# Figma Extraction

Figma reads misfire when they start from pixels. Screenshots invite guessing — a hero
read as "5:4" that was actually screen-height stops, a tracking value eyeballed wrong, a
subtitle size inferred a step too large. Each misread costs a full correction round in the
build. The fix is an order of operations: **numbers before pictures.**

## The layer model — a design system is four layers, read all four

A Figma design system is not a flat token list. Extraction is complete only when every
layer is read (or explicitly marked unobserved):

1. **Variables** — the tokens, at two levels: **base** (numeric primitives — the ramp) and
   **semantic** (named roles referencing base). **Modes** on variables do systemic work:
   breakpoint changes, size modifiers for actions/buttons/icons. A value read without its
   level and mode is half-read.
2. **Styles** — named groupings of variables into applied roles: **text styles** (title,
   subtitle, body, caption — often in two sets: the primitives ramp AND the final intended
   set) and **effect styles** (shadows, blurs). Styles are the system's *intended pairings*
   — a token list without the styles layer loses which combinations are sanctioned.
3. **Components** — how variables + styles pair on the canvas into reusable parts, with
   variant matrices as the data model.
4. **Blocks/templates** — how components compose into page-level modules.

### Variables are also props

A variable group is often a component prop's value **domain**: each variant prop binds
to a token from one group. HeroText's `height` variant (half | medium | tall | full-height)
binds `min-height` to `device/screen-height` (md=50% | lg=70% | xl=90% | full=100% viewport).
Modes resolve one token differently per device, so a single prop→token binding carries the
entire responsive behavior.

**Extraction consequence:** capture *which* variable group each variant binds to — select
an instance and inspect the bound variable on the property, not just px. The group is the
prop's meaning; px is one mode's value. A variant with hardcoded values (no bound variable)
is canvas drift — report it via the both-directions cross-check.

### Anatomy — components are composition trees

A component is a **tree of sub-components**, not a leaf. CardMedia = a media element + a header
element; the media element is itself a component reused across many components/blocks; the header
is a component with its own props. Extraction must walk the tree.

In Figma, shared primitives are usually **dot-prefixed** (`.Media`, `.Base-CardMediaHeader`,
`.ActionButtonTitle`) — the dot marks a private/base component. For each level, record what it
is composed **of** and the props/states **at that level**: header `state=default|subtitle` is a
different axis from card `state=default|hovered|disabled`.

**Reuse mapping:** when the same primitive appears under multiple components, record the reuse —
ONE code component serves them all, and a change propagates everywhere. **Build consequence:**
mirror the tree in code — a composed Figma component gets a composed code component
(CardMediaHeader as its own piece), never flattened. Flattening breaks the propagation the
design system is built for.

### Names are part of the contract

Naming aligns 1:1 between the design system and code — component names, prop names, variant
values, token paths, style role names. The design system's vocabulary IS the shared language;
code that renames (Button for the Action family, ProjectCard for CardMedia) forces permanent
translation and hides drift.

**Extraction consequence:** capture names VERBATIM at every level (component, primitive, prop,
variant value, variable path, style name) — never paraphrase or "improve" a name. A name you
dislike is a finding to raise with the operator, not a thing to silently rename in code.

**Build consequence:** code mirrors the names — CardMedia stays CardMedia, size values stay
100|200|300, layout enums stay the Figma values (half | split-media | full).

## The order — never skip a stage

### 1. Variables first — `get_variable_defs`
The token graph is the truth. Run it on a representative component node before looking at
anything. It yields the values screenshots can only approximate:
- exact type sizes, line-heights (often **percent** — 105 = 1.05), tracking in px, weights, family
- spacing/padding/grid tokens (page padding, col-span widths, space steps)
- component dimensions (button height, border widths, radii)
- semantic device values — e.g. `device/screen-height/full 720` means hero heights are
  **viewport-height stops, not aspect ratios**. A screenshot cannot tell you this; a
  variable can.
- record each variable's **level** (base vs semantic) and any **modes** with per-mode values.

### 2. Styles second — the styles panel
Walk the local styles list (screenshot the styles panel if no API surface reaches it):
- every **text style** with the variables it binds (size/leading/tracking/weight) — and
  note *which set* it belongs to (primitives vs the final intended set; extract both,
  build to the final set).
- every **effect style** (shadow, blur) with values.
- If a style's resolved value conflicts with a variable, record the conflict and flag it
  for the operator — don't silently pick one. (Precedent: subtitle 16 in the styles panel
  vs 20 in variables — the variable won, but only after the operator ruled.)

### 3. Metadata third — `get_metadata`
Structure and the variant space:
- node ids, names, and **exact frame dimensions** of every block instance on a page —
  measure anatomy from these numbers (a title block at y≈280 in a 1393-tall frame is a
  measurement, not an impression)
- component **variant matrices** (props × values). The variant enum IS the data model —
  re-express your build's props as the named variants, don't invent an ad-hoc scheme.

### 4. Screenshots last — `get_screenshot`
Only for what numbers can't carry: composition, art direction, copy (extract **verbatim**,
never paraphrase), and layout relationships. By now you have real dimensions, so annotate
what you see with them instead of estimating.

## Both directions — top-down and bottom-up

The four layers can be read in either direction, and a complete extraction runs both:

- **Top-down** (variables → styles → components → blocks): the stages above. Works when
  the file's system layer is well-maintained.
- **Bottom-up** (reverse-engineer the system from a finished block/layout/page): measure
  the final surfaces and *induce* the layers — cluster the recurring type
  size/leading/tracking combinations into implied text styles; recurring gaps/paddings
  into an implied spacing scale; recurring pairings into implied components. Required
  when the file has detached/hardcoded values, when only templates are shared, or when
  checking whether the canvas actually *follows* its own declared system.

The cross-check is the point: values induced bottom-up that don't exist in the declared
variables/styles are either drift on the canvas or gaps in the system — surface each as
a finding (which one it is decides who fixes what). A one-direction read can't see them.

## Updates — classify the delta by layer

A design system changes continuously; re-extraction's first job is classifying WHAT moved, because each kind implies a different code change:

1. **Primitive value changed** (dimension-800: 24→28) → one token edit in code; flows everywhere automatically. Largest blast radius, smallest diff.
2. **Semantic re-mapped** (font-size-default re-points size/600→size/700; subtitle-default 16→20) → one alias edit; consumers of the alias move, consumers of the raw primitive don't.
3. **Binding changed** (a component now uses subtitle/300 instead of /200, or size-100 buttons instead of size-200) → a component edit; nothing else moves. WARNING from a real misread: different components binding different values of one alias can look like drift or migration when it is actually a variant/mode axis — check the variant/mode dimension before diagnosing (the button-height 28-vs-40 case).
4. **Anatomy/variant changed** (sub-component added/removed, variant axis grown, elements deleted — the Pagination label removal) → component refactor.
5. **Canvas-only override** (an instance detached from the system) → drift: fix the file, not the code.

Procedure: diff the current read against the banked observation log (that's what the log is FOR — never re-extract into a vacuum); name the layer per delta; record supersessions in the log (ADDENDUM style) so the next reader inherits the lineage.

## Operating constraints

- **Active-tab constraint**: the Figma MCP reads the active desktop tab. Switch tabs
  yourself via computer-use (screenshot the Figma window, click the target tab, confirm,
  then extract) — it is self-serve; never ask the operator to switch.
- **Node ids**: log every node id you visit next to what you observed. Re-walks are cheap
  when ids are banked; expensive when they're not.
- **Cropped previews**: if a symbol preview is cropped (tall desktop variants), say so and
  mark the value unresolved — propose a value and flag it for tune, don't present it as read.
- **Annotation pins are invisible to extraction** — verified 2026-07-20: Figma annotations appear in none of the MCP surfaces (metadata, screenshots, design context). Machine-readable intent lives in names, props (including booleans like has-description), variant axes, and variable bindings — those all travel. Prose-only rules go in the vault observation log via the operator; never assume a pin was seen.

## Translate, never transcribe

Figma px values are inputs to the *system*, not literals for the code. The build speaks
tokens: map a measured 64px title to the nearest ramp step (text-800), a 76px nav to the
system's height token, a 105% line-height to the coded title leading. When a measured
value falls between steps, that's a finding to surface — either the ramp grows or the
design snaps — never a hardcoded exception. Same for behavior: a 1280-wide frame showing a
full-bleed image translates to the block's `flush` prop, not `width: 1280px`.

## Output of an extraction

A written observation log (vault document), containing per block: node id, measured frame
dims, anatomy with positions, the token mapping (measured → system token), variant matrix
if a component, verbatim copy, and an explicit **unobserved/unresolved list**. Claims
without a node id or variable behind them are marked as inference.

## Alpha composites — Figma's alias-with-opacity gap

Figma color variables cannot alias another variable AND apply an opacity (long-standing
platform limitation). So material/action tokens built as ink-at-opacity are stored as raw
hex8 — this is NOT canvas drift. On meeting a raw hex8: decompose it (RGB + alpha byte),
match the RGB part against the primitives, and report it as a derived token ("= content/
default/primary @ 5%"), citing the variable's description field where the recipe should
live. Quantization ruling (operator, 2026-07-22): the stated percentage governs; the hex
byte is rounding (0d = 5.098% ≈ 5%, 1a = 10.2% ≈ 10%). Never flag byte-vs-percent deltas
as mismatches, and never "correct" code percentages to byte values.
