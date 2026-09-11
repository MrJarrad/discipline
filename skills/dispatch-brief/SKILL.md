---
name: dispatch-brief
description: >-
  How to write any Agent / subagent dispatch prompt so it points at the contract
  and stays scoped. Use before authoring any dispatch brief. Not for choosing WHO
  (routing) or model (model-routing); not issue-triage mechanics.
---

# Dispatch Brief

## The one rule

**The brief points at the contract; it never restates it.** A paraphrasing brief is
malformed — do not `Agent`. Doer law: `doer-rules.md`.

## Pick the contract

| # | Operator gives | Contract | Parent adds | Verified by |
|---|---|---|---|---|
| 1 | Handoff export pair | the export | `## Source contract`, lock rows | one-pass binding diff |
| 2 | Figma, no export | the file+node | `capture-figma`, live read | `audit-build` vs node |
| 3 | Reference site/shot | capture folder | path, match list | diff vs capture |
| 4 | Itemisation, bug, one-liner | the operator's words | a quoted lock row each; grill assumptions | each row demonstrated |
| 5 | Feel or taste ask | none yet | `grilling`; no brief yet | the lock |
| 6 | Plugin/skill/release | the ask quoted | gates, version | gates green |
| 7 | Fix round | feedback + original contract | sha reviewed | rows cleared |
| 8 | Research, blue-sky | the question, whole | givens fixed, unknown invited (`prompt-craft` alt 2) | sourced options + recommendation |

## Source contract

When a Design Handoff export exists, the export is the contract — whole. The brief names
the export path, the node ids it covers, and the companion export's schema + generated stamp; it says:
build every node, token, copy string and annotation in the file; list every deviation as a defect. The
brief never re-describes the file. Lock rows carry only what the file cannot: blend, behaviour, links,
copy overrides. A brief that paraphrases the export instead of pointing at it is malformed — do not
`Agent`.

```markdown
## Source contract
- Export: <abs path> · nodes: <#id, #id> · companion: <schema N, generated <stamp>>
- AC-S: every node, token, copy string and annotation in the export is built; deviations listed as defects
```

The doer loads **`handoff-to-code`** under a Source contract.

## Locked decisions

```markdown
## Locked decisions
| # | Operator said (verbatim) | Means technically |
| - | --- | --- |
| 1 | "<quote>" | <one line for the doer> |
```

Operator column: verbatim, never a summary, naming the thing as defined wherever it's
defined (layer, component, class, token) — never a synonym (`define-terms`). Under a
Source contract the export is the spec and the lock table is the operator's rulings on top; both are copied whole.
One AC per locked row, deferrals named, plus **AC-S** when a Source contract exists — never expanded into per-node ACs.
Slicing a whole-surface lock is malformed.

## The brief — four parts

- **Goal** — what exists when done.
- **Context** — contract pointer, repo/branch/cwd, primer first.
- **Constraints** — rulings quoted, gates, skills, push policy.
- **Done-when** — the contract's own verification.

**Target brief length: under 250 words**, excluding the lock table.

## What the parent does not add

One batch, not phases; the scenario row's "verified by", not measurement matrices or
evidence READMEs; skill **names**, never restated procedure, and no ruling beyond one
DO/DON'T pair; `doer-rules.md`'s Fixed evidence return, not per-brief contracts.

## Reviewer brief

Same four parts; done-when is **diff the build against the contract**. Carries the
engineer's same current locked table, the lock's **live path**, and the tier — `LIGHT`
default, `FULL` argued. Unnamed tier defaults to `LIGHT`. Rounds cap at 3; merge is gates
green + no red finding.

Deterministic gates are green **before a reviewer is solicited** (`doer-rules.md` states what a gate run requires).

## Persona + model

Label: `persona-(model)` from `model-routing`; `description` leads with the surface —
`cloud — persona (model): task`, or `local` (`routing` rule 9). Model explicit, never
inherited. Effort tier: `routine | contested | high-stakes`.

## State (untrusted draft; verify)

**Every continuation or slice brief carries `## State (untrusted draft; verify)`.** It lists
what prior slices claim landed — sha, mechanism, values — marked as claims.
Prior-slice implementation choices are never passed forward as fact: the doer re-verifies each against the
Source contract and lock before building on it; a wrong mechanism inherited from slice 1 is
slice 2's red finding, not its baseline. **Lock widened, doer unreachable → continuation slice, not a new lane.** When the lock
widens mid-flight and the running doer cannot be reached, let the lane land, then brief a
continuation slice on the same branch carrying the widened rows; review once, after the
last slice.

## Before you dispatch

```
[ ] Contract pointed at by scenario row, not restated
[ ] Operator rulings verbatim, a lock row each
[ ] Repo, branch, cwd; `doer-rules.md`
[ ] Gates green before review
[ ] Model, surface-prefixed description, tier
[ ] Skills named, not restated
[ ] Done-when in contract terms
[ ] Push policy
```
