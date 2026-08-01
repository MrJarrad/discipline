# Components

The concrete component half of the system: what ships, the conventions every
component follows, and how to add or extend one without breaking the contract.

## Rule zero — install, don't hand-roll

Before building **anything**, check the system first:

```bash
npx shadcn@latest add button dialog table   # add one or many
```

shadcn writes the component into `src/components/ui/` as source you own — token-
wired, accessible, yours to edit. ("You own the source" is shadcn's *argued*
position — *"this is not a component library; it's how you build your component
library"* — chosen so you never fight an npm library's API when customization
outgrows it. It's a strong, credible stance, not unanimous industry consensus;
attribute it accurately if a stakeholder pushes back. See [foundations.md](foundations.md).)
Compose screens *out of* these primitives.
Build a custom primitive **only** when the system genuinely lacks it *and* the
operator has agreed it should be custom — surface that decision, never quietly
hand-roll (design-craft's hard rule). Wiring a primitive to an API/SSE/data
source is integration glue, not a custom component — no gate needed.

Also check third-party registries before assuming absence — the house config
wires `@prompt-kit` (`npx shadcn@latest add @prompt-kit/<name>`).

## The house inventory (~47 primitives)

All on Radix, all token-wired, all following the conventions below.

**Forms & input:** Button, Button Group, Input, Input Group, Input OTP,
Textarea, Label, Checkbox, Radio Group, Select, Switch, Slider, Toggle, Toggle
Group, Calendar.

**Overlays & menus:** Dialog, Alert Dialog, Sheet, Drawer, Popover, Hover Card,
Tooltip, Dropdown Menu, Context Menu, Menubar, Command (⌘K palette), Navigation
Menu.

**Layout & surfaces:** Card, Separator, Aspect Ratio, Scroll Area, Resizable,
Sidebar, Accordion, Collapsible, Tabs.

**Data & feedback:** Table, Chart (recharts + `--chart-1..8`), Badge, Avatar,
Progress, Skeleton, Sonner (toasts), Alert, Breadcrumb, Pagination, Carousel.

Don't treat this list as a ceiling — anything on ui.shadcn.com or a wired
registry is one `add` away.

## The five conventions

Every component in the system follows these. New/custom components must too, so
they're indistinguishable from the built-ins.

### 1. CVA for variants

Variants are declared data, not ad-hoc conditionals. `class-variance-authority`
holds a base string + `variants` map + `defaultVariants`:

```tsx
const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-lg text-sm font-medium …",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/80",
        outline: "border-border bg-background hover:bg-muted hover:text-foreground",
        secondary: "bg-secondary text-secondary-foreground …",
        ghost: "hover:bg-muted hover:text-foreground …",
        destructive: "bg-destructive/10 text-destructive hover:bg-destructive/20 …",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: { default: "h-8 px-2.5", sm: "h-7 px-2.5 text-[0.8rem]", lg: "h-9 px-2.5", icon: "size-8" },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
)
```

Note the token-only styling: `bg-primary`, `text-destructive`, `bg-destructive/10`
(low-alpha status fill). No hex, no `dark:` colour overrides — the tokens carry
the theme.

### 2. `cn()` for the final merge

The component always ends its class computation through `cn()` so a caller's
`className` can override cleanly (tailwind-merge lets the last conflicting
utility win):

```tsx
className={cn(buttonVariants({ variant, size, className }))}
```

### 3. `data-slot` for style hooks

Every component stamps a stable `data-slot` (and often `data-variant` /
`data-size`). These are the targeting seam for cross-component styling and for
unlayered CSS that must beat Tailwind's layers — never target by class name:

```tsx
<Comp data-slot="button" data-variant={variant} data-size={size} … />
```

```css
/* e.g. animate panes by slot, not by a brittle class */
[data-slot="resizable-panel"] { transition: flex-grow 200ms linear; }
```

### 4. `asChild` for polymorphism

Radix `Slot` lets a component render *as* its child element, forwarding all
styling — a Button that's actually an `<a>`, a link that's a menu trigger:

```tsx
import { Slot } from "radix-ui"
const Comp = asChild ? Slot.Root : "button"
```

```tsx
<Button asChild><a href="/goals">Goals</a></Button>
```

### 5. One focus-visible pattern

Keyboard focus looks identical across the system — a ring driven by the `ring`
token, plus `aria-invalid` styling from `destructive`:

```
focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50
aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20
```

Icons auto-size (`[&_svg:not([class*='size-'])]:size-4`) and disabled states are
uniform (`disabled:pointer-events-none disabled:opacity-50`).

### Accessibility floor every component owes

Radix gives focus management, keyboard nav, and ARIA for free — don't break it with
a custom overlay or a `<div onClick>`. Beyond colour contrast (WCAG AA), owe:

- **Hit targets.** The house `icon` button is `size-8` (32px) and `sm` is `h-7`
  (28px) — both deliberately *below* WCAG 2.5.5's 44px, a dense-desktop density
  trade-off. Fine for pointer-dense app surfaces; **touch-primary contexts must use
  a larger size variant** — don't ship 28px as a primary touch target.
- **Reduced motion.** Gate non-essential motion behind `motion-reduce:` /
  `@media (prefers-reduced-motion: reduce)`. Currently unhandled in the reference
  instance — add it when you touch motion.
- **Semantic HTML.** Real `<button>`/`<a>`/headings; use `asChild` to keep the
  correct element rather than restyling a `<div>`. ARIA only fills genuine gaps.

## Extending a component

Adding a variant is a **system change**, done in the component's CVA map — not an
inline override at the call site. Add the case (token-styled), and every caller
gets it:

```tsx
// in badge.tsx variants.variant
success: "bg-success/10 text-success",
warning: "bg-warning/10 text-warning",
```

If you find yourself passing a long `className` to bend a component at one call
site, that's the signal to add a variant instead. A one-off override is the same
defect as a raw value.

## Blocks — the rung above primitives

Reusable composed sections (a header, a properties rail, a list panel) are
**blocks**, built from primitives, and pages are built from blocks — never raw
markup dropped onto a page (design-craft's composition rule). The portfolio site's blocks are the reference — see
[portfolio.md](portfolio.md).
