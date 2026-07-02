# Naming conventions

Names are the interface to the whole system — the part every agent types a
hundred times a day. Get them consistent and the system feels like one thing;
get them ad-hoc and it reads as several. Two domains: **token names** and **code
names**.

## Token names

### By value or by role — decided by tier

- **Primitive tokens** are named by their **value**: `blue-500`, `space-4`,
  `radius-2`. They describe *what the thing is*.
- **Semantic + component tokens** are named by their **role/purpose**:
  `primary`, `muted-foreground`, `sidebar-border`. They describe *how it's used*.
  Never bake the value into a semantic name (`--danger`, never `--red-500`) — the
  name has to survive a rebrand that changes the hex.

  This is also a **reskinnability gate**: a semantic name must describe *purpose*,
  never *appearance or brand identity*. `--surface-danger` survives a palette
  change; `--red` or `--blurple` (a specific brand's colour as the semantic name
  rather than an alias *of* it) locks the token to one look and defeats theming.
  It's a naming-review check on every new token — see [theming.md](theming.md).

(The house starter collapses primitives into the semantic layer, so most names
you touch are role names — see the tiers note in [SKILL.md](../SKILL.md).)

### The compositional structure

A token name is levels joined by a separator, ordered general → specific
(Nathan Curtis / EightShapes):

```
[namespace-] object/category - property [- modifier]
   sidebar   -    border                          → surface line for the sidebar
             -    foreground                       → the base text/icon role
   primary   -    foreground                       → text/icon over a primary surface
   chart     -    3                                → 3rd categorical hue
```

- **object/category** + **property** are the required base (e.g. `border`,
  `foreground`). This base is what makes two names feel like siblings.
- **namespace** scopes a subsystem (`sidebar-`, `chart-`).
- **modifier** trails for state/variant when needed (`-foreground`, a step index).

### Three rules that keep it durable

1. **Homogeneity within a class, heterogeneity between classes.** Everything in
   one group shares a shape; different groups look clearly different. All surfaces
   read `X` / `X-foreground`; all categoricals read `chart-N`. A reader can tell
   the *class* from the shape of the name alone.
2. **No homonyms.** One word, one meaning across the system. Don't let `accent`
   mean a surface in one place and an outline color in another.
3. **Promote, don't pre-design.** A token may start local to a component and get
   *promoted* to the semantic layer once reuse is proven — bottom-up. You don't
   have to name every token top-down on day one; you do have to promote it (and
   rename to a role name) the moment a second caller wants it.

### The house token vocabulary

The concrete role names you reference (values in [starter/index.css](starter/index.css)):

| Class | Names | Shape |
|---|---|---|
| Surfaces | `background`, `card`, `popover`, `sidebar` (+ `-foreground`) | `X` / `X-foreground` |
| Intent | `primary`, `secondary`, `muted`, `accent` (+ `-foreground`) | `X` / `X-foreground` |
| Status | `destructive`, `success`, `warning` | role word |
| Lines & focus | `border`, `input`, `ring` | role word |
| Categorical | `chart-1` … `chart-8` | `chart-N` |

## Code names

Concrete house conventions — match them so new code is indistinguishable from
the built-ins.

- **Primitives: PascalCase, no suffix** — `Button`, `Card`, `Dialog`. One
  concept, one name.
- **Compound parts: parent-prefixed PascalCase** — `CardHeader`, `CardContent`,
  `DialogOverlay`, `DialogContent`. The prefix ties the part to its parent and
  keeps imports self-documenting.
- **Style hooks: `data-slot`, kebab-case** — `data-slot="button"`,
  `data-slot="resizable-panel"`. This is the CSS targeting seam; never target by
  class name. Variant context rides alongside as `data-variant` / `data-size`.
- **Group-scoping: `group/<name>`** — `group/button`, `group/badge` — so nested
  `group-data-*` selectors don't collide across components.
- **Variant + size keys: lowercase, hyphenated** — `default`, `outline`, `ghost`,
  `icon`, `icon-sm`. These are the CVA map keys and the `data-*` values; keep
  them identical.
- **Files: kebab-case matching the export** — `button.tsx` → `Button`,
  `theme-provider.tsx` → `ThemeProvider`, `resizable.tsx` → `Resizable`.
- **Utility: `cn()`** at `@/lib/utils` — the one merge helper, referenced by
  alias, never re-implemented per file.

### Where things live (the naming of places)

```
src/components/ui/     ← primitives (owned shadcn source)
src/components/        ← app blocks (PaneShell, Rail, Thread…)
src/screens/           ← page-level compositions
src/lib/               ← utils, helpers (cn, time, queryKeys)
```

Blocks are named for *what they are in the product* (`EntityHeader`, `TaskRail`),
not for their shape — the product vocabulary, not the layout vocabulary.

## Source

Token-naming framework: [Nathan Curtis, "Naming Tokens in Design Systems" (EightShapes)](https://medium.com/eightshapes-llc/naming-tokens-in-design-systems-9e86c7444676).
Code conventions transcribed from the flux-app reference instance.
