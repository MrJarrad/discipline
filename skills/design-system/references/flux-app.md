# Reference instance — flux-app

flux-app (`~/JHD/flux-app`) is the living, production instance of the house
design system. When you need a worked example of the system used well, read the
real source here rather than inventing a pattern.

## Where things live

```
src/
  index.css                    ← the token contract (the source of truth)
  lib/utils.ts                 ← cn()
  components/
    ui/                        ← ~47 shadcn primitives (owned source)
    prompt-kit/                ← shared markdown/command helpers (registry)
    theme-provider.tsx         ← light/dark/system, class on <html>, `d` to toggle
    <block>.tsx                ← app blocks (see below)
  screens/                     ← page-level compositions (Tasks, GoalDetail, …)
  layout/AppLayout.tsx         ← the shell
  context/PaneContext.tsx      ← pane/workspace state
components.json                ← style: radix-nova, baseColor: neutral
```

## Blocks — the reusable rung above primitives

flux-app's own composed sections. This is what "pages are built from blocks, not
raw markup" looks like in practice — study these when building a new block:

- **PaneShell** — consistent pane header + content container; every pane uses it.
- **EntityHeader** — breadcrumb + meta for Task/Goal detail pages.
- **EntityAbout** / **EntityActionRow** — description editor; action buttons.
- **Rail** (TaskRail, GoalRail) — the properties sidebar. *Pattern: attributes in
  the rail, collections in tabs.*
- **Thread** — shared chat/timeline view across Task + Goal.
- **QuickCreatePopover** / **CaptureDialog** — inline create, quick capture.
- **TickerText** — truncate-to-hover-scroll text.
- **EmptyState** — the house "nothing here yet" shape (icon in a soft circle,
  title, optional description, optional action), used across ~10 screens so every
  empty surface reads as one system. Reach for this, don't hand-roll a per-screen
  empty message.

## States are part of the system

Empty / loading / error / disabled aren't afterthoughts — they get the same care
as the happy path (design-craft's visual bar). The house patterns: **empty →
`EmptyState`** (above); **loading → `Skeleton`** (matching the shape of the
content it replaces, used across the same ~10 screens); **disabled → the shared
`disabled:opacity-50 disabled:pointer-events-none`** every primitive already
carries; **error/invalid → `aria-invalid` + the `destructive` token pair**. Build
these states when you build the happy path, not after.

## Layout patterns

- **Pane workspace** on `react-resizable-panels` v4 — vertical-first tiling (max
  2 rows per column, then a new column). Panes animate width on open/close.
- **Sidebar rail** — `16rem` desktop / `18rem` mobile / `3rem` icon-only; toggle
  with `b`.
- **Container queries** (`@container`) on detail panes so responsive behaviour is
  driven by pane width, not viewport — the composition-ladder "responsive by
  construction" done right.
- **Sticky, responsive tab bar** — inactive tab labels collapse to icons when
  narrow.

## Motion conventions (see also motion-craft)

No Framer Motion — Tailwind `tw-animate-css` + CSS transitions only.

- **Panes:** `transition: flex-grow 200ms linear` via `[data-slot="resizable-panel"]`,
  suppressed mid-drag by a `data-dragging` flag on the group.
- **Dialogs/modals:** `data-open:animate-in fade-in-0 zoom-in-95` /
  `data-closed:animate-out fade-out-0 zoom-out-95` (~100ms).
- **Nav menu:** slide + custom easing `cubic-bezier(0.22, 1, 0.36, 1)`, ~300ms.

Match motion-craft's decision framework when adding motion — most repeated actions
(keyboard toggles) get **no** animation.

*Seam note:* durations/easings are currently inlined per component (Tailwind
`duration-100`, a one-off nav-menu `cubic-bezier`), not yet promoted to `--ease-*`
/ `--duration-*` tokens. motion-craft prescribes named easing curves — promote them
into the token contract when motion grows beyond a handful of one-offs.

## House additions this instance proves out

The starter's labelled additions are all load-bearing here: `success`/`warning`
tokens (status badges, toasts), the `--chart-1..8` palette (shared by charts
*and* the tag/label palette so both read as one system), and the multiplier
radius scale (button sizes clamp radius with `rounded-[min(var(--radius-md),12px)]`).

## Design docs in the repo

`HANDOVER.md` carries the design philosophy and open threads. House rule quoted
there: *"nothing raw; compose from shadcn + prompt-kit"* and the operator ethos —
*simple is the harder, better answer; design is how it works (no affordances that
lie)."*
