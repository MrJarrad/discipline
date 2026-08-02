---
name: model-routing
description: Decide model tier, effort, and turn caps for every dispatch — sonnet default, opus rare and justified, top-tier never dispatched; every spec sets maxTurns. Trigger before ANY Agent call or workflow spec, chain-loaded by routing as load-order step 2. Not WHO handles the work — that's routing; not brief structure — that's dispatch-brief.
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

On 2026-07-26 one run dispatched 21 workflows / 42 agents in 6h30m wall time (39 sonnet, 1
haiku, 2 unlabeled), burning an estimated $150–400 for the day. (The dedicated burn-report
artifact did not survive the vault's 2026-07-31 legacy purge; under the current schema
this evidence would live at `projects/discipline/artifacts/`.) None of that spend came from
opus or top-tier — the routing table already held. The waste was structural: **no agent
in any spec that day carried a `maxTurns` cap**, six near-identical "engineer + reviewer"
lanes ran serially instead of in 2–3 parallel lanes (~54 min lost), a duplicated
audit→fix→expand sequence that could have been one workflow cost another ~20 min, and a
session-collision (dispatching before the prior run's session had cleared) burned a
further ~7 min on instant failures. The lesson grounding the defaults above: model tier
was never the leak — uncapped turns per agent and un-parallelized, un-batched dispatch
were. Caps and effort tiering close the first; the routing table and this skill's
panel-size guidance address the second.

## Per-task token budgets (absorbed from model-efficiency)

A budget is a **soft ceiling → checkpoint**, not a hard kill. When a run crosses it, stop and
reassess: right model? right approach? or genuinely a bigger task than its class? Numbers are
output-token-first with a dollar gloss, grounded in measured eval runs.

| Task class | Typical (measured) | Budget checkpoint | If exceeded |
|---|---|---|---|
| Bulk / mechanical | ~3–8k out · $0.07–0.15 (haiku) | **~10k out / ~$0.20** | it's not mechanical — reclassify, don't just spend |
| Standard coding | ~3–4k out · ~$0.08 (haiku) | **~8k out / ~$0.15 haiku** | escalate to sonnet (budget resets to ~$0.45) |
| Complex / craft | ~2–9k out · $0.44–0.95 (opus) | **~$1.50 / one full attempt** | check the loop is productive before a 2nd opus pass |
| UI / design | ~6k out · ~$0.66 (sonnet) | **~$0.90** | you're probably iterating on taste — get a signoff, don't burn tokens |
| Research | 1 Perplexity call · ~2s | **1 call default** | escalate to Sonar Pro/Deep only if the single call was insufficient |
| Orchestration / brain | task-shaped | **name it up front** for the run | decompose into child tasks rather than one giant context |

Batch API halves the coding rates for offline bulk — use it when a mechanical job isn't
latency-bound.

## Effort before tier

Extended thinking / reasoning effort is a per-request toggle with no separate tier price —
prefer *raising effort on the current tier* before *jumping a tier* when the gap is reasoning
depth, not raw capability.

**Decomposition lever:** split tasks so mechanical bulk runs cheap and only the verify/judge
step runs expensive. A bulk edit at haiku plus a final review dispatch at sonnet is cheaper
than one sonnet pass over the whole run.

## Anti-triggers

- A trivial one-liner doesn't need a routing analysis — just do it on whatever's already
  loaded. Don't manufacture a budget ceremony for a two-minute task.
- Research questions never go to a coding tier "because it's cheaper" — cited retrieval is
  the bar for facts; a bare LLM guessing from memory fails it regardless of price.
- Cost is not the *only* axis: if latency is the constraint, a higher tier that finishes
  faster can be the legitimate choice — a real reason to pay up.
