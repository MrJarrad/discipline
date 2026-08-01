---
name: prompt-craft
description: How to write the words of a task prompt or brief — choosing EXECUTION vs STRATEGY altitude, then tuning specificity — so the doer ships best-in-class output. Use when writing or reviewing a task description, brief, or handoff prompt for another agent. Not for task structure, fields, or routing — that's dispatch-brief authoring.
---

# Prompt Craft

The prompt is a real lever, not packaging. In our own model bake-off, fixing one task's prompt changed what **every** model produced — a better brief beat a bigger model. This skill is the craft of writing that brief so the doer ships best-in-class output. It is the sibling of dispatch-brief authoring (which sets task *structure* — fields, slicing, routing); this skill sets the *words inside the description*.

## The one rule: choose the altitude first, then tune specificity

Two altitudes, opposite failure modes. Decide which you're writing before you write a line.

| | **EXECUTION task prompt** (work order) | **STRATEGY / design brief** (open question) |
|---|---|---|
| Goal | Determinism + verifiability — ship without back-and-forth | Exploration quality — surface options, don't pre-decide |
| Specificity | **Narrow.** Maximal on interfaces/constraints/acceptance/scope; minimal on *implementation* | **Wide.** Explicit on the decision + constraints + eval criteria; deliberately non-prescriptive on the *solution* |
| Worst failure | Under-specified → agent guesses, drifts, "generic" output (empirically the dominant, costly failure mode) | Over-specified → agent parrots your plan, offers no alternatives, misses the real question |
| Use when | The *what* is decided; you need the *how* built | The *what* is the question; you need options + a recommendation |

This is the operator's standing lesson: **narrow for execution, wide for strategy/design.** Slicing a strategy question thin answers a sub-slice and misses the real question. (See the `pose-the-big-question` principle.)

## Shared foundations (both altitudes)

Grounded in Anthropic's prompt-engineering guidance (see [references/RESEARCH.md](references/RESEARCH.md) for full sourcing):

1. **Colleague test — the golden rule.** Would a minimally-briefed teammate execute this without asking a question? If they'd be confused, the model will be too. First line = a one-sentence *job to be done*.
2. **Give context *and motivation*, then stop.** 1–3 sentences of "why this matters" targets the output. Don't bury actionable lines inside a stakeholder narrative — the agent can't reliably tell inspirational from actionable.
3. **Examples lock format and decisions.** 3–5 relevant, *diverse* examples beat prose — include one happy path, one edge case, and one counter-example ("bad output looks like…"). Near-duplicate examples cause overfitting.
4. **Separate the sections.** Keep instructions, context, inputs, and criteria in distinct blocks (headings or XML tags) so data isn't read as a constraint and vice-versa.
5. **Assign a role** = expertise + priorities + boundaries (not just "you are an expert").
6. **State success criteria and ask it to self-check** against them before finishing. "Think hard" with no verification buys verbosity, not correctness.

## Altitude 1 — the EXECUTION work order

Make the doer's behavior unambiguous, verifiable, scoped, and hard to creatively misinterpret. Required components:

- **Deliverable + output format** — the exact artifact ("a single PR + patch list", "JSON matching schema X"). Not "write up your findings."
- **Acceptance criteria as pass/fail checks** — observable and, where possible, command-level: `npm test` green, typecheck clean, edge cases A/B/C covered. Not "make sure it works." *Tell:* if you can't write the ACs without inventing new requirements, the task isn't ready.
- **Scope boundaries — Always / Ask-first / Never** — allowed actions, approval gates (schema/API/dep changes), and forbidden actions (force-push, delete, add deps). Agents over-act without this.
- **Operational facts it can't guess** — stack, versions, paths, and **house conventions** (point at the repo's own patterns; match the surrounding code). Vague references force guessing.
- **Phase it when steps depend on each other** — foundation → core → interface → polish; agents execute sequentially and fail if a dependency isn't laid first.
- **Keep it atomic** — one agent session's worth. "Build the whole dashboard" is over-scoped; slice it (see the Slicing section below).

Full skeleton + a worked before/after in [references/TEMPLATES.md](references/TEMPLATES.md).

## Altitude 2 — the wide STRATEGY brief

Invite high-quality exploration without pre-deciding the answer. The shape the operator called "an excellent research prompt":

1. **State the givens as fixed context** — the settled facts, framed as "don't re-litigate this."
2. **Pose the whole question openly** — the *decision*, not the solution. Ask both halves if it has two. "What should we do about X?" not "Implement A, then evaluate it."
3. **Explicitly invite the unknown** — "tell us what we're missing." Give the doer room to surface what you didn't think to ask.
4. **Name exemplars to draw on, without pre-deciding** — point at strong references (Anthropic, competitors, prior art) as inspiration, not as the answer.
5. **Define success at the *outcome* level** — "minimize operational complexity", "time-to-MVP < 2 weeks" — so the agent doesn't invent its own priorities, but don't hand it the implementation.
6. **Require a structured return** — 3–5 options, tradeoffs against the criteria, key unknowns + how to validate them, a recommendation *and* a fallback.

Do **not** paste execution-style acceptance tests into a strategy brief — they force shallow compliance instead of exploration.

## Brief to skills, not around them

The doer's skills are part of the brief's context — a skilled doer already carries the
*method*. The brief's job is to supply what the skills cannot know: the question, the
constraints, the context pointers, the success criteria.

- **Never restate a skill's procedure in the brief.** If the researcher has
  `research-synthesis`, the brief does not say "decompose the question, run multiple
  searches, cross-verify claims" — that's the skill talking, duplicated at extra token
  cost. Restated method also *steers*: the doer follows your paraphrase instead of the
  skill's fuller procedure (the same failure as a description that summarizes its
  skill's workflow).
- **Method restated in a brief is a smell with two causes.** Either the doer lacks the
  skill (fix: assign the skill, not fatten the brief) or the skill's trigger is too weak
  to fire (fix: sharpen the description, not the brief). In both cases the durable fix
  is in the skill system; the fat brief is a workaround that must be paid again on every
  future task.
- **Name a skill only to disambiguate, never to instruct.** "This is a
  research-synthesis-shaped question" is fine when two skills could plausibly fire;
  walking through the skill's steps is not.
- **Per-role default altitudes.** Researcher and designer briefs default to Altitude 2
  (the open question + evidence/eval criteria — their skills carry the how). Engineer
  work orders default to Altitude 1 — but even there, specify interfaces/constraints/
  acceptance, not the method their discipline skills (test-first, diagnosing-bugs)
  already govern.

## How to tell a good prompt from a bad one

- **Good execution prompt:** a teammate could run it without questions; "done" is a pass/fail check; two competent implementers would converge on the same output.
- **Bad execution prompt:** you can't write ACs without inventing requirements; "done" is a guess; two implementers would diverge. Vibe words ("clean", "modern", "robust", "make it great") with no operational meaning.
- **Good strategy brief:** poses the decision, states givens, invites the unknown, asks for options.
- **Bad strategy brief:** pre-decides the answer then asks the agent to "evaluate" it; slices the big question into a narrow sub-query.

## Relationship to sibling skills

- **Dispatch-brief authoring** — task *structure*: which fields, vertical slicing, routing. This skill writes the *description* those fields carry. Use both: structure decides the task exists and how it's wired; prompt-craft makes its words land.
- **`quality`** — the bar every prompt (and its output) is held to: best-in-class, with evidence, or the gap named.
- **`discover-scope` / `research-synthesis`** — when the strategy brief's answer needs real discovery, those carry the method.

Full do/don't table and the research sourcing: [references/DOS-AND-DONTS.md](references/DOS-AND-DONTS.md), [references/RESEARCH.md](references/RESEARCH.md).

## Slicing the work: vertical, not horizontal (absorbed from paperclip-task-setup)

Before writing the brief, decide how many dispatches the plan becomes and what each covers.

**Vertical slice** — a dispatch that delivers a thin but complete end-to-end increment of user-observable value: a tracer bullet through every layer the feature touches, demoable or verifiable on its own the moment it's done.

**Horizontal slice** — one layer across the whole feature ("all the schema," then "all the UI"). Avoid: it produces no shippable increment (nothing a reviewer can exercise) and parallel horizontal slices collide on shared surfaces.

How to slice: (1) find the user-observable capabilities, not the technical layers; (2) draft each slice as a tracer bullet touching only what makes that one capability real and checkable; (3) sequence, don't parallelize collisions — foundation/prefactor slices go first and blockers are named explicitly (a prefactor slice may ship no user-facing behavior, but must say so rather than disguising a horizontal layer as "foundation"); (4) every slice gets the full brief (acceptance criteria, evidence contract, scope fence); (5) don't over-split — an already-atomic demoable change needs no further slicing.

Same doctrine as `test-first`, two altitudes: test-first slices a single implementation session; this slices a plan into dispatches.
