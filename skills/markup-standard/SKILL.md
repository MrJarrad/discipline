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
**Source audit:** `~/JHD/vault/artifacts/2026-07-27-markup-audit.md` — 12 routes, curled
live, parsed for element/landmark/heading/class stats, cross-checked with axe-core.
Findings cited below as **[Audit #N]**.

## Semantic element selection

| Content is… | Use | Not | Why |
|---|---|---|---|
| A list of things (nav items, cards, thumbnails) | `<ul>`/`<li>` (or `<ol>` if order matters) | A `<div>` per item | AT announces "list, N items" and supports item-to-item navigation; a `<div>` stack reads as N unrelated paragraphs. **[Audit #6]** — 0/0 `<ul>`/`<li>` sitewide despite three structurally-list contexts (`navigation-header.tsx` nav items, `grid-collection.tsx:49-54` cards, homepage's 16-project grid). WHATWG: [`<ul>`](https://html.spec.whatwg.org/multipage/grouping-content.html#the-ul-element) is for "a list of items, where the order of the items is not important." |
| A control that navigates to a resource (route, anchor, external URL) | `<a href>` | `<button>` with an `onClick` router push | WHATWG: the `button` element "represents a button labeled by its contents" and drives in-page actions (form submit/reset/custom commands); navigation to a resource is the `<a>` element's job. Keyboard, history, "open in new tab," and status-bar preview all come free with `<a>` and have to be hand-built on a `<button>`. |
| A control that triggers an in-page action (toggle, submit, open a dialog) | `<button type="button">` (or `submit`/`reset` in a form) | `<a href="#">` or `<a>` with no `href` | Same WHATWG distinction, inverted. An `<a>` with no real destination loses its link semantics and keyboard model, and screen readers announce it as a link that goes nowhere. |
| This page's title / a section's title | `<h1>`–`<h6>` at the correct level (see Outline rules) | `<p class="type-title ...">` | Heading level is the *only* machine-readable signal of "this labels the content that follows." **[Audit #2, #5]** — `HeroFeature`'s `nav.title` slot renders the page's own title as `<p>` (`hero-feature.tsx:66`), producing zero-`h1` pages. |
| Page-persistent closing content (copyright, contact, secondary links) | `<footer>` | Content simply ending inside `<main>` | **[Audit #1]** — no `<footer>` component exists sitewide; closing content has nowhere structural to live, which the audit ties directly to the "mixed bag" impression. WAI-ARIA APG: `contentinfo`/footer is for "common information... typically... copyrights, links to privacy statements." |
| Primary page content | `<main>` (exactly one) | A generic wrapping `<div>` | Lets AT users jump straight past repeated chrome (nav, header) to the content. Already correct sitewide per the audit's landmark column — preserve it. |
| An image that conveys information | `<img alt="...">` describing it | `<div style="background-image">` | Background-image divs (toby-ng's approach) are invisible to AT and to image search entirely. **[Audit #14]** — `media.tsx:305-307` already enforces a required `alt` prop; keep using `<img>`, never drop to a CSS background for content images. |

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

## Class discipline (Tailwind)

This project keeps Tailwind — utility-first is a deliberate, documented choice, not the
defect. **[Audit #8]** measured the actual cost: some elements (the `Action` component)
carry 45 utility tokens / 1275+ characters in one `class` attribute, and that's *fine*
for a one-off per-instance composition — the defect is when the same long stack repeats
verbatim across every usage, because at that point it's no longer "utility-first
composition," it's an uncompiled component style pasted N times.

**The line: compose per-instance, extract repeated stacks.**

- **Per-instance utilities stay inline.** Size, spacing, and variant classes that differ
  by call site (`w-40` here, `w-64` there) are exactly what Tailwind is for — don't
  extract these into a named class just to hide them.
- **A stack that's identical across ≥2 call sites is a component style, not a
  coincidence.** Extract it into the design-system's `@layer components` utilities layer
  under a semantic name, the same way `title-style1-200`/`title-style1-400` already
  extract the type-title recipe (`globals.css`) instead of repeating font/tracking/size
  utilities at every call site. Follow that exact pattern for the next repeated stack —
  **[Audit #8]** names `Action`'s static class list as the next candidate (`cva`/`cn`,
  already used correctly in `space-vertical.tsx:21`, is the mechanism; extend it to
  cover `Action`'s base recipe, leaving only size/variant as call-site utilities).
- **Ordering convention** inside a `class`/`cn()` call, left to right: layout
  (display/position/flex-grid) → box model (size/spacing/border) → typography → color →
  state variants (`hover:`/`focus:`/`data-[state]:`) → responsive prefixes last on each
  token they modify. Consistent order makes long class strings scannable and diffable;
  it's a convention to hold, not a spec citation, because Tailwind imposes none.
- **State lives in `data-*` attributes, not extra classes.** Toggle/open/selected/loading
  states are DOM-visible facts about the element — express them as
  `data-state="open"` / `data-loading` and style with `data-[state=open]:` variants, the
  same way `space-vertical.tsx:21-27`'s `data-kind="space-vertical"` already names a
  component's role in the DOM. This keeps state legible in devtools without grepping a
  1000-character class string, and gives CSS a stable selector that doesn't depend on
  class-order.
- **A raw one-off hex/px value in a `class` string is still a bug** — `design-craft`'s
  "nothing raw, ever" rule holds here unchanged; class-length is a separate axis from
  token discipline.

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

## Exceed tier (operator-adopted 2026-07-27) — beyond this skill's own floor

Three gates layered on top of everything above, adopted the same day as this skill's
markup floor, grounded in `launch-plan-2026-07-27.md`'s "Exceed tier" entry: **W3C
validator zero errors/warnings**, **APCA contrast** (WCAG-3 draft algorithm, beyond AA
ratios), and **full function with JavaScript disabled**. Findings cited below as
**[Audit #E-N]**, from the dedicated exceed-tier audit
(`~/JHD/vault/artifacts/2026-07-27-exceed-tier-audit.md`) — same live-curl, same 11
routes, same methodology as the markup audit above, extended rather than repeated.

**Validator-zero.** Prefer `npx vnu-jar` (the Nu Html Checker) — it needs a Java
runtime; where that's unavailable, `html-validate` (`npx html-validate`) is the
sanctioned fallback, but its `recommended`/`document` presets are *stricter than actual
HTML5 validity* and will over-report: `void-style`, `attr-case`,
`attribute-boolean-style`, `attribute-empty-style`, and `valid-id`'s letter-start rule
all flag markup WHATWG explicitly permits (attribute names are ASCII case-insensitive;
a void element's trailing slash is a parser no-op; a boolean attribute may be
empty-string or value-less; an id has no letter-start requirement) — mostly
framework-internal output (React/Next hydration ids and script attributes) outside app
code's control besides. `require-sri` and `no-inline-style` are security/CSP
best-practice opinions, not validity rules — the `style` attribute is a defined global
attribute. Disable all of these in `.htmlvalidate.json` before trusting a "zero" count;
otherwise a healthy page reads as dozens of "errors" that aren't. **[Audit #E-1]** —
scoping this way took the reported total from 46+ false positives per route down to the
real 13 (12 ARIA misuse + 1 heading-order), both fixed, verified zero after.

**APCA contrast.** Compute with `apca-w3`'s `APCAcontrast(sRGBtoY(text),
sRGBtoY(bg))`; walk every visible text node with Playwright (`page.evaluate` a
`TreeWalker` over elements with a direct, non-whitespace text-node child), resolving
the effective background by compositing up the ancestor chain until full opacity.
Thresholds (WCAG-3 draft / APCA Bronze guidance): body text `|Lc| >= 75`, large/display
text (≈24px+ bold or ≈36px+ regular) `|Lc| >= 60`. **[Audit #E-2]** — every failure
sitewide traced to one single token/background pair (a `--muted-foreground` value
against the page background, Lc 73.3, 1.7 short of body threshold) — fix a token
failure with an *existing* compliant token if one already exists; if the only fix is
changing the token's own value, that's a design decision, not a code fix — put it on an
operator-visible list (token, affected routes, current Lc, candidate Lc) instead of
silently changing it.

**No-JS function.** Two passes, both required: `curl` the route (confirms the static
HTML itself, independent of any browser) and Playwright with
`javaScriptEnabled: false` in the browser context (confirms real rendering/paint,
catches CSS-only interactions curl can't see). Check three things per route: nav
`<a href>`s resolve and are real links (not `onClick` router pushes); every visible
piece of text exists in the same static HTML a JS-disabled visitor gets (nothing
client-only-rendered); every `<video>` carries a `poster` attribute and every
client-rendered media component degrades to a real, src-populated `<img>`/`<video>`.
**[Audit #E-3]** — a component that assigns `<video src>` via an
`IntersectionObserver` effect (lazy-load-near-viewport) left the element with no `src`
*and* no `poster` in its server-rendered initial state, so a no-JS visit painted a
fully blank box; the effect is an enhancement, the `poster` attribute is the floor a
no-JS browser actually gets — never gate the fallback still on JS running at all.

## Verification recipe

Run this before claiming any markup change done — it's how the audit itself was
produced, so it's reproducible by construction.

1. **Serve the real route, don't read the source component in isolation.** `curl` the
   live dev server (or a build preview) for the exact URL — JSX intent and rendered DOM
   diverge (conditional landmarks, composed slots, streaming markers). Read the served
   HTML, not just the `.tsx`.
2. **Extract the outline.** Parse the served HTML for `<h1>`–`<h6>` in document order
   and confirm: exactly one `<h1>`, no level skipped between adjacent headings, heading
   text matches the page's actual title/section labels. A short script (stdlib HTML
   parser, or any DOM parser) walking headings in order is sufficient — this is what the
   audit's own measurement script did.
3. **Extract landmark counts.** Count `<header>`, `<nav>`, `<main>`, `<footer>` — confirm
   `header`≤1, `main`==1, `footer`==1, every `<nav>` beyond the first carries a distinct
   `aria-label`.
4. **Run an axe pass** (`wcag2a`/`wcag2aa`/best-practice tags) against the live URL —
   catches contrast, redundant-alt, heading-order, and landmark violations the manual
   read might miss, and is independent confirmation rather than a duplicate check.
5. **Spot-check class discipline** on any touched component: is a Tailwind stack
   repeated verbatim across ≥2 call sites in the diff? If so, it should have moved to
   the `@layer components` layer in this same change, not been left inline.
6. **Read the `<head>`** on the touched route: title, description, OG/Twitter, canonical,
   JSON-LD present and route-specific (not the shared default) when the route has its
   own identity.
7. **[Exceed tier] Validator-zero** — run `vnu-jar` (or the scoped `html-validate`
   fallback above) against every route's served HTML; zero errors/warnings, or the run
   isn't done.
8. **[Exceed tier] APCA pass** — run the `apca-w3` + Playwright enumeration above
   against every route; every text/background pair clears its threshold (Lc75 body /
   Lc60 large), or the gap is on the operator-visible list, never silently shipped.
9. **[Exceed tier] No-JS pass** — `curl` plus a Playwright `javaScriptEnabled: false`
   context against every route; nav works, all text is present, every video has a
   `poster`.

None of these require a passing "vibe" read of the JSX — every check above resolves to
a count, a boolean, or an axe violation list. Attach the actual output (outline list,
landmark counts, axe result) as evidence, per `quality`'s "verify before claiming."
