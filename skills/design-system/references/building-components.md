# How components are built

The mental model beneath the whole system: what the layers are, how each is built
from the one below, and why a component is more than its markup. [`design-craft`](../../design-craft/SKILL.md)
owns the universal composition ladder; this is the **concrete build on our stack**
(tokens → shadcn/Radix → CVA → blocks). Read them together.

## First, the vocabulary — one word, two meanings

"Primitive" is overloaded. Say which you mean:

- **Primitive *token*** — a raw value (`oklch(0.205 0 0)`, `4px`). The bottom of
  the *token* ladder. Named by value.
- **Primitive *component*** — a base UI element from the system (Button, Dialog,
  Popover), built on Radix. The bottom of the *component* ladder.

They connect: primitive components are styled entirely through **semantic tokens**,
which resolve to primitive tokens. So "components are built from semantics, and
semantics from primitives" is literally true — it's the token ladder feeding the
component ladder.

## The full ladder, on this stack

```
primitive tokens        raw values, one place only        (oklch, 4px)          ← index.css :root/.dark
      │  referenced by
semantic tokens         role names                        (--primary, --border)  ← index.css
      │  exposed as utilities via @theme
styles / utils          shared class compositions + cn()  (focus-ring, @layer)   ← index.css, lib/utils
      │  composed into
primitive components    shadcn on Radix, CVA variants     (Button, Dialog)       ← components/ui
      │  composed into
composed components     app-specific units + shells       (Rail, PaneShell)      ← components/
      │  composed into
patterns / blocks       reusable sections                 (EntityHeader, Thread) ← components/
      │  arranged by
page templates          layouts that place blocks         (entity-detail)        ← screens/, layout/
```

**The rule that makes it a ladder:** each rung composes the rung *directly below*,
and never reaches past it to a raw value or one-off markup. A component reaches for
a semantic token, never a hex. A page reaches for a block, never naked markup.
(design-craft: "a raw value is a bug"; "every page is blocks within a template.")

## The styles / utils layer — often skipped, don't

Between tokens and components sits a thin but real layer of **shared style**:

- **`cn()`** (`@/lib/utils`) — the one merge helper every component ends its class
  computation through, so overrides resolve predictably.
- **`@layer base`** in `index.css` — global element defaults built from tokens
  (`body { @apply bg-background text-foreground }`, the restored pointer cursor,
  the height chain).
- **Shared style fragments reused across components** — e.g. the focus-visible
  ring (`focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50`)
  and the icon auto-size rule. These are *styles*, not components: they don't
  render anything, they're reused declarations built from tokens. When a styling
  recipe repeats across components, it belongs here, named — not copy-pasted.
- **`tw-animate-css`** — the shared animation utilities (`animate-in`, `fade-in-0`,
  `zoom-in-95`) components pull from, rather than hand-writing keyframes.

## A component is not just HTML + CSS

This is the big one. A real component in this system is a **complete unit** across
every facet — miss one and it's half-built:

1. **Structure** — the markup / Radix primitive, with the right semantic element
   (`<button>`, not a `<div onClick>`).
2. **Tokenised style** — every colour/space/radius from a token; zero raw values.
3. **Variants** — its axes of variation declared in CVA (`variant`, `size`), not
   ad-hoc `className` at each call site.
4. **All states** — not just the happy path: `hover`, `focus-visible`, `active`,
   `disabled`, `aria-invalid`, and where relevant loading/empty/selected/expanded.
   The button ships every one.
5. **Motion** — enter/exit/press transitions are *part of the component*, not a
   later coat of paint. A dialog that pops in, a button that presses down 1px, a
   pane that animates its width — the motion is authored with the component. (The
   easing/timing *decisions* follow [`motion`](../../motion/SKILL.md); the
   point here is that motion is in scope, not optional.)
6. **Accessibility** — focus management, keyboard, ARIA (Radix gives most free),
   hit-target size, reduced-motion.
7. **Behaviour / data glue** — controlled/uncontrolled state, callbacks, and the
   wiring to an API/SSE source (integration glue is expected — it's not "a custom
   component").

If you only did HTML + CSS, you built a picture of a component, not a component.

## The build recipe

Building one, in order:

1. **Check the system first** — is it a shadcn/Radix primitive already? If so,
   `npx shadcn add` it and stop. Hand-roll only with operator sign-off (rule-zero,
   [components.md](components.md)).
2. **Start from the primitive** — compose the Radix base; inherit its a11y.
3. **Style through tokens only** — semantic tokens for every value; low-alpha for
   status fills (`bg-destructive/10`).
4. **Declare variants in CVA** — the real axes of variation, with `defaultVariants`.
5. **Cover every state** — wire the shared focus ring, disabled, invalid; add
   loading/empty where the component owns them.
6. **Author the motion** — enter/exit/press, from `tw-animate-css` + token easing.
7. **Stamp the hooks** — `data-slot`, `data-variant`, `data-size`; `asChild` for
   polymorphism.
8. **Wire behaviour** — state + callbacks + data.
9. **Verify at real viewports**, both themes, keyboard-only (design-craft's
   visual-truth rule).

## Shells & slots — components that are containers

A component doesn't have to render content — many just provide **structure + a
slot** for other components to fill. This is how you get consistency *and*
flexibility at once:

- **The shell owns the chrome** (header, padding, borders, the frame) so it's
  identical everywhere.
- **The slot varies** — `children` (or a named prop like `action`) holds whatever
  composed components the caller drops in.

Examples in the reference instance: **PaneShell** (a consistent pane header +
content region; every pane is *its content, slotted into the same shell*),
**Card** (`CardHeader`/`CardContent` are slots), **Sidebar**, **EmptyState**
(`action` is a slot for any CTA). Two mechanisms:

- **`children`** — the ordinary slot.
- **`asChild`** (Radix `Slot`) — merge the component's behaviour/style *onto* the
  child element the caller supplies, so a Button can *become* the caller's `<a>`.

A shell is a full component by the definition above — it just happens that its
"structure" facet dominates and its "content" is delegated to the slot.

## Why patterns & components matter — the payoff

Reusable components and blocks aren't bureaucracy — they're the mechanism for the
two things the system exists to deliver:

- **Consistency** — the shell/primitive is defined once, so every instance looks
  and behaves the same. A fix to the component fixes every screen.
- **Efficiency** — you assemble screens from existing rungs instead of rebuilding
  chrome each time. New work is composition, not construction.

So when a composition repeats, **promote it to a named block** (the naming
"promotion" pattern, [naming.md](naming.md)) rather than copy-pasting it. A
repeated chunk of markup is a missing block — the same defect as a repeated raw
value is a missing token.

## How proper use is enforced

Understanding the ladder is half; the skill *holds you to it* through:

- **Rule-zero** — install/compose from the system; never hand-roll a primitive it
  ships ([components.md](components.md)).
- **Extend, don't override** — a new need becomes a CVA variant or a new token,
  deliberately; not a one-off `className` or inline value ([SKILL.md](../SKILL.md)).
- **The composition rule** — pages are blocks in templates; raw markup on a page
  is a bug (design-craft).
- **The conformance checklist** — grep-able anti-patterns that catch raw values,
  hand-rolls, and missing states ([conformance.md](conformance.md)).
