---
name: code-minimalism
description: >-
  A YAGNI decision-ladder for the CODE an engineer writes — reuse existing / stdlib /
  native / installed-dep / one-line before authoring anything new, and write the minimum
  that works. Use when implementing, refactoring, or reviewing code: deciding whether a
  helper/class/abstraction should exist, or when a change is growing more code than the task
  needs. This is the coding-lane token lever (fewer lines per task); it is NOT model routing —
  that is model-efficiency — and NOT for non-coding work. Adapted from Ponytail
  (github.com/DietrichGebert/ponytail).
---

# Code minimalism

**One job:** before writing code, climb a ladder — does this even need to exist, and if it
does, what already solves it — so the change is the *minimum that works*, not the most code
you could justify. Less code is fewer bugs, fewer tokens, less to maintain. **Lazy about the
solution, never about reading:** understand the problem fully first, *then* pick the lowest
rung. Skipping comprehension to ship a small diff is the failure mode, not the goal.

This is the **coding lane** — the code an Engineer *writes*. It is a different lever from
[`model-efficiency`](../model-efficiency/SKILL.md) (which *model* runs the task, fewer tokens
because the tier is cheaper) and from [`quality`](../quality/SKILL.md) (is the output
best-in-class). It composes with both. Adapted from the **Ponytail** plugin
([github.com/DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail)), whose
agentic benchmark measured ~54% less code, ~22% fewer tokens, ~20% less cost at 100% safety
vs. baseline (FastAPI+React, 12 tasks, n=4).

## The ladder — stop at the first rung that holds

Run this *after* you understand the problem, for every unit of code you're about to add:

1. **Does this need to exist?** — the requirement may be met already, or not actually be
   asked for. The best code is the code never written. → skip it.
2. **Already in this codebase?** — a util, a component, the shared foundation. → reuse it.
3. **Standard library?** — the language/runtime stdlib already does it. → use it.
4. **Native platform feature?** — the framework/platform/browser/OS primitive. → use it.
5. **An already-installed dependency?** — something in `package.json`/lockfile covers it. → use it.
6. **One line?** — if it collapses to a line, write the line, not a helper.
7. **Only then:** write the *minimum working code* for the real need.

The rungs are ordered by cost-to-maintain: reuse > stdlib/native > dep > new. Never jump to
rung 7 without checking the ones above it — "I'll just write a quick helper" is the most
common way a codebase accretes duplicated primitives.

## Intensity — default is **Full**

| Mode | Behavior |
| --- | --- |
| **Lite** | Build as asked; suggest the lazier rung in one line, don't enforce it. |
| **Full** *(default)* | **Enforce the ladder.** Reuse/stdlib/native before authoring; write the minimum; keep the explanation shorter than the code. |
| **Ultra** | YAGNI extremist: ship the smallest thing and *challenge* remaining requirements as possibly unneeded. For genuinely over-engineered code, not normal feature work. |

**Default = Full**, chosen because we already lean reuse-first — build on the shared foundation
before inventing — and Full turns that instinct into a checked
procedure without Ultra's tendency to argue back on scope the operator actually wants. Escalate
to Ultra only on an explicit "this is over-built, strip it" task; drop to Lite when the caller
just wants the thing built and a note.

## The safety floor — lazy, not negligent

Minimalism *stops at the trust boundary.* These are **never** on the chopping block, at any
intensity — cutting them is not "minimal," it's broken:

- **Input validation at trust boundaries** (auth, request bodies, external data).
- **Error handling that prevents data loss.**
- **Security measures** — authn/authz, secret handling, injection defenses.
- **Accessibility basics.**
- **Tests** — fewer lines of *product* code, never fewer *tests* for real behavior.
- **Anything the task explicitly asked for.**

If "make it minimal" would remove one of these, you keep it and say why. Removing validation
to save lines is the anti-pattern this skill exists to prevent, not enable.

## Marking a deliberate shortcut

When rung 7 is a knowing shortcut (a prototype, a demo, a deferred hardening), ship it *and*
mark it so the ceiling is visible and the upgrade path is one read away:

```ts
// ponytail: naive CSV split — breaks on quoted fields/embedded commas.
//   Upgrade to a real parser (csv-parse) when this handles user uploads.
```

Name the **ceiling** (what it doesn't handle) and the **upgrade path** (the real fix). An
un-marked shortcut is tech debt; a marked one is a decision. Rule of thumb: *if the explanation
is longer than the code, delete the explanation* — the code is already clear.

Behavioral quick-reference for auditing a diff: [references/DOS-AND-DONTS.md](references/DOS-AND-DONTS.md).

## The procedure

1. **Understand** the problem fully — read the surrounding code and the real requirement.
2. **Climb the ladder** for each unit of code; stop at the first rung that holds.
3. **Hold the safety floor** — validation/security/error-handling/tests are exempt from cutting.
4. **Write the minimum**; mark deliberate shortcuts with a `ponytail:` comment (ceiling + path).
5. **Read the diff back** — anything that isn't earning its lines comes out.

## Anti-triggers

- **Not model routing.** "Which model / how do I cut token cost by running cheaper?" is
  [`model-efficiency`](../model-efficiency/SKILL.md), not this. This skill only shapes the code
  content, not the tier that writes it. Defer, don't answer it here.
- **Not for non-coding work.** Prose, research, board hygiene, design copy — the ladder is
  about code. Don't apply it to a doc or a plan.
- **Not an excuse to under-build.** A genuinely needed capability with no rung 1–6 answer gets
  *written* (rung 7, minimally). "YAGNI" never means refusing work the task actually requires.
- **Don't skip comprehension.** A tiny diff produced without reading the code is the danger,
  not the win. Lazy about the solution; never about understanding.
