# Text values: fresh capture vs portfolio's built type ramp

**Answers:** the operator's open question — what did the text updates change, and does code
track them?

**Short answer:** the **title** ramp is mostly tracked (one step is exact, three drift only at
the small end). The **body** ramp is not tracked at all — every step above 100 was repointed
one primitive up in Figma and code still binds the old ones. Nothing in the conformance map
would ever have caught it: the map covers 5 type tokens, all of them letter-spacing, and
**zero font sizes**.

## Sources (all opened directly, read-only)

- Capture: `~/JHD/captures/live/jhd-spec-designsystem-variables-styles.json`
  (synced 2026-08-13T05:02Z), collection `layout`, 20 `text/*` variables, aliases
  chain-resolved through `text-primitives`.
- Code: `~/JHD/portfolio/src/app/globals.css:219-311` (title ramp, body ramp, paragraph rule).
- Map: `~/JHD/portfolio/design/figma-map.json`.
- No portfolio file was modified.

Code has **three** breakpoint tiers for Figma's four modes: base (`sm`), `@media (min-width:
768px)` (`md` **and** `lg` share it), `@media (min-width: 1280px)` (`xl`). Where Figma
distinguishes `md` from `lg`, code cannot.

## Title ramp — tracked, except at the small end

Figma resolved (sm/md/lg/xl) vs what code produces at that breakpoint:

| step | Figma | code | verdict |
|---|---|---|---|
| `title-100` size | 14 / 16 / 16 / 20 | 16 / 16 / 16 / 16→20 | drift at **sm** (14 vs 16) |
| `title-200` size | 16 / 20 / 20 / 24 | 20 / 20 / 20 / 20→24 | drift at **sm** (16 vs 20) |
| `title-300` size | 28 / 32 / 40 / 48 | 32 / 40 / 40 / 40→48 | drift at **sm** (28 vs 32) and **md** (32 vs 40) |
| `title-400` size | 56 / 56 / 80 / 96 | 56 / 56→80 / 80 / 80→96 | **exact** |

The `md` miss on `title-300` is structural, not an error: Figma moved 300 to a distinct md
value (32) between the sm (28) and lg (40) steps, and code's md/lg share one tier. Closing it
needs a fourth tier, which is a design call, not a code fix.

Tracking is deliberately **frozen** in code (each step binds straight to a
`text-primitives/letter-spacing/*` constant rather than the mode-varying layout alias — see
the rationale at `globals.css:225-234`). That decision still holds against the fresh capture:
`title-300-tracking: -1px` = `letter-spacing/900` = -1 ✓, and the layout alias still resolves
to -0.75 at lg, exactly as the comment says.

One thing did move underneath it: the comment records the old alias chain as
`-0.5/-0.75/-0.75/-1`; the fresh capture's chain is **`-0.25/-0.5/-0.75/-1`**. The sm and md
links were repointed one step. The frozen bind means code is unaffected — but the comment's
account of the alias is now stale.

## Body ramp — not tracked

This is the substantive change.

| step | Figma now (sm/md/lg → xl) | Figma primitive | code | code primitive |
|---|---|---|---|---|
| `body-100` | 12 → **14** | size/100 → size/200 | 12 flat, no xl rise | size/100 |
| `body-200` | **16** → **20** | size/300 → size/400 | 14 flat | size/200 |
| `body-300` | **20** → **24** | size/400 → size/500 | 16 → 20 | size/300 → size/400 |
| `body-400` | **24** → **28** | size/500 → size/600 | 20 → 24 | size/400 → size/500 |

Two distinct changes:

1. **Every step above 100 was repointed one primitive up.** Code's `body-200` (14px,
   `size/200`) is now Figma's `body-100` xl value; code's `300` is Figma's `200`; code's `400`
   is Figma's `300`. Figma's `body-400` (24→28) has **no counterpart in code at all**.
2. **Every step gained an xl rise.** Code's `body-100` and `body-200` are declared flat at all
   breakpoints (`globals.css:284`, `:286`); Figma now rises 12→14 and 16→20 at xl.

Net effect if a page uses `body-style1-300` today: it renders 16px where the design system now
says 20px, at every breakpoint.

## Paragraph spacing — tracks automatically, and still exactly right

Code replaced Figma's four per-step paragraph-spacing constants with one relative rule,
`--paragraph-spacing: calc(1em - 1px)` (`globals.css:296`). Checked against the fresh capture:
Figma's values are 11/15/19/23 at sm/md/lg and 13/19/23/27 at xl, and every one is that step's
own font-size minus 1px. **The rule holds exactly, at all four steps and all four modes** — it
absorbed the repoint with no code change. This is the part of the port that aged well.

Note the comment above that rule quotes `11/15/19/23 … 13/19/23/27`, which are the numbers for
Figma's **current** 12/16/20/24 ramp, not the 12/14/16/20 ramp the size declarations five lines
above actually bind. The rule is self-consistent either way (it's relative); the comment is
describing a ramp the code doesn't implement.

## Why no check caught this

`figma-map.json` maps 5 type-related entries, all tracking, none size:

```
text-primitives/letter-spacing/300  -> --title-style1-100-tracking
text-primitives/letter-spacing/400  -> --title-style1-200-tracking
text-primitives/letter-spacing/1200 -> --title-style1-400-tracking
text-primitives/letter-spacing/100  -> --body-style1-100-tracking
text-primitives/letter-spacing/200  -> --body-style1-200-tracking
```

The whole size ramp — and `title-300-tracking` — are unmapped, so the value lane had nothing
to compare and reported nothing. This is precisely the failure the new coverage report exists
to make visible: `layout` shows **109 unmapped variables** on the live capture.

## Observation, not a finding

`text-primitives/letter-spacing/350` carries the value **18**, among a ramp that otherwise runs
-10.5 to +0.25. Nothing in the capture aliases either `letter-spacing/350` or `size/350`
(checked across all 580 variables), so nothing consumes it and nothing is broken by it. It
reads like a size value entered into a letter-spacing slot. Operator's call.

## Recommendation

One recommendation, not a menu: **map the size ramp before changing any of it.** Add the eight
`layout/text/{body,title}/font-size-*` entries to `figma-map.json` so the value lane reports
this drift on every sync, then decide the body-ramp repoint with the check watching. Fixing the
CSS first would land a change no lane can hold in place.

The `md`/`lg` tier collapse and the body-ramp repoint itself are creative/scope calls and are
left to the operator.
