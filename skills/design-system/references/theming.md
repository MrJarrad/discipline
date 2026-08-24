# Theming & re-skinning

The payoff of tokens. A well-structured token system lets you reskin an entire
product — new brand, new style — by changing the **raw values once** and having
the change flow through semantics → components → screens automatically, because
nothing references a raw value directly. This doc is how to architect for that,
and how to actually do it on our stack.

The thesis is industry consensus, not opinion: every mature system studied
(Material 3, Adobe Spectrum, Salesforce, Radix, shadcn) converges on the same
shape — a fixed **semantic contract** that components bind to, swappable themes
underneath. Sources inline; confidence flagged where thin.

## The theme contract

**Semantic names are a versioned public API; themes are alternate implementations
of it.** The rule that makes a token set swappable: components reference only the
**semantic tier** (`--primary`, `--content-danger`), and every theme supplies a
value for every name in that fixed set. The names never change across themes —
only the values they resolve to.

- **Material 3:** reference → system → component tiers; a system token "can point
  to different reference tokens depending on context, such as light or dark theme."
  ~26 fixed colour roles are the contract. — [m3.material.io/foundations/design-tokens](https://m3.material.io/foundations/design-tokens/overview) · [color roles](https://m3.material.io/styles/color/roles)
- **Spectrum:** global → alias → component, with a deprecation-as-alias migration
  path (rename kept as an alias before removal). — [adobe/spectrum-tokens](https://github.com/adobe/spectrum-tokens)
- **Radix Colors** on why the alias tier exists: it "creates a layer of
  abstraction between design intent and implementation… teams can swap entire
  colour systems without changing component code." — [radix aliasing](https://www.radix-ui.com/colors/docs/overview/aliasing)

**Locked vs. swappable:** locked = a component references a raw value or a
primitive-tier token. Swappable = it references only a semantic name. That's the
whole game.

## The indirection requirement — and where our baseline sits

A component that references a raw hex or a primitive step (`--red-500`) directly is
**un-themeable** — a rebrand that revalues the palette now has to touch every such
component. This is the most-repeated principle in the field and it has a named
failure mode (Apache Superset hardcoding modal padding past its own theme token).
Material states it normatively: "component tokens should point to a system or
reference token, and not contain hardcoded values such as hex codes." — [m3 tokens](https://m3.material.io/foundations/design-tokens/overview) · [Superset #36842](https://github.com/apache/superset/issues/36842)

Our shadcn baseline is **two-tier collapsed** (raw OKLCH values sit inside the
semantic names; no primitive palette) — see the tiers note in [foundations.md](foundations.md).
That's reskinnable *by mode* (the `.dark` swap already proves the mechanism) but
**not by brand**: there's no primitive ramp layer to revalue. To go multi-brand,
introduce the missing tier — a primitive palette of brand ramps that the semantic
tokens alias. That's exactly what the house Orbit system does (below).

## Where the swap happens

Three legitimate mechanisms; most real systems combine two.

| Mechanism | Best for | Cost |
|---|---|---|
| **CSS custom properties**, scoped per selector (`:root`, `.dark`, `[data-brand]`) | web-only, few brands, fast iteration | manual duplication grows with brand count unless generated |
| **Build-time** (Style Dictionary / Terrazzo) | multi-platform (web + iOS + Android), many brands | build step; not instantly user-switchable |
| **Runtime** (Material Dynamic Color / HCT) | personalization from arbitrary input | needs a colour-science lib; exact brand hex harder to guarantee |

- Style Dictionary's canonical multi-brand example splits sources into
  `brands/{brand}/`, `platforms/{platform}/`, `global/` and builds every
  `(brand, platform)` pair; semantic `color.primary` aliases `{color.brand.primary}`
  so the name is invariant across the matrix. — [style-dictionary multi-brand example](https://github.com/style-dictionary/style-dictionary/tree/main/examples/advanced/multi-brand-multi-platform)
- Terrazzo (on the now-stable W3C DTCG 2025.10 spec) formalizes this as **modes**
  ("alternate values of a token… solve theming, responsive, a11y, preference") with
  **resolvers** describing how token sets combine. — [terrazzo](https://terrazzo.app/docs/tokens/)

**The brand × mode problem (2 axes).** Keep them **orthogonal**: two independent
attributes on `<html>` — `data-brand="acme"` and `data-mode="dark"` — not nested
classes. Brand-only tokens (radius, font) live in the `[data-brand]` block so they
aren't repeated per mode; mode-affected tokens (colour, elevation) live in the
combined scope. This mirrors Style Dictionary's independent brand/platform folders.
*(Confidence: medium — this compositional pattern is standard across the ecosystem
but no single spec prescribes it for brand×mode specifically.)*

**For our stack:** CSS custom properties are the default (the cascade does the swap
at paint, no JS). Reach for build-time generation only when you also need native
platform output or more than a handful of brands.

## Which axes to theme

- **Colour, corner radius, typography/font** — strongest evidence of being
  intentionally themeable in production (Material treats shape as a system axis;
  shadcn ships a themeable `--radius`; Style Dictionary varies font). Theme these.
- **Spacing scale, motion/easing** — hold **fixed** by default. No authoritative
  source foregrounds them as brand levers; theme them only for a specific
  requirement. *(Confidence: medium — inference from absence, not a sourced "lock
  them" statement.)*

Our starter already builds these as swappable single-root axes: `--radius` drives
the whole radius scale, `--font-sans` the type. Revalue the root, the scale
follows.

## Generating the palette — don't hand-pick hex

When you reskin, you need a full tint/shade **ramp** from one brand colour. The
state of the art has moved from "pick a hue, lighten/darken in HSL" (breaks
contrast unpredictably) to **contrast-target-driven generation in a perceptual
space, validated against APCA/WCAG** — the scale is generated *to hit* contrast
ratios, not checked after:

- **Radix** 12-step scale: steps 11/12 guaranteed to APCA Lc 60/90 on a step-2
  background. — [radix scale](https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale)
- **Material HCT / tonal palettes**: 5 tonal palettes from one seed, tones mapped
  to roles, "ensures all combinations meet WCAG." — [material-color-utilities](https://github.com/material-foundation/material-color-utilities)
- **Adobe Leonardo** / **Evil Martians Harmonizer**: contrast-*first* generators in
  OKLCH/APCA. — [leonardo](https://github.com/adobe/leonardo) · [harmonizer](https://evilmartians.com/opensource/harmonizer)

### The house tool — Orbit

We have this in-house: **Orbit Color Manager** (`MrJarrad/orbit-tools/color-manager`),
a Figma plugin that *is* a working best-in-class implementation of everything above.
Use it to generate and validate brand ramps rather than reinventing the math.

Orbit's model — a real **three-tier** system:

- **Base ramps** (primitives): `family/step`, e.g. `maritime/300`; ~9 steps
  100–900; the **brand seed sits at step 300**; families tiered core/primary/secondary.
- **Semantic layer**: `content/` (text+icon), `background/`, `border/` — groups
  that **alias** the base ramps. **Brand *and* light/dark both live as modes here**
  — the two-axis problem, solved on the semantic tier.
- **Brand anchors**: identity = "this step of this family is brand colour X."
  Reskin = revalue the base seeds and/or re-point the semantic aliases; the modes
  carry brand × mode.

Its ramp engine (`engine/ramp.ts`) encodes the transferable principles — apply
these whenever you generate a ramp, in or out of Orbit:

1. **Work in OKLCH; step lightness evenly** (perceptually uniform, unlike HSL).
2. **Taper chroma on a bell curve** so midtones stay vivid and the ends don't clip
   or go muddy.
3. **Lock hue by default** to kill the blue→purple drift HSL/Tailwind suffer.
4. **Anchor-aware**: the seed keeps its exact lightness+chroma at its own step; the
   ramp extends lighter and darker around it.
5. **Gamut-principled dark drift**: only hues that go flat when dark (yellow, cyan)
   drift toward the nearest dark-rich anchor (red ~25° / blue ~265°), scaled by how
   starved the hue is — no per-hue special-casing.
6. **Gamma the spacing** (~1.4) so equal-L steps *look* evenly separated.
7. **Grade every result**: Orbit's `contrast.ts` scores WCAG 2.x AA (4.5 text / 3
   UI) **and** APCA Bronze (Lc 75 text / 60 large / 45 UI). A reskin is *validated*,
   not just applied.

**So the house answer to "generate a brand ramp":** seed Orbit with the brand
colour, generate the OKLCH ramp, let it grade contrast, export the steps as your
primitive palette, alias the semantic tokens to them. Don't eyeball hex.

## Switching UX (web)

Boilerplate now, not novel work:

- **Prevent FOUC** with a **synchronous inline `<head>` script** (not a React
  effect) that reads `localStorage` (fallback `prefers-color-scheme`) and sets the
  attribute on `<html>` before first paint. `next-themes` automates this. — [next.js preventing-flash](https://nextjs.org/docs/app/guides/preventing-flash-before-hydration)
- Set the **`color-scheme`** CSS property to the active mode so native controls
  (scrollbars, form widgets) theme too (partial mitigation, not a content fix). — [css-tricks FART](https://css-tricks.com/flash-of-inaccurate-color-theme-fart/)
- **Persist** in `localStorage`; default first-time visitors to `prefers-color-scheme`.

The portfolio site's `theme-provider.tsx` (`~/JHD/portfolio/main`)
already does the light/dark/system + class-on-`<html>` half; a brand axis adds a
second `data-brand` attribute alongside.

## Pitfalls that defeat reskinnability

1. **Hardcoded raw values in components** — the #1 violation; the whole Material
   rule exists to prevent it.
2. **Components referencing the primitive tier** (`--red-500`) instead of semantic
   — revaluing the palette then touches every component.
3. **Scattered per-component `dark:` overrides** instead of overriding the token
   *definition* once (shadcn's model: toggle the class, every component updates
   because the override lives at the token layer).
4. **Semantic names that bake in appearance/identity** — `--blurple`, `--red` as a
   semantic name rather than an alias *of* a colour. Name by **purpose**
   (`--surface-danger`), so the name survives a palette change. *(Inference from
   Radix's aliasing rationale.)*
5. **Contrast breaking when the palette changes** — the reason contrast-first
   generators exist. Fixed-lightness-delta scales break contrast when the base hue
   changes; generate to contrast targets instead (Orbit does).

## The two reskinnability gates

Enforce both — they're what turn "we have tokens" into "we can actually reskin":

1. **No raw/primitive references in components** (mechanical, CI-lintable) — extends
   the [conformance checklist](conformance.md): grep component files for hex, raw
   `oklch()`, and primitive-step tokens; a hit is a themeability leak.
2. **Every semantic token name describes *purpose*, never appearance/brand**
   (review, not lint) — a naming check on any new token ([naming.md](naming.md)).

## Reskinning this system — the recipe

1. **Seed Orbit** with the brand colour(s); generate OKLCH ramps; let it grade
   contrast. Export the steps.
2. **Add the primitive tier** — drop the ramps into `index.css` as by-value tokens
   (`--brand-300…`), the layer the collapsed baseline lacks.
3. **Re-point the semantic tokens** to the new primitives (change the values in
   `:root`/`.dark`, or add a `[data-brand="x"]` scope). Component code is untouched.
4. **Revalue the other themeable axes** if the brand needs them — `--radius`, the
   font — at their single roots.
5. **Verify**: toggle the brand; every surface reflows. Re-run the conformance
   greps (nothing should reference a raw value) and confirm contrast still passes in
   both modes. Check at real viewports.
