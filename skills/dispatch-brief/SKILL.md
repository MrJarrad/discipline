---
name: dispatch-brief
description: >-
  How to write any Agent / subagent dispatch prompt so it's neutral,
  evidence-bound, and scoped. Use before authoring any dispatch brief. Not for
  choosing WHO (routing) or model (model-routing); not issue-triage mechanics.
---

# Dispatch Brief

The orchestrator never writes code or does design work — it only writes briefs. A brief
that steers the answer, skips the required skills, or leaves scope or evidence unstated
produces work that looks done and isn't. Load this before authoring any `Agent` dispatch
(or equivalent subagent) dispatch.

## Neutral briefs never steer

State the question and the constraints. Never a predicted answer. If you name a
candidate — a tool, a library, an approach — label it explicitly as **a hypothesis to
refute, on equal footing with unnamed alternatives**, not a preferred answer wearing a
disguise. "Investigate whether X is the cause (one hypothesis among several — the fix
may lie elsewhere)" is neutral. "Fix the bug in X" when X is unconfirmed is a steer.

If you catch a steer after dispatch, don't wait for the agent to finish — send a
correction immediately.

Figma-backed work names file+node and requires the doer to load `capture-figma` — **do
not paste the resolved instance-prop table**. Name the node; live props win.

## Locked decisions (session — quoted, not paraphrased)

Every non-trivial dispatch brief carries a **Locked decisions** block from `grilling`.
Same bar as governing rulings: **a paraphrase is not compliance.**

**The locked table is the spec — and the brief must copy it whole.** The **first brief**
after a lock must copy the **whole** locked table into ACs. A slice brief ("just nav") of
a whole-surface lock is the origin of partial implement + reviews on the wrong spec —
**malformed — do not `Agent`.**

```markdown
## Locked decisions

| # | Operator said (verbatim) | Means technically (one line) |
| - | --- | --- |
| 1 | "<exact quote from grilling>" | <translation for the doer> |
```

- **Operator column:** experience words the operator actually said — never your summary.
- **Technical column:** one line the doer needs; the parent translates once here, not the doer guessing from "modern" or "robust."
- **Locked decisions → ACs:** **one AC per locked row** (operator-deferred rows named
  explicitly in the brief). Acceptance criteria must trace to these rows — **every locked row**, or an explicit operator-deferred row named in the brief.
- **DO:** Site-wide lock → brief ACs list every surface (or named deferral).
- **DON'T:** Brief "nav clip-mask" when the lock was site-wide.
- **DON'T:** Read "scope to one coherent slice" (Caps below) as permission to drop locked
  rows — that narrows **spec width**; it does not authorize a slice brief of a whole lock.
- A slice AC set that omits locked rows is **malformed** (`review-the-lock-not-the-slice`)
  — **do not `Agent`**. If you cannot write ACs without inventing requirements the operator
  never locked → **`grilling`**, not `Agent`.

**Work batches ≠ spec width.** Implement batches (how you ship) are OK; dropping locked rows
from the brief is not. The lock defines done; batches define sequencing.

## Paired briefs (engineer + reviewer)

When dispatching **reviewer** after engineer, copy the **same current locked table** —
use the engineer's table if that is current. Never reuse an earlier narrower reviewer brief.
Engineer and reviewer briefs must **match on locked rows** (`review-the-lock-not-the-slice`).
A review briefed on a narrower table is **not the gate**; *Review is already running on that
slice* must not protect it.

Standing fleet rulings are quoted separately (below). Locked decisions are **this session's** tree.

## State the rule in plans and briefs

Plans, docs, comments, briefs: the token and the rule, first, at the altitude it applies.
Anything past that is over-explain.

## Persona + model

Every dispatch label uses `persona-(model)` style from the **model-routing tree result**,
e.g. `engineer-sonnet:task-slug`, `reviewer-opus:discipline-sync` (sonnet builder);
`reviewer-opus:product-architecture` when implementer was top-tier or blast is high. The `Agent`
`description` field must lead with `persona (model):` so the thread UI names the
dispatch — e.g. `"Researcher (sonnet): competitive scan"` — never a bare or anonymous run.

Status lines name "persona (model) into repo" with the **actual** chosen model.

Model is chosen via `model-routing` (best for job) — **never inherit** the parent chat
model. Set the dispatch `model` field explicitly.

## Dispatch vehicle (Claude)

- Single doer: `Agent` with the right `subagent_type` (engineer, reviewer, …), background
  by default. **Cloud (Claude cloud session/agent) is the assumed vehicle for doer
  lanes** — if the task can be done in cloud, it should be (`routing` rule 9). Requires
  the target repo to already carry committed discipline overlays; overlay refresh is the
  standing precondition to clear first, not a reason to fall back to local by default.
- Multi-phase / parallel doers / adversarial verify: `node <plugin>/hooks/scripts/workflow.mjs <spec.json>`.
- Vehicle is chosen **when the lane opens**, not per task — a resumed lane stays on
  its existing surface; never bounce a domain between local and cloud.
- **Local** dispatch is the machine-bound exception: use it, and name in the brief the
  one-clause machine-bound need that forces it — capture-stack work (`:4411` listener,
  Capture.app helper, figma-daemon), present-for-review, interactive-auth MCPs, or work
  on this machine's own state. A local dispatch on an overlay-less repo is a named
  fallback in the brief, never the default reach.
- An outgrown or mis-surfaced lane gets a deliberate handoff: wrap evidence into a fresh
  brief on the right surface and re-dispatch, not a retroactive verdict on the prior run.

## Mandatory skill invocations

Frontmatter skill bindings on an agent don't guarantee the agent invokes them — the
brief must name the exact skills the receiving agent is required to invoke for the work
type at hand.

| Work type | Required skills |
|---|---|
| Build / fix | `quality` + `test-first` (+ `design-craft` + `markup-standard` if UI is touched) |
| Build against Figma | `capture-figma` (+ build/fix skills above) |
| Review | `qa-acceptance` + `verify-finding` (+ `markup-standard` if UI is touched) |
| Research | `research-synthesis` |
| Capture | `capture-figma` or `capture-website` |
| Motion | `motion` |

## Anti-delegation clause — dispatched doers never re-delegate

Standing law (`routing` `skills/routing/SKILL.md`: "Persona — you are the doer. Implement.
**NEVER call `Agent`.**") already binds named specialists. This clause **extends it
explicitly to general-purpose vehicles** — a plain `Agent` dispatch with full tools and no
named persona is still a doer, not a second orchestrator.

Grounded in two live incidents, 2026-08-26: a general-purpose vehicle spawned a tool-less
persona sub-agent instead of doing the work itself; a second queued sub-agents and stalled
waiting on them rather than executing inline. Both burned the dispatch on delegation instead
of output.

Every full-tool vehicle brief carries this standard language:

> You ARE the doer — execute inline; your final message is the deliverable. No `Agent`
> calls, no spawn-and-wait. If the task looks like it needs a specialist, that's a scoping
> signal for the parent, not a license to sub-dispatch yourself.

## Ports

Doers run verification servers on `:3211` and up. The operator's live dev server on
`:3210` is never started, stopped, or reused by a dispatched agent — state that boundary
in the brief, don't assume the doer infers it.

## Caps and continuity

- Scope the brief so one dispatch can finish a coherent **work batch**; prefer parallel dispatches
  over one unbounded mega-agent. **Work batches** (how you ship) are not **spec width**
  (what counts as done) — caps must not mean a narrower lock. Every batch brief still
  copies the **whole** locked table into ACs; the batch names which rows this run
  implements, not which rows exist.
- **Wide refactors** (rename shared symbol, mechanical blast radius) → brief as
  expand–contract ticket sequence, not one vertical slice. See `test-first` and
  `prompt-craft` slicing. Each batch stays CI-green; contract ticket deletes the old form last.
- **Commit incrementally** is mandatory brief language: the agent commits after each
  coherent slice so a long run strands nothing uncommitted.
- A continuation never reuses the prior round's labels — mint new labels each round.
  Brief the continuation to treat the working tree as an untrusted draft to verify.

## Three-layer briefs (standing law — not reprinted each dispatch)

Standing fleet law lives in always-on rules and skills (`three-layer-briefs`). **Do not
quote every ruling into every dispatch** — that duplicates always-on context and bloats briefs.

**Three layers:** (1) Always-on — persona/rules and the floor for that medium. (2) Skills —
method; **name** required skills; doer loads each **whole**; no cherry-pick. (3) This job —
what, why, refs, this session's **Locked decisions** table, evidence contract, scope fence.

**Every brief carries:**
- Locked decisions table (verbatim operator + technical translation) — this session's spec
- Three standing footnotes: don't break other work; don't leave an experience broken; use named skills **whole**
- Skill **names** per work type — never paste skill bodies or restate skill procedures

**When to quote a ruling verbatim:** only when session-critical AND not already in always-on
— then one ruling + DO/DON'T pair (`vault/fleet/rulings/2026-08-10-do-dont-pairs.md`). The
reviewer brief gets the same session binders (lock + footnotes), not a fleet ruling anthology.

## Evidence contract

Every brief states what the agent must return as proof of done: a commit hash plus a
clean `tsc`/build result for code, measured numbers for perf or content claims, cited
URLs for research, file paths for anything touched. Where a standing ruling governs the
work, the brief also names what compliance with that ruling looks like as evidence. A
surfaced failure beats a false "done" — say so explicitly.

**Engineer briefs:** do not claim "fixed" or operator-facing done — return evidence for
reviewer. Parent dispatches **reviewer** after engineer lands.

**Reviewer briefs:** copy the **same current locked table** as the engineer brief — paired
briefs must match on locked rows. Behaviour claims require `[runtime]` or `[test]` evidence in the
verdict; visual/feel claims require rendered evidence or re-dispatch **ux-designer**.
Diff-only PASS on behaviour or feel claims is **BLOCK**. A review that **notes** a lock miss
and PASSes is **not PASS** — noted without fail is not PASS.

## Scope fence

State the branch and cwd explicitly (per-agent cwd for multi-repo dispatch). State what
is out of bounds — files, repos, or concerns the agent must not touch. For any repo work:
**do NOT push** unless the brief explicitly authorizes releaseops/orchestrator push —
default is the orchestrator reviews and pushes.

## Reviewer-gate sequencing

Any brief that ends in a merge states the order explicitly: the reviewer's written verdict
completes **before** any merge executes. When dispatching reviewer after engineer, the
reviewer brief carries the **same current locked table** — never an earlier narrower table.
After merge, leave the shared tree on `main` and prune worktrees the doer created. Evidence
artifacts get committed in-repo alongside the change.

## Context continuity — standing specialists and primers

**Law lives in `rules/routing.mdc` (always-on):** same-domain follow-ups **must**
`SendMessage` resume of the standing specialist. This skill only says how to brief that resume.
Spawn fresh for a new domain or when a prior transcript is past useful size.

Every repeated workstream gets a vault primer at
`projects/<project-slug>/primers/<workstream>-primer.md`. Name the primer as **FIRST
READ** in the brief. Brief with verified file:line loci, baselines, and key hashes so the
agent starts working, not re-mapping.

## Checklist before dispatch

```
[ ] Grilling frontier empty OR explicit operator skip; cannot invent ACs → grill first
[ ] Locked decisions block present — operator verbatim + technical translation per row
[ ] Brief copies **whole** locked table into ACs — **one AC per locked row** (deferrals explicit); slice brief of whole-surface lock → malformed, do not dispatch
[ ] Work batch named if scoped — batch ≠ narrower lock; caps do not drop locked rows
[ ] Reviewer dispatch: **same current locked table** as engineer — paired briefs match on locked rows
[ ] Question stated neutrally; any named candidate labeled a hypothesis, not an answer
[ ] Label is persona-(model) from the model-routing tree; dispatch description leads with it
[ ] Model set explicitly (never inherited); justification if above haiku/sonnet
[ ] Required skills named per the work-type table above
[ ] Figma-backed build: file+node named; doer loads capture-figma; no pasted prop table
[ ] Three-layer brief: lock table + three footnotes + skill names only — no skill bodies; no quote-every-ruling novel
[ ] Evidence contract stated: what proof comes back, "failure beats false done"
[ ] Same-domain: `SendMessage` to the standing agent (routing law); spawn only for a new domain; primer cited as first read where one exists
[ ] Brief carries verified file:line loci, baselines, and key-file hashes
[ ] Branch/cwd stated; out-of-bounds named; push policy stated
[ ] "commit incrementally" stated explicitly; continuation gets fresh labels
[ ] Vehicle chosen at lane open (not per task): cloud is the assumed vehicle for doer lanes (confirmed overlay-carrying repo), `workflow.mjs` spec for phased/parallel runs; local only with a one-clause machine-bound justification (which need forces it); resumed lanes stay on their existing surface
[ ] Ports stated: doer verification on :3211+, operator's :3210 untouched
[ ] Merge briefs: reviewer verdict before merge; tree on main + worktrees pruned; evidence in-repo
[ ] Full-tool/general-purpose vehicle brief carries the anti-delegation clause: "you ARE the doer" — no Agent calls, no spawn-and-wait
```
