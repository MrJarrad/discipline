# Operator-set look values bind every consumer (2026-09-24)

When the operator picks a value for a look (blur, opacity, duration, size — "the 30 recede
opacity should be the value used everywhere gallery and grid etc.", 2026-09-22), the lane
binds **every consumer of that look to one token in the same slice**. The brief names the
token and every consumer, found by grep before dispatch.

**Why:** 2026-09-24, the gallery page recede got 50px/0.3 while the card recede stayed
32px/0.20 — the operator had already said "everywhere" two days earlier. Result: a second
round, and his note "I would have expected that to be the same everywhere. I feel like we
took an inefficient path isolating and updating it one place."

**How to apply:** before dispatch, grep for every declaration of the look (blur/opacity/
duration) and list them in the brief as consumers of one token; a lane that changes one and
leaves another is red — the reviewer's Spec axis checks this too (`agents/reviewer.md`).

Ruling: `operator-values-are-site-wide`. Related: `one-implementation-per-component`,
`export-values-win-no-drift-questions`.
