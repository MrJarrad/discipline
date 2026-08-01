# Starting a new project on the house system

Goal: a new web app with the full token contract, dark mode, and shadcn wired —
before you write any UI. Don't hand-assemble tokens; drop in the starter.

## Steps

1. **Scaffold** Vite + React + TypeScript:
   ```bash
   npm create vite@latest my-app -- --template react-ts
   cd my-app && npm install
   ```

2. **Add Tailwind v4 + the Vite plugin:**
   ```bash
   npm install tailwindcss @tailwindcss/vite
   npm install tw-animate-css shadcn @fontsource-variable/geist
   ```
   In `vite.config.ts`, add the plugin and the `@` path alias:
   ```ts
   import { defineConfig } from "vite"
   import react from "@vitejs/plugin-react"
   import tailwindcss from "@tailwindcss/vite"
   import path from "node:path"

   export default defineConfig({
     plugins: [react(), tailwindcss()],
     resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
   })
   ```
   Mirror the alias in `tsconfig.json` (`"paths": { "@/*": ["./src/*"] }`) so
   `@/components`, `@/lib/utils` resolve.

3. **Drop in the three starter files** (from `starter/` in this skill):
   - `starter/index.css` → `src/index.css`, imported once in `src/main.tsx`
   - `starter/components.json` → project root
   - `starter/utils.ts` → `src/lib/utils.ts`

   At this point the full semantic token contract and light/dark theming are
   live — every `bg-*`/`text-*`/`rounded-*` utility resolves to a token.

4. **Initialise shadcn, then add primitives** as you need them:
   ```bash
   npx shadcn@latest init      # reads components.json — no prompts to fight
   npx shadcn@latest add button card dialog input
   ```

5. **Wire the theme toggle.** A `ThemeProvider` that stores `light`/`dark`/
   `system` in `localStorage` and sets the resolved class on `<html>`. See
   the portfolio site's `theme-provider.tsx` (`~/JHD/portfolio`)
   for a complete, keyboard-toggleable implementation to copy.

## Verify it took

- Toggle `dark` on `<html>` in devtools — the whole app should re-theme with no
  per-component changes. If a colour doesn't flip, it's a raw value, not a token.
- A `<Button>` renders with the ring-on-focus, pointer cursor, and radius from
  the scale. If not, `index.css` isn't imported or the `@` alias is wrong.
- Render at desktop **and** mobile widths before calling any screen done
  (design-craft's visual-truth rule).

## What you inherit for free

Semantic tokens · foreground pairing · OKLCH light/dark · one radius root ·
`success`/`warning` status tokens · the 8-hue categorical palette · `cn()` ·
CVA-ready components · Geist. Everything the reference instance (the portfolio site) is
built on.
