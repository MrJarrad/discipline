# Do's and Don'ts — design-system

---

## Do

| Do | Why |
|----|-----|
| Reference a **semantic token** for every colour (`bg-background`, not `bg-white`) | The name survives a rebrand; the hex doesn't |
| Pull the **value from the scale** — radius from the one root, spacing from the 4px scale, type from the four roles | One source per axis; derive, don't hand-pick |
| Reach for the **correct** semantic token, not the nearest-looking one | A `muted-foreground` that happens to match isn't a real `warning` |
| Handle dark mode by **variable swap** — components reference tokens and inherit the flip | Dark is a value swap, not a per-component restyle |
| Install the component **from the system** (`npx shadcn add …`) before building | Never hand-roll a primitive the set already ships |
| **Produce a conformance report** as evidence when shipping visual work for sign-off | Proves the system was *applied correctly*, not just that it looks nice |
| For every raw value flagged, name its **nearest token** (`#1D9E75` → `--success`) | A flag with no destination isn't actionable — keeps the fix on-system |
| Include an **a11y read** (role, focusability, hit target, reduced-motion) in the report | Token-checking proves the look; a11y proves it's usable |
| Propose a **new token/component** with rationale when the contract lacks the value | System changes are deliberate, not silent inlines |

---

## Don't

| Don't | Why |
|-------|-----|
| Hardcode a **hex / oklch / bare `bg-zinc-500`** in shipped UI | A raw value is a bug, not a shortcut |
| Write a raw **`rounded-[7px]` / `p-[7px]` / `z-50` / `shadow-md`** | Off-scale values drift; use the scale / role token |
| Add a **`dark:` colour override** to fix a component's base look | That's the tell you skipped a token |
| Reuse a **`--chart-N`** hue as a semantic colour | Categorical ≠ semantic |
| Sign off visual work on **appearance alone**, with no conformance report | "Looks nice" isn't proof the system was applied |
| Emit a **flag with no `nearestToken`** | Leaves the operator/next agent nowhere to go |
| Run the conformance report on **non-visual, code-only** work | It's scoped to what a user would see |

---

## Branch-specific

### When shipping visual work for the operator's sign-off

**Do:** Produce the conformance report — per-dimension on-system/flag, every raw value paired with its nearest token, an a11y read, and an overall verdict — and attach it alongside the rendered before/after. See [conformance-report.md](conformance-report.md).

**Don't:** Request review on a visual change with no report, or a report that flags a colour but names no token to fix it to.

### When you find a raw value

**Do:** Flag it, name the nearest token (semantic colour by role/value; radius/spacing by nearest scale step; shadow/z by role), and let the operator's one-click "Use token" stay on-system.

**Don't:** Quietly leave it, or map it to the nearest-*looking* token when the correct *semantic* one differs.

### When the contract genuinely lacks the value

**Do:** Flag it as "extend the system" with a rationale + where else it's reused; add the token, then reference it.

**Don't:** Inline the one-off value and move on — the next screen will want it too.

### When the change is code-only / non-visual

**Do:** Recognise it's not visual and skip the conformance report; it rides the normal risk-based path.

**Don't:** Run per-dimension token checks on a backend refactor.

---

## Output format

For any visual change headed to sign-off, produce a conformance report — the JSON document keyed
`design-signoff` that the sign-off panel parses (exact shape: [conformance-report.md](conformance-report.md)):

1. **Named dimension groups** — `components` / `spacing` / `type` / `colour` / `radius` / `elevation` / `zIndex` / `accessibility`, each an array of checks with `status: "ok"` (on-system) or `"flag"`.
2. **Each flag** — carries `value` (the raw value) + `token` (the on-system token to use).
3. **Verdict** — *derived* from the flag count by the panel (all pass / N to check); put the human verdict in `summary`.
4. **`creativeChoice`** — `{ chosen, rejected, why }`.

---

## Examples

**Good:**

```
Conformance report — Goals empty state (verdict: 1 to check)
  Components — on-system: Card, Button from the library
  Spacing    — on-system: gap-2, p-6 on the scale
  Type       — on-system: text-sm, font-medium on the ramp
  Colour     — flag: CTA fill raw #1D9E75, not a token · nearest --success
  A11y       — on-system: role button, focus-visible ring, 44px target
Choice: deep teal over brand blue for the CTA — warmer, lifts off the card.
```

**Bad:**

```
Looks great, shipped it. The teal CTA (#1D9E75) pops nicely against the card —
close enough to the brand green. Ready to merge.
```
