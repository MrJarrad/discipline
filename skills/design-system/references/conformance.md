# Conformance checklist

Turn "read the docs" into "run the check." Apply this when reviewing UI for
system conformance — most items are grep-able. A hit is a finding to justify or
fix, not always a hard fail (the legit exceptions are named).

## Grep-able anti-patterns

Run from the app root (adjust `src/`). Each should return **nothing** in shipped
UI; a hit is a raw value that should be a token.

| # | Anti-pattern | Detection | Legit exception |
|---|---|---|---|
| 1 | Raw hex colour | `grep -rnE '#[0-9a-fA-F]{3,8}\b' src --include=*.tsx` | The `--chart-N` palette in `index.css` only |
| 2 | Raw `oklch()`/`rgb()`/`hsl()` outside the contract | `grep -rnE 'oklch\(|rgb\(|hsl\(' src --include=*.tsx` | None — all colour lives in `index.css` |
| 3 | `dark:` colour override on a component | `grep -rnE 'dark:(bg|text|border)-' src --include=*.tsx` | Rare structural tweak (e.g. translucent input fill) — never a base colour |
| 4 | Raw radius | `grep -rnE 'rounded-\[' src --include=*.tsx` | Clamps like `rounded-[min(var(--radius-md),12px)]` that reference a token |
| 5 | Raw z-index | `grep -rnE 'z-\[|z-(50|40|30|20|10)\b' src --include=*.tsx` | Use the named scale (`z-overlay`…) instead |
| 6 | Raw shadow step (should be role token) | `grep -rnE 'shadow-(sm|md|lg|xl|2xl)\b' src --include=*.tsx` | `shadow-none`; else use `shadow-raised/overlay/modal` |
| 7 | Arbitrary spacing/size | `grep -rnE '(p\|m\|gap\|w\|h)-\[' src --include=*.tsx` | Genuinely dynamic values (computed, `--var`) |
| 8 | Bare colour utility (bypasses tokens) | `grep -rnE '(bg\|text\|border)-(white\|black\|zinc\|gray\|slate\|neutral)-?[0-9]*' src --include=*.tsx` | None — use semantic tokens |

## Eyeball checks (not grep-able)

- **Foreground/background pairing** — every surface uses its own `-foreground`;
  no `card-foreground` text on a `primary` surface. Contrast passes WCAG 2.x AA
  (4.5:1 text / 3:1 UI) in **both** themes.
- **Nothing hand-rolled that the system ships** — a bespoke dropdown/table/avatar
  where a shadcn primitive exists is a finding (design-craft's hard rule).
- **One-off overrides that should be variants** — a long `className` bending a
  component at one call site → add a variant to its CVA map instead.
- **Type from the role set** — sizes/weights from the four roles, not invented
  per component; line-height/tracking set with the role, not sprinkled.
- **Blocks, not raw markup on pages** — a page is blocks in a template; a naked
  chunk of markup dropped onto a screen is the same bug as a raw value.
- **States present** — empty (`EmptyState`), loading (`Skeleton`), disabled, and
  error/invalid states exist, not just the happy path.
- **Dark mode is a value swap** — toggling `.dark` re-themes with no per-component
  changes; anything that doesn't flip is a raw value.
- **Reskinnability** — semantic token names describe *purpose*, never appearance
  (`--surface-danger`, not `--red`/`--blurple`); components reference only semantic
  names, never a primitive step (`--red-500`) or raw value. These two are the gates
  that decide whether the system can be reskinned at all — [theming.md](theming.md).
  (The raw-value greps above double as the mechanical half of this check.)
- **Verified at real viewports** — desktop *and* mobile, named (design-craft's
  visual-truth rule). A code diff alone doesn't approve UI.

## Accessibility floor

- **Focus** — every interactive element shows the shared `focus-visible` ring;
  keyboard order is sane; dialogs trap focus (Radix gives this free — don't break
  it with a custom overlay).
- **Reduced motion** — non-essential motion is gated behind
  `@media (prefers-reduced-motion: reduce)` (or Tailwind's `motion-reduce:`).
  *Currently unhandled in the reference instance — add it.*
- **Hit targets** — see the density trade-off note in [components.md](components.md);
  touch-primary contexts need ≥44px, dense desktop can go smaller with spacing.
- **Semantic HTML** — real `<button>`/`<a>`/`<nav>`/headings; ARIA only to fill
  genuine gaps, not to paper over a `<div>` that should be a button.
