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
   merged state, resume order, and a `## Next` block (one `- lane:` line per lane, format in
   `hooks/scripts/session-resume.mjs`). The open queue is written once, **verbatim** — every open
   `orchestrator/operator-queue.md` row's full text — in the cockpit; a handover carries a link
   and the open-row count only.
4. **Confirm in one line.** Name what's paused and that nothing runs until
   resume — no verdict wall.

Nothing runs after step 4 until "resume."

## Resume

Trigger words: "resume", "pick up where we left off", "carry on from the
snapshot".

0. **Pull main first.** `git fetch origin main` in the vault and read the cockpit and handover
   from `origin/main`, never from the local or branch copy: a session that kept working after
   its wrap leaves newer state on main, and a stale branch cockpit restarts lanes that already
   merged (`resume-reads-vault-main-first-2026-10-10`).
1. Run `node <plugin>/hooks/scripts/session-resume.mjs <vault-root>` once: it prints, per lane, branch head, PR/CI, last progress line vs branch reality, contract, next owner, and whether this session's plugin is older than the installed one (reload before dispatching). Then read the snapshot (`projects/<name>/<name>-handover.md`) as it stands on `origin/main`.
   **Re-check every "running" lane** against live PR and branch state (`gh pr view`, branch
   head, merged or closed, draft or ready, whose decision it is) before any re-dispatch; a
   lane whose PR merged, moved on, or is held by the operator is not restarted.
2. Re-dispatch each interrupted lane as a **fresh continuation** — branch
   counts as an untrusted draft, per standing law, not a trusted resume-in-
   place. This is the same rule as `fresh-context-per-task`: resume-in-place
   is reserved for a reviewer's red on the sha it just built, never for
   picking a paused lane back up.
3. Report what restarted, one line per lane.

## Not wrap

Pause is a quick freeze, resumable mid-session; `wrap` is the full session
close (cockpit, handover, vault, toolkit check). An unplanned network loss is
pause without the courtesy — committed branch work survives, the session
resumes from vault — but pause is the clean, deliberate version, not a
safety net to lean on.

**After any session restart, read every lane's progress file before assuming state** — an
unplanned loss leaves no snapshot naming what was in flight, and one lane once sat stalled
for 4 hours unnoticed because nobody re-checked it (hoverboard, 2026-09-27 — item 9). Treat
the registry / cockpit's lane list as the index, then open each named progress file, not
just the ones the operator happens to ask about.

## Cross-references

- `routing` rule 8 (baton, parent-only `Agent`) — pause does not change who
  dispatches; it only halts new dispatch until resume.
- `wrap` — session close, not this skill; do not substitute one for the
  other.
