# capture-figma — steps 1-4, the layer model and the tool-call order

The operator rulings from the 2026-07-25 training sessions: the architecture read, pages/assets/variables/styles, sections and frames, frames pt2 and components, the four-layer model, the within-Step-2 tool-call order, component anatomy, reading a page layout, and the both-directions cross-check. Nothing here was rewritten — it is the 1.78.0 SKILL.md body, moved.

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
   `body/1200`'s dropped-zero `13` (should be `130`) survives unnoticed. Capture flags every
   raw-valued style property as a review
   candidate (deliberate-or-drift), to be ruled by the operator, not silently accepted or
   silently "fixed." Style names are path-composed from their group (`title` + `200` →
   `title/200`).
4. **Variables vs styles — the confirmed model.** Variables define single values. Styles
   compose values into recipes and may consume variables per-property. Components consume
   both. Assets publish components. Pages organize everything into meaning. This is the
   dependency chain, not an execution order — the file's execution order is Steps 1-4
   below (architecture, then this step's surfaces, then sections/frames/modes, then
   components/bindings); "The order" further down sequences the specific tool calls that
   happen *within* this step.
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
8. **Semantics are mapped to variables — follow the trail.** A step's semantic truth is
   never one layer; it's the full chain: named STYLE → its bound VARIABLE(s) → per-mode
   alias → PRIMITIVE value. Reading any single layer alone misleads — raw style numbers
   look authoritative but can be stale snapshots; a bare variable ramp can be mid-churn;
   primitives alone carry no naming intent. Walk all four links before recording a value.
   **Both-directions rule:** a step exists only if the STYLE exists — a variable with no
   style behind it (an orphaned `500`/`600` ramp step, say) is plumbing or churn, not a
   real step, and code must never bind to it. Conversely a style with a raw property where
   a binding is expected is its own finding (ruling 3, above) — the two directions catch
   different defects. **Break taxonomy**, three kinds, name which one on sight:
   - *Dangling* — a bound property resolves to a raw `VariableID:` instead of a name; the
     variable it points at either doesn't exist in this capture's scope or was deleted.
   - *Raw-where-bound-expected* — a property that should be system-governed (matches its
     sibling properties' binding pattern) holds a hardcoded number instead.
   - *Style-variable disagreement* — the style's own raw value and its bound variable's
     resolved value (at the style's own mode) don't match; also record if two properties
     on one step bind through different chain depths (one direct-to-primitive, one through
     a mode-responsive alias) — same step, inconsistent trail, a break worth naming even
     when both ends individually resolve.
   Every break is a finding to record precisely (which link broke, old vs new if churn
   explains it), never noise to average away.

## Step 3: sections and frames — before variant capture

Operator rulings, training session 2026-07-25 (JHD-Spec-DesignSystem: Examples 2096:1454,
Text 3044:33252, Card – Media 3044:29873; frame panels for D - Home and M - Home; CardMedia
component internals — Content frame wrapping Media + `.Base-CardMediaHeader`; row frames
title/subtitle-primary/body/action with spacers; variant states default/hovered/disabled).
These fix how the container layers between page and component get read.

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
5. **Mode pins are per collection — the context is a vector, not a scalar.** A frame doesn't
   pin one mode, it pins one mode per variable collection it participates in: a frame can
   simultaneously carry layout `lg` AND color `dark` AND any other collection's mode, each
   pinned or left "Auto" (inherited) independently. Capture the full mode vector for a frame,
   not just the badge that happens to be visible — `layout:lg, color:dark` is a different
   context from `layout:lg, color:light` even though the layout pin is identical. Value
   resolution and delta comparisons key on **variable + full mode vector**; comparing two
   frames' values without matching every collection in the vector is comparing apples to a
   different fruit, not flagging drift.
6. **Frame duality.** The outermost frame is Figma's `<body>` — the screen. Frames nested
   inside frames are `<div>`s. Same node type; the role is positional, not intrinsic. A frame
   read names which role it's reading.
7. **The composition ladder is a coding contract.** Finished layouts/pages assemble BLOCKS
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

## The order — the tool-call sequence within Step 2, never skip a stage

This is not a competing top-level order — Step 1's architecture read has already
happened by the time this sequence starts. Within the surfaces Step 2 covers
(variables, styles, metadata, screenshots), run the tool calls in this order:

### 1. Variables first — `get_variable_defs`
The token graph is the truth. Run it on a representative component node, after the
Step 1 architecture read and before looking at anything else. It yields the values
screenshots can only approximate:
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

### Dual read — bank a render beside the structured capture

The structured capture (JSON — variables, metadata, bindings) is never the whole evidence
record. Every capture also banks a **PNG render** of the captured target in the same
capture folder as its JSON, taken at the same point in the sequence as Step 4's
screenshots (after variables/styles/metadata, once real dimensions are in hand).

- **Scope — top-level frame plus named components, never an exhaustive sweep.** Render the
  page's top-level frame, and any component the dispatch brief names explicitly by name or
  node id. This is NOT a per-component sweep of every instance on the page — rendering
  everything wastes calls and buries the evidence that matters under scenery nobody asked
  to verify.
- **Render path, in preference order:**
  1. **Figma MCP `get_screenshot`** when the session has it (Mac desktop MCP bridge) — the
     same tool Step 4 already uses for composition/copy reads.
  2. **Figma REST images endpoint** when `FIGMA_TOKEN` is available (Cloud Environment
     secret) and the MCP tool isn't: `GET https://api.figma.com/v1/images/:file_key?ids=<node-id>&format=png&scale=2` —
     equivalent to `scripts/figma-node.mjs image <fileKey> <nodeId>` (see the REST node
     lane above).
- **Naming — same stem as the JSON, `.png` suffix.** `<frame-slug>.json` →
  `<frame-slug>.png`. A brief-named component's render appends the component slug:
  `<frame-slug>--<component-slug>.png`.
- **Evidence contract — both channels, always.** Reviewer and UX Designer read BOTH the
  JSON and the render: the JSON carries name/prop/token parity, the render carries visual
  parity. A visual-parity claim citing only the JSON is incomplete evidence — treat it the
  same as an unverified claim under the Verification rule above. Doers producing capture
  output must bank the render before handing the capture off; consumers checking visual
  parity must open the render, not infer it from the JSON.

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