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

**Part-name fidelity.** When the operator's own words name a physical/visual part or
element, the operator column carries the **name of the actual thing as defined wherever
it's defined** — a layer/component name in a design file, a class or token in code, a
style, a file — exactly as the operator said it; the technical column may append a code
identifier, which itself should mirror that source name — never a synonym, in either
direction. Ring, rim, lip, and edge can be different named things, and swapping one for
another is how a lane and a review get spent on the wrong part (hoverboard 2026-09-08:
"the part that just peeks out of the thruster" named the thing `disc`'s edge; the brief
renamed it to the ring). A brief that renames a part instead of quoting its defined name
is malformed. Resolve unclear part names against the project glossary (`define-terms`)
before the row goes into a brief.

- **DO:** "Row 4: `disc` edge (the thing is named `disc`; operator: 'the part that peeks
  out of the thruster')"
- **DON'T:** "Row 4: ring rim smoothing"
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

**Name the lock's live path, not just the snapshot.** The copied table is a courtesy
snapshot; the brief also names the **live lock file** (vault path) and requires the
reviewer to re-read it and confirm the match **before recording any finding**. The spec
may have moved since dispatch — a mismatch is a red finding, "spec drifted", never a
clear verdict with a note attached.

Standing fleet rulings are quoted separately (below). Locked decisions are **this session's** tree.

**Deterministic gates precede review.** Build, typecheck, and the suite (CI where the
repo has it) must be **green before a reviewer is solicited** — a reviewer handed a red
build returns immediately without reviewing. The engineer brief states the gates; the
reviewer brief cites them as met. Model judgement is for the residual those gates cannot
express, never a substitute for running them.

**Review tier — `LIGHT` is the standing default; `FULL` is the exception the brief must
argue** (operator, 2026-09-07: *"way too much agent reviewing going on generally"*).
`LIGHT` verifies the named ACs with runtime evidence and skips exhaustive sweeps and
mutation batteries. `FULL` is for cross-repo, destructive, or first-pass high-blast
surfaces, and the brief names **why** — an unargued `FULL` is over-review. Unnamed tier
defaults to `LIGHT`; the tier is the parent's call at dispatch, never the reviewer's.
**One review per change**, and small fixes (single file, no behaviour claim, gates green)
get **no reviewer** at all — engineer verification plus parent check.

**The reviewer samples the routine and re-derives the claim classes.** Engineer commits
evidence; the brief requires the reviewer to independently re-derive **2–3 unannounced
probes of its own choosing** plus anything suspicious, and audit the rest. Random
adversarial sampling is what keeps independence — it is not a licence to accept the
engineer's word wholesale. **Enumeration, precedent, and determinism claims are exempt
from sampling**: the brief requires them grep- or rerun-verified in full
(`reviewer-reruns-evidence-tables`). Every finding is **independently re-validated**
before it surfaces, and the brief says so.

**Review rounds are capped at 3 per change.** A round is one reviewer verdict. At the cap
without a clean result the loop halts and the parent presents the open findings to the
operator — the brief never promises a fourth round or a re-brief.

## State the rule in plans and briefs

Plans, docs, comments, briefs: the token and the rule, first, at the altitude it applies.
Anything past that is over-explain.

## Persona + model

Every dispatch label uses `persona-(model)` style from the **model-routing tree result**,
e.g. `engineer-sonnet:task-slug`, `reviewer-opus:discipline-sync` (sonnet builder);
`reviewer-opus:product-architecture` when implementer was top-tier or blast is high.

**Surface-first description (hard item, `routing` rule 9).** The `Agent` `description`
field must lead with the chosen surface, then `persona (model):`, so the thread UI names
both on every dispatch — `cloud — persona (model): task` or `local — persona (model):
task`, e.g. `"cloud — Researcher (sonnet): competitive scan"`, `"local — Engineer
(sonnet): capture-stack fix"`. Never a bare or anonymous run, and never `persona (model):`
without the surface prefix. A **local** dispatch's brief must carry the one-clause
machine-bound justification (`dispatch-brief` "Vehicle" section) — the surface prefix
makes that choice visible in the thread UI; the justification clause is what makes it
legitimate. Cloud dispatches carry no justification clause — cloud is the default.

Status lines name "persona (model) into repo" with the **actual** chosen model.

Model is chosen via `model-routing` (best for job) — **never inherit** the parent chat
model. Set the dispatch `model` field explicitly.

**Effort tier — every brief names one:** `routine | contested | high-stakes`. It states
how much deliberation the job is worth, so model and thinking budget follow the work
rather than the parent's habit. `routine` is known-shape work with a clear answer;
`contested` is work where reasonable approaches disagree or a claim will be argued;
`high-stakes` is irreversible, cross-repo, or fleet-wide blast radius. `model-routing`
maps each tier to a model and a thinking budget — this skill only requires the field.

## Dispatch vehicle (Claude)

- Single doer: `Agent` with the right `subagent_type` (engineer, reviewer, …), background
  by default. **Cloud (Claude cloud session/agent) is the assumed vehicle for doer
  lanes** — if the task can be done in cloud, it should be (`routing` rule 9). Requires
  the target repo to already carry committed discipline overlays; overlay refresh is the
  standing precondition to clear first, not a reason to fall back to local by default.
- Multi-phase / parallel doers / adversarial verify: `node <plugin>/hooks/scripts/workflow.mjs <spec.json>`.
- Vehicle is chosen **when the lane opens**, not per task — a resumed lane stays on
  its existing surface; never bounce a domain between local and cloud.
- **Local** dispatch is the exception, and the brief names the one clause that forces it.
  Only three clauses are legitimate (`routing` rule 9): (a) **verifying the deployed
  surface** or present-for-review — cloud egress 403s `*.workers.dev`; (b) machine-bound
  stacks — `:4411` capture listener, Capture.app helper, figma-daemon, interactive-auth
  MCPs; (c) this machine's own state. A doer slice verifying its **own build** on
  `:3211`+ is **not** machine-bound — that goes cloud; nor is "faster", "interactive", or
  "read-only". A local dispatch on an overlay-less repo is a named fallback in the brief,
  never the default reach.
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

## Slice classification: adjust vs clean-rebuild

Before authoring a brief against a design-backed defect set, classify it as an adjust
slice or a clean-rebuild slice — `issue-triage`'s "Designed means build" section owns this
call; this skill briefs whichever slice that classification produces.

**Prototype-first when the mechanism is unproven.** If the slice rests on physics or
behaviour nobody has run yet (compositing, a novel interaction, an unverified data
shape), brief a throwaway `prototype` lane **before** the build lane — minutes of running
code settle what build rounds otherwise grope at. Proven mechanism → straight to build.

**CI carries the suite.** On repos with GitHub Actions running typecheck + suite on
push/PR, the brief points evidence at the green check for those two rather than making
every engineer and reviewer round re-run the full suite locally; per-round evidence stays
on what CI does not cover (runtime behaviour, captures, ACs).

## Anti-delegation clause — dispatched doers never re-delegate

Standing law (`routing` `skills/routing/SKILL.md`: "Persona — you are the doer. Implement.
**NEVER call `Agent`.**") already binds named specialists. This clause **extends it
explicitly to general-purpose vehicles** — a plain `Agent` dispatch with full tools and no
named persona is still a doer, not a second orchestrator.

Observed live 2026-08-26: a general-purpose vehicle spawned a tool-less
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

## Notes ledger — survive compaction

A long dispatch that compacts loses the facts it earned. **Before any compaction, append
the key facts and decisions to a scratch ledger file, then re-read the ledger after the
compaction** — a searchable ledger beats one lossy summary. The brief names the ledger
path (scratch, never the repo) and states the rule for the doer: verified `path:line`
loci, resolved ambiguities, rejected approaches and why, and the current state of each
AC go in the ledger as they are settled — not reconstructed afterwards from a summary
that already dropped them.

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

**Briefs name skills; they never restate them.** Name the skill and the doer loads it
whole via the Skill tool. Pasting a skill's procedure into a brief duplicates always-on
context, drifts silently when the skill changes, and reads as a licence to cherry-pick
the pasted part. Naming is the instruction.

**When to quote a ruling verbatim:** only when session-critical AND not already in always-on
— then one ruling + DO/DON'T pair (`vault/fleet/rulings/2026-08-10-do-dont-pairs.md`). A brief
may not paste vault rulings **beyond one DO/DON'T pair**: name the ruling's path and let the
doer read it. The reviewer brief gets the same session binders (lock + footnotes), not a
fleet ruling anthology.

**Target brief length: under 600 words**, excluding the locked-decisions table and pasted
acceptance criteria. A longer brief is almost always restated skill procedure or a ruling
anthology — cut those first, never the lock rows or the evidence contract.

## Fixed evidence return

**Every persona returns the same five things, in this order.** Defined once here; agent
files reference this section rather than restating it, and briefs cite it rather than
inventing a shape per dispatch.

| # | Field | What it is |
|---|---|---|
| 1 | **Final sha** | the commit the evidence certifies |
| 2 | **Per-criterion table** | one row per AC / locked row: criterion, pass/fail, `file:line` |
| 3 | **Gate output verbatim** | build, typecheck, suite lines as they printed — never paraphrased |
| 4 | **Open gaps** | what is unmet, unverified, or operator-deferred; "none" when none |
| 5 | **Next owner** | `next: reviewer` \| `next: engineer` \| `next: operator` \| `next: parent` |

**No prose recap, no narrative** — the table and the gate output are the report. Budget:
**≤ 250 words**, excluding the per-criterion table and the verbatim gate output. Over
budget is a signal the run was under-scoped, not a licence to narrate.

Non-code lanes map the same five: the reviewer's per-criterion rows are its
severity-ranked findings with their re-validation; the researcher's `file:line` is the
cited URL; ux-designer's is the viewport-evidence path. A surfaced failure beats a false
"done" — a fail row with evidence is a complete return, and the brief says so.

## Evidence contract

Beyond the fixed shape above, every brief names what counts as proof for *this* job:
measured numbers for perf or content claims, cited URLs for research, the captured
artifact for design work. Where a standing ruling governs the work, the brief also names
what compliance with that ruling looks like as evidence.

**Engineer briefs:** do not claim "fixed" or operator-facing done — return evidence for
review. Parent solicits **reviewer** after engineer lands and the gates are green.

**Reviewer briefs:** copy the **same current locked table** as the engineer brief (plus its
live path) — paired briefs must match on locked rows. The reviewer returns
**severity-ranked findings** (red / amber / note), each independently re-validated — not a
bare merge verdict. **Merge condition: deterministic gates green + no red finding open**,
remitted by the parent. Behaviour claims require `[runtime]` or `[test]` evidence in the
finding; a diff-only behaviour claim is red. Look and feel are the operator's lane —
rendered agent evidence for a Figma/reference match goes to **ux-designer**, and a review
that **notes** a lock miss without failing it is not a clear review.

## Scope fence

State the branch and cwd explicitly (per-agent cwd for multi-repo dispatch). State what
is out of bounds — files, repos, or concerns the agent must not touch. For any repo work:
**do NOT push** unless the brief explicitly authorizes releaseops/orchestrator push —
default is the orchestrator reviews and pushes. A dispatched agent never edits settings,
permissions, hooks, or plugin config (`~/.claude/**`, `.claude/settings*.json`) — a blocked
or denied command is a finding to return to the parent, never a workaround.

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
[ ] Description leads with surface — `cloud — persona (model): task` or `local —
    persona (model): task`; a local dispatch's brief carries one of the three legitimate
    clauses (`routing` rule 9): verifying the **deployed surface**/present-for-review,
    a machine-bound stack, or this machine's own state — a slice verifying its own
    `:3211`+ build is **not** machine-bound and goes cloud
[ ] Reviewer brief names its **review tier** — `LIGHT` by default, `FULL` only with the
    justification argued — and requires 2–3 unannounced re-derived probes plus audit of
    the rest, enumeration/precedent/determinism claims verified in full, and every
    finding independently re-validated; round cap of 3 stated
[ ] Deterministic gates (build, typecheck, suite/CI) green before a reviewer is solicited
[ ] Reviewer brief names the lock's **live path**, not only the copied snapshot
[ ] Effort tier named — `routine | contested | high-stakes` — and mapped via model-routing
[ ] Notes-ledger path named for long dispatches: append before compaction, re-read after
[ ] Model set explicitly (never inherited); justification if above haiku/sonnet
[ ] Required skills named per the work-type table above
[ ] Figma-backed build: file+node named; doer loads capture-figma; no pasted prop table
[ ] Three-layer brief: lock table + three footnotes + skill names only — no skill bodies; no quote-every-ruling novel
[ ] Evidence return is the **Fixed evidence return** shape (sha, per-criterion table with
    file:line, gate output verbatim, open gaps, next owner) — referenced, not re-specified;
    ≤ 250 words excluding table and gate output
[ ] Job-specific proof named on top of the fixed shape: "failure beats false done"
[ ] Skills **named**, never restated; no vault ruling pasted beyond one DO/DON'T pair
[ ] Brief length under the 600-word target (locked table and ACs excluded)
[ ] Same-domain: `SendMessage` to the standing agent (routing law); spawn only for a new domain; primer cited as first read where one exists
[ ] Brief carries verified file:line loci, baselines, and key-file hashes
[ ] Branch/cwd stated; out-of-bounds named; push policy stated
[ ] "commit incrementally" stated explicitly; continuation gets fresh labels
[ ] Vehicle chosen at lane open (not per task): cloud is the assumed vehicle for doer lanes (confirmed overlay-carrying repo), `workflow.mjs` spec for phased/parallel runs; local only on one of the three scoped clauses; resumed lanes stay on their existing surface
[ ] Unproven mechanism: prototype lane briefed before the build lane
[ ] Ports stated: doer verification on :3211+, operator's :3210 untouched
[ ] Merge briefs: merge condition stated (deterministic gates green + no red finding open); tree on main + worktrees pruned; evidence in-repo
[ ] Full-tool/general-purpose vehicle brief carries the anti-delegation clause: "you ARE the doer" — no Agent calls, no spawn-and-wait
```
