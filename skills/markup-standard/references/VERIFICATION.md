# markup-standard — the verification recipe

How served markup is actually checked, step by step. SKILL.md names the gate; this is the recipe. Nothing here was rewritten — it is the 1.78.0 body, moved.

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
   the `@layer components` layer in this same change, not been left inline. Same check
   for inline `style`/CSS declaration blocks: a visual recipe declared more than once
   should be one named class applied by name, not repeated or inlined.
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
