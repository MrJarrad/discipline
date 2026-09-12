# Worked example — a navigation footer

From a real pair (`design-handoff` v6 + `design-system-handoff` schema 8).

The companion states the token:

```
$device/screen-height/full · WEB `--device-screen-height-full` · 📝 100% of screen height
  Responsive behavior: default=100dvh
```

The markdown states the component set and its grid:

```
NavigationFooter (COMPONENT_SET) #4719:258951
  Responsive via: `device` property (md+ → sm)
  Responsive grid: 12-col
  | size (w×h) | $device/width×$device/screen-height/full |
  | section    | col-span 3/12 (md+) · col-span 6/12 (sm) |
  | colGap     | $grid/gap-sm |

  device=md+ (COMPONENT) #4719:258479 $device/width×$device/screen-height/full [V]
    menu (FRAME) #4709:256923 fill×hug [Grid, colGap:$grid/gap-sm] overlay(columns:12)
      section (FRAME) #4709:256924 fill×hug col-span(3/12)
```

Reading it in order:

1. The footer's own size is two bindings, so it is two custom properties —
   `width: var(--device-width); height: var(--device-screen-height-full)`. The token itself
   resolves to `100dvh` because the variable's description states the fraction and its group
   is declared viewport-relative in the config. **Nothing in code restates `100dvh`** — the
   token is the single place the value is stated.
2. `menu` is a `[Grid]` frame with a 12-column overlay, so it is `display: grid` with
   `grid-template-columns: repeat(12, minmax(0, 1fr))` and `column-gap: var(--grid-gap-sm)`.
3. `section` is `col-span(3/12)`, so it is `grid-column: span 3`. At `sm` the same child is
   `col-span(6/12)` → `grid-column: span 6`, and the table's note that `sm` wraps to two rows
   is the grid doing that on its own, not a second layout.
4. `fill×hug` is a sizing chain, not a missing value: `fill` is the grid placement above,
   `hug` is content height. Neither gets a literal.
5. The `device` property is the variant axis, so `md+` and `sm` are one component with one
   prop — not two components.

## DO / DON'T — this week's failures

**Column maths instead of the grid**

- **DO:** `.footer-section { grid-column: span 3; }` inside a `display: grid` container with
  twelve columns and `column-gap: var(--grid-gap-sm)`.
- **DON'T:** `width: calc((100% - 11 * var(--grid-gap-sm)) / 12 * 3 + 2 * var(--grid-gap-sm))`.
  It can measure identically at one width and still be a defect: the mechanism the handoff
  named is a grid container, and "on the grid" without the container is a steer to arithmetic.

**Binding the alias instead of the handoff's name**

- **DO:** `height: var(--device-screen-height-full)` — the `codeSyntax.WEB` name the companion
  states for `$device/screen-height/full`.
- **DON'T:** `height: var(--screen-height-full)` because that name already existed in the
  stylesheet. A legacy alias hop is not the export's name; binding it hides which token was
  consumed and survives the next regeneration only by luck.

**Trusting a code comment over the current pair**

- **DO:** Build the copy string on the node line of the pair you were pointed at, and read the
  changelog section for what moved since the last export.
- **DON'T:** Keep the existing string because a comment above it cites an audit from a previous
  week. The audit is a record of an older export; the pair in the brief is the contract.

## `col()`/`row()` grid placement — schema v9 (export v11, 2026-09-12)

`design-handoff` schema v9 replaced `col-span N/M` inside responsive grid tables (and node
rows) with `col(S/N of M)` / `row(S/N)`:

```
| description | col(4/4 of 12) | col(4/5 of 12) | col(1/12 of 12) row(2/1) |
```

`col(S/N of M)` is `grid-column: S / span N` on an M-column grid (the start position is now
explicit, not left to source order); `row(S/N)` is `grid-row: S / span N`, present only when a
child needs an explicit row (most do not — grid auto-flow places them). Same mechanism as
Build standard 5 — a `[Grid]` frame is `display: grid`; column maths is still a defect even
when it measures right.
