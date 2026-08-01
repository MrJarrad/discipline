---
name: routing
description: >-
  Decide WHO handles every piece of work before any tool is touched — the
  orchestrator dispatches, it does not do. Load at session start and consult
  before every Agent call, Explore, Plan, WebSearch, or inline answer. Trigger
  whenever work arrives: a user request, a plan step, an issue, a follow-up.
  Chain-loads model-routing (tier/effort/caps), dispatch-brief (brief
  structure) and prompt-craft (brief wording) — routing owns who, they own how.
  Not for writing the brief itself, and not model tiers — those stay with the
  chained skills.
---

# Routing — who does the work

The orchestrator's job is dispatch. Doing work inline that a persona or skill
owns is a routing failure **even if the output is correct** — it starves the
fleet, bypasses skill discipline, and makes usage unauditable. Evidence: in the
week of 26 Jul–1 Aug, the orchestrator ran its own Explore agent 18 times while
Researcher was dispatched once and 14 of 30 skills never fired.

## Load order (mandatory, before ANY dispatch)

1. This skill — pick the persona and mandatory skills from the tables below.
2. `model-routing` — set tier, effort, maxTurns explicitly.
3. `dispatch-brief` — structure the brief.
4. `prompt-craft` — write its words at the right altitude.

A dispatch made without all four loaded is malformed.

## Hard rules (non-negotiable)

1. **Research never stays home.** Any lookup, comparison, market/competitor
   question, "what's the best X", "cutting edge", or sourced question about the
   live world → dispatch **Researcher**, whose primary mechanism is
   `perplexity-research` (standing operator rule, 2026-07-20: "all external
   research must be done by the perplexity model"). Never answer research from
   memory; never substitute Explore/general-purpose. WebSearch/WebFetch only
   follow up already-cited URLs.
2. **Figma reads go through `capture-figma`.** A pasted figma.com URL, "fresh
   sync", "the figma version", "discrepancies with figma", or any need for
   tokens/variables/variants/component names/copy from a design file → invoke
   `capture-figma` first. Figma screenshots in chat are context, never a
   substitute.
3. **Built-vs-design checks go through `audit-build`** ("the blocks are off",
   "doesn't match figma", post-port verification) — dispatched to UX Designer.
4. **Live-site references go through `capture-website`** ("look at this site",
   "like pentagram does", any external URL offered as a reference).
5. **Explore/Plan are reconnaissance only.** The orchestrator may use built-in
   Explore/Plan for its own codebase orientation before writing a brief — never
   as a substitute for work a persona owns, and never for anything the operator
   asked to be researched, designed, built, reviewed, or released.
6. **The fleet merges and ships, never the orchestrator** (operator ruling,
   2026-07-26). Reviewer gates the merge; Release Ops executes the release via
   `release-deploy`.

## Persona dispatch table

| Work smells like (operator's actual phrasing) | Dispatch | Mandatory skills in the brief |
|---|---|---|
| "research…", "dispatch the researcher", "did research look at…", "worth researching", "cutting edge", "best in class way to", compare/market/competitor | **Researcher** | perplexity-research, research-synthesis |
| "implement", "build", "fix", "refactor", "bring v2 in", "remove X and replace with Y" | **Engineer** | quality, verify-finding, test-first, qa-acceptance (+ design-craft, markup-standard when UI) |
| "match the figma", "discrepancies", "feels too big", "the animation feels off", "make it look right", UI review | **UX Designer** | design-craft, capture-figma or audit-build (rule 2/3), motion |
| "review this", "ready to merge", "check before shipping" | **Reviewer** | quality, qa-acceptance, verify-finding, markup-standard |
| "release", "deploy", "push to production", "ship it", "get it live" (post-review) | **Release Ops** | quality, qa-acceptance, release-deploy |
| plan approved → tasks; "sort the tasks", "tidy the board", "triage" | **Project Manager** (dispatch automatically when a plan is approved, not on request) | issue-triage |
| "quick concept", "explore the X approach", "v2 of Y to explore", state-machine / data-shape question | Engineer or UX Designer | prototype |
| hard/intermittent bug, "still broken", "not picking up", second failed fix | Engineer | diagnosing-bugs |

## Domain-library table (which skills the brief must name)

| Domain in play | Load |
|---|---|
| SEO / meta / sitemap / schema / rankings / content structure | the relevant `seo-*` skill; `seo-audit` before any site launch |
| Shipping web UI | design-system, markup-standard, web-perf/performance, webapp-testing |
| Next.js project (App Router, "use cache", OpenNext, RSC) | nextjs + next-devtools-mcp (per-project), plus workers-best-practices/wrangler for the Cloudflare side; design-system + markup-standard + webapp-testing as with any web UI |
| Greenfield marketing/portfolio surface with NO house design system | design-taste-frontend (when a design system exists, design-craft + design-system govern — never both paths at once) |
| Workers / Pages / KV / D1 / R2 / wrangler | workers-best-practices, wrangler (+ durable-objects, agents-sdk, sandbox-sdk, cloudflare-email-service as applicable) |
| Security-sensitive surfaces (auth, input, payments) | owasp-security |
| Image generation / creative direction | banana |
| Editing an existing image (identity-preserving) | qwen-edit |
| Brand video / motion content | remotion, ffmpeg, playwright-recording, elevenlabs/acestep as needed, runpod for GPU |
| Apple platform project (occasional but real) | the Apple suite (swift/swiftui/ios/macos…, testing, security, release-review — the iOS-scoped versions). Web project → web equivalents above; never cross-load |
| Meetings / ops ("what's on my plate", transcripts) | ops-inbox, which chains summarise-meeting |
| Memory (prior decisions, learnings) | vault-recall before deriving; vault-write to land |

## Self-check before acting inline

Before the orchestrator touches any tool ask: **"does a persona or skill own
this?"** If yes and you're about to do it yourself — stop, dispatch. Log the
routing decision as one line in the dispatch description ("Researcher (sonnet):
…"), per operator-rules rule 1.

## Verification hooks

- Reviewer: a change whose brief mandated skills must show those invocations in
  the transcript — missing evidence is a quality failure, send back.
- `wrap`: report personas/skills invoked this session against these tables;
  any mandated-skill zero on relevant work is a defect to log.
