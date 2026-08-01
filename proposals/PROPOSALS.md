# Discipline Plugin Proposals — routing, merges, conflict fixes

**Date:** 1 Aug 2026 · **Against:** ~/JHD/discipline @ v1.20.1 · **Process:** these are inputs to `agent-ops` (which owns skill-library changes and the eval gate) — apply via its procedure, not by blind copy.

## 0. Status checks (done)

- flux plugin confirmed **disabled** (`"flux@flux-local": false`) — no live conflict with discipline's same-named skills.
- v1.20.1 already fills gaps the 1.15.0-era audit flagged: `webapp-testing` (web testing — no new skill needed, and personal iOS `testing` stays dormant), `release-deploy` (web release procedure), `design-taste-frontend` + `impeccable` (greenfield anti-slop craft).

## 1. NEW: `skills/routing/SKILL.md` (included in this folder)

The missing layer. dispatch-brief disclaims routing; nothing owns it; the usage data shows the cost (Explore ×18 vs Researcher ×1 in the last week; 14/30 skills at zero). The draft encodes: hard rules (research → Researcher/perplexity, Figma → capture-figma, fleet merges not orchestrator), a persona dispatch table keyed to Jarrad's actual phrasing, a domain-library table (SEO, web UI, Cloudflare, imagery, video, Apple-vs-web disambiguation), and verification hooks for Reviewer and wrap.

**Deviation from the earlier "merge model-routing" decision, flagged for the eval gate:** model-routing at v1.20.1 is a mature spend skill (tiers + effort + maxTurns + panel sizing, grounded in the 26 Jul burn report). Merging would bloat routing and bury that content. The draft instead makes routing chain-load model-routing + dispatch-brief + prompt-craft as a mandatory four-step load order — same guarantee (nothing forgotten), better separation. If the eval gate prefers a literal merge, the draft's structure accepts model-routing as a section without rework.

## 2. Merges (drafting guidance — bodies already exist, combine don't rewrite)

- **motion** ← motion-craft + review-animations + animation-vocabulary. Sections: Build (motion-craft body) / Review (review-animations body, keeps its Block-Approve bar) / Vocabulary (animation-vocabulary body). Description opens: "Build, review, and name motion…" with triggers "the animation feels off", "review the transition", "what's it called when…". UX Designer's stack: three entries → one.
- **shape-stress** absorbs **stress-plan**. stress-plan's interview loop becomes shape-stress's "Stress an existing plan" mode; its trigger phrases ("grill this proposal", "stress-test the plan") join shape-stress's description. stress-plan deleted.
- **vault-recall + vault-write → vault** (optional, low priority). One memory skill, Read and Write chapters; fence lines vanish because the boundary becomes internal.
- Personal library (outside the plugin, same pattern): playwright-recording → chapter of playwright-skill; remotion-official → chapter of remotion; ffmpeg-toolkit → chapter of ffmpeg; seo-* 13 → 6 (audit+competitor-pages / plan / content+page / technical+sitemap+schema+images+hreflang / international-local(geo+local) / programmatic).

## 3. Conflict fixes (description-only patches)

- **Archive personal `frontend-design`** — superseded at v1.20.1 by design-taste-frontend (greenfield direction) + impeccable (craft CLI). Its "avoid generic aesthetics, invent" mandate directly contradicts design-craft/design-system's "reach for existing tokens first" on any project WITH a system. The plugin pair already carries the correct scoping ("no existing design system to follow").
- **banana description patch** — drop "editing" from its trigger claim: generation + creative direction only. qwen-edit owns edits of existing images. One clause each, fence lines both ways.
- **`cloudflare` umbrella** — rewrite as a thin index naming which sibling owns what (workers-best-practices, durable-objects, wrangler, email-service, agents-sdk, sandbox-sdk), or archive it and let routing's domain table do the indexing. Risk today: the matcher loads the shallow umbrella instead of the deep specialist.
- **performance absorbs web-perf** (personal) as its audit chapter — performance already declares itself the implementation "how"; web-perf is the measurement procedure. One skill, build+measure.

## 4. Trigger rewrites for never-fired plugin skills

Pattern (proven by which skills DO fire): open with the operator's phrases, close with fence lines. Priority order by expected value: capture-figma (rewrite in dependability audit §3.2), prototype, design-system, diagnosing-bugs, discover-scope, define-terms, issue-triage, ops-inbox, summarise-meeting, model-routing (add trigger: "before ANY Agent call" is currently only enforced by routing's load order). The audit document carries drop-in text for the first six.

## 5. Agent charter patches (agents/*.md, one line each)

- researcher.md — dispatch triggers gain: "dispatch the researcher", "did research look at", "worth researching", "cutting edge", "best in class way to".
- project-manager.md — "Dispatch automatically when a plan is approved — not on request", plus "sort the tasks", "tidy the board".
- releaseops.md — "merge it", "get it live", + automatic post-Reviewer dispatch for production-bound work; cites release-deploy.
- ux-designer.md — capture-figma/capture-website/audit-build become preconditions: "any task referencing Figma or a live reference starts by invoking the relevant capture skill — never build or review from screenshots alone."

## 6. Verification (closes the loop)

- Reviewer checklist: evidence that brief-mandated skills actually ran (Skill invocations visible in transcript); missing → send back.
- wrap: session report of personas/skills used vs routing tables; mandated-skill zeros logged as defects.
- Dashboard: refresh roster to v1.20.1's 39 skills; weekly scheduled refresh so zeros surface within days, not weeks.
