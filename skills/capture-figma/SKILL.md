---
name: capture-figma
description: Read a Figma file into buildable truth before anything gets built or audited against it. Trigger on "match the figma", "discrepancies with figma", "fresh sync", "the figma version", a pasted figma.com URL, or any need for tokens, block anatomy, variant matrices, template layouts, or copy from a design file to drive code — variables first, metadata second, screenshots last, never misread off pixels; copy is its own mandatory audit lane, never waved through as "just content." Not for capturing live websites — that's capture-website; not for motion-tool sources (Jitter, AE, Lottie, Figma motion timelines) — that's capture-motion-source; not for auditing a built page against Figma — that's audit-build.
---

# Figma Extraction

**Who runs this:** Engineer or UX Designer on the dispatched Agent run — not the parent
orchestrator reading instance props on their behalf. Parent names file key + node id; the
doer loads this skill and reads via REST when the node id is known
(`scripts/figma-node.mjs`) precisely because desktop Figma MCP binds to the parent session
only.

## Read order — the law, before any other step

Operator, 2026-08-25, verbatim: "the anatomy is the best place [to] start when looking
at figma, the variables and all that are important and they need to be correct, but
[if] you or the agents don't understand what it all adds up to then we're setting
ourselves up to fail. like first thing is understand the layout or the component or
whatever has been pointed at. What are we building? then what's it made up of. … if
the system is flowing correctly variables and token updates should just flow pretty
simply at a global level."

Workshopped across five live test reads and operator-ratified 2026-08-26 (vault:
[[figma-read-sequence]]), this six-step sequence is the full law — it supersedes the
original three-step order, absorbing it rather than stacking a second competing order
alongside it: steps 1-2 below ARE "what are we building?", step 4 IS "what is it made
of?", and values stay last in both. Every read of a Figma target — component,
template, block, whole file — runs in this order, no matter which lane (MCP/REST/bank)
or which step below supplies the mechanics:

1. **Name & context first.** The exact node name and everything it encodes before
   opening anything: `D`/`M` prefix, page, view, `– State` suffix, mode pill,
   dot-prefix privacy, section vs frame vs component set. State what the name alone
   tells you, before any tool call past the name itself.
2. **The glance — one sentence.** From name + layer list (one cheap metadata read),
   state identity + composition inventory in a breath. Operator's ratified example,
   verbatim: "This frame is the desktop Home Gallery design in its Landing state; it
   contains a NavigationHeader, a NavigationSecondary, and a feed of SplitAsymmetric
   blocks." This reveals whether the target is composed purely of named components
   (healthy) or raw frames doing block work (a finding — see the composition ladder,
   Step 3.7) before a single pixel is measured. Pixels come second, to ground the
   glance, never first. When a Layer Brief export exists for the target (tool ladder
   rung 0, below), the glance is read off the brief's top of tree, not assembled from a
   fresh layer-list call.
3. **Place it on the opinion gradient.** Primitive / component / block / page layout
   ([[design-system-opinion-gradient]]) — the level dictates what the thing is allowed
   to mean and which truth it's read against in step 4. This is Step 1's archetype
   classification made explicit as its own numbered stop, not a step to skip because
   Step 1 "already covers it."
4. **Descend, each level against its own truth — this is "what is it made of?"** The
   anatomy: grid and composition (Step 3), per-element placement and col-spans, slots,
   sizing chains (hug/fill/fixed — Step 4's binding chain rule below), states read
   two-tier (page states as sibling frames in the bank's `exampleStructure` bucket per
   the Template-layout lane, component states as variant properties per the layer
   model's Components layer), and copy (the Copy lane) — all read as structure before
   any of it is reduced to a number. Read each level against the truth the opinion
   gradient assigns it, not a truth borrowed from an adjacent level
   ([[design-system-opinion-gradient]]):
   - *Page layouts:* blocks in order, variant + props **as authored — overrides are
     the layout's opinion, read as intent, never drift** (template-layout lane
     principle, and the opinion gradient's "per-instance overrides are not drift"
     rule); layout grid; placement with positioning intent (pinned/sticky/scrolling);
     page-tier states via sibling Example frames; M/D are ONE opinion through each
     block's device axis — divergence the device axis can't explain is a real
     inconsistency ([[design-system-opinion-gradient]] axis-ownership rule).
   - *Blocks/components:* variant axes with axis ownership (`device` = the block's
     own; every other axis = layout-facing opinion — [[design-system-opinion-gradient]]
     axis-ownership rule); every variant's layer tree, slots, sizing chain,
     effects/materials; props API as wiring (Step 4.2); text slots classified
     placeholder/real/unset-default; nested components as-placed, never re-derived
     (Step 4/"An instance is a pointer + prop record"); interaction layer (states,
     prototype reactions, motion) or explicit "none authored." When a Layer Brief export
     exists for the target (tool ladder rung 0, below), this descent is interpretation
     of the brief's per-layer lines rather than a fresh tool-walk to reconstruct the
     same tree — MCP/REST still supply what the brief doesn't carry (screenshots,
     interactions, copy classification, spot-verified binding proofs).
5. **Values last.** Variables and tokens (The order, below: variables → styles →
   metadata → screenshots) are the closing pass, not the opening one, because in a
   system that's flowing correctly a token update propagates globally and simply —
   values only mean something once 1-4 are already understood. Every dimension,
   spacing, size, or height is reported as its **bound variable name**, resolved value
   in parentheses, tagged **[proven: boundVariables]** (confirmed via REST `--raw` or
   the plugin export's own `boundVariables`) or **[inferred: emitted var()]** (only
   seen as an emitted CSS custom property, not yet confirmed against boundVariables) —
   never as a naked number ([[no-naked-px]]: "it's really important that we're picking
   up the variables, i don't ever add fix px in designs" — operator, verbatim). A
   value with no binding found either side is not neutral data: since the operator
   never authors fixed px, it's either (a) a read failure — walk deeper before
   reporting — or (b) a genuine authoring slip, a finding to surface to the operator,
   exactly like a raw hex in code. FILL/HUG computed sizing is not an unbound
   value — it's a legitimate sizing-chain outcome (Step 4's binding-chain rule), never
   confuse a computed dimension for a naked literal. **A "read" that opens with
   `get_variable_defs` and can't state what's being built or what it's made of first is
   not a design read — it's a values dump**, and gets sent back regardless of how
   accurate the numbers turn out to be.

   **Inference never convicts an unbound verdict.** `get_design_context`'s emitted code
   resolves component-internal bindings to their literal CSS output — a missing
   `var()` in emitted code is a **false negative**, not proof of an unbound value
   (proven live 2026-08-26). Before ruling anything "unbound" on a component, arbitrate
   with REST `--raw` (`scripts/figma-node.mjs node <fileKey> <nodeId> --raw`) and read
   the node's actual `boundVariables` — that is the only source that convicts. Tag
   accordingly: **[proven: boundVariables]** only once REST `--raw` (or an export
   carrying `boundVariables`) has been read directly; **[inferred: emitted var()]** for
   anything short of that — and an [inferred] tag is never itself grounds to report an
   unbound finding, only grounds to go confirm one.
6. **Relations & responsive story.** Where the target is consumed, what consumes it,
   the cross-mode narrative in prose — close every read this way, whole-file or single
   component alike.

This governs sequencing across the whole skill: steps 1-4 (name/glance/level/anatomy)
always precede step 5 (values), and within step 5 itself variable bindings come first
among values, never first overall. Tool ladder unchanged throughout (MCP first, REST
for depth/arbitration and the values-pass arbiter above, bank for modes).

## Rule zero — operator-supplied Figma renders are 2x retina, always ÷2

Any PNG the operator hands you as a design contract (a screenshot exported from Figma,
not read live through the MCP `get_screenshot`/`get_metadata` tools) is a **retina (2x)
render by default** — its pixel dimensions and every element inside it are twice the
CSS/native px value that belongs in code. **Divide every measurement taken off such a
render by 2 before it becomes a px value.** Confirm the multiplier once, cheaply, before
measuring anything: the image's own pixel width against the target's known native width
(e.g. a Figma plugin panel's `figma.showUI` width) — a 684px-wide render for a 342px-wide
panel is 2x, not a coincidence.

**Why this is rule zero, not an appendix note:** the capture-figma plugin UI shipped
**two consecutive oversized-UI rounds** (2026-07-31, then again 2026-08-01) because this
rule was applied partially each time — body text and panel width got the ÷2 treatment,
but row padding, button padding, inter-row gaps, and the count-number/count-label font
sizes were left at their retina-derived values and shipped as if they were already
native. Each round looked "corrected" by eye and still read oversized in the real plugin
window, because eyeballing proportions on a rendered mockup can't catch a numeric 2x
residual — only measuring pixels (not vibes) against the contract catches it. Treat
retina-vs-native as a checklist to run over **every sized element** (font sizes,
paddings, gaps, radii, icon/control dimensions, the container's own size) — never assume
the correction from a prior pass covered a property it didn't touch.

Figma reads misfire when they start from pixels. Screenshots invite guessing — a hero
read as "5:4" that was actually screen-height stops, a tracking value eyeballed wrong, a
subtitle size inferred a step too large. Each misread costs a full correction round in the
build. The fix is an order of operations: **numbers before pictures.**

## Cloud vs Mac (plugin sync)

- **Mac** runs the Figma Capture plugin + `capture-listener` → writes
  `~/JHD/figma-plugins/main/capture-figma/captures/live/`.
- After each sync (or when Cloud must see the tip), run
  `~/JHD/vault/main/estate/publish-captures.sh` (or flat `~/JHD/vault/estate/…`)
  which banks + pushes `estate/captures`.
- **Cloud** fleet install symlinks the captures ground → `vault/estate/captures` (`~/JHD/captures`
  no longer exists as a standalone path since the 2026-08-25 estate split). Pull vault
  before reading if a mid-session publish just landed. Taxonomy: vault `estate/capture-tools.md`.
- Live Figma without local JSON needs Environment secret **`FIGMA_TOKEN`** (REST lane).

## Lane choice — three lanes, one hierarchy

MCP, REST, and the live listener are correct at different layers — pick by what's
available and what you're reading, not by habit:

1. **Portability floor — MCP (this skill's steps below).** Works for any file, no
   dependencies beyond the Figma desktop MCP bridge (operator ruling). Every stage in
   Steps 1-4, "The order," and Recapture is written against MCP tool calls
   (`get_variable_defs`, `get_metadata`, `get_screenshot`) precisely so the skill is
   self-sufficient with nothing else installed or configured. Use this lane whenever
   `FIGMA_TOKEN` isn't available, or the target file needs a one-off, human-in-loop read.
2. **REST lane, when `FIGMA_TOKEN` exists — pinned tree/versions.** For tree/structure
   (pages, frames, components, variant matrices) and real version pinning,
   `~/JHD/figma-plugins/main/capture-figma/listener/figma-capture.mjs` (snapshot/delta)
   plus `figma-node.mjs` against the plain REST API (`depth`/`ids` omitted) is
   best-in-class: no active-tab constraint, no lazy-page gaps, real `?version=` pinning
   (research decision — the original research note did not survive the vault's
   2026-07-31 legacy purge; a fresh decision record, if this needs re-grounding, belongs
   at `projects/capture-figma/decisions/`). Use this lane for anything that needs to be
   pinned to a specific version id and diffed structurally later (`figma-capture.mjs
   versions` / `snapshot --version <id>` / `delta`). This listener family moved out of
   the discipline plugin to `~/JHD/figma-plugins/main/capture-figma/listener/` in the
   2026-08-25 estate split — the discipline plugin no longer carries its own copy.
3. **Active variables/styles/components lane — Capture Figma sync plugin.** For variables,
   styles, and component/layer-binding exports with full mode coverage, the ACTIVE exporter
   lives in **`~/JHD/figma-plugins/main/capture-figma`** at `figma-sync/` (import
   `~/JHD/figma-plugins/main/capture-figma/figma-sync/manifest.json` in Figma
   Development). Contract: `references/figma-agent-plugin-brief.md`. Each **Sync** POSTs
   the same payload to **both** the **capture-ingest** Worker
   (`~/JHD/figma-plugins/main/capture-figma/ingest-worker` → R2 + `jhd-vault`
   `estate/captures/live/`) when a Bearer is saved, and the local **capture listener**
   (`~/JHD/figma-plugins/main/capture-figma/listener/capture-listener.mjs`, `POST /capture`
   on `localhost:4411`) when it is up. Optional `CAPTURE_AUTO_PUBLISH=1` →
   `publish-captures.sh`. No Local/Remote toggle.

Ad-hoc/live-lookup: even when the REST or listener lane is the default for a file, MCP
remains the right tool for a quick live check against whatever's on screen right now —
confirming a single value, sanity-checking a pull, walking a file nobody has piped a
token for yet.

## The tool ladder — pick by what you're reading, not by habit

This replaces improvising a tool per task. Read down the ladder; stop at the first rung
that answers the question:

0. **A Layer Brief export, when one exists for the target — primary anatomy source.**
   An operator-provided or banked per-layer anatomy brief (format reference:
   `projects/capture-figma/artifacts/layer-brief-plugin/` in the vault — a Figma plugin
   that walks a frame and emits, per layer, its name/type, placed instance props, sizing
   chain, layout direction and gap/pad expressed as bound-variable NAMES inline, with
   unbound literals self-flagged rather than left to be spotted by eye) answers the
   anatomy/structure question directly — no tool-walking needed to reconstruct it. When
   one exists for the target frame or component, read-sequence Step 2 (the glance) and
   Step 4 (the descent) become **interpretation of the brief**, not a sequence of MCP/REST
   calls to assemble the same picture by hand. This rung sits above MCP for
   anatomy/structure specifically — it does not replace MCP/REST for what a brief doesn't
   carry: screenshots, interaction/prototype data, copy classification, and binding
   PROOFS (a ⚠-flagged literal in the brief is a pre-surfaced finding, ready to report as
   read; an unflagged binding may still be spot-verified via REST `boundVariables` when
   the claim is load-bearing enough to need [proven] rather than [inferred] — see the
   values-pass arbitration rule in Step 5). No banked or operator-supplied brief for the
   target → drop to rung 1.
1. **Figma MCP first — design context, text content, variables.** `get_design_context`
   for composition/intent, `get_variable_defs` for the token graph, `get_metadata` for
   structure and variant matrices. This is the portability floor (no token, no listener,
   works on any file the desktop app has open) and the only lane that reaches live text
   content and variables without an Enterprise plan.
2. **REST scripts second — tree walks and PNG export.** `scripts/figma-node.mjs` (`node`
   for a pruned subtree, `image` for a rendered PNG) against a known node id, no
   active-tab dependency. Use this for exhaustive tree walks (every frame under a page,
   every variant in a set) that would burn many MCP round-trips, and for every export
   render — **`get_screenshot` on Claude Code returns text descriptions of the image,
   not pixels**, so a PNG export always goes through the REST images endpoint or the
   desktop MCP bridge on Mac, never through `get_screenshot` on Claude Code.
3. **The sync bank JSON third — offline and mode-resolution work.** The active exporter's
   banked export (`~/JHD/figma-plugins/main/capture-figma/captures/live/*.json`, or the
   vault mirror at `estate/captures/live/`) carries full mode coverage and the `copy`
   array (below) already extracted — reach for it when working offline, resolving a
   value across every mode at once (no live session needed to walk each mode by hand),
   or diffing against a prior capture via `changes.jsonl`.

**Known live limits, name them rather than rediscovering them:**

- **MCP page listing can miss canvases.** `get_metadata`/`get_design_context` walking a
  file's page list has been observed to omit pages that exist on the canvas. When a page
  count looks short, fall back to the REST depth-walk (`figma-node.mjs node <fileKey>
  <rootId>` with children expanded) to confirm the true page set before concluding a page
  doesn't exist.
- **REST `variables/local` is Enterprise-gated.** `figma-node.mjs vars` hits `GET
  /v1/files/:key/variables/local`, which 403s on non-Enterprise plans (the script detects
  this and exits 2 rather than fabricating a result). The live path for variables on a
  non-Enterprise file is the MCP `get_variable_defs` lane, not REST.

**Code Connect is explicitly OUT** (operator ruling, 2026-08-25: Enterprise-only,
"quite expensive" — would replace the capture plugin if it were available, it isn't).
Do not reach for `get_code_connect_map`/`add_code_connect_map`. Instead, each consuming
repo maintains an explicit **Figma-name → code-name mapping table** (in-repo, e.g. a
`figma-code-map.md` or equivalent next to the design-system source) — an audit diffs
the capture's names against that table, it never re-derives naming conventions from
scratch. The capture-figma plugin (`~/JHD/figma-plugins/main/capture-figma`) stays the
house name-mapping truth; this table is downstream of it, not a replacement for it.

The steps below (Steps 1-4, the layer model, "The order," recapture) are written as the
MCP-only procedure — the portability floor. When a REST or listener lane is available, run
the same conceptual stages (architecture → styles/variables → components → blocks) through
that lane's output instead of MCP tool calls; the sequence and the operator rulings don't
change, only which tool produces each layer's data.

## REST node lane — no active tab needed

For a single already-known node id, `scripts/figma-node.mjs` (same `FIGMA_TOKEN`
convention as `figma-capture.mjs`) reads it straight from the REST API — no desktop app,
no active-tab dependency, no risk of reading whatever tab happens to be focused.

- **`node <fileKey> <nodeId> [--raw] [--out path]`** — `GET /v1/files/:key/nodes?ids=`.
  Prints pruned JSON (vector geometry — `vectorNetwork`/`vectorPaths`/`fillGeometry`/
  `strokeGeometry` — stripped; structure, names, `boundVariables`, styles, layout props,
  and `absoluteBoundingBox` all kept) to stdout, or to `--out` if given. `--raw` skips
  pruning. `nodeId` accepts `572:46329`, `572-46329`, or a full figma.com URL's
  `?node-id=` — pass the URL as the sole argument and both the file key and node id are
  extracted from it.
- **`image <fileKey> <nodeId> [--scale 2] [--out path]`** — `GET /v1/images/:key` at
  `format=png`, downloads the rendered PNG. Default `--out`:
  `~/JHD/figma-plugins/main/capture-figma/captures/renders/<key>-<id>.png` (dir created if missing).
- **`vars <fileKey>`** — `GET /v1/files/:key/variables/local`. Enterprise-plan gated: on
  403 it prints the documented explanation and exits 2 rather than fabricating a result —
  fall back to the MCP `get_variable_defs` lane below.
- Errors are specific: 403/404/429 each get a distinct message, and 429 respects a
  `Retry-After` response header (single retry) before falling back to a fixed 2s wait.

**When to prefer this over the desktop MCP lane:** always, whenever the node id is
already known (from a prior capture, a pasted figma.com link, a delta report) — it has
no active-tab constraint, so it can't accidentally read the wrong tab, and it doesn't
require the desktop app to be open at all. Reach for the desktop MCP lane instead only
for **live selection** — a human-in-loop walk where nothing is yet pinned to a node id,
or the operator is actively clicking around the canvas to find the right node.

## Export shape — what the active exporter and REST lane produce

The active exporter's export (contract: `references/figma-agent-plugin-brief.md`) and the
REST lane's snapshot both carry more than a flat token list — extraction reads all of it:

- **Stable ids for rename detection.** Variables and styles carry an OPTIONAL `id`
  (Figma's persistent id); components carry `key`, which already served this purpose.
  When an id is present on both sides of a sync, the listener correlates by id first —
  a renamed entry reads as a rename, never as a spurious removed+added pair. Treat a
  file's ids as available-but-optional: older exports without them fall back to
  name-only diffing, and that fallback is not itself a defect.
- **Components, standalone and sets, with full prop schemas.** Standalone components and
  component sets each carry their typed prop schema (VARIANT props with their option
  list, BOOLEAN/TEXT/INSTANCE_SWAP props with defaults and, for INSTANCE_SWAP,
  preferred component keys) — read this as the props API (Step 4), not a flat list.
- **Per-variant layer bindings — the component-internals chain.** Each variant in a
  component set may carry `bindings`: an array of `{ layer, property, value }` recording
  which layer *inside* the component instance binds which property to which variable
  (alias) or holds it raw. This is the anatomy walk (see "Anatomy — components are
  composition trees") made machine-readable — read a variant's bindings before assuming
  its internals are uniform across the matrix.

## Copy lane — mandatory, equal to variables and geometry

Text content is a fifth layer, not a footnote to the visual ones. A live audit missed a
designed nav copy change entirely because the bank's copy was never read as its own
lane — it got waved through as "just a content difference," exempt from the same
scrutiny a token or a geometry value gets. That exemption is never available.

- **The bank's top-level `copy` array is the source.** The active exporter's export
  carries `copy: [{ id, path, text }]` at the top level (`id` optional, `path` the same
  Page/Frame/Component path convention as every other named entry, `text` the verbatim
  string) — read it as a full inventory, not a spot-check.
- **The listener diffs copy automatically — this is the primary path.** The listener's
  `diffCopy()` (`~/JHD/figma-plugins/main/capture-figma/listener/capture-listener.mjs`)
  correlates `copy` entries id-first, falling back to `path` when an id is missing on
  either side — the same id-first/path-fallback pattern as every other bucket — and
  emits three change records into `changes.jsonl`'s `changed.copy` array: `copy_changed`
  (`{ path, old, new }`, a matched entry whose `text` differs), `copy_added` (`{ path,
  text }`, a new-side-only path), and `copy_removed` (`{ path }`, an old-side-only path).
  `summary.copy` totals the count. Read a copy delta from `changes.jsonl` exactly as you
  would read a `layer_binding_*` delta (Change taxonomy, below) — the listener already
  classified it, don't re-derive it by eye.
- **Manual keyed diff — only when no listener/sync record exists.** When the read is
  MCP-only or REST-only (no active listener session, no banked `changes.jsonl` covering
  the capture window — e.g. a one-off file nobody has synced), there is no automated
  `copy_*` record to read. In that narrow case, and only that case, diff the current
  `copy` array against the prior capture by hand: key on `path` (or `id` when present),
  same rename-detection logic as variables/styles/components, and report every changed/
  added/removed string explicitly — never summarize a text diff as "content updated."
  This manual path is the fallback, not the default; reach for `changes.jsonl` first
  whenever the listener has been running.
- **Text is never exempt.** A string that reads as "just copy" can be the entire
  designed change (a nav label, a CTA, a section header) — extract it **verbatim**
  (Step 4's rule already says this for screenshots; the copy lane is where it becomes
  systematic instead of incidental) and hold it to the same before/after scrutiny as a
  spacing token. If a capture's audit report has a copy section with zero findings, that
  section still exists and says so explicitly — it's never silently omitted because
  "nothing changed."

## Template-layout lane — read layouts, not just component inventories

Reading a design file's templates (project pages, marketing layouts, any page-level
frame meant to ship) means reading them as **layouts** — structure, instances, geometry,
and states expressed as sibling frames per the operator's naming pattern (e.g.
`default`/`hovered`/`disabled` as separate authored frames, not a toggled prop) — not
stopping at a component-set inventory of what exists on the page.

- **A template read is Step 3's "Reading a page layout" four-pass contract**, applied to
  every template/project-page frame the brief touches, not just nav chrome. A live audit
  read a project-page template only for nav geometry and missed the template's own
  layout entirely — the fix is applying the four-pass read (context, composition, blocks
  as instances, values as chains) to the whole template frame, every time one is in
  scope, not narrowing to whichever region prompted the read.
- **States-as-frames is a first-class pattern, not noise.** When a component/template
  author expresses states as sibling frames with a `state=` naming axis, capture each
  sibling as its own state's layout (own geometry, own instance set) — collapsing them
  into "the same layout" loses the state-specific structure the frames exist to record.
  The bank keeps this page tier structurally separate from component variants: state
  frames live in the export's `exampleStructure` bucket (group "Examples"), a distinct
  top-level key from `templateFrames` — the same page-tier/component-tier split the
  layer model draws between blocks/templates and components.
- **Component-set inventory is necessary but not sufficient.** Listing which components a
  template instantiates answers "what's used here"; it doesn't answer "how is this page
  built" — the ordered block sequence, the frame's mode vector, and prop tables per
  instance (Step 3/4) are still required for a template read to count as complete.

## Operator-intent rule

When the operator states a design file was updated ("X was updated", "that changed in
Figma"), that statement outranks a historical code ruling the bank might otherwise seem
to confirm. A prior ruling recorded against an earlier state of the file is not evidence
the file is still in that state — re-read the named layer against the operator's claim
before citing the old ruling as still-current. Treat "operator says updated" as a signal
to recapture that layer, not as a claim to verify-then-dismiss against stale history.

## Change taxonomy — the listener's reading vocabulary for "what changed"

The listener (`scripts/capture-listener.mjs`) computes a richer change record than any
exporter's own changelog — its own changelog is add/remove-only; `changes.jsonl` adds
per-mode and per-binding modification detail. Read a delta report using this vocabulary,
not ad-hoc prose:

- **Per-mode value changes** — a variable's value changed old→new within one mode,
  keyed by variable path + mode. This is the base case: neither an alias nor a rename.
- **Renames** — `variablesRenamed` / `stylesRenamed` / `componentsRenamed`: an entry's
  stable id matched across syncs while its name changed (`{ bucket, id, oldName,
  newName }`). Never confuse with a removed+added pair — that's the point of the id.
- **`alias_repointed`** — a per-mode value change where BOTH the old and new value are
  alias strings pointing at different targets (`{ path, mode, aliasFrom, aliasTo, type }`
  in `changed.aliasRepoints`) — a structural rewire, not a value edit.
- **`binding_broken`** — alias → raw: a variable that used to point at another variable
  now holds a literal value. Same `aliasRepoints` array, same shape, `type` distinguishes
  it from a repoint.
- **`binding_added`** — raw → alias: the reverse of broken — a literal became an alias.
- **`layer_binding_*`** (`layer_binding_repointed` / `layer_binding_broken` /
  `layer_binding_added` / `layer_binding_removed`) — the same four-way classification,
  one layer down: applied to a component set VARIANT's internal `bindings` (matched
  variants diffed by `layer`+`property`) rather than a top-level variable. Kept in its
  own `changed.layerBindings` array and its own `summary.layerBindings` count — a
  different chain (component internals) from top-level variable/style aliasing, never
  merged into `repointed`.
- **`copy_*`** (`copy_changed` / `copy_added` / `copy_removed`) — the same id-first,
  path-fallback correlation applied to the top-level `copy` array (Copy lane, above):
  `copy_changed` is a matched entry whose `text` differs old→new, `copy_added`/
  `copy_removed` are path-only-on-one-side. Kept in its own `changed.copy` array and its
  own `summary.copy` count — text is diffed the same structural way as every other
  bucket, never left to eyeballing.

Use this vocabulary when writing a delta report or a capture document's changelog
section — "what changed" is answered in these terms, not "some values moved."

## Verification rule — from the week's failures

Emission/render questions (does this token/binding actually reach rendered output?) are
answered by **curling served CSS from a fresh client**, never by reading a stale browser
tab or a cached preview. A tab open from before the change under test proves nothing —
open a new client (or a fresh curl) after the change lands, and read what it actually
serves. Artifacts (the architecture map, the variables ledger, a delta report) never
re-derive a value from first principles — they **diff exports**: the current pull against
the banked one, or the listener's `changes.jsonl` against the prior capture. If a claim
about "what changed" or "what's live now" isn't backed by a fresh export or a fresh
served response, it isn't verified yet.

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

## Output of an extraction — two artifacts, separately schemad

A capture is not one document. It's two, cross-referencing, each with its own frontmatter
and vault path — this is the codified convention, not a one-off from any particular
capture. Filed thing-then-aspect, under the owning project's `artifacts/` (e.g.
`projects/capture-figma/artifacts/` for this plugin's own captures, or
`projects/<consuming-project>/artifacts/` when the capture is for another project's UI):

1. **Architecture map** (`projects/<name>/artifacts/<file-name>-architecture-map.md`) —
   Step 1's anatomy, the skeleton. Frontmatter: `file` (human-name-first, key in
   parens), `captured` (date), `sources` (what was pulled and when — pinned REST
   snapshot id / MCP session, plus any operator screenshots), `status` (e.g.
   "architecture baseline," in-flight caveats), `supersedes` (the previous map this
   replaces, or "nothing" for a first capture). Body: pages in canvas order with role
   and frame counts, the PRODUCER/CONSUMER archetype, library manifest, per-page
   findings — everything from Steps 1, 3, and 4's structural layers.
2. **Variables ledger** (`projects/<name>/artifacts/<file-name>-variables-ledger.md`) — Step 2's values.
   Frontmatter: `file_key`, `file_name`, `capture_date`, `version` (the pinned version id,
   or an explicit "unpinned" note with why), `coverage` (a list of `page_id`/`page_name`
   pairs actually pulled), `method` (which tool and mode — e.g. "MCP get_variable_defs per
   page, single-mode" or "active exporter + capture listener, all modes"). Body: variables and
   styles grouped by collection/type, sorted alphabetically within each group (recapture
   discipline's determinism rule applies here too), with discrepancies and coverage gaps
   called out as their own sections.

Both documents live at ONE stable vault path per file/system forever (recapture discipline,
below, applies to each independently — a variables recapture doesn't require re-writing the
architecture map, and vice versa). Per-item content in either document: node id, measured
dims where relevant, the token mapping (measured → system token), variant matrix if a
component, verbatim copy, and an explicit **unobserved/unresolved list**. Claims without a
node id or variable behind them are marked as inference.

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

**Supplementary mechanics:** when the discipline plugin's `scripts/figma-capture.mjs`
and a `FIGMA_TOKEN` are available — the REST lane per "Lane choice" above — use it for
true REST version pinning: `versions` to list real version ids, `snapshot --version <id>`
to pin a capture to one, `delta` to structurally diff two normalized snapshots. When the
active exporter's live sync is running instead, `scripts/capture-poll.mjs` and the
capture listener's `GET /changes?n=` serve the equivalent recapture-delta role — poll
`/changes` rather than re-running a full snapshot. The MCP-only recapture discipline
above is the portability floor: it never depends on either script, so the steps are
complete and self-sufficient on any file with no token and no listener running — but when
a faster lane is available, prefer it here too.
