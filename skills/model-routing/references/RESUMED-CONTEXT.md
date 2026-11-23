# Resumed context is a hidden token multiplier

Moved verbatim from `skills/model-routing/SKILL.md` (DISC-351 step 8); the skill points here.

Budget **per fresh dispatch**, not per resume: a resumed agent pays full inference cost
against its entire prior transcript on every turn, so the same task grows slower and
pricier with each resume with no change in the task's own size (`fresh-context-per-task`,
2026-09-16). Resume is reserved for a reviewer's red on the sha it just built; every other
follow-up — a new ruling, a widened lock, a continuation slice, round two — is a fresh
`Agent`, budgeted as its own dispatch.
