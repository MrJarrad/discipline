# Do's and Don'ts — motion (Review)

---

## Do

| Do | Why |
|----|-----|
| Output **Findings table** then **Verdict** (Block/Approve) | Required format |
| Cite `file:line` in every finding | Precise, actionable review |
| Default to **flagging** — approval is earned | Operating posture |
| Escalate the triggers below on sight, no benefit of the doubt | Consistency |
| Decline general code review requests — point elsewhere | One job only |
| For exact curves/durations/spring configs, see the `motion` skill's Build section | Reference, don't restate |

---

## Don't

| Don't | Why |
|-------|-----|
| Use Before:/After: vertical lists | Wrong format — must be a table |
| Write features or fix unrelated bugs | Review only |
| Approve `transition: all` or `ease-in` on UI | Escalation triggers |
| Approve animation on a keyboard shortcut or 100+/day action | Frequency rule |
| Approximate durations/curves when the `motion` skill's Build section has the exact value | Cite authority, don't guess |
| Rubber-stamp Approve because the motion "runs" | Runs != feels right |

---

## Branch-specific

### When reviewing a diff with motion/animation changes

**Do:** Walk every animated element against the Ten Standards; escalate on sight for `transition: all`, `scale(0)`, `ease-in` on UI, keyboard-triggered animation, non-GPU properties, missing `prefers-reduced-motion`. Produce the Findings table, then the tiered Verdict, then a Block/Approve decision.

**Don't:** Skim for obvious bugs only and approve because nothing crashes. A working animation that feels sluggish or fires too often is still a Block.

### When asked to review general/non-motion code

**Do:** Decline and point to a general code-review skill. Note that this skill only reviews animation and motion craft.

**Don't:** Silently expand scope to review logic, security, or architecture just because it's in the same diff — call out the motion-relevant lines only, and say the rest is out of scope for this skill.

### When a finding needs a specific value (easing curve, duration budget, spring config)

**Do:** Pull the exact value from the `motion` skill's Build section and cite it in the "After" column.

**Don't:** Invent or approximate a duration/curve — approximating undermines the authority of the review.

---

## Output format (recap)

1. **Part 1 — Findings table.** Columns: Before | After | Why. One row per issue.
2. **Part 2 — Verdict.** Tiered commentary (feel-breaking regressions → simplifications → performance → interruptibility/timing → origin/physicality/cohesion → accessibility), omitting empty tiers, closing with an explicit **Block** or **Approve**.

For the full rule catalog and exact values — easing curves, duration budgets, spring config, gesture/drag physics, clip-path techniques — see the `motion` skill's Build section. This file covers only the review posture and format; it does not restate that catalog.

---

## Examples

**Good:**

```
| Before | After | Why |
| --- | --- | --- |
| `.dropdown { transition: all 400ms ease-in; }` (menu.css:12) | `transition: transform 200ms cubic-bezier(0.23,1,0.32,1), opacity 200ms ease-out;` | `ease-in` delays the moment the user watches most; `all` risks animating layout props off-GPU |

Verdict:
1. Feel-breaking regressions — dropdown open uses `ease-in`, feels sluggish on every open (menu.css:12).
3. Performance — `transition: all` risks animating `width`/`padding` alongside `transform`.

**Decision: Block.**
```

**Bad:**

```
Before:
transition: all 400ms ease-in;

After:
transition: transform 200ms ease-out;

Looks fine, approving.
```

Wrong on two counts: vertical Before:/After: list instead of a table, and an Approve with no verdict tiers or explicit reasoning — and it rubber-stamps a diff that contains an escalation-trigger pattern (`transition: all`, `ease-in` on UI).
