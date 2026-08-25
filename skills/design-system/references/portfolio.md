# Reference instance — the portfolio site

The portfolio site (`~/JHD/portfolio/main`, dev server on :3210) is the living
**composition** example for JHD web UI — how house tokens and Action look in
production. It is **not** the token source of truth once `@jhd/design-system`
ships CSS; until then, its stylesheet is the interim contract.

## Where things live

```
src/
  app/globals.css              ← interim token contract (sections 1–11 + action-base/badge-base)
  lib/utils.ts                 ← cn()
  components/
    ui/                        ← site primitives aligned to house Action/Badge
    theme-provider.tsx         ← light/dark/system, class on <html>
    <block>.tsx                ← site blocks (composed sections — NOT the system)
  ...
components.json                ← shadcn config where still used
```

Read the actual tree — this sketch is only the shape to expect.

**Package vs site:** `MrJarrad/jhd-design-system` (`~/JHD/jhd-design-system`)
owns tokens + Action/Badge/`cn()` once extract lands. Portfolio owns **site
compositions** — NavigationHeader, list feed, case-study panels, print layouts.
Do not copy those blocks into new apps as if they were the system.

## Interim contract (until package CSS lands)

`src/app/globals.css` sections 1–11 define:

- Figma-named surfaces: `background-default-*`, `content-default-*`
- Type roles: `title-style1-*`, `body-style1-*`, caption utilities
- Action radii and `action-base` / `badge-base`
- Dark swap via token overrides — not per-component `dark:` colour fixes

When the package publishes CSS, new web products import it and portfolio
migrates off duplicated sections — still **no vendoring** into other repos.

## Blocks — composition, not primitives

Site blocks (EmptyState, shell/header patterns) show how design-craft's
composition ladder works in production. Study before building a new block;
**do not** treat them as copy-paste kit for other products.

## States

Empty / loading / error / disabled follow house patterns: EmptyState, Skeleton,
shared disabled opacity, `aria-invalid` + destructive pair. Build with the happy
path.

## Motion

Tailwind `tw-animate-css` + CSS transitions — see [`motion`](../../motion/SKILL.md).
Portfolio often inlines durations; promote to motion tokens when patterns repeat.

## Design docs

Vault ruling: `fleet/rulings/jhd-design-system.md`. Repo handover:
`projects/portfolio/portfolio-handover.md`.
