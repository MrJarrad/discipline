---
name: design-craft
description: How to apply ANY design system to produce best-in-class UI — the universal "how" beneath every project's own system. Reach for existing tokens/components first, match the system, verify visually. Pairs with each repo's own design system + usage guide.
---

# Design Craft

A design system tells you *what* exists. This skill is *how* to wield it — on any project.

Read [references/DOS-AND-DONTS.md](references/DOS-AND-DONTS.md) when applying this skill.

## The one rule — nothing raw, ever
Every value in shipped UI references the system: a **token / variable**, a **shared style**, a **shared component**, or a **block** (a composed, reusable section). No hardcoded colors, spacing, type, or one-off markup — **a raw value is a bug, not a shortcut.** If what you need isn't in the system, **add it to the system, then reference it** (see *System changes are deliberate*). This holds regardless of which design system the project uses — it's the rule beneath all the rest.

## The composition ladder
Build only by climbing this ladder — each rung composes the rung below, never reaching past it to raw values or one-off markup:

**tokens → styles / utils → components → blocks / modules → page templates**

- **Tokens** — the design variables (colour, spacing, type, radius). The *only* place raw values live.
- **Styles / utils** — shared utility classes & helpers, built from tokens.
- **Components** — single-purpose reusable primitives (button, card, input), built from styles + tokens.
- **Blocks / modules** — composed, reusable sections (a header, a goal list, a run panel), built from components.
- **Page templates** — layouts that arrange blocks.

**The composition rule: every page is blocks within a page template — never raw markup dropped onto a page.** If a page needs something that isn't a block yet, build the block (from components, from tokens), then place it. A one-off chunk of markup on a page is the same bug as a raw colour value.

**Responsive by construction.** Every rung from components upward is built to render responsively — a page template flexes only because the blocks and components beneath it already do. Responsiveness is designed in at the component level, never bolted onto the finished page. (Verify at real viewports — see below.)

## Adopt, don't transliterate
When you move UI onto a design system, adopt its **conventions and real components** — don't carry the old system's quirks across. A like-for-like swap that preserves one-off corner radii, ad-hoc shadows, or bespoke reimplementations of things the system already provides (charts, tables, hover-cards, avatars) is the bug, not the goal. Use the system's component for the job; match its radius scale and elevation; delete the local idiosyncrasy. If you catch yourself preserving a "load-bearing" override, question whether it's truly load-bearing or just inherited drift — default to the system's convention.

**Hard rule — never hand-roll what the system provides.** Before building ANY component, check the system first: shadcn components, blocks, charts, and the registry directory (third-party registries). Pull and compose those. Build something custom **only** when it genuinely doesn't exist in the system *and* the operator has agreed it should be custom — **surface that decision before building it, never quietly hand-roll.** (Composing screens *out of* the system's primitives is expected; reinventing a primitive/component the system already ships is the violation.) Necessary *integration glue* — wiring a component to an API/SSE/data source — is not "a custom component" and doesn't need this gate.

## On arrival in a project
1. **Find the system.** Locate this project's design system + usage guide (check the repo: `AGENTS.md`, a tokens/design dir, a `shared/` foundation). Read it before touching UI.
2. **Reach for what exists first.** Use the project's tokens, components, and patterns. "Almost the same but slightly different" is the enemy — use the system as-is or extend it; invent only with a stated reason.

## The visual bar (applies everywhere)
- **Hierarchy is visible** — a stranger can tell primary/secondary/tertiary in two seconds.
- **Spacing is intentional** — from the scale; no stray gaps, nothing crammed.
- **Alignment is ruthless** — everything to a grid / baseline / shared edge.
- **Type has a system** — sizes/weights/line-heights from the scale, not per-component.
- **Density matches context** — dashboards dense, marketing breathes, forms have room.
- **Polish the defaults** — empty / loading / error states get the same care as the happy path.

## Verify before done (visual-truth)
Render the surface at real viewports (desktop + mobile) — don't approve UI from a code diff alone. Name the surface + viewport you checked.

## System changes are deliberate
Need a new token/component? Propose it as a system change with rationale + where else it's reused — don't quietly inline a one-off.

This is the universal layer. Each project's *specific* how (its own tokens + patterns) lives in that repo's usage guide — read it on arrival. Sits under `flux-quality` (the bar).
