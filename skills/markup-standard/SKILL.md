---
name: markup-standard
description: The definition of done for shipped HTML — semantic elements, landmarks, heading outline, link-vs-button, alt text, Tailwind class discipline, and head/meta hygiene, with a verification recipe. Use when writing or reviewing any HTML/JSX that ships to a browser, before marking UI work done, or when a reviewer needs to check served markup. Not the visual/token bar — that's design-craft; not AC-by-AC verification — that's qa-acceptance.
---

# Markup Standard

Shipped HTML is a contract with browsers, assistive technology, and search crawlers —
not just a rendering target for CSS. This skill is that contract's definition of done.
It sits alongside `design-craft` (which governs *tokens and visual composition*): this
skill governs *element choice and document structure*, the layer beneath the pixels.

Every rule below is grounded in either the [2026-07-27 markup audit](#source) of
jarrad.design's served HTML, or a cited standard (WHATWG HTML, WAI-ARIA APG, WCAG).
None of it is invented preference.

<a id="source"></a>
**Source audit:** `~/JHD/vault/projects/portfolio/audits/2026-07-27-markup-audit.md` — 12 routes, curled
live, parsed for element/landmark/heading/class stats, cross-checked with axe-core.
Findings cited below as **[Audit #N]**.

## Semantic element selection

The element carries the meaning; a `div` with a click handler carries none. Reach for the
element whose name describes the content — `nav`, `main`, `article`, `section`, `aside`,
`figure`, `button`, `a`, `ul`/`ol`, `table` — before reaching for a `div` plus ARIA. ARIA
patches a gap; it never substitutes for an element that already exists.

The full element-by-element table, the Tailwind class-discipline rules, and the **Exceed
tier** (what "beyond this skill's own floor" means and when it applies) are in
[ELEMENTS-AND-CLASSES.md](references/ELEMENTS-AND-CLASSES.md).

## Landmark & outline rules

**Landmarks — one instance, or a distinguishing label.**
Per WAI-ARIA APG's [Landmark Regions](https://www.w3.org/WAI/ARIA/apg/practices/landmark-regions/):
`banner`/`header` and `contentinfo`/`footer` are limited to one per page; `main` should
appear exactly once; `nav` may appear more than once but **"when multiple landmarks of
the same type appear on a page, each should have a unique label"** (exception: identical
link sets, e.g. duplicate pagination, may share a label).

- Every route ships exactly one `<header>`, one `<main>`, and (new requirement) one
  `<footer>` — mount `<footer>` once in the root layout, not per-page. **[Audit #1]**
- When two `<nav>` elements coexist in the DOM (desktop + mobile toggles), each gets
  `aria-label="Primary"` / `aria-label="Mobile"` — even if only one is visible at a
  given viewport, both are in the markup and must be disambiguated. **[Audit #7]**

**Heading outline — never skip a level, exactly one `<h1>` per page.**
Per WHATWG's [heading and outline algorithm](https://html.spec.whatwg.org/multipage/sections.html#headings-and-outlines):
*"Each heading following another heading... must have a heading level that is less
than, equal to, or 1 greater than [the previous heading's] level."* Jumping `h1` → `h3`
is explicitly the spec's own non-conforming example. The spec also treats starting a
document below `h1`, or omitting `h1` entirely, as poor practice for readability and AT
navigation.

- Every route has exactly one `<h1>` naming the page, before any other heading.
  **[Audit #2]** — `/kit` and `/projects/yardsale/v2` currently ship zero.
- No level is skipped between adjacent headings. **[Audit #4]** — `/`, `/projects`,
  `/v2` jump `h1` → `h3` because grid/card sections have no `h2` section label.
- One concept, one heading level, everywhere it appears. If a component renders "this
  page/section's title" in more than one context (page header vs. nested feature
  block), give it an explicit level prop rather than hardcoding a tag — **[Audit #5]**
  documents `HeaderMedia`'s `titleAs?: "h1" | "h2"` prop (`header-media.tsx:15-24`,
  consumed by `pagination-page.tsx:29` specifically to avoid a duplicate `h1`) as the
  already-correct in-codebase pattern; every title-rendering component should carry the
  same prop rather than reinventing the decision per component.

## Link vs. button — the test

Ask **"what happens when this activates?"**

- **The URL changes / the browser navigates (including client-side route change)** →
  `<a href>`. Never wrap a router push in a `<button>` or a `<div onClick>`.
- **Something happens on the current page and the URL does not change** (open a modal,
  toggle a panel, submit a form, change a value) → `<button type="button">`.
- A styled `<a>` and a styled `<button>` are allowed to look identical — that's a CVA
  variant question (`design-craft`'s domain), not a reason to pick the wrong element for
  the convenience of shared styling.

Grounded in WHATWG's [button element](https://html.spec.whatwg.org/multipage/form-elements.html#the-button-element)
(action-triggering, no navigation semantics) vs. [`<a>`](https://html.spec.whatwg.org/multipage/text-level-semantics.html#the-a-element)
(`href` "affect[s] what happens when users follow hyperlinks" — resource navigation).

## Alt text policy

Per WHATWG's [alt attribute requirements](https://html.spec.whatwg.org/multipage/images.html#alt):

1. **Every content-bearing `<img>` gets a non-empty, non-redundant `alt`.** Already
   enforced sitewide via `Media`'s required prop (`media.tsx:305-307`) — **[Audit #14]**,
   keep this gate, don't add an escape hatch (`alt=""` as a default, optional prop).
2. **Purely decorative images get `alt=""`**, never a filename or omitted attribute —
   this removes them from the AT tree instead of announcing noise.
3. **Never duplicate adjacent visible text.** If a caption/label right next to the image
   already states what the image shows, the image's alt is redundant and should be
   `alt=""`. **[Audit #10]** — `/projects/yardsale/v2`'s teaser image has
   `alt="Oliver Cabell"` sitting directly next to visible text reading "Oliver Cabell";
   axe-core's `image-redundant-alt` flags exactly this pattern.

## Head/meta hygiene

**[Audit #9]** — every route currently shares one static `<meta name="description">`
and ships no Open Graph, Twitter Card, canonical link, or structured data; `/kit`
inherits the bare root `<title>` with no override.

- **Per-page `<title>`, always overridden** — never inherit the root default on a route
  that has its own identity (a case-study page, `/kit`).
- **Per-page `description`**, sourced from real page content (case-study copy already
  exists in `case-studies.ts`/`projects.ts` — wire it, don't invent new copy).
- **`openGraph` + `twitter` fields** on every shareable route (Next.js's `Metadata` type
  supports both natively — this is wiring, not a new dependency).
- **One `canonical` link per route.**
- **Structured data**: at minimum one JSON-LD `Person`/`WebSite` block in the root
  layout; add `BreadcrumbList`/`Article`-equivalent per case study if the content
  supports it.
- **`robots: noindex`** on any prototype route reachable at a real URL before it ships
  past dev — **[Audit #11]** flags `/v2` and `/projects/yardsale/v2` as crawlable today
  with no `noindex`, both titled "(prototype)."

## Class discipline (Tailwind)

Utilities express the design system's tokens, never raw values: no arbitrary `[13px]`-style
values where a token exists, no duplicated utility strings that should be a component, and
no class soup standing in for a named part. Rules in full:
[ELEMENTS-AND-CLASSES.md](references/ELEMENTS-AND-CLASSES.md).

## Verification recipe

Served markup is the artefact under test — not the JSX, not a screenshot. Check the
**served** HTML for the landmark set, the heading outline, link-vs-button correctness, and
alt text on every image, and cite what you read. The step-by-step recipe is
[VERIFICATION.md](references/VERIFICATION.md).
