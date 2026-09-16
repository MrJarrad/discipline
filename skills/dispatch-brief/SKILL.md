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
| 1 | Handoff export pair | the export | `## Source contract`, lock rows | binding diff |
| 2 | Figma, no export | the file+node | `capture-figma`, live read | `audit-build` |
| 3 | Reference site/shot | capture folder | path, match list | diff vs capture |
| 4 | Itemisation, bug, one-liner | the operator's words | a quoted lock row each; grill | row demoed |
| 5 | Feel or taste ask | none yet | `grilling`, no brief | the lock |
| 6 | Plugin/skill/release | the ask quoted | gates, version | green |
| 7 | Fix round | feedback + the original contract | sha reviewed | rows cleared |
| 8 | Research, blue-sky | the question, whole | givens fixed, unknown invited (`prompt-craft`) | sourced recommendation |

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

Operator column: verbatim, naming the thing as defined (layer, component, class, token) —
never a synonym (`define-terms`). Under a Source contract the export is the spec and the lock table is the operator's rulings on top; both are copied whole.
One AC per locked row, deferrals named, plus **AC-S** when a Source contract exists — never expanded into per-node ACs.

## The brief — four parts

- **Goal** — what exists when done.
- **Context** — contract pointer, repo/branch/cwd, primer first.
- **Constraints** — rulings quoted, gates, skills, push policy; the **worktree name** (lane kind + sha) and the **gate timeout** (suite length, foreground). Geometry and pipeline briefs state their **invariants** — what must not change. A **measurement-named AC** (ratio, ΔE, CV) is checked at the operator's crop first; one that fails is out.
- **Done-when** — the contract's verification; for UI, motion or prototype work, **the build up and the link sent** — the operator is the cheapest visual gate, so no visual evidence is contracted. **DO:** *"Rebuilt; re-run it and tell me what's off."* **DON'T:** a screenshot pack proving a look nobody has seen.

**Target brief length: under 250 words**, excluding the lock table.

## What the parent does not add

One batch, not phases; the scenario row's "verified by", not matrices; skill **names**,
never restated procedure, no ruling beyond one DO/DON'T pair; `doer-rules.md`'s Fixed
return.

## Reviewer brief

Same four parts; done-when is **diff the build against the contract**. Carries the
engineer's same current locked table, the lock's **live path**, and the tier — `LIGHT`
default, `FULL` argued. Unnamed tier defaults to `LIGHT`. Rounds cap at 2
(`agents/reviewer.md` § Round cap); gates green **before a reviewer is solicited**; merge is
gates green + **no red finding**.

## Persona + model

Label: `persona-(model)` from `model-routing`; `description` leads with the surface —
`cloud — persona (model): task`, or `local` (`routing` rule 9). Effort tier:
`routine | contested | high-stakes`.

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
[ ] Contract pointed at by its row, not restated
[ ] Operator rulings verbatim, a lock row each
[ ] Repo, branch, lane-named worktree
[ ] Gates green before review; `doer-rules.md`
[ ] Model, surface-prefixed description, tier; skills named
[ ] Invariants stated; measurement ACs framing-checked
[ ] Done-when in contract terms
[ ] Push policy
```
