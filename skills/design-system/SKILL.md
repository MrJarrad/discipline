---
name: design-system
description: The house web design system — the concrete WHAT (token contract + shadcn/Radix component set on Tailwind v4) that design-craft's HOW applies. Use when starting a new web UI project, wiring tokens/theme, adding or extending a component, choosing a colour/spacing/radius value, or reviewing UI for system conformance. Ships a portable shadcn starter (copy-paste index.css + config) plus flux-app as the reference instance. Not for iOS/macOS UI, and not the composition rules themselves — that's design-craft.
---

# Design System

A design system has two halves: **what exists** (the tokens, the components) and **how you wield it** (the composition ladder, the visual bar). This skill is the **what** for house web UI. [`design-craft`](../design-craft/SKILL.md) is the **how**, [`design-eng`](../design-eng/SKILL.md) is motion/feel, and all three sit under [`flux-quality`](../flux-quality/SKILL.md) (the bar). Don't re-derive the composition ladder here; don't ignore the token contract there.

**The stack — one house standard for web UI:**

| Layer | Choice |
|---|---|
| Framework | React 19 + TypeScript + Vite |
| Styling | Tailwind CSS v4 (`@tailwindcss/vite`, CSS-first `@theme`) |
| Components | shadcn/ui on Radix primitives — `style: radix-nova`, `baseColor: neutral`, CSS variables on |
| Variants | `class-variance-authority` (CVA) |
| Class merge | `cn()` = `clsx` + `tailwind-merge` |
| Colour space | OKLCH (perceptual — lightness math is predictable) |
| Icons | `lucide-react` · Toasts `sonner` · Charts `recharts` · Font `Geist Variable` |

## When to use

- Bootstrapping a new web project → start from the portable baseline, don't hand-assemble tokens.
- Wiring theme / dark mode, or reaching for a colour, spacing, radius, or shadow value.
- Adding a component (install from shadcn first — see below) or extending one with a new variant.
- Reviewing UI for conformance: is every value a token? is dark handled by variable swap, not per-component overrides? Run the grep-able [conformance checklist](references/conformance.md).
- Shipping **visual work** for sign-off: don't just eyeball it — **produce a conformance report as evidence** (per-dimension on-system/flag with the nearest token for any raw value, plus an a11y read and an overall verdict), attach it to the issue, and let the operator approve it. This is what proves the system was *applied correctly*, not merely that it looks nice. Procedure + report contract: [conformance-report.md](references/conformance-report.md).
- Reskinning for a new brand/style, or making a system multi-brand → [theming.md](references/theming.md).

## The token contract — the heart of it

Every colour is a **semantic token**, never a literal. You don't write `bg-white` or `text-zinc-900`; you write `bg-background` and `text-foreground`. The token's *value* differs between light and dark; the *name* you reference never changes. That single indirection is what makes theming, contrast, and rebranding free.

**Foreground pairs with background.** Tokens come in `X` / `X-foreground` pairs — `primary`/`primary-foreground`, `card`/`card-foreground`, `destructive`/`destructive-foreground`. Put `X` on a surface, `X-foreground` on the text/icons over it. The pair gives you one reusable *place* to guarantee contrast — but it doesn't make contrast automatic: **verify each pair against WCAG 2.x AA** (4.5:1 text, 3:1 large text / UI) in both themes; that's the legal floor. (APCA is a useful extra perceptual check but is *not* a ratified standard yet — see [foundations](references/foundations.md).) Never mix a foreground from one pair onto another pair's surface.

**The semantic set** (full copy-paste values live in [references/starter/index.css](references/starter/index.css)):

- **Surfaces:** `background`, `card`, `popover`, `sidebar` (+ their `-foreground`)
- **Intent:** `primary` (the one high-emphasis action / brand) · `secondary`
  (lower-emphasis solid) · `muted` (quiet backgrounds + `muted-foreground` for
  secondary text) · `accent` (hover/selected wash on neutral items) — each with a
  paired `-foreground`. Reach down this emphasis ladder: most surfaces are neutral,
  `primary` is scarce by design.
- **Status:** `destructive`, `success`, `warning` — semantic, used at low-alpha for backgrounds (`bg-destructive/10`) and full-strength for text/icons
- **Lines & focus:** `border`, `input`, `ring`
- **Categorical:** `--chart-1..8` — a fixed 8-hue palette for charts *and* tags/labels, so both read as one system. Extend in-pattern (evenly-spaced hues) past 8.

**Dark mode is a value swap, not a restyle.** Tokens are declared once in `:root` and overridden wholesale in `.dark`; a `dark` class on `<html>` flips them. Components never carry `dark:` colour overrides for their base look — they reference tokens and inherit the swap. (The only legit `dark:` uses are the rare structural tweak, e.g. a translucent input fill.) If you're writing `dark:bg-…` to fix a colour, that's the tell you skipped a token.

**Theming is the payoff — a whole reskin from swapping values.** Because nothing references a raw value, changing the primitives (colours, radius, font) reflows through semantics → components → screens: a new brand or style, no component edits. The dark swap is just the first proof of it. To reskin *by brand* (not only by mode) you add the primitive ramp layer the collapsed baseline lacks, generate ramps perceptually with the house **Orbit** tool, and re-point the semantic aliases. Full architecture, mechanisms, and the reskin recipe: [references/theming.md](references/theming.md).

**Radius scales from one root.** `--radius: 0.625rem` (10px) drives a multiplier scale — `--radius-sm` (×0.6) through `--radius-4xl` (×2.6). Use `rounded-md`/`rounded-lg`/`rounded-xl`, never a raw `rounded-[7px]`.

**Tiers — where the baseline sits, and when to grow it.** The industry standard at scale is three tiers: **primitive** (raw values, named by value — `blue.500`) → **semantic** (roles, named by purpose — `primary`) → **component** (per-component overrides). The house starter is deliberately *two-tier and collapsed*: raw OKLCH values live directly inside the semantic names. That's the right default for an app — dark mode already works, fewer moving parts. Grow deliberately when you feel the pain: add a **primitive palette** once you're generating tint scales or a second brand; add **component tokens** once one component needs an isolated override you don't want rippling through the semantic tier. Rationale + sources: [foundations](references/foundations.md).

**The one rule (from design-craft, restated in tokens):** a raw value is a bug. Need something the contract lacks? Add the token, then reference it — see *Extending the system* below.

## Beyond colour — type, space, elevation, z-index

Colour is the richest axis but not the only one. A system that only tokenises
colour leaves the rest to drift. The house positions:

**Type.** One family (Geist Variable), and a small set of **semantic roles**, not
per-component sizing:

| Role | Class |
|---|---|
| Page / section title | `text-lg`/`text-xl` · `font-semibold` |
| Body (the default) | `text-sm` · `font-medium` |
| Secondary / meta / caption | `text-xs` · `text-muted-foreground` |
| Label (form / eyebrow) | `text-xs` · `font-medium` |

Sizes/weights come from this set, not invented per component (design-craft: "type
has a system"). *Known thin spot:* `leading-*`/`tracking-*` are still applied
ad-hoc in the reference instance — treat line-height/letter-spacing as part of the
role (set them with the role, don't sprinkle) until a formal ramp is promoted.

**Space.** The 4px Tailwind scale, used from the scale — `gap-2`, `p-4`, never a
raw `mt-[7px]`. Density is contextual (dense app surfaces, roomier forms) but
always a scale step.

**Elevation.** Three named depths, picked by **role** not raw step:
`shadow-raised` (cards/inputs) · `shadow-overlay` (popovers/menus) · `shadow-modal`
(dialogs/sheets). Most surfaces stay flat. Reach for the role token, not
`shadow-md`. (Defined in [starter/index.css](references/starter/index.css).)

**Z-index.** A named stacking scale — `z-dropdown` < `z-sticky` < `z-overlay` <
`z-modal` < `z-toast` — so layers compose predictably. A raw `z-50` is the same
bug as a raw hex; the scale exists to stop that drift.

## Principles that hold for ANY token-based system

Portable truths, not shadcn-specific — apply them even on a project that uses a different system:

1. **Name by role, not by value** (for semantic tokens). `--danger`, not `--red-500` — the name survives a rebrand; the hex doesn't. Keep names homogeneous within a class, distinct between classes, and free of homonyms. Full naming convention (token + code): [references/naming.md](references/naming.md).
2. **Pair foreground with background** so contrast lives in one reusable place — then verify that pair against WCAG 2.x AA (the floor), rather than eyeballing it per screen.
3. **One source per axis.** One radius root, one spacing scale, one type ramp — derive the rest by formula, don't hand-pick siblings.
4. **Theme by swapping values behind stable names**, so a component written once works in every theme.
5. **Status is semantic and consistent** — the same success green everywhere, expressed as a token, at low-alpha for fills and full-strength for text.
6. **Categorical ≠ semantic.** Chart/tag hues are an ordered palette chosen for distinguishability; don't reuse `primary`/`destructive` as "chart colour 1."
7. **Extend the system, never inline around it.** A one-off value on a page is the same defect as a hardcoded hex in a component.

## Components — never hand-roll a primitive

Before building any component, install it from the system: `npx shadcn@latest add <name>`. The house set already includes ~47 primitives (Button, Dialog, Sidebar, Command, Table, Chart, …). Compose screens *out of* these; build custom **only** when the system genuinely lacks it *and* the operator has agreed — surface that decision, don't quietly hand-roll (design-craft's hard rule).

House conventions every component follows — **CVA** for variants, **`cn()`** for merge, **`data-slot`** for style hooks, **`asChild`** (Radix `Slot`) for polymorphism, and a shared **`focus-visible` ring** pattern. Full inventory, the conventions with code, and how to add/extend are in [references/components.md](references/components.md).

**A component is a whole unit, not just markup.** Structure + tokenised style +
variants + *every* state (hover/focus/active/disabled/invalid/loading/empty) +
motion + accessibility + behaviour. Motion is authored *with* the component, not
bolted on later. Some components are **shells** — mostly structure + a `children`
slot that holds other components (PaneShell, Card). For the ground-up mental model
— the primitive→semantic→component→block ladder, the styles/utils layer, shells &
slots, and the build recipe — read [references/building-components.md](references/building-components.md).

## Starting a new project

Don't assemble this by hand. Follow [references/setup.md](references/setup.md): scaffold Vite+React+TS, add Tailwind v4 + the Vite plugin, drop in the three starter files ([index.css](references/starter/index.css), [components.json](references/starter/components.json), [utils.ts](references/starter/utils.ts)), `shadcn init`, then add primitives as needed. You get the full token contract and theming for free on line one.

## The reference instance — flux-app

flux-app is the living, best-in-class instance of this system: the concrete token values, the app-specific blocks built on the primitives (PaneShell, Rail, Thread, EntityHeader…), the pane/workspace layout patterns, and the motion conventions. When you need a worked example of the system in production, read [references/flux-app.md](references/flux-app.md).

## Extending the system

Need a new token or component? It's a **deliberate system change**, not an inline: propose it with a rationale and where else it's reused, add it to the contract (`index.css`) or install/compose the component, *then* reference it. A value that appears once still goes in the system — the next screen will want it too.

Reach for the **correct** token, not the nearest-looking one. "A token was used" isn't the bar — the right *semantic* token is (a `muted-foreground` that happens to match isn't a substitute for a real `warning`). Mature teams find that policing usage without policing correctness backfires. And the system earns adoption by being good enough to trust, not by mandate — quality is the lever. Sourced rationale + citations: [references/foundations.md](references/foundations.md).

The quick do/don't summary — tokens vs raw values, and the conformance-report obligations — is in [references/DOS-AND-DONTS.md](references/DOS-AND-DONTS.md).
