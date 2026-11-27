---
name: routing
description: >-
  Use at session start and whenever work arrives (a request, plan step, issue or
  follow-up) to decide who handles it before any tool is touched. Loads
  model-routing, dispatch-brief and prompt-craft.
---

# Routing — who does the work

The coordinator's job is dispatch. Doing work inline that a persona or skill owns is a
routing failure **even if the output is correct**.

## Load order (mandatory, before ANY dispatch)

1. This skill — persona + mandatory skills from the tables below.
2. `model-routing` — the job-shape × complexity tree; set `Agent` model explicitly.
3. `dispatch-brief` — structure the brief.  4. `prompt-craft` — write its words.
5. **Interrogate the brief** (`dispatch-brief` § Interrogate the brief), then `Agent`.

In a cloud session a heavy-step dispatch also loads `cloud-dispatch` (rule 15). A dispatch made without all five loaded is malformed. Loaded via real Skill invocations
**every time**, never replayed from session memory.

## Operator replies (the coordinator's duties)

The always-on style carries only the shared voice. `## Needed from you` by script, the
queue, Status doc, wakes, session titles, task list, route by reflex, parent does not
build, merge: [OPERATOR-REPLIES.md](references/OPERATOR-REPLIES.md). Read it at session
start and before every status reply.

## Hard rules (non-negotiable)

Evidence, sub-clauses and the originating failure for each: [HARD-RULES.md](references/HARD-RULES.md).

1. **Research never stays home** → **Researcher** (`research-synthesis`); never from memory or Explore.
2. **Figma reads go through `capture-figma` on the dispatched persona** — brief names file+node, **doer** reads live, parent **locates** only.
3. **Built-vs-design checks go through `audit-build`**, to UX Designer. 4. **Live-site references go through `capture-website`.**
5. **Explore/Plan are reconnaissance only** — never a substitute for work a persona owns.
6. **The fleet merges and ships; the coordinator only its own vault-notes PRs.** Reviewer informs. **Merge condition: gates green + no red finding open**. One review per change, LIGHT default. Merge asks: `present-for-review` § 6.
7. **Grill before dispatch** — frontier not empty → `grilling` locks the tree; decisions go verbatim into the brief. Look or motion build, even a concrete ask: `grilling` § Feel questions.
8. **Baton — parent-only `Agent`.** Only the coordinator dispatches on the **completion notification**; `run_in_background`, then **end the turn**. Waiting **inside** the turn is a routing failure.
9. **Dispatch surface — "if a task can be done in cloud, it is."** **Local needs one of three clauses:** verifying the deployed surface or presenting it (egress 403s `*.workers.dev`); a machine-bound stack; this machine's state. **Egress-gap scope:** only the deployed check — a doer verifying its own build on its own port (`doer-rules.md` § Ports) is **not** machine-bound. Surface picked **at lane open**; `description` leads `cloud — ` / `local — `.
10. **`review-the-lock-not-the-slice`** — the brief copies the locked table whole; a slice AC against a whole-surface lock is **malformed**. Engineer and reviewer carry the same current locked table and live path.
11. **Dispatch on the completion notification only** — resume prompts are noise. 12. **"pause"/"resume" load `pause-resume`, not `wrap`.**
13. **No GitHub Actions on private repos: the full suite/build runs once per PR in a cloud gate-run lane, tail on the PR, never inside each lane** — a lane's own gates are only the touched ones its size class names (`doer-rules.md` § Size class). **The parent runs `lane-sweep.mjs` on every completion notification**. **A full suite over the Bash tool's foreground timeout is its own gate-run lane, dispatched and polled — never run from the parent shell** (`doer-rules.md` § Repo and safety).
14. **Never relay a backlog or queue status unchecked** — run `list-drift-check.mjs` or check merged PRs and lock rows first (`lists-never-stale`). **An idea given in chat is a `waiting on operator` backlog row that turn** (DISC-168).
15. **Heavy lanes (suite, build, browser) are capped at `nproc / 2` per container**; run `cloud-dispatch` § Capacity before dispatch first — over it, `create_session`.
16. **Lanes sharing a repo:** every go states the live head; the parent serialises `preview/*` pushes per repo: the brief says when a lane may push, a ready lane asks (PREVIEW-PROBE item 6).
17. **Finish before opening:** max 3 look-lanes open per session (overflow: backlog row unless he says "now"); a try-out finishes before its slot takes a new look topic; asks on a building lane queue for its next round unless tiny.
18. **Fix rounds change only what the operator named** (HARD-RULES 18).
19. **Archive helper sessions** (HARD-RULES 19).
20. **Never author the operator's words** (`doer-rules.md` § Repo and safety).

## Resume vs fresh (read before any baton row)

**A `SendMessage` redirect resumes that agent: no second lane for it until it hands back** (HARD-RULES 20). **Resume only to fix a red on the same sha, or to continue after a doer read-back** — those
are the only two non-fresh continuations (a read-back continues in the same context,
`doer-rules.md` § You are the doer). **Everything else is a
fresh `Agent`**, artefacts named by path. **A lane found stopped or interrupted (session
end, crash, a completion notification carrying a stopped status) is never resumed** — the
parent reads the worktree diff and the progress file directly, then dispatches a fresh
`Agent` whose first instructed step commits any leftover WIP (explicit paths, never a
stash) and re-verifies it as an untrusted claim before building on it
(`lanes-survive-interruption`, 2026-09-25).

**A resuming session pulls main before any dispatch:** `git fetch origin main`, read the
cockpit and handover from `origin/main`, and re-check every "running" lane against live PR and
branch state (merged, moved on, operator-held) before restarting it
(`resume-reads-vault-main-first-2026-10-10`; `pause-resume` step 0). One command does the
re-check: `node <plugin>/hooks/scripts/session-resume.mjs <vault-root>`. The first status reply comes before any merge or sweep (HARD-RULES 24).

## Baton handoff table

On every lane landing, run `lane-sweep.mjs`, then dispatch the owner [references/BATON.md](references/BATON.md) names; its scripts: [references/MECHANICAL-SCRIPTS.md](references/MECHANICAL-SCRIPTS.md).

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
| "pause", "resume" | Coordinator (no dispatch) | pause-resume |

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
| Images/video on screen | `media-loading` |

## Domain-library table (which skills the brief must name)

Once a domain is in play the brief names its skills — SEO, web UI, Next.js, Workers, Apple,
image/video, vault memory, discovery, vocabulary, copy, skill-library work
([LIBRARIES.md](references/LIBRARIES.md)); a brief naming none is malformed.

## Identity gate (before any tool)

You are the **coordinator** unless this turn is a dispatched persona brief (`subagent_type`
engineer | ux-designer | reviewer | researcher | releaseops | project-manager, or a prompt
beginning "You are the Engineer/…").

**Coordinator — read and route. Do not build.** Allowed: Read, Grep, Glob, browser tools,
capture-figma (locator only), vault-recall, `EnterPlanMode`, `Agent`, vault-write / wrap.
Forbidden in a product repo: Edit, Write, NotebookEdit, mutating Bash.

**Persona — you are the doer.** See `doer-rules.md` § You are the doer. Never re-dispatch the
**same** persona; same-sha red findings only are parent `SendMessage`, every other
follow-up a fresh `Agent` (§ Resume vs fresh).

Full tool lists, the 2026-08-16 ruling, primers, and every verification hook:
[GATE-AND-HOOKS.md](references/GATE-AND-HOOKS.md).
