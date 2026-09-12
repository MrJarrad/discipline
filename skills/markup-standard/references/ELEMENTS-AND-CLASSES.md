# markup-standard — element selection, class discipline, and the Exceed tier

SKILL.md keeps the rule that decides each call; this file is the full element table, every Tailwind class-discipline rule, and the Exceed tier in full. Nothing here was rewritten — it is the 1.78.0 body, moved.

## Semantic element selection

| Content is… | Use | Not | Why |
|---|---|---|---|
| A list of things (nav items, cards, thumbnails) | `<ul>`/`<li>` (or `<ol>` if order matters) | A `<div>` per item | AT announces "list, N items" and supports item-to-item navigation; a `<div>` stack reads as N unrelated paragraphs. **[Audit #6]** — 0/0 `<ul>`/`<li>` sitewide despite three structurally-list contexts (`navigation-header.tsx` nav items, `grid-collection.tsx:49-54` cards, homepage's 16-project grid). WHATWG: [`<ul>`](https://html.spec.whatwg.org/multipage/grouping-content.html#the-ul-element) is for "a list of items, where the order of the items is not important." |
| A control that navigates to a resource (route, anchor, external URL) | `<a href>` | `<button>` with an `onClick` router push | WHATWG: the `button` element "represents a button labeled by its contents" and drives in-page actions (form submit/reset/custom commands); navigation to a resource is the `<a>` element's job. Keyboard, history, "open in new tab," and status-bar preview all come free with `<a>` and have to be hand-built on a `<button>`. |
| A control that triggers an in-page action (toggle, submit, open a dialog) | `<button type="button">` (or `submit`/`reset` in a form) | `<a href="#">` or `<a>` with no `href` | Same WHATWG distinction, inverted. An `<a>` with no real destination loses its link semantics and keyboard model, and screen readers announce it as a link that goes nowhere. |
| This page's title / a section's title | `<h1>`–`<h6>` at the correct level (see Outline rules) | `<p class="type-title ...">` | Heading level is the *only* machine-readable signal of "this labels the content that follows." **[Audit #2, #5]** — `HeroFeature`'s `nav.title` slot renders the page's own title as `<p>` (`hero-feature.tsx:66`), producing zero-`h1` pages. |
| Page-persistent closing content (copyright, contact, secondary links) | `<footer>` | Content simply ending inside `<main>` | Landmark only when the lock/contract includes closing content — **do not invent a footer** on standing build/review. **[Audit #1]** — no `<footer>` component exists sitewide; closing content has nowhere structural to live, which the audit ties directly to the "mixed bag" impression. WAI-ARIA APG: `contentinfo`/footer is for "common information... typically... copyrights, links to privacy statements." |
| Primary page content | `<main>` (exactly one) | A generic wrapping `<div>` | Lets AT users jump straight past repeated chrome (nav, header) to the content. Already correct sitewide per the audit's landmark column — preserve it. |
| An image that conveys information | `<img alt="...">` describing it | `<div style="background-image">` | Background-image divs (toby-ng's approach) are invisible to AT and to image search entirely. **[Audit #14]** — `media.tsx:305-307` already enforces a required `alt` prop; keep using `<img>`, never drop to a CSS background for content images. |
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
- **Repeated property combinations become a class.** When the same combination of
  properties appears on more than one element, that combination becomes a class or
  utility — a single reusable name, defined once, applied by name. Inline `style=`
  attributes are only for truly per-instance computed values (a data-driven offset, a
  computed custom property). The class name describes what it does (`.blend-ink`,
  `.card-elevated`), not what it contains (`.gray-blur-thing`) — the recipe can evolve
  behind a stable role name, exactly like a token. (Operator ruling 2026-08-28,
  blend-mono precedent — the monochrome-ground blend treatment was hand-declared per
  surface before being named and hoisted.) The JS-side analogue is the same discipline
  one level down: a repeated computed value (a duration, an easing curve) gets a named
  helper function (`entryDurationCss`/`entryEasingCss`) instead of being interpolated
  inline at every call site — same rule, different material.
## Exceed tier (operator-adopted 2026-07-27) — beyond this skill's own floor

Three gates layered on top of everything above, adopted the same day as this skill's
markup floor, grounded in `launch-plan-2026-07-27.md`'s "Exceed tier" entry: **W3C
validator zero errors/warnings**, **APCA contrast** (WCAG-3 draft algorithm, beyond AA
ratios), and **full function with JavaScript disabled**. Findings cited below as
**[Audit #E-N]**, from the dedicated exceed-tier audit — same live-curl, same 11
routes, same methodology as the markup audit above, extended rather than repeated. (The
standalone exceed-tier audit file did not survive the 2026-07-31 vault legacy purge;
`~/JHD/vault/projects/portfolio/audits/2026-07-27-markup-audit.md` is the closest
surviving primary source — re-running the exceed-tier gates is the correct fix if this
evidence is needed again, not reconstructing the citation.)

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
