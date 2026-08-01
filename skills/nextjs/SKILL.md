---
name: nextjs
description: Build, review, or deploy a Next.js (App Router) app — Cache Components, "use cache", revalidateTag/updateTag/refresh, Server Actions, proxy.ts, or Cloudflare via @opennextjs/cloudflare. Use when the operator names Next.js, App Router, RSC, "use cache", proxy.ts, middleware.ts, OpenNext, ISR, PPR, or a .tsx under app/. Not Workers post-deploy — workers-best-practices/wrangler; not UI tokens — design-system/markup-standard; not test/perf — webapp-testing/performance; not SEO — the seo-* family.
---

# Next.js

The house Next.js skill: App Router only, Cloudflare as the deploy target. It owns what's
specific to Next.js — the file conventions, the Cache Components model, Server Actions, and
the OpenNext-on-Cloudflare path. It does not restate what a sibling skill already owns: once
code is running on a Worker, `workers-best-practices` and `wrangler` own the Workers
production bar; the token/markup bar for anything this skill renders
is [`design-system`](../design-system/SKILL.md) and
[`markup-standard`](../markup-standard/SKILL.md); test and perf mechanics are
[`webapp-testing`](../webapp-testing/SKILL.md) and `performance`. Cross-link to those rather
than duplicating them — see §9, §10, §12.

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

## 7. Image and font optimisation

Use `next/image` and `next/font` as the sanctioned defaults over a manual `<img>`/`<link>` —
that's the whole reason both exist in the framework, and it's the safe default to reach for
without further justification.

**Decision rule — no sourced defaults/config shape.** This skill doesn't carry `next/image`'s
default format/quality table or a `remotePatterns` shape, because neither was independently
sourced. Read them from the installed version's own docs or `next-devtools-mcp`'s knowledge
base (§11) at implementation time, not from memory. Two things this skill does own the
pointer for, not the content: the numeric Core Web Vitals bar an image choice is judged
against (CLS included) is `performance`'s; the alt-text/markup bar any `next/image` usage
ships against is [`markup-standard`](../markup-standard/SKILL.md)'s.

## 8. Env and config

`next.config.ts` — native TypeScript config, no `next.config.js` + JSDoc workaround needed.

**Decision rule — no sourced env-schema shape.** This skill doesn't ship a typed-env-schema
code sample. `JanSzewczyk/claude-plugins`' `nextjs` plugin's T3 Env pattern is the mineable
reference (same provenance note as §5) — cherry-pick the schema shape from there rather than
inventing one here.

## 9. Cloudflare deployment — the differentiator

This is the one thing genuinely missing from every community Next.js pack surveyed, and the
reason this skill exists in-house rather than being installed wholesale.

**The path.** The officially endorsed Cloudflare deployment adapter is
**`@opennextjs/cloudflare`** (the OpenNext adapter). Scaffold with
`npm create cloudflare@latest -- <app> --framework=next`, or let Wrangler auto-detect an
existing Next.js project. It deploys the app to a Worker running Next's **Node.js runtime**,
not Edge — the reason it's more feature-complete than the retired `@cloudflare/next-on-pages`
path. Supported: App Router, Route Handlers, SSG/SSR/ISR, image optimisation, PPR, and
`"use cache"`.

**Required config.** The `nodejs_compat` compatibility flag, plus a compatibility date of
**2024-09-23 or later** in `wrangler` config. Wire the rest of the Worker (bindings, routes,
secrets) per `wrangler`'s own conventions — this skill owns the Next.js side of the config,
not the Workers side of it.

**Known gaps — check these before committing to a feature:**

| Gap | Detail |
| --- | --- |
| Node.js Middleware (15.2+) | Unsupported on Workers — see the `proxy.ts` cross-check in §6 |
| Worker size limits | 3 MiB (free tier) / 10 MiB (paid tier), compressed |
| Windows local dev | Not guaranteed — develop under WSL or Linux CI instead |

**The mandatory pre-ship check.** Production runs on `workerd`; `npm run dev` runs plain
Node. Those are different runtimes with different behaviour — a change that works under
`npm run dev` is **not** verified for production. Run **`npm run preview`** (which builds
through the actual OpenNext/Workers path) before every ship. Treat a ship that skipped
`npm run preview` as unverified, the same way `webapp-testing` treats a claim with no test
run behind it.

**Decision rule — no sourced `open-next.config.ts` contents.** This skill doesn't ship a
config file body because no primary source backed specific contents at authoring time. Read
whatever the scaffold command above generates, or pull current syntax from
`next-devtools-mcp` / opennext.js.org, rather than hand-writing one from memory.

**Watch item, not yet actionable.** Next.js's new **Build Adapters API (alpha)** explicitly
cites OpenNext-style adapters as its model — it could eventually formalise or replace parts
of this setup. Don't build against it yet; note it in a project's upgrade log when it leaves
alpha.

**Cross-links, not duplication.** Deploy mechanics and CLI usage are `wrangler`'s; stateful
coordination needs (a chat room, a booking system, anything needing a Durable Object) are
`durable-objects`'; the general Workers production bar (streaming, no floating promises, no
global state, secrets, observability) is `workers-best-practices`'. This skill hands off to
all three the moment code is running on the Worker — it doesn't restate their content.

## 10. Testing and perf hooks

Don't duplicate mechanics this skill doesn't own:

- **Playwright E2E** (locators, web-first assertions, visual regression, Page Object Model)
  is [`webapp-testing`](../webapp-testing/SKILL.md)'s — apply it to Next.js routes exactly as
  you would any web app; nothing Next.js-specific changes the mechanics.
- **Core Web Vitals and perf measurement** (the numeric bar, profiling method) is
  `performance`'s.
- The one Next.js-specific wrinkle: `next-devtools-mcp` (§11) bundles a Playwright MCP
  integration, so RSC/hydration-specific failures can be correlated back to a route or a
  specific `get_server_action_by_id` result — prefer that pairing over a bare Playwright run
  when the symptom is RSC/hydration-shaped rather than a generic UI assertion.

## 11. MCP tooling

| Server | Install | What it's for |
| --- | --- | --- |
| **`next-devtools-mcp`** (official, Vercel-maintained, built into Next 16+) | Per-project `.mcp.json`, `npx -y next-devtools-mcp@latest` | Connects to a running `next dev` server via the built-in `/_next/mcp` endpoint. Tools: `get_errors`, `get_logs`, `get_page_metadata`, `get_project_metadata`, `get_routes`, `get_server_action_by_id` — plus a Next.js knowledge base, an upgrade/codemod helper, Cache Components setup guidance, and Playwright MCP integration. Requires Next.js ≥16. **Install this per project** — it's the primary debugging tool for RSC/hydration issues, cache misbehaviour, and routing questions; prefer it over guesswork. |
| **Vercel MCP** (official, OAuth remote) | `claude mcp add --transport http vercel https://mcp.vercel.com` | **Docs-search only, if at all.** Deployment here is Cloudflare (§9), not Vercel — skip its deployment/project/analytics tools entirely; installing them adds an OAuth grant with no matching use case. |

Minimal per-project `.mcp.json` shape for the required server:

```json
{
  "mcpServers": {
    "next-devtools": {
      "command": "npx",
      "args": ["-y", "next-devtools-mcp@latest"]
    }
  }
}
```

## 12. SEO cross-reference

`generateMetadata` is **async** in v16 — a direct consequence of §3's async-APIs mandate:
it awaits `params`/`searchParams` (and, where used, `cookies()`/`headers()`) the same as any
other Server Component code. That's the one piece of SEO plumbing this skill owns.

Everything else — audits, structured data, Core Web Vitals for search, AI-search readiness,
sitemaps, local/technical/content SEO — belongs to the **`seo-*` family**
(`seo-audit`, `seo-technical`, `seo-schema`, `seo-content`, `seo-geo`, and siblings). Those
skills own the tactics; this skill only owns the Next.js-specific surface (async
`generateMetadata`, the App Router metadata file conventions from §2) that their
recommendations get implemented through. Don't restate SEO tactics here — dispatch to the
relevant `seo-*` skill instead.

## Sources

Primary sources behind every version, flag, and behaviour claim above: nextjs.org/blog/next-16
· nextjs.org/docs/app/guides/mcp · vercel.com/docs/agent-resources/vercel-mcp ·
opennext.js.org/cloudflare · developers.cloudflare.com/workers/framework-guides/web-apps/nextjs
· opennext.js.org/news/2026-03-25-3-years-of-opennext. Community-pack provenance and MCP
server evaluation: `proposals/nextjs-research-brief.md` (this fleet's internal research
brief, 1 Aug 2026) — not restated here; read the brief for that discussion.
