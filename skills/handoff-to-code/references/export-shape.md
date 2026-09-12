# Export shape — what the companion and a live capture carry

An export carries more than a flat token list, and the implementation reads all of it:

- **Stable ids for rename detection.** Variables and styles carry an OPTIONAL `id` (the
  design tool's persistent id); components carry `key`, which already served this purpose.
  When an id is present on both sides of a sync, correlate by id first — a renamed entry
  reads as a rename, never as a spurious removed+added pair. Treat ids as
  available-but-optional: older exports without them fall back to name-only diffing, and
  that fallback is not itself a defect.
- **Components, standalone and sets, with full prop schemas.** Standalone components and
  component sets each carry their typed prop schema (VARIANT props with their option list,
  BOOLEAN/TEXT/INSTANCE_SWAP props with defaults and, for INSTANCE_SWAP, preferred component
  keys) — read this as the props API, not a flat list.
- **Per-variant layer bindings — the component-internals chain.** Each variant in a component
  set may carry `bindings`: an array of `{ layer, property, value }` recording which layer
  *inside* the component binds which property to which variable (alias) or holds it raw.
  Read a variant's bindings before assuming its internals are uniform across the matrix.
- **Per-variable responsive behaviour.** A dimensional variable's `responsiveBehavior.rules`
  are published **per layout variant** — the same variable can be `mode-stepped` at the
  default variant and `fluid-clamp` at another, and each is honoured on its own. The
  variable's own `description` may state a viewport fraction in the exact form
  `N% of screen height` / `N% of screen width`; that convention is a supported input, because
  design-tool variables carry no viewport semantics and a description is the only place a
  designer can state the fraction today.
