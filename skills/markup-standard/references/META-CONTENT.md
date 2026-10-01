# markup-standard — meta content

The long form behind SKILL.md's "Meta content" section. Length bands are common-practice
guidance (search snippets truncate near them), not WHATWG rules.

## Titles

- One pattern across the site, e.g. `<page> — <site>`; the home route may be the bare site name.
- Unique per route; never inherit the root default on a route with its own identity.
- About 60 characters at most. Wording: `brand-voice`.

## Descriptions

- One per route, unique, sourced from the page's real content (existing case-study or
  page copy first; write new copy only with `brand-voice`).
- About 70–160 characters; a sentence, not a keyword list.
- A route that deliberately reuses another's description (a placeholder page) is
  recorded as such and is `noindex`.

## Alt text

Rules: SKILL.md "Alt text policy". Additional meta-content checks: share images carry
alt (`og:image:alt` / `twitter:image:alt`); alt describes the image, not the page.

## Favicon and icon set

| Asset | Check |
| --- | --- |
| Tab icon (`rel=icon`, SVG or ICO/PNG) | link present, URL returns 200 |
| Apple touch icon (180×180 PNG) | link present, URL returns 200 |
| Android/manifest icons (192, 512 PNG) | manifest linked, each icon URL returns 200 |
| Theme colour | `theme-color` meta present if the brand has one |

Until the brand icon is supplied, record the set as an open item; never ship a
framework-default icon silently.

## Share image

- 1200×630, one per shareable route, absolute URL, returns 200 as an image.
- Fallback order: per-page override (e.g. a screenshot of the page's landing view) →
  the page's own hero image → a brand card (wordmark on a plain ground).
- Keep the data shape able to carry a per-page override even before a CMS field exists.
- Pair with `og:title`, `og:description`, `twitter:card`.

## Noindex and sitemap

Placeholder, prototype and unfinished routes carry `robots: noindex` and stay out of the
sitemap; a moved route gets a permanent redirect and the sitemap lists only the new URL.

## Worked example (generic)

A site-wide pass added: one title pattern, per-route descriptions taken from page copy,
a share-image fallback chain (hero → brand card), alt on every image, noindex on a
placeholder route, and an automated head/meta check in CI that failed on a missing
title, description, alt or share image. The check, not a one-off audit, is what kept it
true afterwards.

## Head wiring detail (moved from SKILL.md)

- Never inherit the root `<title>` on a route with its own identity (a case-study page, a kit page).
- Descriptions come from existing page/case-study copy — wire it, don't invent new copy.
- `openGraph`/`twitter` fields are framework-native wiring (Next.js `Metadata` supports both); no new dependency.
- Structured data: at minimum one JSON-LD `Person`/`WebSite` block in the root layout; `BreadcrumbList`/`Article` per case study if content supports it.
- Prototype routes (`/v2`, "(prototype)" titles) carry `robots: noindex` before shipping past dev.
