# Representation-mappings audit — every equality rule in the lanes (2026-08-14)

Required by the operator ruling *"the plugin surfaces every difference — rulings
annotate, never suppress"* (`~/JHD/vault/fleet/rulings/2026-08-14-rulings-annotate-never-suppress.md`),
scope-sharpening section, verbatim:

> The ONLY class of coded ruling that may make the lanes read two forms as EQUAL
> (no difference to surface) is REPRESENTATION MAPPING — where the same design
> truth is legitimately expressed differently per medium: units, alpha
> quantization, name projection, greedy wrap. Everything ELSE — value
> differences, binding differences, component-intent differences, "deliberate"
> divergences — SURFACES, annotated at most.

So this is the full list of every place a lane currently decides two things are
the same, each classified, each with the fixture that pins it. Anything
intent-shaped is not on this list — it moved to `scripts/annotations-registry.json`
and is reported every sync.

## A. Representation mappings — allowed to read as equal

| # | Rule | Class | Where | Two-way definition | Fixtures |
|---|------|-------|-------|--------------------|----------|
| A1 | Figma style/token name `title-style1/300` ↔ CSS class `title-style1-300` | name projection | `scripts/binding-check.mjs:217` (`figmaValueToCssClass`) | `/` ↔ `-` at every step separator; total and lossless in both directions for the name grammar Figma emits (segments never contain `-`… see the caveat below) | `scripts/binding-check.test.mjs` — "css-class assertion, aligned binding", "…drifted binding (the hero bug)", plus the explicit projection fixture added this round |
| A2 | `rem` ↔ `px` (1rem = 16px), and a trailing `s` on a duration | units | `scripts/conformance-check.mjs:245` (`parseCssScalar`) | `px = rem × 16`; `rem = px ÷ 16`. Duration `0.3s` ↔ Figma's `300` (ms) | `scripts/conformance-check.test.mjs` — "css-scalar: aligned rem value converts to px and matches figma's raw number" (:103), the alias-chain and scale cases (:177, :201) |
| A3 | Figma's static px ↔ code's fluid `clamp()/min()/max()/calc()`, evaluated at each mode's anchor viewport | units | `scripts/conformance-check.mjs:284–528` (`css-fluid`) | resolve the winning declaration at the mode's anchor width (1rem = 16px, 1vw = anchorWidth/100) and compare the resulting px against Figma's mode value | `scripts/conformance-check.test.mjs` — the css-fluid block (:541, :692–698) |
| A4 | Figma 8-digit hex alpha ↔ CSS `rgb()` with percentage alpha | alpha quantization | `scripts/conformance-check.mjs:753–790` | the **stated percentage governs**; the hex byte is quantization (`Math.round(pct × 255)`), so both sides normalise to `{r,g,b,alphaPercent}` before comparison | `scripts/conformance-check.test.mjs:290` (equal at the same quantized percentage) and `:315` (a real 10-point alpha drift still fails) |
| A5 | Greedy wrap = the browser default = Figma's only wrap model | greedy wrap | **not implemented in any lane** — it is a code-side policy (`text-wrap: balance/pretty` deleted from the portfolio's `globals.css`, vault `token-rulings.md` 2026-07-26) | n/a: no lane compares wrap behaviour, so no lane reads two forms as equal | n/a — listed for completeness because the ruling names it |

**A1 caveat, stated not hidden:** the projection is lossless only while Figma
style-name segments contain no `-`. A Figma name like `title-style1/300-alt`
projects to `title-style1-300-alt`, which is also what `title-style1/300/alt`
would project to. No such name exists in the current file (checked against the
2026-08-14T12:26 capture); if one is ever authored, the projection stops being
two-way and this row needs a real escape. Flagged, not papered over.

## B. Not equality rules — structural facts about what is being compared

These skip a comparison, so they were audited with the same suspicion, but none
of them reads two different design truths as the same truth.

| # | Rule | Where | Verdict |
|---|------|-------|---------|
| B1 | The `device` axis is skipped when comparing an M-/D- instance pair | `schema-v2-transform.mjs` / `code.js`, `compareInstancePair` | **Pairing key, not equality.** An M-frame instance is `device=sm` and its D-frame counterpart `device=md+` *by construction* — that axis is how the two sides of the diff are identified. Comparing on it would flag every instance in the file for being on the side of the diff it is on. **Operator call flagged below.** |
| B2 | Two siblings with the same name that are interchangeable instances (same main component / component set) don't raise `duplicate_sibling_name` | `schema-v2-transform.mjs`, `siblingsAreInterchangeable` | **Detection predicate, not a ruling.** The check exists to catch *ambiguous* id/name-fallback matching; two instances of the same component under the same name are not ambiguous — either resolves to the same thing. No difference is being hidden. |
| B3 | A group of canonical spacer instances under one name is exempt from the same check | `schema-v2-transform.mjs`, `spacerSiblingGroupExempt` | Same class as B2, narrower: canonical spacer names on spacer-set instances. **Flagged as the weakest of the three** — it is name-keyed, so it is the one most likely to be quietly covering something. Recommended follow-up: emit it as an annotated informational row like B4 rather than a silent `continue`. |
| B4 | A homogeneous repeating run (same type, same name, non-root-level) is reported as `homogeneous_sibling_sequence` instead of `duplicate_sibling_name` | `schema-v2-transform.mjs`, `isHomogeneousRepeatingRun` | **Already annotate-shaped** — it emits an item, and as of this round the panel shows it under ANNOTATED rather than dropping it. |
| B5 | A template that exists in the capture but isn't `READY_FOR_DEV` is not checked | `scripts/page-template-check.mjs` | **Scope boundary** — a work-in-progress design is not a contract, so there is nothing to compare against. It was silent; it is now counted and stated in the lane summary. |
| B6 | `technical-design-check.mjs` has no CHECKS entry for the smoothing item ("RATIFIED-KEEP per operator") | `scripts/technical-design-check.mjs:28` | **A check that was never written**, not a suppression of one that runs. Nothing is being filtered; the lane simply has no opinion there. Left as is, recorded here so it is not mistaken for a hidden filter later. |

## C. Moved to annotations this round — intent-shaped, no longer equality

| Was | Where it lived | Now |
|-----|----------------|-----|
| `RATIFIED_AXIS_EXCEPTIONS` (NavigationHeader layout) — retyped the divergence to `ratified_axis_exception`, which the panel then dropped entirely | `schema-v2-transform.mjs` / `code.js` + `ui.html`'s `NON_ACTIONABLE_WARNING_TYPES` | registry `navigationheader-mobile-layout-split`; the divergence emits as an ordinary `axis_ownership_violation`, annotated, rendered under ANNOTATED |
| `DEVICE_OWNED_AXES` (LayoutGrid `columns`) — emitted nothing at all, silently | `schema-v2-transform.mjs` / `code.js` | registry `layoutgrid-columns-device-owned`; emitted and annotated every sync |
| `entries[].ratifiedVariants` — diverted a match out of the comparison before it ran | `scripts/binding-check.mjs`, `scripts/page-template-check.mjs` | retired: suppresses nothing, reported as a `retired_map_field` item; the split-text ruling now lives in the registry as `splitcontent-split-text-row-gap` |
| The PaginationPage sm-height divergence — classified in a map `$note`, with no instrument watching for the file catching up | `~/JHD/portfolio/design/figma-map.json` | registry `paginationpage-sm-height-screen-height-500`, an **anticipated-update** with a mechanical closure condition evaluated every sync |

## D. One operator call, surfaced not decided

**B1, the `device` axis skip.** It is the only remaining coded rule that stops a
comparison without being one of the ruling's four representation classes. The
recommendation is to keep it: it is the diff's own pairing key, and surfacing it
would add one item per instance per sync saying "the mobile frame is mobile" —
noise that would bury the real report. If you read the law more strictly than
that, the fix is one line (delete the `continue`) plus a registry entry per
component, and the lanes will start reporting it.
