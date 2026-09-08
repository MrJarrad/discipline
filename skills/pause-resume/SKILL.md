---
name: pause-resume
description: >-
  Freeze and thaw the dispatch surface on the operator's one word — "pause",
  "I need to pause", "I need to pause shortly", "wind down", "stop for now",
  "let's stop here", "resume", "pick up where we left off", "carry on from
  the snapshot". Pause: no new dispatches, stop every running agent at its
  next safe point, bank a one-screen state snapshot, confirm in one line.
  Resume: read the snapshot, re-dispatch each interrupted lane as a fresh
  continuation, report what restarted. Not `wrap` — wrap is the full session
  close; pause is a quick, resumable freeze.
---

# Pause / resume

Operator-ratified 2026-08-31 (`fleet/rulings/pause-resume-protocol.md`). The
operator works in transit and needs a clean, fast wind-down word — not the
full `wrap` close.

## Pause

Trigger words: "pause", "I need to pause", "I need to pause shortly", "wind
down", "stop for now", "let's stop here".

1. **No new dispatches.** Stop routing; nothing new goes to `Agent` until
   resume.
2. **Stop every running agent at its next safe point.** Commit-incrementally
   law means in-flight work already lives on pushed/committed branches —
   let the current commit land, then halt; do not kill mid-edit.
3. **Bank a one-screen snapshot** into `projects/<name>/<name>-handover.md`
   for each touched project: in-flight lanes + their shas, dirty worktrees,
   merged state, queued operator calls, and resume order.
4. **Confirm in one line.** Name what's paused and that nothing runs until
   resume — no verdict wall.

Nothing runs after step 4 until "resume."

## Resume

Trigger words: "resume", "pick up where we left off", "carry on from the
snapshot".

1. Read the snapshot (`projects/<name>/<name>-handover.md`).
2. Re-dispatch each interrupted lane as a **fresh continuation** — branch
   counts as an untrusted draft, per standing law, not a trusted resume-in-
   place.
3. Report what restarted, one line per lane.

## Not wrap

Pause is a quick freeze, resumable mid-session; `wrap` is the full session
close (cockpit, handover, vault, toolkit check). An unplanned network loss is
pause without the courtesy — committed branch work survives, the session
resumes from vault — but pause is the clean, deliberate version, not a
safety net to lean on.

## Cross-references

- `routing` rule 8 (baton, parent-only `Agent`) — pause does not change who
  dispatches; it only halts new dispatch until resume.
- `wrap` — session close, not this skill; do not substitute one for the
  other.
