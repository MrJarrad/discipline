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

## Neutral wording never steers

State the question and the constraints. Never a predicted answer. If you name a
candidate — a tool, a library, an approach — label it explicitly as **a hypothesis to
refute, on equal footing with unnamed alternatives**, not a preferred answer wearing a
disguise. "Investigate whether X is the cause (one hypothesis among several — the fix
may lie elsewhere)" is neutral. "Fix the bug in X" when X is unconfirmed is a steer. If
you catch a steer after dispatch, send the correction immediately — don't wait for the
agent to finish.

## Mechanism named

A brief states how each locked value is produced, not only what it measures. Must be named whenever present: a grid — `display: grid` container and children placed
by `grid-column`, never col-span arithmetic; frame dimensions — the sizing token, never a
literal; a repeated part — the component instance, never inline markup; blend — which node
carries `mix-blend-mode` and whether it is absolute or fixed. "On the grid" without the container
is a steer to arithmetic (portfolio nav, 2026-09-10).

- **DO:** "Nav sits on the page grid: the `<header>` is the `display: grid` container, links placed by `grid-column`"
- **DON'T:** "Nav on the grid"

## Relationship to sibling skills

- **Dispatch-brief authoring** — task *structure*: which fields, vertical slicing, routing. This skill writes the *description* those fields carry. Use both: structure decides the task exists and how it's wired; prompt-craft makes its words land.
- **`quality`** — the bar every prompt (and its output) is held to: best-in-class, with evidence, or the gap named.
- **`discover-scope` / `research-synthesis`** — when the strategy brief's answer needs real discovery, those carry the method.

Full do/don't table and the research sourcing: [references/DOS-AND-DONTS.md](references/DOS-AND-DONTS.md), [references/RESEARCH.md](references/RESEARCH.md).

## The two altitudes

- **EXECUTION work order** — the outcome is known; the brief fixes it and leaves the doer the how. Specificity high on the *what*, low on the *route*.
- **STRATEGY brief** — the outcome is the question; the brief fixes the givens and invites the unknown, asking for sourced options and a recommendation.

Shared foundations, both templates in full, the brief-to-skills guidance, the
good-vs-bad test and the vertical-slicing rule (tracer bullets, never horizontal layers):
[ALTITUDES.md](references/ALTITUDES.md).

Read [DOS-AND-DONTS.md](references/DOS-AND-DONTS.md) when applying this skill;
[TEMPLATES.md](references/TEMPLATES.md) holds the copyable shapes and
[RESEARCH.md](references/RESEARCH.md) the evidence behind the rules.
