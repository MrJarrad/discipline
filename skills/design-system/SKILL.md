---
name: design-system
description: The JHD house web design system — Figma-named tokens, Action/Badge primitives, and consumption of @jhd/design-system. Trigger when starting or reviewing JHD web UI, wiring tokens or theme, reaching for a colour/spacing/radius/type value, or reviewing UI for system conformance. Not for iOS/macOS UI (Swift binds the same Figma variables), not Figma plugins, and not site compositions — that's design-craft.
---

# Design System — JHD house web

The **what** for JHD web UI: Figma-named tokens 1:1, Action/Badge/`cn()` primitives, and the shared package. [`design-craft`](../design-craft/SKILL.md) is the **how** (composition ladder, visual bar); [`motion`](../motion/SKILL.md) is motion/feel. All three sit under [`quality`](../quality/SKILL.md).

**This is not a generic Vite + Geist + shadcn starter.** JHD web products consume the house package — they do not scaffold a parallel token contract.

## When to use

- Starting or reviewing **JHD web UI** (portfolio, Skillz, any future web product).
- Wiring theme / dark mode, or reaching for a colour, spacing, radius, or type value.
- Adding or extending a primitive (Action, Badge) or checking conformance.
- Shipping visual work for sign-off → produce a [conformance report](references/conformance-report.md).

## The contract — Figma names 1:1

Token names mirror Figma variables and styles exactly. Deviations are defects.

**Surfaces & content:** `background-default-*`, `content-default-*` (primary / secondary / tertiary and their pairs).

**Type roles:** `title-style1-*`, `body-style1-*`, caption roles — bind the **style**, not ad-hoc `text-lg`.

**Action & motion:** Action radii, motion tokens — same names in CSS and Figma. **Motion law** (sequencing grammar, type enter, token-bound clocks): [references/motion-law.md](references/motion-law.md). The [`motion`](../motion/SKILL.md) skill reads and implements law; it does not own it.

**The one rule:** a raw colour, type size, radius, or space is a bug. Need something the contract lacks? Add the token in the **package** (or propose it), then reference it — never inline around it.

**Dark mode is a token swap**, not per-component `dark:` colour overrides. Tokens are declared once; a theme class flips values. Components reference stable names.

**Consumers supply Suisse** via `--font-suisse`. Font files stay with each app — do not vendor font copies into the package.

## Where the system lives

| Layer | Source |
|---|---|
| **Package (SoT once extract lands)** | `@jhd/design-system` from `~/JHD/design-system/main` (`MrJarrad/jhd-design-system`) |
| **Interim contract (until package ships CSS)** | `~/JHD/portfolio/main/src/app/globals.css` sections 1–11 + `action-base` / `badge-base` |
| **Composition example (not the system)** | Portfolio site blocks — NavigationHeader, list feed, case-study, print layouts |

**Do not vendor.** Import the package. Two web products on copied tokens is drift from day one.

**Site compositions are not the system.** Do not copy portfolio blocks into new apps as if they were primitives. Compose new screens from package tokens + Action/Badge; study portfolio for patterns, not for copy-paste markup.

## Principles (portable, still true)

1. **Name by role, not by value** — `--content-default-primary`, not `#333`. Full convention: [naming.md](references/naming.md).
2. **Pair foreground with background** — verify WCAG 2.x AA per pair in both themes.
3. **One source per axis** — one radius root, one spacing scale, one type ramp.
4. **Theme by swapping values behind stable names.**
5. **Extend the system, never inline around it.**

Generic token-tier theory and citations: [foundations.md](references/foundations.md). Do/don't summary: [DOS-AND-DONTS.md](references/DOS-AND-DONTS.md).

## Components

House primitives: **Action**, **Badge**, **`cn()`** — owned in the package once extract lands. Until then, portfolio's `action-base` / `badge-base` in `globals.css` are the living contract.

Before hand-rolling a primitive, check the package (or portfolio interim). Compose screens from system parts; build custom only when the system genuinely lacks it and the operator agrees.

Component conventions (CVA, `data-slot`, focus ring): [components.md](references/components.md), [building-components.md](references/building-components.md).

## Starting a JHD web product

Follow [references/setup.md](references/setup.md): add `@jhd/design-system` as a dependency from `~/JHD/design-system/main`, wire `--font-suisse`, import package CSS — **do not** scaffold Vite+Geist+shadcn as the JHD path.

## Reference instance — portfolio

`~/JHD/portfolio/main` is the living **composition** example: how tokens and Action look in production. Token **source of truth** moves to the package when CSS lands; until then read `src/app/globals.css` sections 1–11. Details: [references/portfolio.md](references/portfolio.md).

## Conformance & review

Run the [conformance checklist](references/conformance.md). For sign-off, attach a [conformance report](references/conformance-report.md) — per-dimension on-system/flag, a11y read, verdict.

Multi-brand / reskin (Orbit ramps): [theming.md](references/theming.md) — only when a second brand is real, not for one-off pages.

## Native & Figma

- **Native products** (Capture.app) bind the same Figma variables in Swift — not a CSS copy. See vault ruling `fleet/rulings/jhd-design-system.md`.
- **Figma plugins** stay Figma — this skill does not apply.
