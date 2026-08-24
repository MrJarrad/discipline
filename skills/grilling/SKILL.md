---
name: grilling
description: >-
  Interview relentlessly until the design tree is locked — frontier rounds of
  experience-level questions, each with a recommended answer. Use before dispatch
  on non-trivial build/design work, when stress-testing a plan or proposal, when
  the operator says grill this, or when acceptance criteria cannot be written
  without inventing requirements. Not bugfixes with a clear repro, not explicit
  just implement this. Composes define-terms when a repo is open.
---

# Grilling

Sits under `quality` (verify before claiming, never fabricate). This skill adds
the one discipline alignment needs before build: **lock the decision tree through
experience questions, not engineering menus.**

Read [references/DOS-AND-DONTS.md](references/DOS-AND-DONTS.md) when applying this skill.

## When this fires

- Non-trivial build or design work and the frontier is not empty
- Match reference site / Gill / Figma feel — grill at experience altitude OR operator skip, then dispatch with tape/reference path + locked AC; do not invent ACs
- "Grill this", "stress-test the plan", "is the plan ready"
- Orchestrator cannot write acceptance criteria without inventing requirements
- `shape-stress` interview mode (this skill is the interview primitive)

**Not for:** typo fixes, clear bugfixes with repro, explicit "just build it" / skip
grill.

## Smell table

| Smell | Do |
| --- | --- |
| Match reference site / Gill / Figma feel | Grill at experience altitude OR operator skip → then dispatch with tape/reference path + locked AC. Do not invent ACs. Visual claims: browser evidence (Claude browser tools or Playwright) and/or **ux-designer** before claiming parity. |

## The design tree

Map the work as a **design tree**: every decision branches into the decisions that
hang off it. Work the tree in **rounds**.

The **frontier** is every decision whose prerequisites are already settled — questions
you can ask *now* without guessing at answers you haven't heard yet. Ask the **whole
frontier** in one round: number each question and give your recommended answer.
Then wait for the operator's answers before the next round.

Each question is formatted:

```
❓ **Q1 — <short title>**
<question body — experience level, anyone could answer>

➡️ **Recommended:** <one answer, not a menu>
```

Each round the operator answers reshapes the tree: settled decisions push the frontier
outward. Recompute the frontier and ask the next round. A question whose answer
depends on another question still open in this round belongs to a *later* round, not
this one.

## Designer altitude (non-negotiable)

Questions are **experience**, not engineering. Never ask which technical solution to
pick. If a technical fork is actually the operator's decision, ask what it means for
the product — a question anyone could answer. Translate that answer into the
technical choice in the locked-decisions brief; the doer never reverse-engineers a
stack choice from a vibe word.

| Wrong (engineering) | Right (experience) |
| --- | --- |
| Optimistic locking or last-write-wins? | If two people edit the same capture at once — does the later one overwrite, or do we stop and ask? |
| SSR or client render? | Should this screen be fully there when it opens (even if that costs a beat), or appear instantly and fill in? |
| Redis or in-memory cache? | If the list is stale for a few seconds, is that acceptable, or must it always feel live? |

**Facts** are the agent's job (codebase, docs, vault) — never ask the operator to
restate what a read would show. Don't block the round on a lookup: dispatch
reconnaissance if needed; only questions downstream of unsettled facts wait.

**Decisions** are the operator's — and they are experience decisions. A question a
designer couldn't answer without becoming an engineer is malformed: rewrite it or
decide it in the brief without asking.

Pair every question with **one recommended answer** and **one named alternative**
rejected — never a menu of technical options.

## Locked decisions output

When the frontier is empty, emit a **Locked decisions** block before anyone acts or
dispatches:

```markdown
## Locked decisions

| # | Operator said (verbatim) | Means technically (one line) |
| - | --- | --- |
| 1 | "<quote>" | <translation for the doer> |
```

Confirm shared understanding with the operator before dispatch or build.

## Composition

- **`define-terms`** — when a repo is open, sharpen vocabulary and update
  `CONTEXT.md` / ADRs as terms crystallise during grilling (grill-with-docs pattern).
- **`shape-stress`** — calls this skill for interview mode; patches the six-section
  draft after each round.
- **`dispatch-brief`** — carries the Locked decisions block verbatim into every brief.

## Stop conditions

- **Done:** frontier empty + operator confirms shared understanding (or explicit
  proceed / ship / looks good).
- **Skip:** operator says "just build it" / skip grill — name what's still open once,
  then proceed.
- **Not done:** major branches still assumed, or ACs would require inventing
  requirements — keep grilling.
