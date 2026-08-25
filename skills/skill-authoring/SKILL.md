---
name: skill-authoring
description: >-
  Write or edit agent-consumed documents — SKILL.md files, AGENTS.md, rules,
  agent prompts — so they trigger reliably, stay legible, and don't bloat context.
  Use when creating or editing a skill, rule, or AGENTS.md, or when a skill's
  description fails to fire. Not for task brief wording — that's prompt-craft; not
  for vault placement — that's vault-write.
---

# Skill Authoring

Documents agents consume — skills, rules, `AGENTS.md`, agent prompts — share one
writing discipline. Packaging differs; the levers are the same: predictable triggering,
legible structure, and minimal redundant load.

Read [references/DOS-AND-DONTS.md](references/DOS-AND-DONTS.md) when applying this skill.

## Context pointers

A **context pointer** is text in always-loaded context that names out-of-context
material and the condition for reaching it. A skill's `description` is one; a line in
`AGENTS.md` is another. **The pointer's wording decides when the agent reaches the
material** — sharpen the pointer before inlining a long body.

Pointer rules:

- **Front-load the leading word** — the trigger lives at the start of the description.
- **One trigger per branch** — synonyms for the same case are one branch written twice; collapse them.
- **Cut identity the body already carries** — don't repeat the skill name or full procedure in the description.

## Two loads

Every document spends one of two budgets:

| Load | Cost | When to pay |
| --- | --- | --- |
| **Context load** | Always-loaded tokens every turn | Model-invoked skills, always-on rules |
| **Cognitive load** | Operator must remember to invoke | User-invoked-only skills |

Material reached only through a pointer escapes context load at the price of one
pointer line. Material with no pointer rides entirely on cognitive load.

**Pick model-invocation** when the agent must reach the skill on its own, or another
skill must compose it. **Pick user-invocation** (`disable-model-invocation: true` in
Cursor/Claude) when only the operator should fire it — zero context load, operator is
the index.

Shared reference two user-invoked skills both need → plain file outside the skill
system any skill can point at.

## Information hierarchy

Build from **steps** (ordered actions) and **reference** (rules, definitions, consulted
on demand). Rank by how immediately the agent needs the material:

1. **In-file step** — what to do, in order.
2. **In-file reference** — flat rules consulted on the same run.
3. **Disclosed reference** — sibling file reached by pointer; loaded only when the pointer fires.

**Progressive disclosure:** inline what every branch needs; push behind a pointer what
only some branches reach. Branching is the cleanest disclosure test.

**Co-location:** keep a concept's definition, rules, and caveats under one heading —
scattered fragments force coin-flip attention.

**Sprawl:** even live, unique lines thin attention. Cure via disclosure and branch splits.

## Steps and completion criteria

Every step ends on a **completion criterion** — done vs not-done:

- **Sharpen the bound first** — "frontier empty" beats "understanding reached."
- **Demand drives legwork** — "every modified model accounted for" forces thorough work.

Strongest criteria are checkable **and** exhaustive.

## Leading words

A **leading word** is a compact concept the model already knows (_frontier_, _tracer
bullet_, _seam_, _locked decisions_). Repeat as a token, never as a sentence — it
anchors behaviour in fewer tokens.

Hunt restatements to collapse:

- "fast, deterministic, low-overhead" → _tight_ (a _tight_ loop)
- "a loop you believe in" → _red_ (the loop goes _red_ on the bug)

**Negation** steers poorly — _Don't think of an elephant_. Prompt the **positive**
target behaviour; pair prohibitions only as hard guardrails with a positive target.

## Names are UI; briefs/docs explain

Never add text onto a skill, rule, agent prompt, or product control that explains what it
does — that belongs in documentation or a dispatch brief. A control's name is the UI; a
caption that narrates it is the defect.

## Pruning

- **Single source of truth** — one authoritative place per meaning; duplication inflates prominence and maintenance cost.
- **Environment is truth** — `package.json` scripts, directory layout, `--help`. Don't cache what a one-line lookup answers. Cache unwritten conventions, gotchas, reasons.
- **Relevance discipline** — remove lines that no longer bear on the task; sediment is the default failure mode.

## Skill-specific mechanics

### Frontmatter

```yaml
---
name: skill-name
description: >-
  One paragraph: WHAT + WHEN (branches the agent should match). Front-load triggers.
  Not procedure — that's the body.
---
```

Description is the trigger surface. Body is the procedure.

Description is plain prose — no angle-bracket placeholders, and no custom frontmatter
keys on agents — the claude.ai marketplace validator rejects both.

### Router skills

When user-invoked skills multiply past memory, one **router** skill names when to reach
each — cognitive load cure. Routers hint; they cannot fire user-invoked skills (no
description on those).

### Composition

User-invoked orchestrators call model-invoked primitives via explicit load instructions
("load `grilling`") — never duplicate the primitive's procedure in the orchestrator.

## Checklist before shipping a skill

```
[ ] Description front-loads triggers; one branch per distinct case; no procedure in description
[ ] Steps have completion criteria; reference disclosed where branch-specific
[ ] No duplication of sibling skills — compose and point
[ ] Leading words used where a triad repeats
[ ] Positive framing; negation only with paired positive target
[ ] Invocation choice explicit: model vs operator-only
[ ] Environment not restated when lookup is cheap
```

## Relationship to siblings

| Skill | Owns |
| --- | --- |
| `prompt-craft` | Wording inside **task briefs** for doers |
| `dispatch-brief` | Brief **structure**, locked decisions, evidence contract |
| `grilling` | Experience interview primitive — don't restate here |
| `vault-write` | Where artifacts land in the vault |
