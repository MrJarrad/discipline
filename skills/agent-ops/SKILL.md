---
name: agent-ops
description: Discipline for changing how the skill library and dispatch system itself works — the skill × prompt × model trifecta. Owns the skill library, agent prompts/charters, and the eval harnesses that gate them. Use when authoring or auditing a skill or an agent charter/AGENTS.md, or when running the eval gate before a mechanism change ships. Not for product or domain work — that's the doer skills; this is the mechanism behind them.
---

# Agent-Ops Discipline

The orchestrator decides *where* work goes. `quality` decides whether a single output
is *good enough to ship*. **Agent-Ops decides whether a change to how the skill library
and dispatch system itself works actually makes it better — proven before it ships.**

The system has three levers, the trifecta: **skill × prompt × model.** A *skill* is a
reusable procedure; a *prompt* (charter / `AGENTS.md`) is the contract that loads it; a
*model* is what runs it. This discipline owns the mechanism behind all three: how you
change a lever, and how you prove the change helped before it's live.

## What this owns — three artifacts, one bar

| Artifact | Canonical home | Is |
| --- | --- | --- |
| **Skills** | `skills/` | the reusable procedures the dispatch system loads |
| **Prompts / charters** | `agents/` | each persona's operating contract (an `agents/<persona>.md` file) |
| **Eval harness** | `meta/skill-eval/` | the one gate (`scripts/skill-eval.mjs` + `meta/skill-eval/cases.json`) that scores trigger recall, false-positives, and persona routing against a baseline arm |

If it changes *how an agent decides or acts across tasks*, it's Agent-Ops. If it changes
*one product output*, it's a doer skill — not this.

## Non-negotiables

1. **No mechanism change ships un-evaluated.** Every edit to a skill or prompt
   passes its eval gate — GREEN *and* with a baseline showing the change
   discriminates (better with the change than without). "Reads better to me" is not evidence.
2. **One canonical home.** A procedure lives in exactly one skill; charters
   *reference* it, never restate it. Duplicated procedure is drift — fix the
   source, don't patch the copy.
3. **Earn existence.** Every skill / charter has a live consumer. No
   consumer → delete it, don't keep it "just in case."
4. **One lever at a time.** Don't tune the skill and swap the model in the same pass — you
   won't know which moved the needle, and you can't gate what you can't attribute.

## The change loop — every mechanism change

Quick behavioural reference: [references/DOS-AND-DONTS.md](references/DOS-AND-DONTS.md) —
read it when auditing or before shipping a change.

**Diagnose → Change one lever → Eval-gate → Ship or route.**

- **Diagnose.** Name the failure mode from *real runs*, not a vibe: an agent skipped a
  step, over-fired a skill, ran the wrong model. Point at the
  artifact that owns the behavior.
- **Change.** Make the smallest edit to that source artifact. Author/audit per the
  playbook below.
- **Eval-gate.** Run the matching harness (table below). Ship on GREEN with baseline
  discrimination; on cap-without-GREEN, escalate — never weaken a scenario to force green.
- **Ship / route.** One PR per change, eval evidence attached, route to the reviewer with a
  one-line "what changed and what the gate proved."

## Per-artifact playbook

### Skills — `skills/`
Author and audit against the skill-authoring standard —
[references/skill-authoring-standard.md](references/skill-authoring-standard.md): the five
tests (**does one thing**, **states its trigger** for *and* not for, **self-contained**, **one
canonical home**, **best-in-class bar**) plus the triggering conventions (description is a
*trigger* not a summary; lead with "Use when…"; keep the anti-trigger; match intensity to the
failure). Gate with `meta/skill-eval`: add or reuse a case in
`meta/skill-eval/cases.json` (route / trigger / fence), run
`node scripts/skill-eval.mjs meta/skill-eval/cases.json --tag <type> --live
--baseline-plugin-dir <pre-change worktree>`, and read the printed verdict + discrimination —
GREEN and DISCRIMINATES to ship; NON-DISCRIMINATING means the change isn't earning its
tokens; BASELINE UNAVAILABLE means no comparison ran (never treat as GREEN).

### Prompts / charters — `agents/`
A charter is the persona's operating contract: role, definition-of-done, handoff, escalation.
It **applies** skills; it never restates them (see `agents/engineer.md`'s `skills:`
frontmatter plus body — the charter applies those skills, it does not restate them). Audit
for: every behavior lives in *either* a loaded skill *or* the charter, with no overlap;
escalation and handoff paths are first-class, not prose. Persona-selection accuracy (does the
right work route to the right charter) is a `route`-type case in `meta/skill-eval`; whether a
charter, once loaded, produces good behaviour is out of scope for v1 (see
`meta/skill-eval/README.md`).

## The eval gate — one harness, three case types

| Change to… | Case type in `meta/skill-eval/cases.json` | Pass bar |
| --- | --- | --- |
| a skill's trigger phrasing | `trigger` | GREEN (majority of n samples fire the skill); baseline arm DISCRIMINATES, not NON-DISCRIMINATING |
| a skill's anti-trigger fence | `fence` | GREEN (forbidSkills never fire) |
| `routing`'s persona table / a charter | `route` | GREEN (persona + skills match); baseline arm DISCRIMINATES |

In every case the bar is **GREEN + discriminates against a no-change baseline** (run via
`--baseline-plugin-dir`, a pre-change worktree of this repo — see
`~/JHD/vault/projects/discipline/audits/eval-t1-plugin-root-spike-2026-08-01.md` for the mechanism). A change
that passes with *and* without itself changed nothing worth shipping; a run with no baseline
arm reports BASELINE UNAVAILABLE, never GREEN. Model routing / tier changes are out of scope
for v1 (`meta/skill-eval/README.md`).

## Audit cadence — corrections become scenarios

When a correction traces to a mechanism (a recurring miss, a persona that
keeps over-stepping), fix the source artifact **and add or strengthen a scenario** so the
gate catches it next time. A correction without a new scenario will recur. Record the
failure mode + fix via `vault-write` so the next audit starts ahead of it.

## Handoff & escalation

- **Publish** to the library repo (`skills/`) via a merged PR; name the merge in the handoff.
- **Route to the reviewer** with the eval evidence and the one-line gate result.
- **Escalate to the operator** for any change that alters merge / routing behavior.

## Minimal-sufficient

The best mechanism change is the one you didn't need. Prefer strengthening one existing
artifact over adding a new one; a new skill must earn its home against the library that
already exists. Review for deletion, not just addition.
