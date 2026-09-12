---
name: capture-figma
description: Read a Figma file into buildable truth before anything gets built or audited against it. Trigger on "match the figma", "discrepancies with figma", "fresh sync", "the figma version", a pasted figma.com URL, or any need for tokens, block anatomy, variant matrices, template layouts, or copy from a design file to drive code — variables first, metadata second, screenshots last, never misread off pixels; copy is its own mandatory audit lane, never waved through as "just content." Not for capturing live websites — that's capture-website; not for motion-tool sources (Jitter, AE, Lottie, Figma motion timelines) — that's capture-motion-source; not for auditing a built page against Figma — that's audit-build; not for building code from a design-handoff export pair — that's handoff-to-code.
---

# Figma Extraction

**Who runs this:** the dispatched Engineer or UX Designer, never the parent reading instance
props on their behalf. Parent names file key + node id; the doer reads via REST
(`scripts/figma-node.mjs`) — desktop Figma MCP binds to the parent session only.

| Reference | Holds |
| --- | --- |
| [READ-ORDER.md](references/READ-ORDER.md) | the six-step law in full, per-level descent, values arbitration |
| [LANES-AND-TOOLS.md](references/LANES-AND-TOOLS.md) | lane mechanics, `figma-node.mjs`, known limits, Cloud/Mac sync |
| [READ-STEPS.md](references/READ-STEPS.md) | Steps 1-4, the four-layer model, the tool-call order |
| [COPY-AND-TEMPLATES.md](references/COPY-AND-TEMPLATES.md) | those two lanes in full |
| [DELTAS-AND-ARTIFACTS.md](references/DELTAS-AND-ARTIFACTS.md) | change taxonomy, the two artifacts, recapture |
| [plugin-constraints.md](references/plugin-constraints.md) | the plugin's build constraints |

## Read order — the law, before any other step

Operator-ratified 2026-08-26 (vault: [[figma-read-sequence]]). **Every** read — component,
template, block, whole file — runs these six steps in order, whichever lane supplies the
mechanics ([READ-ORDER.md](references/READ-ORDER.md)).

1. **Name & context first** — what the node name alone encodes, before any other call.
2. **The glance** — identity + composition inventory in one sentence, from name + layer list.
3. **Place it on the opinion gradient** — primitive / component / block / page layout ([[design-system-opinion-gradient]]) decides what it may mean.
4. **Descend, each level against its own truth** — "what is it made of?": grid, composition, placement, slots, sizing chains, states, copy, all as structure before any number.
5. **Values last.** **When a `design-handoff` + `design-system-handoff` export pair exists for the target, the values pass is not run here at all — load `handoff-to-code`**, which owns every binding and the deviation table.
6. **Relations & responsive story** — where the target is consumed, in prose.

Two rules decide whether a values read is honest:

- **No naked px.** Every dimension is its **bound variable name**, resolved value in parentheses, tagged **[proven: boundVariables]** or **[inferred: emitted var()]** — never a naked number ([[no-naked-px]]: "i don't ever add fix px in designs" — operator). An unbound value is a read failure to walk deeper on, or an authoring slip to surface — never neutral data.
- **Inference never convicts an unbound verdict.** A missing `var()` in emitted code is a **false negative**; only REST `--raw` `boundVariables` convicts.

**A "read" that opens with `get_variable_defs` and can't first state what's being built and what it's made of is not a design read — it's a values dump**, and gets sent back however accurate the numbers are.

## Rule zero — operator-supplied Figma renders are 2x retina, always ÷2

Any PNG the operator hands you as a design contract (not read live through `get_screenshot`/`get_metadata`) is a **retina 2x render by default**. **Divide every measurement taken off such a render by 2 before it becomes a px value.** Confirm the multiplier once against the target's known native width, then run the ÷2 as a checklist over **every sized element** — font sizes, paddings, gaps, radii, icon/control dimensions, the container's own size. The plugin UI shipped two consecutive oversized rounds because the ÷2 reached body text and panel width but not padding, gaps or label sizes: eyeballing proportions cannot catch a numeric 2x residual.

## Lane choice — three lanes, one hierarchy

Pick by what's available, not by habit. Mechanics: [LANES-AND-TOOLS.md](references/LANES-AND-TOOLS.md).

1. **Portability floor — MCP.** Any file, nothing installed beyond the desktop bridge; also the right tool for a quick live check against whatever is on screen.
2. **REST, when `FIGMA_TOKEN` exists** — no active-tab constraint, no lazy-page gaps, real `?version=` pinning. Prefer it **whenever the node id is already known**.
3. **Capture Figma sync plugin** — variables, styles and layer bindings at full mode coverage, plus the banked `copy` array and `changes.jsonl`.

## The tool ladder — pick by what you're reading, not by habit

Read down; stop at the first rung that answers the question.

0. **A Design Handoff export (Layer Brief), when one exists for the target — primary anatomy source, and the contract itself.** Steps 2 and 4 become *interpretation of the brief*, not a tool-walk rebuilding the same tree. It does not cover screenshots, interaction data, copy classification or binding proofs.
1. **Figma MCP** — design context, text, variables; the only lane reaching live text and variables without Enterprise.
2. **REST scripts** — exhaustive tree walks and every PNG export (`get_screenshot` on Claude Code returns text descriptions, not pixels).
3. **The sync bank JSON** — offline, every mode at once, diffing via `changes.jsonl`.

**Code Connect is explicitly OUT** (operator ruling, 2026-08-25). Each consuming repo keeps a Figma-name → code-name mapping table instead.

## Export shape — read it in `handoff-to-code`

What an export carries beyond a flat token list — stable `id`s, typed prop schemas, per-variant layer `bindings`, per-variable `responsiveBehavior` — and how it becomes code lives in **`handoff-to-code`**. Load it whenever a `design-handoff` + `design-system-handoff` pair exists for the target.

## Copy lane — mandatory, equal to variables and geometry

Text is a fifth layer, not a footnote. A live audit missed a designed nav copy change because the bank's copy was waved through as "just a content difference." **That exemption is never available.** Read the top-level `copy` array as a full inventory; read a copy delta from `changes.jsonl` as you would a `layer_binding_*` delta. A copy section with zero findings still exists and says so. Mechanics and the manual fallback: [COPY-AND-TEMPLATES.md](references/COPY-AND-TEMPLATES.md).

## Template-layout lane — read layouts, not just component inventories

A template read is the four-pass page-layout contract — context, composition, blocks as instances, values as chains — applied to **the whole template frame**, never narrowed to the region that prompted the read. States authored as sibling frames are first-class, each captured as its own layout. An inventory answers "what's used here", not "how is this page built" ([COPY-AND-TEMPLATES.md](references/COPY-AND-TEMPLATES.md)).

## Operator-intent rule

When the operator says a design file was updated, that outranks a historical ruling the bank might seem to confirm. Recapture that layer; don't verify-then-dismiss against stale history.

## Verification rule

Emission questions (does this token reach rendered output?) are answered by **curling served CSS from a fresh client**, never a stale tab or cached preview. Artifacts **diff exports**, never re-derive. A claim about "what changed" with no fresh export or served response behind it is not verified.

## Translate, never transcribe

Figma px are inputs to the *system*, not literals: map a measured 64px title to the nearest ramp step. A value between steps is a finding — the ramp grows or the design snaps — never a hardcoded exception.

## Recapture and change tracking

A capture that can't be compared to the next one is half-done. Four rules; procedure, the two output artifacts and the caveats: [DELTAS-AND-ARTIFACTS.md](references/DELTAS-AND-ARTIFACTS.md).

- **Pin every capture** — the datetime, plus the operator-named version label when there is one. Untimestamped cannot be compared later.
- **Stable paths, updated in place** — one vault path per file forever; git is the diff engine. Never `capture-v2.md` side-by-side.
- **Scope before recapturing** — the affected layers, not everything.
- **Diff on names, not node ids**, and write the capture sorted so reorder churn can't drown the real deltas.

Read a delta in the listener's vocabulary — per-mode changes, renames, `alias_repointed`, `binding_broken`/`binding_added`, `layer_binding_*`, `copy_*` — never ad-hoc prose.
