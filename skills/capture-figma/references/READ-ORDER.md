# capture-figma — the read order in full

The six-step read-order law with the operator's ratified wording, the per-level descent rules, the values-pass arbitration and the [proven]/[inferred] tagging. SKILL.md carries the six steps and the rules that decide a read; this is the detail behind each. Nothing here was rewritten — it is the 1.78.0 SKILL.md body, moved.

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
5. **Values last.** **When a `design-handoff` + `design-system-handoff` export pair exists
   for the target, the values pass is not run here at all — load `handoff-to-code`, which
   maps every binding through its `codeSyntax.WEB` name and owns the deviation table.**
   Otherwise: variables and tokens (The order, below: variables → styles →
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