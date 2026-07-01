# Do's and Don'ts — discover-scope

---

## Do

| Do | Why |
|----|-----|
| **Loop** gather -> research -> validate -> update every cycle | Scope grows with evidence, not a single pass |
| Ask **one focused question** at a time (max 2-3 if tightly related) | Discovery is conversational, not a form |
| Research open questions from **real sources**, readonly | Faster and more reliable than guessing or re-asking what's checkable |
| **Validate** every new fact against the SCOPE doc | Catches contradictions before they calcify |
| Tag every fact: **Confirmed / Assumed / Open** | Keeps the scope's confidence level honest |
| Log **Contradictions** until resolved | No silent rewrites of what someone actually confirmed |
| Put uncommitted options in the **Ideas backlog** | Separates exploration from commitment |
| Hand off to `shape-stress` once shaping readiness is green | Right tool at the right time — this skill explores, that one converges |

---

## Don't

| Don't | Why |
|-------|-----|
| Write a **shaped plan** or start converging sections in this skill | That's `shape-stress` — this skill only produces the SCOPE it consumes |
| **Interview** with a long list of upfront questions | Overwhelming, and not how real discovery works |
| Treat research **findings or ideas** as confirmed goals | The user owns commitment, not the research step |
| **Silently overwrite** a confirmed fact | Breaks trust in the scope doc |
| Skip **validate** when new context arrives | Lets drift and contradictions build up unnoticed |
| Implement code or build anything | Discovery only — no building |
| Fabricate a finding to fill a gap | Source it or flag it as still open — see `flux-quality`'s never-fabricate bar |

---

## Branch-specific

### When the raw material is vague

**Do:** Ask one clarifying question on the highest-leverage unknown (usually the
problem or the primary user).

**Don't:** Fill the SCOPE doc with invented requirements to make it look complete.

### When the user says "just build it" / "skip ahead, we already know what we want"

**Do:** Check whether it's genuinely already scoped — problem, goals, and
constraints stated plainly with no open questions. If so, this skill doesn't need
to run a full discovery loop; say so and move on (to `shape-stress` or straight to
build, per the ask). If gaps exist, name them in one line and offer a fast
one-cycle discovery rather than a long interview.

**Don't:** Force a multi-cycle discovery loop onto a request that's already fully
scoped, and don't quietly skip validation on a request that only looks scoped.

### When the user says "write the plan / start building now"

**Do:** Run the shaping readiness checklist. If it's green, hand off to
`shape-stress`. If gaps remain, list them plainly and offer to close them or
proceed with the gaps named.

**Don't:** Refuse to move on when scope is genuinely ready, and don't silently
jump past shaping readiness because the user sounds impatient.

---

## Output format

Primary: the SCOPE doc, structured per SKILL.md (Summary, Problem, Goals,
Non-goals, Users & stakeholders, Constraints, Assumptions, Open questions, Ideas
backlog, Contradictions, Research log, Shaping readiness).

Secondary: a 3-5 line delta summary after each cycle — what changed, what's still
open.

---

## Annotated example

**Initiative: warehouse replenishment -> storefront sync**

```
Summary
Discovery for safe warehouse-to-storefront inventory increases. Confidence:
high on problem and constraints; medium on sync cadence and SKU mapping.

Problem (confirmed)
The storefront is system of record for inventory deductions at checkout, but
warehouse replenishments aren't reliably reflected there. Stale availability
creates operational risk.

Goals
1. Reflect warehouse replenishments safely in the storefront [confirmed]
2. Never impact checkout or storefront availability [confirmed]
3. Roll out incrementally with logging [assumed - validate with stakeholder]

Non-goals
- Real-time bidirectional sync
- Per-warehouse storefront visibility
- Historical reconciliation

Assumptions
| Assumption                                  | Status      | Evidence         |
| Increases only - storefront owns deductions | validated   | Stakeholder brief|
| Batch/async sync acceptable                 | unvalidated | Needs ops input  |

Open questions
1. Sync cadence / SLA? (owner: ops)
2. Locale-SKU mapping rules? (owner: eng)

Ideas backlog
- Selective low-stock refresh only (source: research - not committed)

Contradictions
(none)

Shaping readiness
[x] Problem confirmed
[x] Goals + non-goals
[ ] Open questions deferred or answered
[ ] No unresolved contradictions

Ready for shape-stress once open questions are deferred with an owner or answered.
```

**What makes this good:** every fact is tagged; non-goals are explicit; the idea
that wasn't committed to lives in the backlog, not the goals; open questions each
have a named owner instead of floating unassigned.

**What would make it bad:** a goals list that includes "maybe use a message
queue" as if committed; no non-goals section at all; a contradiction (say, a
later note that the storefront is *not* system of record) folded in silently
instead of surfaced.

---

## Examples

**Good cycle:**

```
Gathered: stakeholder needs a B2B portal, Q3 launch (confirmed).
Research: codebase check - auth module already exists (source: src/auth/).
Validated: no conflicts with existing SCOPE.
Updated SCOPE.md - added Q3 constraint, new open question on SSO provider.
Next question: who is the primary user - admin or end customer?
```

**Bad:**

```
Here's a full shaped plan with 12 features we'll build.
-> Wrong skill (that's shape-stress) and no gather/validate loop happened first.
```
