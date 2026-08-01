# Glossary — prototype

The domain model for **throwaway spikes** — runnable code that answers one design question before shaped work begins. Complements `stress-plan` (conversation) and `test-first` (production tests).

**Bold terms** in any definition are themselves defined here — find them by heading.

## Contents

- [Branches](#branches)
- [Lifecycle](#lifecycle)
- [Pipeline](#pipeline)

---

## Branches

### Logic prototype

Terminal TUI over a **pure logic module** — state machine, reducer, or function set. Answers "does this behaviour feel right?"

_Avoid:_ mixing terminal I/O into the portable logic

### UI prototype

Several **structurally different** variants on one route, switchable via `?variant=` and a floating bar. Answers "what should this look like?"

_Avoid:_ three colour tweaks on the same layout

### Portable module

The logic behind a logic prototype — reducer/state machine with no I/O. This is what gets **absorbed** into production; the TUI shell is deleted.

_Avoid:_ shipping the TUI shell to production

---

## Lifecycle

### Throwaway marker

Naming/path makes prototype status obvious — not mistaken for production code.

_Avoid:_ a `utils.ts` prototype with no label

### One-command run

A single script in the project's task runner — the next person starts it without remembering paths.

_Avoid:_ a five-step manual setup

### Prototype verdict

Durable capture of question + answer in `NOTES.md`, an ADR, or an issue — the only artifact worth keeping.

_Avoid:_ leaving a dead prototype without a verdict

---

## Pipeline

### Pre-shape spike

Runs before `shape-stress` when conversation alone is insufficient to settle the question.

_Avoid:_ prototyping instead of shipping when the acceptance criteria are already clear

### Snippet handoff

A validated reducer/schema from the prototype may inline into the shaped project or the task body — trimmed to the decision-rich parts.

_Avoid:_ pasting the entire throwaway file into the shaped artifact

---

## Related skills

| Skill | When |
| ----- | ---- |
| `stress-plan` | Plan stress — not runnable |
| `shape-stress` | After the verdict — shape the project |
| `prompt-craft` | Slice with the embedded snippet |
| `test-first` | Production red-green after the decision |
