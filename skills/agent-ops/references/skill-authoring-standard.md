# Skill-Authoring Standard

The canonical standard for authoring a skill so it **triggers dependably** and earns its
tokens. `agent-ops` references this when authoring or auditing any skill; it is the source
the "five skill-standards tests" point at. Keep procedure here — do not restate it in charters.

## The five tests (a skill ships only if all five hold)

1. **Does one thing** — a single procedure, not a grab-bag.
2. **States its trigger** — what it's *for* **and** what it's *not* for (see triggering below).
3. **Self-contained** — the body carries everything the doer needs; no "see the other skill".
4. **One canonical home** — the procedure lives here and nowhere else; others reference it.
5. **Meets the best-in-class bar** — measured against the best example in its category.

## Triggering conventions — the description is a *trigger*, not a summary

The `description` frontmatter is the **only** text the harness scans to decide whether the
skill is relevant. Write it as a firing condition, not documentation.

- **Lead with the trigger, not the topic.** Start with (or center on) **"Use when …"** —
  concrete symptoms, situations, and contexts that should fire the skill. The reader is a
  router deciding *should I open this*, not a student learning *what is this*.
- **Never summarize the skill's workflow in the description.** A description that recaps the
  steps creates a shortcut the agent will take *instead of reading the body* — it acts on the
  summary and skips the real procedure. (Superpowers documents the failure verbatim: a
  description saying "code review between tasks" caused an agent to do **one** review when the
  skill's flowchart required **two**.)
- **Keep the anti-trigger — our edge.** End with **"Not for X — that's `<other-skill>`."**
  This is the single biggest defence against *wrong-tool-fires* (two skills the router can't
  tell apart) and *misuse*. Superpowers omits anti-triggers; we keep them deliberately.
- **Third person, present tense, under ~500 chars.** "Route an issue onward…", not "I will…".

Reference shape (matches our strongest shipped descriptions, e.g. `design-modules`,
`diagnosing-bugs`): `<what it is> — Use when <symptoms/situations>. Not for <X> — that's <skill>.`

## Intensity language — match the form to the failure, don't cargo-cult the shouting

Hard imperatives (`ALWAYS`, `MUST`, an "Iron Law" block) are a *tool for one failure mode*,
not a house style. Superpowers' own tuning found:

- Use hard prohibition language **only for "skips-the-rule-under-pressure" failures** — the
  agent knows the rule and rationalizes past it (e.g. "ship without verifying"). A short
  red-flag / rationalization table that names the excuse and counters it works here.
- Do **not** reach for `MUST`/`ALWAYS` for *shape or completeness* failures (wrong output
  form, missing a step) — there, a worked example or a checklist beats volume.
- **Avoid "unless it matters" nuance clauses** on a rule that already works — measurably
  degrades it by handing the agent a rationalization hook.

## Earn existence

Every skill needs a live consumer. No consumer → delete it; don't keep it "just in case."
A new skill must beat strengthening one that already exists.

## Why these (sourced)

Cherry-picked from the `obra/superpowers` framework (v6.1.1), which triggers skills very
dependably. Verified against the cloned source:

- Description-as-trigger + no-workflow-summary rule, with the "one review vs two" failure
  case — `skills/writing-skills/SKILL.md`.
- Match-the-form-to-the-failure / don't-add-nuance-clauses — `skills/writing-skills/SKILL.md`
  ("Match the Form to the Failure") and `CLAUDE.md` (tuned Red-Flags/rationalization content).

**Not adopted here (see the follow-up issue):** superpowers' load-bearing reliability lever
is a `SessionStart` hook that force-injects an always-on dispatcher skill ("if there's a 1%
chance a skill applies, you MUST invoke it — before any action") into every session. That is
a system-wide behavior change to the always-injected layer and must pass the eval gate before
it ships — tracked separately, not folded into this authoring standard.
