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

## 1a. The eight row classes, specialised for an export

`qa-acceptance` § The coverage ledger names eight row classes every ledger carries, each
present or marked "none in scope." Under a Design Handoff export pair:

1. **Geometry and placement** — per device, from the export's device components/variants.
2. **Tokens** — per mode, with the `mode` column filled from the export's `modes[]` (light/
   dark/bttf); a token row collapsed to one mode is red even where that mode measures right.
3. **Copy** — every text string in the block export **and** its layout examples, export vs
   built, **per route** — a string that only appears in an example frame (a page-specific
   Title/Description) gets its own row keyed to the route that renders it, not folded into
   the component's generic row.
4. **Links and targets** — every `href`, `mailto:`, and clipboard payload named in an
   Interaction note (e.g. "copies email address to clipboard") or an instance prop.
5. **States, variants and prototype flows** — per instance: every `props()` combination the
   export or its examples exercise, plus any prototype/interactive-state note.
6. **Behaviour annotations** — **one row per Interaction/Development note**, verbatim from
   the export, each with the test or probe that proves it (scroll-fade, motion-law-on-reload,
   max-visible-count, clipboard-copy, etc.) — a note with no proving row is unreached, not met.
7. **Semantics and a11y hints** — the `~semantic(<tag>)` markers and any accessibility note,
   checked against the built markup's actual element.
8. **Absence** — every lock row the new export **retires**, plus every node id present in the
   prior export and **absent** in the new one, sourced from the changelog (the export's own
   structural/content diff, or a delta note like `design-handoff-*-delta.md`) — each proven
   **not present** in the built page by test or grep, never left as "should be gone."

A class with nothing in scope for this lane still gets its line: `<class> — none in scope`.

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

## 5. Frame-first proof, before any link (Change 2, 2026-09-22)

**Before any link goes out, the return carries a side-by-side** — the export frame exported as
PNG via the REST API, and the build rendered at the frame's own width, both at the same
viewport — sitting next to the per-node ledger, not after it. Two links shipped against Figma
frames the operator had to paste himself is the failure this closes.

**The reviewer checks the ledger against the export JSON's node list before approving** — every
node id the JSON states for the frame in scope has a ledger row; a ledger row with no matching
node id, or a node id with no ledger row, is a red finding, not a note for next round.
