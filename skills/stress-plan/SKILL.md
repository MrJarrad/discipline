---
name: stress-plan
description: Interview relentlessly about a plan or design until every branch is resolved — one question per turn, each with a recommended answer. Use when stress-testing a plan or design before building, when grilling a proposal for gaps, or when another skill needs a plan stressed before it starts building.
---

# Stress Plan

Sits under `quality` (the bar for verification, evidence, and honesty). This
skill doesn't restate that bar — it adds the one discipline plan review needs on
top of it: **grill one branch at a time, never a batch.**

Read [references/DOS-AND-DONTS.md](references/DOS-AND-DONTS.md) before the first question.

**Not for:** bugfixes, "just implement this," or any request that already has a
clear, narrow path — that's normal work, not a plan to stress.

## The interview

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

Stop when the major branches are resolved (shared understanding), or when the
calling skill's checklist says the plan is finished. Remaining micro-decisions
can wait for implementation.
