# nextjs — Cloudflare deployment, MCP tooling, testing and SEO cross-reference

SKILL.md keeps the rule per numbered area; this file is the OpenNext/Cloudflare differentiator in full, the MCP tooling surface, the testing and perf hooks, the SEO cross-reference and the sources. Nothing here was rewritten — it is the 1.78.0 body, moved.

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
- **Core Web Vitals and perf measurement** (the numeric bar, lab evidence on UI work) is
  **Law 9** in
  [`design-craft/references/TECHNICAL-DESIGN.md`](../design-craft/references/TECHNICAL-DESIGN.md)
  — engineer/reviewer duty on UI diffs; field CrUX stays release-only.
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


## 7. Image and font optimisation

Use `next/image` and `next/font` as the sanctioned defaults over a manual `<img>`/`<link>` —
that's the whole reason both exist in the framework, and it's the safe default to reach for
without further justification.

**Decision rule — no sourced defaults/config shape.** This skill doesn't carry `next/image`'s
default format/quality table or a `remotePatterns` shape, because neither was independently
sourced. Read them from the installed version's own docs or `next-devtools-mcp`'s knowledge
base (§11) at implementation time, not from memory. Two things this skill does own the
pointer for, not the content: the numeric Core Web Vitals bar an image choice is judged
against (CLS included) is **Law 9** in
[`design-craft/references/TECHNICAL-DESIGN.md`](../design-craft/references/TECHNICAL-DESIGN.md);
the alt-text/markup bar any `next/image` usage ships against is
[`markup-standard`](../markup-standard/SKILL.md)'s.
## 8. Env and config

`next.config.ts` — native TypeScript config, no `next.config.js` + JSDoc workaround needed.

**Decision rule — no sourced env-schema shape.** This skill doesn't ship a typed-env-schema
code sample. `JanSzewczyk/claude-plugins`' `nextjs` plugin's T3 Env pattern is the mineable
reference (same provenance note as §5) — cherry-pick the schema shape from there rather than
inventing one here.
