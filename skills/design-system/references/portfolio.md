# Reference instance — the portfolio site

The portfolio site (`~/JHD/portfolio`, dev server on :3210) is the living,
production instance of the house design system. When you need a worked example
of the system used well, read the real source there rather than inventing a
pattern.

## Where things live

```
src/
  index.css                    ← the token contract (the source of truth)
  lib/utils.ts                 ← cn()
  components/
    ui/                        ← shadcn primitives (owned source)
    theme-provider.tsx         ← light/dark/system, class on <html>
    <block>.tsx                ← site blocks (composed sections)
  ...                          ← page-level compositions built from blocks
components.json                ← shadcn config (baseColor: neutral)
```

Read the actual tree — it is the source of truth; this sketch is only the shape
to expect.

## Blocks — the reusable rung above primitives

The site's own composed sections are what "pages are built from blocks, not raw
markup" looks like in practice — study the existing blocks before building a new
one. House block patterns proven in production:

- **EmptyState** — the house "nothing here yet" shape (icon in a soft circle,
  title, optional description, optional action), reused so every empty surface
  reads as one system. Reach for this, don't hand-roll a per-screen empty
  message.
- **Shell/header blocks** — a consistent page/section header + content
  container, used everywhere rather than per-page markup.

## States are part of the system

Empty / loading / error / disabled aren't afterthoughts — they get the same care
as the happy path (design-craft's visual bar). The house patterns: **empty →
`EmptyState`** (above); **loading → `Skeleton`** (matching the shape of the
content it replaces); **disabled → the shared
`disabled:opacity-50 disabled:pointer-events-none`** every primitive already
carries; **error/invalid → `aria-invalid` + the `destructive` token pair**. Build
these states when you build the happy path, not after.

## Layout patterns

- **Container queries** (`@container`) on content sections so responsive
  behaviour is driven by container width, not viewport — the composition-ladder
  "responsive by construction" done right.
- **Responsive collapse** — labels collapse to icons when narrow rather than
  wrapping or truncating arbitrarily.

## Motion conventions (see also the `motion` skill)

No Framer Motion — Tailwind `tw-animate-css` + CSS transitions only.

- **Dialogs/modals:** `data-open:animate-in fade-in-0 zoom-in-95` /
  `data-closed:animate-out fade-out-0 zoom-out-95` (~100ms).
- **Nav:** slide + custom easing `cubic-bezier(0.22, 1, 0.36, 1)`, ~300ms.

Match the `motion` skill's decision framework when adding motion — most repeated
actions (keyboard toggles) get **no** animation.

*Seam note:* durations/easings are often inlined per component (Tailwind
`duration-100`, one-off cubic-beziers), not yet promoted to `--ease-*` /
`--duration-*` tokens. The `motion` skill prescribes named easing curves — promote
them into the token contract when motion grows beyond a handful of one-offs.

## House additions this instance proves out

The starter's labelled additions are all load-bearing here: `success`/`warning`
tokens (status badges, toasts), the `--chart-1..8` palette (shared by charts
*and* the tag/label palette so both read as one system), and the multiplier
radius scale (button sizes clamp radius with `rounded-[min(var(--radius-md),12px)]`).

## Design docs in the repo

Check the repo's own docs (`README`/handover notes) for the design philosophy
and open threads. House rule: *"nothing raw; compose from shadcn primitives"*
and the operator ethos — *simple is the harder, better answer; design is how it
works (no affordances that lie)*.
