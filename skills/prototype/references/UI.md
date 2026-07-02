# UI Prototype

Several **radically different** UI variations on one route, switchable from a floating bottom bar.

## When this is the right shape

- "What should this page look like?"
- Comparing layouts before committing

If the question is logic/state — use [LOGIC.md](LOGIC.md).

## Sub-shapes

**A — existing page (preferred):** variants on the same route via `?variant=`. Keep data fetching; swap the render subtree.

**B — new throwaway route (last resort):** only when there's nothing sensible to embed in. The path must say `prototype`.

## Process

### 1. State the question + pick N

Default **3 variants**, max **5**. A one-line plan in a comment or README.

### 2. Generate structurally different variants

Different layout, hierarchy, primary affordance — not colour tweaks. Use the project's component library.

### 3. Wire the switcher

`?variant=` param; `VariantA`, `VariantB`, etc.; a shared `PrototypeSwitcher` component.

### 4. Floating bottom bar

Prev/next variant, label, keyboard arrows. Hidden in production (gate on the environment).

### 5. Capture the verdict and clean up

Record the winning variant (NOTES.md, an ADR, an issue). Delete the losers and the switcher; fold the winner properly (rewrite — don't promote the prototype code verbatim).

## Anti-patterns

- Variants differing only in colour/copy
- A shared layout component that forces the same structure across variants
- Real mutations — read-only or stubs only
- Leaving the switcher in production
