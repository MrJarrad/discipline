# Do's and Don'ts — design-craft

---

## Do

| Do | Why |
|----|-----|
| Reach for an existing **token / component / block** first | Nothing raw, ever — the one rule |
| Climb the **composition ladder** (tokens → styles → components → blocks → page templates) | Every page is blocks within a page template |
| **Find the system** on arrival (repo docs, tokens dir, `shared/` foundation) before touching UI | Can't reuse what you haven't located |
| **Adopt** the target system's real components and conventions when migrating UI | A like-for-like swap that keeps old quirks is the bug |
| Check **shadcn / blocks / the registry** before building anything custom | Never hand-roll what the system already provides |
| Propose a **new token/component** with rationale when the system is missing one | System changes are deliberate, not silent |
| **Render at real viewports** (desktop + mobile) before calling UI done | Visual truth — a code diff isn't verification |
| Name the **surface + viewport** checked | Evidence travels with the claim |
| Make shipped UI **self-explanatory** — extra explanation is the defect; fix the UI (caption is one shape) | Token + rule at the UI altitude; anything past self-explanatory is over-explain |

---

## Don't

| Don't | Why |
|-------|-----|
| Hardcode a **color, spacing, or type value** in shipped UI | A raw value is a bug, not a shortcut |
| Drop **one-off markup** onto a page instead of a block | Same bug as a raw value, at the composition layer |
| **Hand-roll** a component the system already ships (chart, table, hover-card, avatar) | Reinventing a primitive is the violation |
| Preserve an old system's **quirk** (corner radius, shadow, spacing) as "load-bearing" without checking first | Usually inherited drift, not a real constraint |
| **Quietly inline** a one-off instead of proposing a system change | Hides the decision from the next person who hits the same need |
| Approve UI from a **code diff alone** | Must render and verify at real viewports |
| Add **extra explanation** to shipped UI that doesn't read on its own (caption is one shape) | Fix the UI — anything past self-explanatory is over-explain |

---

## Branch-specific

### On arrival in a new project

**Do:** Locate the design system + usage guide first (`AGENTS.md`, tokens dir, `shared/`); read it before writing any UI.

**Don't:** Start writing components from memory of a different project's system.

### When migrating UI onto a design system

**Do:** Adopt the new system's real components; match its radius/elevation scale; delete local idiosyncrasies.

**Don't:** Transliterate the old markup 1:1, preserving colors/shadows/spacing that aren't in the new system.

### When something needed isn't in the system

**Do:** Check shadcn/blocks/registry first; if genuinely absent, propose the addition (with rationale + reuse sites) before building it.

**Don't:** Silently hand-roll a custom component without surfacing that decision.

### When asked to "just ship it" without visual verification

**Do:** Render the surface at real viewports before marking done; name what was checked.

**Don't:** Mark UI done from the diff, without opening it in a browser at desktop + mobile widths.

---

## Output format

For any UI change, state:

1. **System used** — which tokens/components/blocks were reused.
2. **New system additions** (if any) — what was proposed and why.
3. **Verification** — surface + viewport(s) rendered and checked.

---

## Examples

**Good:**

```
Used: `Button` (variant=primary), `spacing-4` token, existing `CardHeader` block.
No new tokens needed.
Verified: /settings page at 1440px and 390px — hierarchy and spacing hold.
```

**Bad:**

```
Added a div with `padding: 14px` and `#3B82F6` for the button background — close
enough to the brand color already in the design tokens.
```
