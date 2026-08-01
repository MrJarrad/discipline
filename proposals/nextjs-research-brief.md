_Researched 1 Aug 2026 by a dispatched research agent (web-sourced, cited). Companion to PROPOSALS.md — feeds the routing domain table and a proposed nextjs skill._

# Next.js Tooling & Skills Research Brief

## Answer

Build one first-party `nextjs` skill (adopt the pattern of the existing Astro/Cloudflare skills), don't rely on any existing community pack wholesale. Install two MCP servers: **`next-devtools-mcp`** (official, per-project, dev-time debugging) and, optionally, **Vercel MCP** only for docs lookup (skip its deployment/project tools since deployment is Cloudflare, not Vercel). Skim the community repos below for snippets to steal (Server Actions + Zod patterns, cacheLife profiles) but treat them as reference material, not drop-in installs — none are mature or vetted enough to adopt wholesale, and none address Cloudflare deployment, which is the actual gap. The highest-value net-new content is the Cache Components/`"use cache"` model in Next.js 16 and the OpenNext-Cloudflare deployment path, since neither exists anywhere in the current Astro/Workers skill set.

## 1. Existing skills/plugins found

| Name | Link | Quality assessment | Verdict |
|---|---|---|---|
| laguagu/claude-code-nextjs-skills | https://github.com/laguagu/claude-code-nextjs-skills | MIT, 169 commits, transparently attributes upstream (Vercel/Anthropic/Supabase/shadcn) content, covers Next.js 16 + AI SDK 7 + pgvector. Reasonably serious but scoped to an AI-app stack, not general Next.js, and no Cloudflare content. Author warns skills "drift" from upstream. | Adapt — mine for App Router/perf/caching/SEO content, don't install as-is |
| t-code4change/nextjs-claude-skills | https://github.com/t-code4change/nextjs-claude-skills | Claims "production-grade," covers SEO/perf/caching/core patterns — contents couldn't be fetched (robots.txt); unverified provenance, no visible activity/star signal. | Skip until independently verified |
| JanSzewczyk/claude-plugins (Szum-Tech marketplace) | https://github.com/JanSzewczyk/claude-plugins | 9 agents / 29 skills incl. a `nextjs` plugin (Server Actions + react-hook-form + Zod, T3 Env, structured logging, error/retry patterns, feature scaffolding). 1 star — low adoption, but MIT and structurally sound; the Server Actions/Zod/T3-Env pattern set is genuinely useful. | Adapt — cherry-pick the Server Actions/env-validation patterns; don't install wholesale |
| masonjames/shadcnblocks-skill | https://github.com/masonjames/shadcnblocks-skill | Knowledge of 2,500+ shadcn/ui blocks. Overlaps with the existing Tailwind v4/shadcn design-system skill; framework-agnostic. | Skip — redundant |
| "nextjs-shadcn" (mcpmarket.com listing) | https://mcpmarket.com/tools/skills/next-js-shadcn-ui-expert | Directory listing, not a primary source; unverifiable. | Skip |
| Marketplace directories | claudemarketplaces.com · designrevision.com "Awesome Claude Code Skills" · claudeskills.info/best/nextjs-skills · claudedirectory.org | Discovery starting points only; none confirm an official Anthropic/Vercel Next.js SKILL.md pack exists. | Use for periodic re-scanning |

**Bottom line:** No official Anthropic or Vercel Next.js SKILL.md pack exists as of Aug 2026. The community landscape is early, fragmented, low-star, and none of it covers Cloudflare deployment — the one thing actually needed here. Build in-house.

## 2. MCP servers

| Name | Link | What it does | Recommended? |
|---|---|---|---|
| **next-devtools-mcp** (official, Vercel-maintained, built into Next.js 16+) | https://nextjs.org/docs/app/guides/mcp · https://github.com/vercel/next-devtools-mcp | Connects to a running `next dev` server via built-in `/_next/mcp`. Tools: `get_errors`, `get_logs`, `get_page_metadata`, `get_project_metadata`, `get_routes`, `get_server_action_by_id`; plus a Next.js knowledge base, upgrade/codemod helper, Cache Components setup guidance, Playwright MCP integration. Per-project `.mcp.json` (`npx -y next-devtools-mcp@latest`). | **Yes — install per Next.js project.** Official, purpose-built for the Engineer-debugs-live-app pattern; mirrors what wrangler/chrome-devtools MCP do for the Cloudflare/Playwright skills. Requires Next.js ≥16. |
| **Vercel MCP** (https://mcp.vercel.com, official OAuth remote) | https://vercel.com/docs/agent-resources/vercel-mcp | Docs search, project & deployment management, log analysis, analytics. `claude mcp add --transport http vercel https://mcp.vercel.com`. Mature, actively maintained. | **Partial — docs-search only, if at all.** Deployment is Cloudflare, so project/deploy/analytics tools are dead weight and the OAuth grant an unnecessary surface. Otherwise skip and rely on bundled reference links + WebFetch. |
| React/component MCPs, third-party mcp-vercel etc. | (surveyed via aggregators; github.com/nganiet/mcp-vercel) | Redundant with the official offerings above. | **Skip.** |
| shadcn/ui MCP | already connected in this fleet | Component/block/theme lookup, framework-agnostic. | **Already covered.** |

## 3. Best-practice landscape 2026

- **Current stable:** Next.js 16 (GA 21 Oct 2025; 16.2.x as of Mar 2026), Node 20.9+, TS 5.1+. App Router uses React 19.2 canary-track (View Transitions, `useEffectEvent`, `<Activity/>`). Source: nextjs.org/blog/next-16.
- **App Router vs Pages:** App Router is default and actively evolving; Pages Router receives no new architecture investment — App Router only for greenfield.
- **Caching — the big change:** Next.js 16 replaces implicit route-level caching with **Cache Components** (`cacheComponents: true`), built on the `"use cache"` directive plus completed Partial Prerendering. Dynamic code executes at request time by default — caching fully opt-in/explicit. Companion APIs: `revalidateTag(tag, cacheLifeProfile)` (profile now required), new `updateTag()` (Server-Action-only, read-your-writes), new `refresh()` (uncached data only). `middleware.ts` deprecated in favour of `proxy.ts` (Node runtime).
- **RSC/Server Actions conventions:** async `params`/`searchParams`/`cookies()`/`headers()`/`draftMode()` mandatory (sync removed); parallel-route slots need explicit `default.js`; React Compiler stable but opt-in; Turbopack default bundler (2–5× builds, up to 10× refresh).
- **Cloudflare deployment path (the actual target):** officially endorsed path is **`@opennextjs/cloudflare`** (OpenNext adapter) — `npm create cloudflare@latest -- <app> --framework=next`, or Wrangler auto-detect. Deploys to Workers on Next's **Node.js runtime** (not Edge) — why it's more feature-complete than the old `@cloudflare/next-on-pages`. Supports App Router, Route Handlers, SSG/SSR/ISR, image optimisation, PPR, and `"use cache"`. Requires `nodejs_compat` flag + compatibility date ≥2024-09-23. Known gaps: Node.js Middleware (15.2+) unsupported on Workers; Worker size limits (3 MiB free / 10 MiB paid, compressed); Windows dev not guaranteed (WSL/Linux CI). Production runs on `workerd` while `npm run dev` runs Node — **`npm run preview` is the mandatory pre-ship check**, not just `dev`. Sources: opennext.js.org/cloudflare · developers.cloudflare.com/workers/framework-guides/web-apps/nextjs · opennext.js.org/news/2026-03-25-3-years-of-opennext.
- Next.js now frames deployment portability via the new **Build Adapters API (alpha)**, explicitly citing OpenNext-style adapters — watch; could formalise/replace parts of the OpenNext setup.

## 4. Proposed "nextjs" SKILL.md outline

```yaml
---
name: nextjs
description: >
  Use when building, reviewing, or deploying a Next.js (App Router) application —
  triggers on "Next.js", "App Router", "server component", "server action",
  "use cache", "cacheLife", "revalidateTag", "proxy.ts", "middleware.ts",
  "next.config", "OpenNext", "deploy Next.js to Cloudflare", "ISR", "PPR",
  "Cache Components", RSC hydration errors, or any .tsx file under app/.
---
```

Sections: 1 Framework baseline (Next 16+, React 19.2, Turbopack, minimums) · 2 App Router file conventions (layout/page/loading/error/not-found/route, `default.js` for parallel slots, route groups, colocation) · 3 RSC patterns (server vs `"use client"` boundary discipline, interactivity at leaves, `<Suspense>` streaming, no client `useEffect` fetch by default) · 4 Caching model (`"use cache"`, `cacheComponents: true`, `cacheLife` profiles, `revalidateTag` vs `updateTag` vs `refresh`, PPR interplay) · 5 Server Actions (react-hook-form + Zod, error/toast, optimistic UI, never trust client input) · 6 Routing/proxy (`proxy.ts`, Node runtime, auth/redirects) · 7 Image & font optimisation (`next/image` defaults, `remotePatterns`, `next/font`, CLS) · 8 Env & config (typed env schema; `next.config.ts` native TS) · 9 **Cloudflare deployment — the differentiator** (`@opennextjs/cloudflare`, `open-next.config.ts`, `nodejs_compat` + compat date, size budgets, wrangler wiring, `npm run preview` mandatory, unsupported features; cross-links to wrangler/durable-objects/workers-best-practices) · 10 Testing & perf hooks (cross-link playwright/webapp-testing/performance, don't duplicate) · 11 MCP tooling (`next-devtools-mcp` `.mcp.json` snippet; prefer it over guesswork for RSC/hydration debugging) · 12 SEO cross-reference (existing seo-* skills; async `generateMetadata` in v16).

## Routing-table row (drop into routing/SKILL.md domain table)

| Next.js project (App Router, "use cache", OpenNext, RSC) | nextjs skill + next-devtools-mcp (per-project), plus workers-best-practices/wrangler for the Cloudflare side; design-system + markup-standard + webapp-testing as with any web UI |

## Sources (fetched by the research agent)
nextjs.org/blog/next-16 · nextjs.org/docs/app/guides/mcp · vercel.com/docs/agent-resources/vercel-mcp · opennext.js.org/cloudflare · developers.cloudflare.com/workers/framework-guides/web-apps/nextjs · github.com/laguagu/claude-code-nextjs-skills · github.com/JanSzewczyk/claude-plugins · github.com/t-code4change/nextjs-claude-skills (robots-blocked, unverified) · github.com/masonjames/shadcnblocks-skill · aggregator roundups (dev.to, claudemarketplaces.com, designrevision.com, claudeskills.info, claudedirectory.org)

## Confidence
Existing skills: **medium** (ecosystem early/low-star; one repo unfetchable). MCP servers: **high** (primary official docs). Landscape & Cloudflare path: **high** (primary sources, recent). Skill outline: **high** structurally — assumes deployment content lives in one skill rather than a companion `nextjs-cloudflare-deploy`; match or split per your granularity preference.
