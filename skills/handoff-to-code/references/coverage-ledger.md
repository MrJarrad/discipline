# Coverage ledger — the house return under an export contract

House law on top of `handoff-to-code`. The skill's `SKILL.md` is a byte mirror of the
`handoff-css` package and is not edited here; this file is the JHD overlay the brief,
`doer-rules.md` § Fixed evidence return and `agents/engineer.md` point at. Load both.

Operator, 2026-09-20: *"It seems like the gate updates we made swung too far. But reverting
isn't the solution. What we want is accuracy in build."* and *"We need to fix the discipline.
So we aren't in this situation. How do we build more accurately to begin with."*

## 1. The ledger replaces the deviation table

**Every node id in scope gets one row, written before any code is written.** The deviation
table listed only what went wrong, so a node nobody built produced no row at all — the nav
rebuild shipped a feed that was never compared to the export, three times
(`2026-09-20-nav-footer-audit`).

| node id | binding | token / class (`codeSyntax.WEB`) | built at `file:line` | measured value | status |
| --- | --- | --- | --- | --- | --- |

- **A node in scope with no row is red** — not an omission to catch at review. Scope is the
  export node ids the brief names, expanded to every descendant the export states.
- **Scope stops at an `◆instance of` boundary** — the instance is one row (its own props and
  bindings); the instanced component's insides are that component's own lane.
- **Rows exist before the build.** The first four columns are filled from the export (`built at`
  as the file you will write); `measured value` and `status` are filled from the running build.
- **Deviation is a status value, not a second table.** `status` is the skill's own enum —
  `match` · `resolved-to-export` · `unflagged-viewport` · `hand-authored-override` — plus
  `not-built` (red) and `unreached` (the state never rendered; also red, never a pass).
- **`measured value` is measured, from the built page.** A value copied out of your own source
  is not a measurement.

## 2. Variance never collapses into one literal

**Where the export states a different value per device, per page or per state, the ledger
carries a row per mode — or a mode column with every mode filled. One literal covering
several export modes is red even when one of the modes measures right.**

This is the whole mechanism behind the nav defects: one feed constant for every page, one
`size="200"` for every device, one `--grid-margin-sm` for three breakpoints, then CSS patches
after the fact. All three are fix-once-in-the-source problems; a per-breakpoint patch over a
collapsed literal is a second defect, not a fix.

## 3. Layout examples become a composition table first

**The layout-example export pair is a required input to every component-set lane that has
one.** A component set's own export usually ships no example frames — they live in a separate
example pair (`…-example-…` markdown + companion). The brief names that pair alongside the
component's export; it travels with the lane as context, never as a second contract unit
(`dispatch-brief` § references/ACCURACY.md). No example pair named and none exists → say so in
the ledger; **no example pair named while one exists is a malformed brief**, stop and ask.

Derive this table **before building**, from every example frame whose instances are the lane's
component — its `props()` and its children's `👁hidden` flags:

| page | state | device | visible set |
| --- | --- | --- | --- |

The ledger checks composition against it: one ledger row per cell that differs, naming the
condition in code that produces it. An example frame with no cell is an unread frame.

## 4. Pixel proof, not computed style

A node is `match` only when it was **seen**: a headed screenshot at the operator's viewport and
at each breakpoint family, with a pixel assertion on the built region. A `getComputedStyle`
read proves a declaration exists, not that anything painted — the footer that never painted
passed computed-style checks every round. See `present-for-review` § Before the link goes out.
