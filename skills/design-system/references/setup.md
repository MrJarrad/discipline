# Wiring a JHD web product to the house system

Goal: consume `@jhd/design-system` from the fleet package — **not** scaffold a
parallel Vite + Geist + shadcn token contract.

## Steps

1. **Ensure the package checkout exists** on disk:
   `~/JHD/jhd-design-system` (container clone via `jhd-container-clone.sh`
   if missing).

2. **Add the dependency** from the local package (workspace / file path until
   published):
   ```bash
   npm install ../design-system/main   # adjust relative path from your app root
   ```
   Or wire the monorepo/workspace alias your stack uses — the rule is **one
   import surface**, not a copied `globals.css` in the app.

3. **Import package CSS once** at the app root (e.g. Next.js `layout.tsx` or
   Vite `main.tsx`):
   ```ts
   import "@jhd/design-system/styles.css"   // path per package export once extract lands
   ```
   Until the package ships CSS, **do not vendor** — read the interim contract
   from `~/JHD/portfolio/main/src/app/globals.css` sections 1–11 and track
   package extract as the follow-up. New apps should plan for package import
   on day one.

4. **Supply Suisse** via `--font-suisse` in the app's theme / layout. Font
   files stay with the app — never copy them into the package or another product.

5. **Use Figma-named utilities** — `bg-background-default-primary`,
   `text-content-default-secondary`, `type-title title-style1-400`, Action
   classes from the package — not raw Tailwind colour steps or Geist defaults.

6. **Dark mode:** theme class on `<html>` swaps token values. No per-component
   `dark:bg-*` for base surfaces. Copy portfolio's `theme-provider.tsx` pattern
   if you need a reference toggle.

## Verify it took

- Toggle dark on `<html>` — surfaces re-theme without component edits.
- Grep for raw hex / arbitrary `[` values — should be zero outside the package.
- Action/Badge render with house radii and focus ring — not shadcn defaults
  unless explicitly part of the package.

## What you do **not** do on JHD products

- `npm create vite` + Geist + shadcn init as the house path.
- Copy `globals.css` (or `index.css`) from portfolio into a new app repo.
- Invent a second visual language because "it's faster."

For generic token-starter education (non-JHD greenfield), the old shadcn/Geist
baseline remains in `references/starter/` as reference material only — **not**
the JHD product path.
