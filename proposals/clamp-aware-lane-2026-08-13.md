# Clamp-aware conformance lane (`css-fluid`) — mechanism proved, portfolio round pending

**Commissioned by:** the `clamp-aware-lane-commissioned` ruling, itself raised by
`VERDICT REASONS (text-ramp)` §3 in
`~/JHD/vault/orchestrator/specs/technical-design-spectrum-verdict.md`.

**What the verdict proved, both directions:** mapping `layout/text/title/font-size-400` as a
checked `css-scalar` entry against the *unperturbed, already-correct* CSS flagged 10/10 modes
`value_mismatch` (a `clamp()` expression compared against Figma's scalar) — a guaranteed false
positive on correct code. So all 8 font-size variables were filed `entriesUnmappable`, and "the
lane still can't catch drift on these 8 values; that gap is now documented, not closed."

**What shipped here:** a `css-fluid` extraction mode in `scripts/conformance-check.mjs`. It
replays a custom property's `:root` cascade at **each Figma mode's own anchor viewport width**
— the base declaration plus every `@media` width range that admits that width, source order
deciding — evaluates the winning `clamp()`/`calc()`/`min()`/`max()` expression there, and
compares the resolved px against that mode's resolved Figma value.

## Anchor widths come from the capture

`layout/device/width` in
`~/JHD/captures/live/jhd-spec-designsystem-variables-styles.json` carries them per mode:

| mode | width | mode | width |
|---|---|---|---|
| `sm` / `sm-flush` | 375 | `lg` / `lg-flush` | 1280 |
| `md` / `md-flush` | 768 | `lg-sidebar-main(-flush)` | 1280 |
| `xl` / `xl-flush` | 1920 | | |

They are the design's own numbers, not an engineer's table. A map may point at a different
variable (`anchorWidths.figmaPath`) or declare a table (`anchorWidths.modes`) for a Figma file
that carries no device-width variable; the capture wins where both exist. A mode with no anchor
width from either source is a `missing-anchor-width` **defect**, never a silent skip.

## Tolerance

Exact (0.01px, float noise only) where the clamp saturates at one of its own bounds — that
value is a designed endpoint. 0.5px, overridable per entry with `tolerancePx`, where the
anchor lands strictly inside a fluid segment and the value is an interpolation.

## Evidence — both directions, on the live capture and real portfolio CSS

A scratch probe mapped all 8 `entriesUnmappable` font-size variables as `css-fluid` entries
against a **copy** of `~/JHD/portfolio/src/app/globals.css`. The portfolio repo was not
modified; moving those 8 entries out of `entriesUnmappable` is the next portfolio round's job.

**Green:** 8 entries, **80 modes evaluated, 2 defects** — and the 2 are not the clamp-vs-scalar
false positive this work exists to kill. `title-400` (the exact variable that produced 10/10
false positives under `css-scalar`) is green at all ten modes, as is `title-300` and every body
step.

**Red:** with `--title-style1-300-size`'s 768-segment floor drifted `2rem → 2.25rem` (36px
where the capture says 32px) in the probe copy, the run flags exactly:

```
[value_mismatch] layout/text/title/font-size-300 (md @768px): figma=32 code=36
[value_mismatch] layout/text/title/font-size-300 (md-flush @768px): figma=32 code=36
```

`sm` reads the base declaration and `lg`/`xl` read the 1280 block, so nothing outside the
interior moves — this drift is invisible to any check that skips `md`'s own anchor, which is
the `title-300` case the ten-modes-are-the-contract ruling was written for.

## Finding for the next portfolio round — `xl-flush` on title-100/200

The two live defects above are a real Figma/code divergence, not lane noise:

| variable | `xl` (1920) | `xl-flush` (1920) | code at 1920 |
|---|---|---|---|
| `layout/text/title/font-size-100` | 20 | **16** | 20 |
| `layout/text/title/font-size-200` | 24 | **20** | 24 |

Every other font-size variable has `xl-flush` mirroring `xl` (and `lg-flush` mirroring `lg`).
These two do not. Both modes anchor at the same 1920px viewport, so no width-keyed CSS can
satisfy both — the code currently matches `xl`. Either Figma's `xl-flush` values for those two
steps are an authoring slip, or flush layouts genuinely take a smaller title at `xl` and the
code needs a non-width signal to express it. **Operator/design call, not an engineering one**
— filed here, unresolved, rather than papered over with a tolerance.
