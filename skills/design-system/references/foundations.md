# Foundations — the sourced rationale

Why the house system is shaped the way it is, grounded in primary sources so the
choices survive a skeptical question. Confidence flags are honest: some of this
is ratified standard, some is credentialed practitioner consensus.

## Token tiers — primitive → semantic → component

The converged industry pattern is **three tiers**, same three roles under
different vendor names:

| Tier | Material 3 | Adobe Spectrum | Salesforce SLDS | Named by |
|---|---|---|---|---|
| 1 — raw values | reference | global | global | **value** (`blue.500`) |
| 2 — roles/decisions | system | alias | semantic | **role** (`color.text.danger`) |
| 3 — component-scoped | component | component | component | **role**, component-scoped |

The third tier earns its place by letting you override one component's look — or
fix a local bug — **without touching the semantic tier and risking regressions
elsewhere**. Two tiers (primitive → semantic) is workable for a small/single-brand
system; all three big systems converge on three at scale. (Material 3, Spectrum,
SLDS docs — consistent, not disputed.)

**Where the house baseline sits — the honest gap.** shadcn's default (what our
starter ships) is effectively **two-tier**, and even that is *collapsed*: the raw
OKLCH values live directly inside the semantic names in `:root`/`.dark` (there's
no separate primitive palette layer, and no per-component token tier). That's the
right default for an app-scale system — fewer moving parts, and dark mode already
works because the semantic layer exists. **Scale up deliberately when you feel the
pain:** introduce a primitive palette (`--blue-500…`) once you're generating tint
scales or supporting multiple brands, and add component tokens once a component
needs an isolated override you don't want rippling through the semantic tier.
Name primitives by value, semantic/component tokens by role — never the reverse.

*Interchange format:* the W3C Design Tokens (DTCG) format hit its first stable
version **2025.10** (Oct 2025) and is adopted by Figma, Tokens Studio, Style
Dictionary, Terrazzo, et al. — native OKLCH/P3 support. Target it if the system
ever needs to export tokens to design tools. — [w3.org/community/design-tokens](https://www.w3.org/community/design-tokens/2025/10/28/design-tokens-specification-reaches-first-stable-version/) · [Nathan Curtis, "Naming Tokens"](https://medium.com/eightshapes-llc/naming-tokens-in-design-systems-9e86c7444676)

## OKLCH — why, not just "it's newer"

Two concrete reasons, both from primary sources:

1. **Perceptually uniform lightness.** In HSL, adding 10% L shifts blue and purple
   by visibly different amounts, so programmatically derived scales (a 9-step
   ramp, a `/80` hover) drift in contrast. OKLCH's L channel is uniform across
   hues, so derivation is predictable — which is exactly what a token system does.
2. **Wider gamut (Display P3)** beyond sRGB — more vivid where sRGB clipped.

This is why **Tailwind v4** moved its whole palette to OKLCH and **shadcn** flipped
its default theme HSL→OKLCH. Radix Colors converged independently on perceptual
lightness ("HSL-mixed dark stops look greenish/brownish").

**Caveat:** not every L/C/H triple is in-gamut — browsers clip to the nearest
displayable color. Spot-check generated values actually render rather than
silently clipping. — [Tailwind v4](https://tailwindcss.com/blog/tailwindcss-v4) · [shadcn theming](https://ui.shadcn.com/docs/theming) · [Evil Martians, OKLCH in CSS](https://evilmartians.com/chronicles/oklch-in-css-why-quit-rgb-hsl) · [Radix scale](https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale)

## Theming & contrast — the correction

"Stable names, swapped values per `.dark`" is the confirmed pattern across shadcn,
Radix, and Material 3 (whose three-tier model is *justified* by exactly this:
roles stay put, reference values swap). High confidence — keep it.

**But foreground/background pairing does not make contrast automatic.** The pair
gives you a single, reusable *place* to guarantee contrast — you still have to
verify it:

- **WCAG 2.x AA is the hard floor** and the only legally-binding standard today
  (ADA/EAA reference it): **4.5:1** normal text, **3:1** large text / UI
  components. Check every surface+foreground pair against it, in both themes.
- **APCA** (perceptual, accounts for size/weight/polarity) is a useful *design-time*
  gut-check — Radix Colors uses it internally, engineering text steps to Lc 60/90
  targets ([radix scale docs](https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale)).
  But **do not call it
  "the new WCAG standard": it is not.** It was *removed* from the WCAG 3 draft in
  July 2023 pending consensus; WCAG 3 isn't expected as a Recommendation before
  2028. Many blog posts overstate this — guard against it. — [ui.shadcn.com/docs/theming](https://ui.shadcn.com/docs/theming) · [W3C WCAG3 issue #29](https://github.com/w3c/wcag3/issues/29)

## Component architecture — headless + copy-source

**Headless primitive + styled layer:** Radix Primitives ship unstyled, implement
WAI-ARIA patterns, and handle focus/keyboard/ARIA, exposing state via data
attributes for the styling layer to target. Same category as React Aria and Ark.
This is why our components are Radix underneath. — [radix-ui.com/primitives](https://www.radix-ui.com/primitives)

**"Copy the source you own"** is shadcn's *argued position* — not unanimous
industry consensus (attribute it accurately to a skeptic). shadcn: *"This is not a
component library. It is how you build your component library."* Rationale: once
customization exceeds what an npm library's API anticipated, you end up wrapping
and fighting overrides; owning the source (Radix + Tailwind + CVA, added via CLI)
avoids that — and it's AI-readable, which a compiled package isn't. — [ui.shadcn.com/docs](https://ui.shadcn.com/docs)

**Variants:** CVA is framework-agnostic and what shadcn generates; `tailwind-variants`
adds slots + Tailwind-native responsive variants if you need them. (CVA vs t-v
comparison is medium-confidence — secondary sources.)

## Governance — quality earns adoption, not mandate

The practitioner consensus (expert testimony, not controlled study — flag as such):

- **Quality is the adoption lever.** Nathan Curtis: *"A system's quality must meet
  or exceed the quality threshold held by a product team, lest the product not
  trust or respect it enough to adopt it."* Governance is an earned-trust problem,
  not a policing problem. This maps cleanly onto [`quality`](../../quality/SKILL.md).
- **Policing usage without policing correctness backfires.** Adobe Spectrum's team
  found a linter that merely flagged hardcoded values made things *worse* — devs
  grabbed the nearest matching token instead of the *correct* semantic one. Enforce
  correctness, not just "a token was used."
- **Extend deliberately, bounded.** Polaris scopes where deviation is expected
  (e.g. data viz) vs. where teams default to system components. Deliberate
  extension with a stated reason > silent override.

**Composition lineage:** the tokens → components → patterns/blocks → templates
ladder ([`design-craft`](../../design-craft/SKILL.md)) descends from Brad Frost's
Atomic Design; Frost places tokens as the "subatomic" layer beneath atoms. — [bradfrost.com](https://bradfrost.com/blog/post/design-tokens-atomic-design-%E2%9D%A4%EF%B8%8F/) · [EightShapes/Curtis](https://www.knapsack.cloud/blog/nathan-curtis-co-founder-at-eightshapes-balancing-reuse-and-customization-in-ui-design)

## Low-confidence flags

Honest about what's shakier: the Spectrum governance testimony and the Polaris
"when to deviate" guidance are single secondary-source interviews/summaries, not
the vendors' own published docs — plausible and consistent with everything else,
but do a primary-source check before making either load-bearing in a
stakeholder-facing doc. No rigorous cross-org study of "great vs mediocre design
systems" exists; those claims are practitioner synthesis.
