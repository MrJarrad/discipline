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
