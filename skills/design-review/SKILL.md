---
name: design-review
description: >-
  Experience review — named tasks, heuristic evaluation, and optional depth
  (real users, synthetic hypotheses, AT-with-people). Trigger on "design-review",
  "review the experience", or "user-test this". Not standing merge/tech review —
  that's reviewer + quality; not Figma/system numeric fidelity — that's audit-build.
---

# Design Review

Standing **reviewer** and **quality** score **build craft** only — no invented layout,
copy, or "add a footer." This skill owns **experience judgment**: whether the surface
serves real tasks, where heuristics fail, and (when the brief names depth) synthetic or
real-user hypotheses. Recommendations are allowed; **do not patch** unless the operator
then asks to build.

Read [references/DOS-AND-DONTS.md](references/DOS-AND-DONTS.md) when applying this skill.

## Floor by depth

| Depth | When | Method |
| --- | --- | --- |
| **Default** | Every design-review dispatch unless brief names more | Named tasks → heuristic pass (Nielsen-class, scoped to the surface) |
| **Opt-in: synthetic** | Brief names synthetic / simulated users | Hypothesis only — never a verdict; cite what you'd watch for, not "users would hate this" |
| **Opt-in: real users** | Brief names real users / usability test | Protocol + findings tied to tasks |
| **Opt-in: AT-with-people** | Brief names a11y-as-experience / people with AT | Beyond keyboard/labels/contrast (standing can-use-it stays on engineer/reviewer) |

Everyday **can-use-it** (keyboard, labels, no-mouse baseline) stays on **engineer** and
**reviewer** — not duplicated here unless the brief opts into people-with-AT depth.

## Default workflow

1. **Lock the surface and primary task** — one surface, one primary task, one heuristic
   pass is the fallback when scope is unclear. Widen only when the brief names more.
2. **Name tasks before heuristics** — what must a stranger accomplish on this surface?
   Tasks are the spec; heuristics score task completion, not taste.
3. **Heuristic pass (scoped)** — apply a Nielsen-class set to the locked tasks only.
   Findings are **task fail points** ("task X breaks because…"), not copy notes or layout
   sketches unless the fail point requires naming the gap.
4. **Figma / system misses** — load **`audit-build`** for built-vs-design numeric
   fidelity; do not duplicate its measurement loop here. For the Figma-contracted
   screenshot-pair evidence requirement, see `qa-acceptance` — one place, not restated here.
5. **Return findings + recommendations** — structured fail points and recs; stop unless
   the brief also authorizes build.

## Synthetic users (opt-in only)

When the brief names synthetic depth:

- State the **hypothesis** ("If a first-time visitor tries to…, friction may appear at…").
- **Never verdict** ("users will abandon") — synthetic is a probe, not a study.
- Pair with the named task and heuristic that would confirm or falsify the hypothesis.

## Relationship to siblings

| Skill / persona | Owns |
| --- | --- |
| `quality` / **reviewer** | Build craft, can-use-it implementation, lab CWV, trust-boundary security |
| `audit-build` | Numeric built-vs-Figma / system fidelity |
| `design-craft` | Token/composition bar when building or on explicit look-right |
| **ux-designer** | Dispatched persona for this skill — renders evidence when the brief needs viewport proof |

## Checklist before returning

```
[ ] Primary task(s) named before heuristics
[ ] Findings are task fail points, not standing merge-gate taste
[ ] Figma/system gaps delegated to audit-build, not re-measured here
[ ] Synthetic (if used) framed as hypothesis, not verdict
[ ] No code patches unless brief authorized build after review
```
