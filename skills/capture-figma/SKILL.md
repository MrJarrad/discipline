---
name: capture-figma
description: Read a Figma file into buildable truth — variables first, metadata second, screenshots last — without misreading sizes, aspects, or tracking. Use when extracting tokens, block anatomy, variant matrices, or copy from any Figma file, or when a Figma read needs to drive code. Not for capturing live websites — that's capture-website; not for auditing built pages against Figma — that's audit-build.
---

# Figma Extraction

Figma reads misfire when they start from pixels. Screenshots invite guessing — a hero
read as "5:4" that was actually screen-height stops, a tracking value eyeballed wrong, a
subtitle size inferred a step too large. Each misread costs a full correction round in the
build. The fix is an order of operations: **numbers before pictures.**

## Step 1: architecture read — before any value capture

Values mean nothing against no skeleton. Before touching variables, styles, components,
or screenshots, read the file's shape.

1. **Anatomy first.** Walk pages in canvas order (order is meaning — the author sequenced
   them on purpose), then frames per page, component sets with their variant counts, style
   inventories by type, and variable collections with modes where available. This is the
   skeleton; values captured against it are legible, values captured without it are noise.
2. **Classify the archetype.** From the anatomy, name the file **PRODUCER** (defines the
   system: layer-ramp pages, deep variant sets, canonical styles/variables, a published
   library) or **CONSUMER** (assembles from one: thin local vocabulary, a heavy remote
   component index, one or more deliverable pages plus exploration/scratch pages). Record
   the archetype explicitly in the capture artifact — it decides how every later layer gets
   read.
3. **Library manifest.** Foreign content is provenance, not contamination — copy-pasted
   material routinely drags another file's styles, components, and variables along, and
   that's normal. Record each library's state in the file: created-in-file / added-and-used
   / used-but-not-added / missing-entirely. Style/component counts only mean something
   **per page role**: a foreign binding on a deliverable page is a finding; the same binding
   on an exploration/scratch page is scenery — never flag it.
4. **Contract surface.** For a consumer file, the contract surface is whichever
   canonical-library components and styles the **deliverable** pages bind — that's the
   audit scope. Exploration pages are out of scope by default; don't spend extraction effort
   auditing them unless the operator asks.
5. **Name human-first.** Capture artifacts and all prose name files human-name-first with the
   key in parentheses — e.g. "JHD-Spec-DesignSystem (arJSACOFZmIi5rFGlxXoi0)"; never key-only.

## Step 2: pages, assets, variables, styles — before component capture

Operator rulings, training session 2026-07-25. These fix how names, assets, and styles get
recorded once the architecture read is in hand and before the deeper layers get walked.

1. **Names are paths.** A bare name is ambiguous — "Blocks" can be a page, an assets group,
   and casual vocabulary all at once. Capture artifacts and findings always qualify a name by
   its container path (Page / Frame / Set / Component), never a bare name where a path exists.
   Pages are the namespace and the primary finding surface for information about a file.
2. **Assets mirror authoring.** The Assets browse hierarchy is the same tree as page → frame
   containment: "Created in this file" groups by page, and each drill-in section is that page's
   frames. The spatial authoring IS the consumer catalog — one structure, two views, not two
   systems to reconcile. Dot-prefixed components (`.Name`) are private parts; Figma collects
   them under a "Hidden" group and they never publish — don't extract them as if they did.
3. **Styles are partially-bound recipes.** Record per-property binding status inside each
   style — which properties bind variables (e.g. font-family → `text/title/font-family`,
   weight → `weight/strong`) and which hold RAW values (e.g. size 40, line-height 105%,
   letter-spacing -0.75 in `title/200`). Raw properties inside styles are prime drift/defect
   territory — no variable guardrail sits behind them, which is how a line-height typo like
   80/13 survives unnoticed. Capture flags every raw-valued style property as a review
   candidate (deliberate-or-drift), to be ruled by the operator, not silently accepted or
   silently "fixed." Style names are path-composed from their group (`title` + `200` →
   `title/200`).
4. **Variables vs styles — the confirmed model.** Variables define single values. Styles
   compose values into recipes and may consume variables per-property. Components consume
   both. Assets publish components. Pages organize everything into meaning. Read the layers
   in this order when capturing — each one is the substrate the next is built from.
5. **The recipe model is universal.** All four style types — text, color/fill, effect, and
   layout-guide/grid — share one anatomy: name + description + properties, each property
   either variable-bound or raw. Effect `material-blur-100` binds radius to `blur-100`;
   `border-focused` binds shadow color to `color/border/focused/*` but holds spread `2` raw;
   layout guide "default" is a grid recipe (12 col, stretch, margin 48, gutter 48).
   Per-property binding status (ruling 3, above) is capture signal for every style type, not
   just text.
6. **Variable = scalar, style = composite.** Styles hold what variables structurally cannot:
   multi-stop gradients (`social/instagram` — 3-stop linear), stacked effects
   (`drop-shadow-100` — 5-layer stack), grid definitions. When a "variable" for such a thing
   comes back empty (`social/instagram` returned `""` in a variable pull), the real value
   lives in the style — capture must join both before declaring a value missing.
7. **Descriptions are the in-file documentation surface.** Variable and style description
   fields carry derivation recipes and intent (per the alpha-quantization ruling). Empty
   descriptions are a countable documentation-gap finding class — capture reports the count
   per collection/style group, never judges individual gaps.

## Step 3: sections and frames — before variant capture

Operator rulings, training session 2026-07-25 (JHD-Spec-DesignSystem: Examples 2096:1454,
Text 3044:33252, Card – Media 3044:29873; frame panels for D - Home and M - Home). These fix
how the container layers between page and component get read.

1. **Sections are optional organization.** The path runs Page → Section(s) → Frame/
   ComponentSet when a section is present; sections nest (chapters/sub-chapters), and a
   "`<Component>` Primitives" sibling section shelves private parts alongside the component
   they belong to. Files without sections are normal — don't infer a missing layer where the
   author never authored one. Sections carry a dev-status field, but in this practice that
   status is **data to record, never a workflow signal** — don't infer build-readiness from
   it.
2. **Frames are Figma's HTML body.** A frame is an ordered content model: children
   (components, frames) sit in authored order under auto-layout flow, and that order IS the
   composition — D - Home reads HeroText, then 11 SplitAsymmetric rows, then
   NavigationHeader, gap 0. Reading a frame means capturing children-in-order **plus**
   property bindings **plus** mode assignments — any one alone is a partial read.
3. **Frame properties bind variables.** Width binds to `device/width`, height to
   `device/screen-height/*`, fill to a semantic color, and a layout-guide style attaches for
   grid. A raw dimension on a frame is the anomaly worth flagging — but an authored raw
   exception can carry real meaning: M - Home's padding-bottom 96 is mobile nav clearance,
   the Figma twin of the code's body `pb-32` pairing. Report the raw value and the meaning
   together; don't flag it as drift without checking for one.
4. **Frames are mode contexts.** A frame pins variable-collection modes via its Appearance
   property (e.g. layout: `lg` / `sm`; observed mode list: `lg`, `sm`, `md`, `xl`, `lg-flush`,
   `sm-flush`, `md-flush`, `xl-flush`, `lg-sidebar-main`, `lg-sidebar-main-flush`), and every
   descendant resolves its variables through that pinned mode — a badge reading `lg`/`sm` is
   explicit, "Auto" means inherited from the frame. The `D -` / `M -` name prefix is the
   human label for the pinned mode. **Every value capture must record the mode context it was
   read in.** A value that differs across two frames for the same variable is mode
   resolution, not drift — check the pinned mode before calling it a discrepancy.
4b. **Mode pins are per collection — the context is a vector, not a scalar.** A frame doesn't
   pin one mode, it pins one mode per variable collection it participates in: a frame can
   simultaneously carry layout `lg` AND color `dark` AND any other collection's mode, each
   pinned or left "Auto" (inherited) independently. Capture the full mode vector for a frame,
   not just the badge that happens to be visible — `layout:lg, color:dark` is a different
   context from `layout:lg, color:light` even though the layout pin is identical. Value
   resolution and delta comparisons key on **variable + full mode vector**; comparing two
   frames' values without matching every collection in the vector is comparing apples to a
   different fruit, not flagging drift.

Operator rulings, training session 2026-07-25 (evidence: CardMedia component internals —
Content frame wrapping Media + `.Base-CardMediaHeader`; row frames title/subtitle-primary/
body/action with spacers; variant states default/hovered/disabled).

5. **Frame duality.** The outermost frame is Figma's `<body>` — the screen. Frames nested
   inside frames are `<div>`s. Same node type; the role is positional, not intrinsic. A frame
   read names which role it's reading.
6. **The composition ladder is a coding contract.** Finished layouts/pages assemble BLOCKS
   ONLY — a coded page reads as a sequence of blocks, nothing finer. Components are
   legitimately composed of frames (divs), elements, and other components — fine-grained
   structure belongs inside components. Audit rule: a raw frame or bare element at page level
   is a composition violation; the identical structure inside a component is anatomy, not a
   finding.

## Step 4: frames pt2 and components — before variant capture

Operator rulings, training session 2026-07-25 (evidence: HeroText instance 3913:51049 vs
identical plain frame 3913:51073; SpaceVertical variant panels; HeroText instance prop
panel). These fix how a frame's node type and a component's props get read.

1. **A component is a frame converted and published.** Conversion grants two things a
   plain frame never has: **library identity** (instances stay linked, receive updates,
   appear in Assets) and a **props API**. Node TYPE is the only truth-teller — a plain
   FRAME carrying a published component's name, with identical internals, is a detached
   copy or hand-build: inert, update-orphaned. Name-matches-component + type=FRAME is its
   own flagged finding class; don't wave it through because the visuals match.
2. **The props API is the component's public interface** — read it like coded prop types.
   Variant props (`device=desktop`, `height=medium`), boolean props wired to structure
   (`has-spacer-top` toggles whether the SpacerTop layer exists at all), text props, and
   **nested exposed props** (a child's `TextTitle size=200` surfaced through the parent)
   all belong to this surface. Instances distinguish overrides from inherited defaults —
   capture records both, not just the resolved value.
3. **Universal property-reading rule — applies to every layer, component or not.** A
   property is read by its **binding chain**, never its endpoint number: raw value ←
   variable binding (H bound to `space-300`, resolving 48) ← prop binding (visibility
   bound to `has-spacer-top`) ← mode context (the frame's mode vector). Capture records
   the chain, not the number alone — "48" hand-typed and "space-300 → 48" are different
   facts, and a truly raw value on a system property is the notable finding, not the
   default reading.

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

### Component anatomy

A COMPONENT_SET is a container holding two things, never mixed:

1. **The props schema** — typed, defaulted. VARIANT props carry an option list;
   BOOLEAN/TEXT props carry internal id suffixes in the data (`#153:0`) that VARIANT props
   don't — that suffix is how you tell the two apart when reading raw metadata.
2. **The variant matrix** — COMPONENT children, one per combination (e.g. `device` ×
   `height` = 12 for HeroText).

**Variant names are prop equations, not labels.** `device=desktop, height=medium` is
structured data — parse each set-child's name into a prop-value record; never treat it as
a display string. Variants pin their mode (a `device=mobile` variant carries `sm`) — the
variant matrix IS the mode matrix, made concrete.

**Variant internals are the composition ladder in miniature.** Inside one variant you'll
find: instances of smaller components (a spacer is a `SpaceVertical` instance — spacing is
componentized, not padding), frames standing in for divs (a `wrapper` frame holds the
bound layout grid; a `Content` frame holds bound `maxWidth`/`minHeight`/padding), and zero
unbound properties — every level resolves through variables (`boundVariables` on fills,
size, grids, padding). If a value isn't bound, that's drift, not a legitimate leaf.

**An instance is a pointer + prop record**, nothing more: `componentId` + prop values (+
overrides vs defaults). It contributes no structure of its own. Read definitions once, at
the source; read instances only as prop records against that definition.

### Reading a page layout

A page layout is read as a **contract**, not a picture — four passes, in order:

1. **Context**: the body frame's mode vector + its own property bindings (+ authored raw
   exceptions) — nothing below is interpretable without it.
2. **Composition**: children in order, blocks only at page level; the ordered block list
   IS the layout; non-block children at this level are composition violations.
3. **Blocks as instances**: read each block's props (variants, booleans, text, nested
   exposed props; overrides vs defaults), never re-derive internals — those belong to the
   component definition, read once, elsewhere.
4. **Values as chains**: every surfaced number recorded as token → value (in mode), so
   audits compare derivations, not pixels, and a token change diffs as one named change.

A layout so captured = mode vector + ordered block sequence + prop tables — small,
diffable, re-renderable; the Figma page and the coded page (e.g. a `home-layout.ts`) are
two serializations of the same structured data, and conformance is record-by-record
comparison.

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

## Recapture and change tracking

A capture that can't be compared to the next one is half-done. Recapture discipline
turns a snapshot into a changelog — using only the MCP tools, on any Figma file.

1. **Pin every capture.** The MCP surface has no version-list endpoint, so pin with
   what it does give you: record in the capture document's frontmatter the capture
   datetime (`get_metadata`/`get_design_context` run time) and, when the operator has
   named a meaningful stop in Figma's version history, that operator-named version
   label. A capture without a recorded datetime cannot be compared later — it's a
   photo with no timestamp.

2. **Stable paths, updated in place.** A capture for a given file/system lives at ONE
   vault path forever; recaptures overwrite it. Git is the diff engine — the vault
   commit history IS the change log. Never write `capture-v2.md` side-by-side files;
   that forks the log instead of extending it.

3. **Scope before recapturing.** Ask the operator (or check the observation log) what
   changed since the last capture, and recapture only the affected layers (variables/
   styles/components/blocks) — not blindly everything. Named versions from the
   operator are the strongest signal; encourage the operator to name versions at
   meaningful stops so scoping has something reliable to key off.

4. **Diff on names, not node ids.** Node-id stability across restructures is unverified;
   the 1:1 naming contract (see above) makes names the reliable diff key. Normalize
   captures so ordering is deterministic — sort token lists, variant matrices
   alphabetically — otherwise reorder churn drowns the real deltas in noise. This
   deterministic ordering is authoring discipline: write the capture document sorted,
   every time, so `git diff` output stays clean.

5. **The delta report.** After a recapture, run `git diff` on the capture path — that
   IS the diff engine here — and write the human summary of what changed (added/
   removed/renamed tokens, changed values with old→new, new variants) into the
   capture's changelog section or the commit message — downstream build tasks are cut
   from that delta, not from re-reading the whole file.

**Caveats:**
- Dev Mode "Compare changes" and branch review are UI-only — human review aids, not
  pipeline inputs.
- Starter-plan files have 30-day version retention in Figma's own history — a
  comparison window there can silently expire; the vault's git history does not.

**Supplementary mechanics:** if the flux-discipline plugin's `scripts/figma-capture.mjs`
and a `FIGMA_TOKEN` are available, use it for true REST version pinning —
`versions` to list real version ids, `snapshot --version <id>` to pin a capture to
one, `delta` to structurally diff two normalized snapshots — but this skill never
depends on it; the steps above are complete and self-sufficient on their own.
