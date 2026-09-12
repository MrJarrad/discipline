# Schema v9 node hints — one rule each (export v11, 2026-09-12)

A schema-v9 brief adds hints beyond `col-span N/M` (grammar:
`schema/design-handoff.v9.grammar.md`), each a mechanism rule:

| Hint | Rule |
| --- | --- |
| `col(S/N of M)` / `row(S/N)` | `grid-column`/`grid-row: S / span N` — never column maths. |
| `aspect: $token (stable)` / `varies` | Stable → `aspect-ratio`, intrinsic height. Varies → per-breakpoint dimensions. |
| `semantic(<tag>)` | Build that exact HTML element. |
| `interactive(click, hover)` | Wire the named handler(s) — not passive display. |
| `states(:hover, :focus, …)` | Native CSS pseudo-classes, never a JS-toggled class. |
| `a11y(…)` | Apply the named `aria-*`/`role` verbatim — not optional. |
| `position(sticky\|fixed)` | Set that CSS `position`. |
| `@container` | `container-type`/`container-name` — not a media query. |
| `desc("…")` | Build context only — never a binding, never shipped copy. |

`worked-example.md` (worked `col()`/`row()` read) and `export-shape.md` (rename ids, prop
schemas) cover the rest.
