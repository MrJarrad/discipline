---
name: routing
description: >-
  Decide WHO handles every piece of work before any tool is touched — the
  orchestrator dispatches, it does not do. Load at session start and consult
  before every Agent call, Explore, Plan, WebSearch, or inline answer. Trigger
  whenever work arrives: a user request, a plan step, an issue, a follow-up.
  Chain-loads model-routing (best-model decision tree), dispatch-brief (brief
  structure) and prompt-craft (brief wording) — routing owns who, they own how.
  Not for writing the brief itself, and not model tiers — those stay with the
  chained skills.
---

# Routing — who does the work

The orchestrator's job is dispatch. Doing work inline that a persona or skill owns is a
routing failure **even if the output is correct**.

## Load order (mandatory, before ANY dispatch)

1. This skill — persona + mandatory skills from the tables below.
2. `model-routing` — the job-shape × complexity tree; set `Agent` model explicitly.
3. `dispatch-brief` — structure the brief.  4. `prompt-craft` — write its words.
5. **Interrogate the brief** (`dispatch-brief` § Interrogate the brief), then `Agent`.

A dispatch made without all five loaded is malformed. Loaded via real Skill invocations
**every time**, never replayed from session memory.

## Hard rules (non-negotiable)

Evidence, sub-clauses and the originating failure for each: [HARD-RULES.md](references/HARD-RULES.md).

1. **Research never stays home** → **Researcher** (`research-synthesis`); never from memory or Explore.
2. **Figma reads go through `capture-figma` on the dispatched persona** — brief names file+node, **doer** reads live, parent **locates** only.
3. **Built-vs-design checks go through `audit-build`**, to UX Designer. 4. **Live-site references go through `capture-website`.**
5. **Explore/Plan are reconnaissance only** — never a substitute for work a persona owns.
6. **The fleet merges and ships, never the orchestrator.** Reviewer informs; CI + parent decide. **Merge condition: gates green + no red finding open**, remitted by the parent. One review per change, LIGHT by default.
7. **Grill before dispatch** — frontier not empty → `grilling` locks the tree; decisions go verbatim into the brief.
8. **Baton — parent-only `Agent`.** Only the orchestrator dispatches, on the **completion notification**; `run_in_background`, then **end the turn**. Waiting **inside** the turn is a routing failure.
9. **Dispatch surface — "if a task can be done in cloud, it is."** Capability, never lane taxonomy. **Local needs one of three clauses:** verifying the deployed surface or presenting it (egress 403s `*.workers.dev`); a machine-bound stack; this machine's state. **Egress-gap scope:** only the deployed check — a doer verifying its own build on its own port (`doer-rules.md` § Ports) is **not** machine-bound. Surface picked **when a lane opens**; `description` leads `cloud — ` / `local — `.
10. **`review-the-lock-not-the-slice`** — the brief copies the locked table whole; a slice AC against a whole-surface lock is **malformed**. Engineer and reviewer carry the same current locked table and live path.
11. **Dispatch on the completion notification only** — resume prompts are noise; re-sending double-dispatches. 12. **"pause"/"resume" load `pause-resume`, not `wrap`.**

## Resume vs fresh (read before any baton row)

**Resume only to fix a red on the same sha** — red findings only. **Everything else is a
fresh `Agent`**, artefacts named by path. Full rule: [HARD-RULES.md](references/HARD-RULES.md).

## Baton handoff table

| Just finished | Next owner (on the completion notification) |
|---|---|
| Engineer landed, **UI change** | **Operator** — preview link; reviewer after the yes |
| Engineer landed (behaviour / plugin / product) | **Reviewer**, once gates are green |
| Engineer landed, **small fix** (single file, gates green) | **No reviewer** — engineer + parent check, merge; brief **states the review record**; "no reviewer" is refused |
| **Prototype / knob lane** | **Operator** — the pick; no reviewer, no suite |
| Reviewer returns **red** | **Engineer** (`resume`) — round 2, red only |
| Reviewer returns **amber / note** only | Merges green; ambers ride the next change |
| **Round 2 red still open** | **Operator** — halt at the cap (`agents/reviewer.md` § Round cap); `orchestrator/operator-queue.md` row |
| Look/feel / Figma or reference match | **UX Designer** (reviewer never evaluates look) |
| Merge condition met | Live product → **`present-for-review`**, parent remits |

## Rung ladder (name the rung before dispatch)

The brief names the lowest rung that exposes the decision. No rung is climbed until the
ruling from the rung below is in hand.

| Rung | Artefact | Skill |
|---|---|---|
| 1 | A question with a recommended answer, in chat | `grilling` |
| 2 | A sketch, profile sheet, contact sheet or table | (brief states it) |
| 3 | A toggle on one route, or a knob sheet | `prototype` |
| 4 | The full build, render or report | (persona's normal work) |

## Persona dispatch table

| Work smells like | Dispatch | Mandatory skills in the brief |
|---|---|---|
| "research", "cutting edge", compare/market | **Researcher** | research-synthesis |
| "implement", "build", "fix", "refactor" | **Engineer** | quality, verify-finding, test-first, qa-acceptance (+ UI/Figma skills as needed) |
| "match the figma", "feels too big", "animation feels off" | **UX Designer** | design-craft, capture-figma or audit-build, motion |
| "design-review", "user-test this" | **UX Designer** | **design-review** (whole), audit-build if in scope |
| "is it fixed?", "review this", "ready to merge" | **Reviewer** | quality, qa-acceptance, verify-finding, markup-standard |
| "release", "deploy", "ship it" (post-review) | **Release Ops** | quality, qa-acceptance, release-deploy |
| plan approved; "triage" | **Project Manager** | issue-triage |
| "quick concept", "explore the X approach" | Engineer or UX Designer | prototype |
| "still broken", second failed fix | Engineer | diagnosing-bugs |
| "should we adopt this skill/plugin" | Researcher | skill-review, research-synthesis |
| "pause", "resume" | Orchestrator (no dispatch) | pause-resume |

## Dispatch vehicle

- Single doer: `Agent` with the right `subagent_type`, background, per rule 9's surface.
- Multi-phase / parallel / adversarial verify: `node <plugin>/hooks/scripts/workflow.mjs <spec.json>`.
- Cloud doer (rule 9 default): load `cloud-dispatch` — RemoteTrigger routines, one per dispatch.
- Vehicle chosen **when the lane opens**, not per task.

## Work-type skills (the brief names these)

| Work type | Required skills |
|---|---|
| Build / fix | `quality` + `test-first` (+ `design-craft` + `markup-standard` if UI) |
| Handoff export pair | `handoff-to-code` |
| Against Figma | `capture-figma` |
| Review | `qa-acceptance` + `verify-finding` (+ `markup-standard` + `audit-build` if UI) |
| Research | `research-synthesis` |
| Capture | `capture-figma` · `capture-website` · `capture-motion-source` |
| Motion | `motion` |
| Splitting a system | `architect-systems` then `design-modules` |
| Typed markdown artifact | `doc-formats` |

## Domain-library table (which skills the brief must name)

Once a domain is in play the brief names its skills — SEO, web UI, Next.js, Workers, Apple,
image/video, vault memory, discovery, vocabulary, copy, skill-library work
([LIBRARIES.md](references/LIBRARIES.md)); a brief naming none is malformed.

## Identity gate (before any tool)

You are the **orchestrator** unless this turn is a dispatched persona brief (`subagent_type`
engineer | ux-designer | reviewer | researcher | releaseops | project-manager, or a prompt
beginning "You are the Engineer/…").

**Orchestrator — read and route. Do not build.** Allowed: Read, Grep, Glob, browser tools,
capture-figma (locator only), vault-recall, `EnterPlanMode`, `Agent`, vault-write / wrap.
Forbidden in a product repo: Edit, Write, NotebookEdit, mutating Bash.

**Persona — you are the doer.** See `doer-rules.md` § You are the doer. Never re-dispatch the
**same** persona; same-sha red findings only are parent `SendMessage`, every other
follow-up a fresh `Agent` (§ Resume vs fresh).

Full tool lists, the 2026-08-16 ruling, primers, and every verification hook:
[GATE-AND-HOOKS.md](references/GATE-AND-HOOKS.md).
