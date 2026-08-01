---
name: shape-stress
description: "Shape work into six sections — Context, Exploration & References, Outcomes, Acceptance Criteria, Constraints & Known Risks, Out of Scope — then stress it until the checklist is green. Trigger on \"is there anything else that needs to go into the plan\", \"anything else technical or best in class we should have\", \"is the plan ready\", turning conversation context into a project shape, or stress-testing/grilling any existing plan or proposal (the absorbed stress-plan mode: one question per turn, each with a recommended answer). Not raw discovery — that's discover-scope."
---

# Shape Stress

Turns conversation context into a **shaped project** — the container for value and
boundaries — and defines when that shape is actually finished. Shape answers *what
problem, what done, what not* — not *how we build it*. It runs before build, feeding
`quality`'s Shape phase with a draft that's already been stressed rather than
rubber-stamped.

Read [references/DOS-AND-DONTS.md](references/DOS-AND-DONTS.md) when applying this
skill — it holds the quick-reference tables, branch-specific guidance, and worked
examples.

## Where this sits

`shape-stress` owns two things: the **shaping structure and finish-bar** — the
sections a shape needs, the synthesis rules that keep them aligned, and the
checklist that says a draft is done — and the **interview mechanic** — one question
per turn, each with a recommended answer, walking the design tree branch by branch.
The interview mechanic is documented once, as its own mode (see "Stress an existing
plan (interview mode)" below), and every stress cycle in the six-section loop *runs*
that mode as its question-asking mechanism.

It also doesn't restate `quality` — the best-in-class bar this skill's output
feeds into at the Shape phase of the craft loop. `shape-stress` is what "shaped"
means; `quality` is what "good enough to build from" means for every phase,
Shape included.

Concretely: the interview mode decides *how* to ask the next question (one branch,
one recommendation, wait for the answer). The six-section workflow decides *what*
the draft needs to contain before that question count can hit zero, and *when* to
stop asking. The interview mode works standalone too — someone who arrives with an
existing plan or proposal and no six-section shape in hand ("grill this proposal",
"stress-test the plan") can run it directly, without the shaping workflow around it.

## Stress an existing plan (interview mode)

Sits under `quality` (the bar for verification, evidence, and honesty) — this mode
doesn't restate that bar, it adds the one discipline plan review needs on top of it:
**grill one branch at a time, never a batch.**

This mode is standalone: it fires on its own when someone arrives with an existing
plan, design, or proposal and no six-section shape in hand ("grill this proposal",
"stress-test the plan"), and it's also what each cycle of the stress loop below runs
as its question-asking mechanism.

**Not for:** bugfixes, "just implement this," or any request that already has a
clear, narrow path — that's normal work, not a plan to stress.

### The interview

Interview the plan relentlessly until you and the user reach shared
understanding. Walk down each branch of the design tree, resolving dependencies
between decisions one at a time. For every question, give your recommended
answer — never a bare question.

Ask exactly one question per turn, and wait for the answer before asking the
next. Multiple questions at once let the user cherry-pick the easy ones while
the hard dependency stays unresolved.

If a question is answerable by reading the codebase or linked docs, do that
instead of asking — don't make the user restate what the code already shows.

If "grill this" arrives with no plan attached, ask what to stress-test first —
that's still one question, not a design-tree walk.

Stop when the major branches are resolved (shared understanding), or — when
this mode is running inside the six-section stress loop below — when that
loop's finished checklist says the plan is finished. Remaining micro-decisions
can wait for implementation.

## The six sections

A shaped project has exactly these sections. Nothing here is a PRD/implementation
section (Feasibility, Testing, Analytics, file paths) — those belong one layer
down, in whatever this org calls its implementation-slice artifact.

| Section | Must include | Avoid |
| ------- | ------------ | ----- |
| **Context** | Problem + current state + why now; tag Assumptions | Solution design, tech stack picks |
| **Exploration & References** | Full links/artefacts, grouped by theme | Implementation paths in prose |
| **Outcomes** | ≥3 bullets under "When this is complete:" — value, not tasks | Implementation steps |
| **Acceptance Criteria** | ≥3 testable, project-level conditions | File paths; slice-level detail |
| **Constraints & Known Risks** | ≥2 real limits, dependencies, or failure modes | Generic filler |
| **Out of Scope** | ≥2 explicit exclusions | Vague "future work maybe" |

## Synthesis rules

- Pull from conversation context (plus any optional scoping doc if one exists) —
  tag **Assumption** vs **Confirmed** wherever a fact isn't directly stated.
- **Outcomes ↔ Acceptance Criteria must align.** Outcomes state value; ACs state
  verifiable bars. Every Outcome should trace to at least one AC.
- **Out of Scope must not contradict Outcomes or ACs.** If it does, that's a
  contradiction — surface it in the stress loop, don't quietly pick a side.
- **Project-level only.** No implementation seams, no file paths, no
  slice-template sections. Those belong in whatever turns this shape into
  buildable work next.
- Thin context is fine — fill every section anyway, tag the unknowns as
  Assumption, and let the stress loop chase them down. Don't block on missing
  input.

## The stress loop

Shaping isn't done at v0. Run this loop until the finished checklist is green:

1. **Draft v0** — fill all six sections from context (placeholders OK if marked
   Assumption).
2. **Review the checklist** below against the current draft.
3. **Run one interview-mode cycle** (see "Stress an existing plan (interview
   mode)" above) — one question, one recommended answer, on the biggest open
   gap or contradiction. Wait for the answer.
4. **Patch the draft** from the answer — tag new facts Confirmed vs Assumption.
5. **On contradiction** — surface immediately: *"Earlier this said X, now Y — which
   wins?"* Never silently overwrite a Confirmed fact with a new claim.
6. **Re-run the checklist.** If items are still open, go again — this is a loop,
   not a single pass.
7. **Stop** when the checklist is green *and* the user has confirmed the shape (or
   explicitly says proceed / ship / looks good).

## Finished checklist

All must pass before the shape is treated as done:

| # | Check |
| - | ----- |
| 1 | **Context** — problem + why stated; assumptions tagged |
| 2 | **Exploration & References** — every known artefact listed, or an explicit placeholder |
| 3 | **Outcomes** — ≥3 "when complete" bullets tied to value |
| 4 | **Acceptance Criteria** — ≥3 testable, project-level conditions |
| 5 | **Constraints & Known Risks** — ≥2 real limits or risks |
| 6 | **Out of Scope** — ≥2 explicit exclusions |
| 7 | **No contradictions** — ACs, Out of Scope, and Outcomes all align |
| 8 | **User sign-off** — confirmed this round, or an explicit proceed |

Thin context is not a reason to stop early — it's a reason to tag more
Assumptions and keep stressing. Don't wait on an external scoping document that
doesn't exist; work from what's in front of you.

## Anti-patterns

- **Publishing before the stress loop converges** — treating v0 as done because it
  "looks complete" rather than running it through the checklist.
- **Blank-slate requirements interview instead of stressing a draft** — the
  six-section loop stresses an *existing* shape one gap at a time; it doesn't
  restart discovery from zero. That's a different job.
- **Acceptance Criteria that smuggle in implementation seams** — file paths, module
  names, or slice-template sections (Feasibility, Testing, Analytics) belong one
  layer down, never in a project-level AC.
- **Multiple stress questions in one turn** — breaks the interview-mode mechanism
  this loop depends on.
- **Silently overwriting a Confirmed fact** when new context contradicts it —
  surface the contradiction instead.
- **Treating "Out of Scope" as filler** — vague exclusions ("other stuff later")
  don't prevent scope creep; they just look like they do.
- **Running the full interview on a bugfix or clear implementation request** —
  out of scope for interview mode too; that's normal work, not a plan to grill.
- **Assuming a detailed plan exists when the user gave none** — clarify what to
  stress-test before opening a design-tree walk.
- **Asking the user something the codebase already answers** — wastes their
  time and skips legwork the interview mode should do itself.
- **Starting to build or edit code during the interview** — the job is
  stress-testing the plan, not implementing it.
