# Accuracy in the brief — one contract unit per lane, pixel proof in done-when

Operator ruling 2026-09-20, `accuracy-before-the-link`: *"We need to fix the discipline. So we
aren't in this situation. How do we build more accurately to begin with. You also used open on
this task and outcome was sloppy."* The model is not the lever — brief shape and coverage are.

## One contract unit per lane, always

**A brief covering more than one contract unit is malformed at any model, at any effort tier.**
A contract unit is one export `COMPONENT_SET`, one captured page, one component, one motion
source. A whole-surface brief is not an `opus` job; it is a slicing failure. The parent slices
and dispatches one lane per unit, each with its own ids, its own lock rows and its own coverage
ledger (`qa-acceptance` § The coverage ledger).

**The layout-example pair travels with the lane as context, not as a second unit.** Examples
of the lane's component live in their own export pair; the brief names it beside the
component's export so the doer can derive the page × state × device composition table before
building. Naming it is not widening the lane — omitting it, when one exists, is a malformed
brief.

- **DO:** one lane per `COMPONENT_SET` — `#4719:258951 NavigationFooter`, nodes listed, its
  example pair named as context.
- **DON'T:** *"rebuild the nav and footer site-wide"* — one lane, two component sets, no ledger
  that can be counted.

Escalating the model instead of slicing is the failure this rule names: the nav rebuild ran on
the strongest model available and still collapsed per-device and per-page export values into
single literals, because nothing in the brief made the uncovered nodes visible.

## Pixel proof at the operator's framing

A built region's done-when is a **headed screenshot at the operator's viewport and at each
breakpoint family, with a pixel assertion on that region**. A `getComputedStyle` read proves a
declaration exists, not that anything painted — a footer that never painted passed
computed-style checks three rounds running.

The proof sits in the doer's return, **before** the preview link goes out; it never delays the
link and it never reviews how the region looks. The operator remains the visual gate
(`doer-rules.md` § Fixed evidence return; `present-for-review`).
