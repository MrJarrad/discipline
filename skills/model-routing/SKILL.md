---
name: model-routing
description: Decide which model tier every dispatch runs on — sonnet is the default, opus is rare and must be justified in the brief, top-tier is never dispatched. Load alongside dispatch-brief before authoring ANY Agent call or workflow spec.
---

# Model Routing

Model choice is a dispatch decision, made from this table — never inherited from the
session, never picked by vibe. An unset `model` field silently inherits the
orchestrator's own (top-tier) model: **always set it explicitly.**

## Decision table

| Tier | When | Examples |
|---|---|---|
| **haiku** | Trivial mechanics with an unambiguous spec | renames, file moves, formatting, single-value lookups, running a known script and reporting output |
| **sonnet** | **DEFAULT — everything else** | builds, fixes, audits, tracing, reviews, research, diagnosis, test writing, route-walking, screenshot verification |
| **opus** | RARE. Only with a written one-line justification in the brief | novel architecture with high blast radius; adversarial judging where sonnet **demonstrably failed on this task** (record the failure) |
| **top tier (fable/mythos)** | Never dispatched | orchestration and final synthesis live in the orchestrator itself |

## Escalation rule

Escalate one tier only after the cheaper tier has actually failed on the task at hand
— a wrong or incomplete result you can point to, not a prediction that it might
struggle. Record the failure in the escalated brief ("sonnet run X produced Y, wrong
because Z"). "This is important" is not a justification; importance is handled by the
evidence contract and the reviewer gate, not by model spend.

## Checklist addition (extends dispatch-brief)

```
[ ] model set explicitly on the dispatch (never inherited)
[ ] tier chosen from the table above; sonnet unless the table says otherwise
[ ] if opus: one-line justification in the brief, naming the cheaper-tier failure
```

## Effort & caps

Model tier is one spend lever; effort and turn caps are the other two — set all three on
every dispatch, not just the model.

- **Effort low** for mechanical stages: renames, formatting, running a known script and
  reporting output, single-value lookups — the same shape of work that routes to haiku.
- **Effort medium** is the default for everything else: builds, fixes, audits, tracing,
  reviews, research, diagnosis, test writing.
- **Effort high** only for the hardest verify/judge passes — an adversarial refuter on a
  high-stakes claim, a judge scoring competing designs. Never the default; justify it in
  the brief the same way an opus escalation gets justified.
- **Every spec sets `maxTurns`.** `workflow.mjs` now defaults an unset agent to 60 turns
  (and an unset haiku agent to effort `low`) so a spec that forgets still runs capped, not
  unbounded — but the default is a backstop, not a substitute for choosing a real number
  for the task at hand. A spec that deliberately wants no cap must say so explicitly
  (`"maxTurns": null`), which the runner logs as a burn-warning rather than silently
  honoring.
- **Single-reviewer gates are the default.** One reviewer (or one verify pass) per build is
  sufficient for ordinary work. Reach for a multi-vote adversarial panel (`phase.verify.votes
  > 1`, or multiple independent judge dispatches) only when the task itself says
  "thorough" or "audit" — routine builds don't need three refuters agreeing.

## Checklist addition — effort & caps

```
[ ] effort set per stage (low for mechanical, medium default, high only for justified verify/judge)
[ ] maxTurns set on every spec agent (or the 60-turn default is an accepted, not accidental, choice)
[ ] single reviewer/verify pass unless the task says thorough/audit — then justify the panel size
```

## What today cost, and why

On 2026-07-26 the fleet ran 21 workflows / 42 agents in 6h30m wall time (39 sonnet, 1
haiku, 2 unlabeled), burning an estimated $150–400 for the day
(`~/JHD/vault/artifacts/2026-07-26-fleet-burn-report.md`). None of that spend came from
opus or top-tier — the routing table already held. The waste was structural: **no agent
in any spec that day carried a `maxTurns` cap**, six near-identical "engineer + reviewer"
lanes ran serially instead of in 2–3 parallel lanes (~54 min lost), a duplicated
audit→fix→expand sequence that could have been one workflow cost another ~20 min, and a
session-collision (dispatching before the prior run's session had cleared) burned a
further ~7 min on instant failures. The lesson grounding the defaults above: model tier
was never the leak — uncapped turns per agent and un-parallelized, un-batched dispatch
were. Caps and effort tiering close the first; the routing table and this skill's
panel-size guidance address the second.
