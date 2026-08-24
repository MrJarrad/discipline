---
name: shape-stress
description: "Shape work into six sections — Context, Exploration & References, Outcomes, Acceptance Criteria, Constraints & Known Risks, Out of Scope — then stress it until the checklist is green. Trigger on \"is there anything else that needs to go into the plan\", \"anything else technical or best in class we should have\", \"is the plan ready\", turning conversation context into a project shape, or stress-testing/grilling any existing plan or proposal (interview mode via grilling: frontier rounds, experience questions, recommended answers). Not raw discovery — that's discover-scope."
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
checklist that says a draft is done — and the **interview hook** — each stress cycle
runs [`grilling`](../grilling/SKILL.md) to walk the design tree until the frontier is
empty.

It also doesn't restate `quality` — the best-in-class bar this skill's output
feeds into at the Shape phase of the craft loop. `shape-stress` is what "shaped"
means; `quality` is what "good enough to build from" means for every phase,
Shape included.

Concretely: `grilling` decides *how* to ask (frontier rounds, experience altitude,
recommended answers). The six-section workflow decides *what* the draft needs to
contain and *when* to stop. Interview mode works standalone too — someone who arrives
with an existing plan and no six-section shape ("grill this proposal") can run
`grilling` directly, without the shaping workflow around it.

## Stress an existing plan (interview mode)

This mode **loads and runs `grilling`** — do not reimplement the interview here.

When someone arrives with an existing plan, design, or proposal and no six-section
shape in hand ("grill this proposal", "stress-test the plan"), or when the stress
loop below needs another interview cycle, invoke `grilling`. Patch the six-section
draft from each round's answers when this mode runs inside the stress loop.

**Not for:** bugfixes, "just implement this," or any request that already has a
clear, narrow path — that's normal work, not a plan to stress.

If "grill this" arrives with no plan attached, `grilling` asks what to stress-test
first — one experience question, not a design-tree walk until the subject exists.

Stop when `grilling`'s frontier is empty and shared understanding is confirmed — or,
when running inside the stress loop below, when that loop's finished checklist is
green. Remaining micro-decisions can wait for implementation.

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
3. **Run one `grilling` cycle** on the biggest open gap or contradiction — frontier
   round at experience altitude. Wait for answers.
4. **Patch the draft** from the answers — tag new facts Confirmed vs Assumption.
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
  six-section loop stresses an *existing* shape; it doesn't restart discovery from
  zero. That's `discover-scope`.
- **Acceptance Criteria that smuggle in implementation seams** — file paths, module
  names, or slice-template sections belong one layer down, never in project-level ACs.
- **Reimplementing grilling here** — load `grilling`; don't invent a parallel interview.
- **Silently overwriting a Confirmed fact** when new context contradicts it —
  surface the contradiction instead.
- **Treating "Out of Scope" as filler** — vague exclusions don't prevent scope creep.
- **Running the full interview on a bugfix or clear implementation request** —
  normal work, not a plan to grill.
- **Asking the user something the codebase already answers** — `grilling` handles this.
- **Starting to build or edit code during the interview** — stress the plan, not implement.
