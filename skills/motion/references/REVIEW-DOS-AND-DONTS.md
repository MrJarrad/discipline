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
| **Load motion law** when the brief names one — [LAW.md](LAW.md) | Block law rows only when law is loaded and cited |
| **Block** craft defects always: **flash-before-enter**, **hidden-complete**, pause-stack, recipe-not-live | Universal — not law-dependent |

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
| Approve **flash-before-enter** or **hidden-complete** | Craft Blocks — always |
| Approve **pause-stack** or **recipe-not-live** | Craft Blocks — always |
| **Block site-specific rows** (overlap, raster, clip-wipe, nav chrome) when **no law is loaded** | Law unobserved — craft review only |
| **Block without citing** the loaded law source and row | Review must quote the contract |

---

## Branch-specific

### When reviewing a diff with motion/animation changes

**Do:** Walk every animated element against the Ten Standards and, when a law is loaded, every row in [LAW.md](LAW.md) / the cited `motion-law.md`. Escalate on sight for `transition: all`, `scale(0)`, `ease-in` on UI, keyboard-triggered animation, non-GPU properties, missing `prefers-reduced-motion`, craft defects, and law violations. Produce the Findings table, then the tiered Verdict, then Block/Approve.

**Don't:** Skim for obvious bugs only and approve because nothing crashes. A working animation that feels sluggish, flashes before it animates, or pops text in finished while hidden is still a **Block**.

### When a motion law is loaded

**Do:** Quote the law path in the review brief. **Block** each violated row (overlap, pile, raster, type-enter, clocks, cold/in-app gate, scroll chrome — whichever the law defines).

**Don't:** Re-litigate law the brief did not load. Don't invent rows the law omits.

### When no motion law is loaded

**Do:** Review craft only (Ten Standards, t90, GPU, accessibility, craft defect classes).

**Don't:** Block for missing clip-wipe, overlap, or nav column order — say law unobserved.

### When flash-before-enter or hidden-complete appear

**Do:** **Block** immediately. Name the class in the Findings table.

**Don't:** Treat these as polish or "maybe acceptable on first load." Craft Blocks — always.

### When asked to review general/non-motion code

**Do:** Decline and point to a general code-review skill. Note that this skill only reviews animation and motion craft.

**Don't:** Silently expand scope to review logic, security, or architecture just because it's in the same diff — call out the motion-relevant lines only, and say the rest is out of scope for this skill.

### When a finding needs a specific value (easing curve, duration budget, spring config)

**Do:** Pull craft values from the `motion` skill's Build section; pull law clocks from the cited `motion-law.md` or design-system motion law.

**Don't:** Invent or approximate a duration/curve — approximating undermines the authority of the review.

---

## Output format (recap)

1. **Part 1 — Findings table.** Columns: Before | After | Why. One row per issue.
2. **Part 2 — Verdict.** Tiered commentary (feel-breaking regressions → simplifications → performance → interruptibility/timing → origin/physicality/cohesion → accessibility → law violations when loaded), omitting empty tiers, closing with an explicit **Block** or **Approve**.

For the full rule catalog and exact craft values — easing curves, duration budgets, spring config — see the `motion` skill's Build section. For law shape and load order, see [LAW.md](LAW.md).

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
