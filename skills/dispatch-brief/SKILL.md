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
malformed. Doer law: `doer-rules.md`.

**The brief carries the operator's words, never the parent's guesses**: the operator's
words and images are the contract, quoted verbatim; no invented numbers; outcomes and
their measurement, never mechanisms; a confirmed read-back (`grilling`) is quoted in the
brief for any visual note; the parent's own additions are prefixed "parent:". Full rule
and checklist: [BRIEF-WORDS.md](references/BRIEF-WORDS.md).

## Interrogate the brief

Above trivial/small-fix, the brief is read as the doer would and answered against a fixed
set before the lane opens; findings fix the brief. Run by a read-only `haiku` agent, or the
parent inline for trivial/small-fix. Set and template: [INTERROGATE.md](references/INTERROGATE.md).
The brief carries `## Interrogated`.

## Pick the contract

| # | Operator gives | Contract | Parent adds | Verified by |
|---|---|---|---|---|
| 1 | Handoff export pair | the export | `## Source contract`, lock rows | binding diff |
| 2 | Figma, no export | file+node | `capture-figma`, live read | `audit-build` |
| 3 | Reference site/shot | capture folder | path, matches | diff vs capture |
| 4 | Itemisation, bug, one-liner | operator's words | quoted lock row; grill | row demoed |
| 5 | Feel or taste ask | none yet | `grilling`, no brief | the lock |
| 6 | Plugin/skill/release | ask quoted | gates, version | green |
| 7 | Fix round | feedback + contract | sha reviewed | rows cleared |
| 8 | Research, blue-sky | question, whole | givens fixed, unknown invited | sourced rec |

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

The doer loads **`handoff-to-code`** under a Source contract, plus the house ledger overlay
`skills/handoff-to-code/references/coverage-ledger.md`.

**One contract unit per lane, always** — one export `COMPONENT_SET`, one captured page, one
component. A brief covering more than one is malformed at any model; the parent slices, one
lane each. Every brief's done-when names the **coverage ledger** (`qa-acceptance`)
([ACCURACY.md](references/ACCURACY.md)).

## Locked decisions

```markdown
## Locked decisions
| # | Operator said (verbatim) | Means technically |
| - | --- | --- |
| 1 | "<quote>" | <one line for the doer> |
```

Operator column: verbatim, naming the thing as defined, never a synonym (`define-terms`).
Under a Source contract the export is the spec and the lock table is the operator's rulings on top; both are copied whole.
One AC per locked row, deferrals named, plus **AC-S** when a Source contract exists — never expanded into per-node ACs.

## The brief — four parts

- **Goal** — what exists when done.
- **Context** — contract pointer, repo/branch/cwd, primer first.
- **Constraints** — rulings quoted, gates, skills, push policy; **worktree name** (lane kind + sha), **gate timeout** (suite length, foreground), **`Rung:`** (`routing` § Rung ladder) with done-when in its terms. Geometry/pipeline briefs state their **invariants** — what must not change. A **measurement-named AC** (ratio, ΔE, CV) checks at the operator's crop first. A gate brief names **the contract path read at run time**; a pinning gate converts now.
- **Done-when** — the contract's verification; for UI, motion or prototype work, **the build up and the link sent** — the operator is the cheapest visual gate. **DO:** *"Rebuilt; re-run it."* **DON'T:** a screenshot pack. A built region's done-when names **pixel proof at the operator's framing** — computed-style reads are not proof ([ACCURACY.md](references/ACCURACY.md)).
- **`## Interrogated`** — result, or "inline, clear" ([INTERROGATE.md](references/INTERROGATE.md)).

**Target brief length: under 250 words**, excluding the lock table.

## What the parent does not add

One batch, not phases; the scenario row's "verified by", not matrices; skill **names**, never
restated procedure, no more than one DO/DON'T pair; `doer-rules.md` Fixed return.

## Reviewer brief

Same four parts; done-when is **diff the build against the contract**. Carries the locked table, the lock's live path, and the tier — `LIGHT` default, `FULL` argued. Unnamed tier defaults to `LIGHT`. Rounds cap 2 (`agents/reviewer.md` § Round cap); gates green before a reviewer is solicited; merge is gates green + no red finding.

## Persona + model

Label: `persona-(model)` from `model-routing`; `description` leads with surface — `cloud —
persona (model): task` or `local` (`routing` rule 9). Effort tier: `routine | contested | high-stakes`.

## State (untrusted draft; verify)

**Every continuation or slice brief carries `## State (untrusted draft; verify)`.** It
lists what prior slices claim landed — sha, mechanism, values — marked as claims.
Prior-slice implementation choices are never passed forward as fact: the doer re-verifies each against the
Source contract and lock before building on it; a wrong mechanism inherited from slice 1 is
slice 2's red finding, not its baseline. **A continuation slice is a fresh agent, not a resume** (`routing` § Resume vs fresh); artefacts named **by path**, never carried as context. **Lock widened, doer unreachable → continuation slice, not a new lane.** When the lock widens mid-flight and the running doer cannot be reached, let the lane land, then brief a continuation slice on the same branch carrying the widened rows; review once, after the last slice.

## Before you dispatch

```
[ ] Contract pointed at by its row, not restated
[ ] Operator rulings verbatim, a lock row each
[ ] Repo, branch, lane-named worktree
[ ] Gates green before review; `doer-rules.md`
[ ] Model, surface-prefixed description, tier, rung; skills named
[ ] Invariants stated; measurement ACs framing-checked
[ ] Done-when in contract terms
[ ] Push policy
[ ] Every number sourced or knobbed
[ ] No mechanism prescribed
[ ] Parent additions marked "parent:"
[ ] One contract unit per lane
[ ] Pixel proof at the operator's framing in done-when
[ ] Brief interrogated (or inline, clear); `## Interrogated` recorded
```
