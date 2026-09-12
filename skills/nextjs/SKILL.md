---
name: nextjs
description: Build, review, or deploy a Next.js (App Router) app — Cache Components, "use cache", revalidateTag/updateTag/refresh, Server Actions, proxy.ts, or Cloudflare via @opennextjs/cloudflare. Use when the operator names Next.js, App Router, RSC, "use cache", proxy.ts, middleware.ts, OpenNext, ISR, PPR, or a .tsx under app/. Not Workers post-deploy — workers-best-practices/wrangler; not UI tokens — design-system/markup-standard; not test mechanics — webapp-testing; not CWV bar — Law 9 in design-craft/references/TECHNICAL-DESIGN.md; not SEO — the seo-* family.
---

# Next.js

The house Next.js skill: App Router only, Cloudflare as the deploy target. It owns what's
specific to Next.js — the file conventions, the Cache Components model, Server Actions, and
the OpenNext-on-Cloudflare path. It does not restate what a sibling skill already owns: once
code is running on a Worker, `workers-best-practices` and `wrangler` own the Workers
production bar; the token/markup bar for anything this skill renders
is [`design-system`](../design-system/SKILL.md) and
[`markup-standard`](../markup-standard/SKILL.md); test and perf mechanics are
[`webapp-testing`](../webapp-testing/SKILL.md); Core Web Vitals bar is **Law 9** in
[`design-craft/references/TECHNICAL-DESIGN.md`](../design-craft/references/TECHNICAL-DESIGN.md).
Cross-link to those rather than duplicating them — see §9, §10, §12.

**Not a v16 upgrade guide.** This skill assumes a Next.js 16 App Router project already
targeting Cloudflare. For migration/codemod help on an older project, use
`next-devtools-mcp`'s upgrade helper (§11) rather than hand-porting from memory.

## 1. Framework baseline

| Baseline | Value |
| --- | --- |
| Framework | Next.js 16 (GA 21 Oct 2025; 16.2.x as of Mar 2026) |
| Router | App Router — default, actively evolving. Pages Router gets no new architecture investment: App Router only for greenfield work |
| Runtime minimums | Node 20.9+, TypeScript 5.1+ |
| React | 19.2, canary-track (View Transitions, `useEffectEvent`, `<Activity/>`) |
| Bundler | Turbopack — the default (2–5x faster builds, up to 10x faster refresh) |
| Compiler | React Compiler — stable, opt-in (not on by default) |

If a project is on Pages Router or pre-16, that's a different, larger conversation
(routing/architecture decision) — flag it rather than silently porting patterns from this
skill across the boundary.

## 2. App Router file conventions

The segment-level convention set, one file role per name: `layout`, `page`, `loading`,
`error`, `not-found`, `route` — each scoped to the segment (folder) it sits in, and each
optional except `page`/`route`. Two structural rules that changed real behaviour in 16:

- **Parallel-route slots need an explicit `default.js`.** A `@slot` folder with no matching
  active state and no `default.js` is a hard miss, not a silent fallback — add one per slot.
- **Route groups** (`(group)`) organise segments without adding a URL segment; **colocation**
  — non-route files (components, tests, styles) living inside the `app/` segment they belong
  to — is the sanctioned default over a parallel `components/` tree mirroring routes.

## 3. RSC patterns

Server Components are the default render target; reach for `"use client"` only at the leaves
that actually need interactivity — push the boundary down the tree as far as it'll go, don't
mark a whole page client just because one button needs an `onClick`. Stream slow segments
with `<Suspense>` around them rather than blocking the whole route on the slowest fetch. Don't
client-fetch with `useEffect` by default — a Server Component's own async render is the fetch;
reach for client-side fetching only when the data is genuinely client-only (user interaction,
browser APIs).

**Async APIs are now mandatory, not optional.** `params`, `searchParams`, `cookies()`,
`headers()`, and `draftMode()` are all async in v16 — the synchronous form is removed, not
just deprecated. Await every one of them, in Server Components, Route Handlers, and
`generateMetadata` alike (§12).

## 4. Caching model

The biggest behavioural change in 16. Next.js replaced implicit route-level caching with
**Cache Components** (`cacheComponents: true` in `next.config`), built on the `"use cache"`
directive plus completed Partial Prerendering (PPR). The default flipped: dynamic code now
executes at request time unless you opt a piece of it into caching explicitly with
`"use cache"` — nothing is silently cached behind your back anymore.

Three invalidation APIs, each with a distinct scope — don't reach for the wrong one:

| API | Scope |
| --- | --- |
| `revalidateTag(tag, cacheLifeProfile)` | Invalidates everything cached under `tag`. The `cacheLifeProfile` argument is now **required** — there's no bare `revalidateTag(tag)` call anymore. |
| `updateTag()` | New in 16. **Server-Action-only.** Gives read-your-writes: the action's own response sees the update immediately, without waiting for the tag to propagate elsewhere. |
| `refresh()` | New in 16. Refreshes **uncached** data only — not a substitute for the tag APIs above. |

**Decision rule — `cacheLifeProfile` values aren't sourced here.** This skill doesn't carry
the profile catalog (name, TTL, stale window per profile) because no primary source backed a
specific list at authoring time — don't guess one. Pull the current profile set for the
installed Next.js version from `next-devtools-mcp`'s Cache Components setup guidance (§11)
before writing a `revalidateTag` call, rather than hardcoding a profile name from memory.

## 5. Server Actions

A Server Action (`"use server"`) is the mutation path `updateTag()` is scoped to (§4) —
validate every input on the server regardless of what client-side validation already ran;
never trust a client-submitted value just because a form library validated it first. A
minimal shape, using only the APIs named above:

```ts
"use server";
import { updateTag } from "next/cache";

export async function saveDraft(formData: FormData) {
  const draft = parseAndValidate(formData); // server-side validation, always
  await db.draft.update(draft);
  updateTag("draft"); // read-your-writes for this action's own response
}
```

**Decision rule — no sourced react-hook-form + Zod pattern.** This skill doesn't ship a
specific form-validation code sample because none was independently verified as sourced
material. `JanSzewczyk/claude-plugins`' `nextjs` plugin bundles a Server Actions +
react-hook-form + Zod + T3 Env pattern set worth mining for the shape of that integration —
cherry-pick from it, don't install the plugin wholesale (it's MIT, structurally sound, but
low-adoption and unvetted at the "install as-is" bar).

## 6. Routing and the proxy

`middleware.ts` is **deprecated** in favour of `proxy.ts`, which runs on the **Node.js
runtime** — not Edge. That's a real capability change, not a rename: full Node APIs are
available to proxy logic (auth checks, redirects) that the old Edge-only middleware couldn't
reach.

**Decision rule — no sourced `proxy.ts` config/matcher syntax.** Read the exact export shape
and matcher config from the project's own generated file or from `next-devtools-mcp`'s
knowledge base (§11) rather than porting middleware-era config syntax across by assumption.

**Cross-check before shipping to Cloudflare:** the Node runtime `proxy.ts` runs on doesn't
carry unmodified onto Workers — Node.js Middleware (15.2+) is unsupported there (§9). Confirm
any proxy-based auth/redirect logic still behaves before it's deploy-critical.

## 7. Images, fonts, env and config

`next/image` and `next/font` are the default — a raw `<img>` or a webfont `@import` on a
shipped route is a defect, and env access follows the server/client split rather than
leaking a secret into the bundle. Both sections in full, with the Cloudflare-specific
caveats: [CLOUDFLARE-AND-TOOLING.md](references/CLOUDFLARE-AND-TOOLING.md).

## 9. Cloudflare deployment — the differentiator

JHD Next.js apps ship on Cloudflare through `@opennextjs/cloudflare`, not Vercel: the
adapter's cache handlers back `revalidateTag` and ISR, `nodejs_compat` is required, and the
Worker's limits decide what a route may do. Build and preview through the adapter, never
`next start`, or you are verifying a runtime you will not ship on. Procedure, MCP tooling,
testing and perf hooks, and the SEO cross-reference:
[CLOUDFLARE-AND-TOOLING.md](references/CLOUDFLARE-AND-TOOLING.md).
