---
name: prototype
description: Build a throwaway prototype to answer a design question — a terminal app for logic/state, or UI variants on one route. Use when a state-machine, data-shape, or "what should this look like" question is better answered by running code than by talking it through.
---

# Prototype

A prototype is **throwaway code that answers a question**. The question decides the shape.

Read [references/GLOSSARY.md](references/GLOSSARY.md) and [references/DOS-AND-DONTS.md](references/DOS-AND-DONTS.md) before building.

---

## Pick a branch

Identify the question — from the request, surrounding code, or ask if unclear:

| Question | Branch |
| -------- | ------ |
| "Does this logic / state model feel right?" | [references/LOGIC.md](references/LOGIC.md) — interactive terminal app |
| "What should this look like?" | [references/UI.md](references/UI.md) — radically different UI variants on one route |

Getting the branch wrong wastes the whole prototype. If ambiguous and the requester is unreachable, default to backend module → logic; page/component → UI. **State the assumption** at the top.

---

## Rules (both branches)

1. **Throwaway and clearly marked** — name/path shows prototype status; locate near the module or page being explored.
2. **One command to run** — the project's task runner (`pnpm`, `make`, `python`, etc.).
3. **No persistence by default** — in-memory state unless persistence *is* the question.
4. **Skip polish** — no tests, minimal error handling, no abstractions beyond the question.
5. **Surface state** — after every action (logic) or variant switch (UI), show full relevant state.
6. **Delete or absorb when done** — fold the validated decision into real code or delete; don't let it rot in the repo.

---

## When done

Capture the **answer** durably: a commit message, an ADR, a Paperclip issue, or a `NOTES.md` next to the prototype with the question it answered. If the requester is around, a quick conversation suffices; if not, leave the placeholder before deleting.

Suggest the next step: shape the validated decision with `shape-stress`, or if it's already clear enough, hand it straight to `paperclip-task-setup` as a vertical slice.

---

## Pipeline position

Optional during **`discover-scope`** or **`shape-stress`** — before committing to a shaped plan.

```
discover-scope → [prototype?] → shape-stress → paperclip-task-setup
```

---

## Related

| Skill | When |
| ----- | ---- |
| `shape-stress` | Prototype validated — shape into a project |
| `paperclip-task-setup` | Embed the prototype's decision in a vertical-slice task |
| `stress-plan` | Question is plan risk, not something runnable — conversation, not code |
| `design-modules` | Prototype validated an interface shape |
| `test-first` | Production red-green work after the decision lands |

This is throwaway-spike discipline — a different regime from `test-first`'s production red-green loop. Don't apply test-first's ceremony to a prototype (see Don'ts), and don't leave a prototype's decision uncaptured the way `flux-quality`'s verify-before-claiming bar would flag.
