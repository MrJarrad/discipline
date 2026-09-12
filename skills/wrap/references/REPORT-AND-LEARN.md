# wrap — the report, the handover prose moves, and the learn step

SKILL.md carries the report's audience rule and the learn step's one law. This file is
the full text: report shapes, the four handover-prose moves, the lesson-mining procedure,
the mid-session checkpoint, and the mined-lessons list. Nothing here was rewritten — it
is the 1.78.0 SKILL.md body, moved.

## Report

**Operator-facing (default):** compact outcomes — what's banked, what's next. Follow handover
prose four moves below. Do **not** dump seven-section tables, "wrap skill", or plugin names
unless the operator asked for the machinery.

**Internal (agent contract):** walk all seven sections in order; state per section what
changed and what was verified — not just "wrapped." Name specific commits, listener state,
and where rulings landed. Log personas/skills invoked against routing tables
(`skills/routing/SKILL.md`) — mandated-skill zero on relevant work is a defect, not a silent gap.
Log the session's **dispatch tally** — `cloud N / local M` — with each local dispatch's
one-clause machine-bound justification spot-listed (`routing` rule 9); an unjustified local
count, or a cloud share trending down session over session, is drift to name, not skip.
Log **review rounds per change** — `<change>: N of <cap>` against the cap in
`agents/reviewer.md` § Round cap — including changes that took the small-fix no-reviewer
path (`0`) and any that **halted at the cap** with findings still open. Rounds are the
loop's health signal: a session trending toward the cap on every change means the briefs
or the gates are failing upstream, and that is drift to name here.

## Handover prose: compact, redact, reference, name the next step (absorbed from paperclip-work-products)

Every piece of handover prose — the HANDOVER document, a wrap summary, a blocked/parked note — follows four moves:

1. **Compact state** — one or two sentences of what changed and where things stand, not a replay of how you got there.
2. **Redact** — no API keys, tokens, credentials, or PII, even if they appeared in your working context. If unsure, redact.
3. **Reference, don't repeat** — point at the artifact, commit, or file path; never paste the diff or document body. The handover records *where*, not *what*.
4. **Name the next step** — whose move it is and what they do. Prose that ends without a next step is a dead end, not a handoff.

All four, every time — compact-but-no-next-step is still a dead end; redacted-but-pasted-stack-trace still fails move 3.

## Learn — mine the session for lessons before the lint/commit gate (operator ruling 2026-08-03)

Wrap does not end at re-stating what happened — it also asks whether the session
just taught something durable that mid-session vault-write discipline didn't
already catch. Relying purely on "someone banks it as it happens" leaves a gap:
a correction or a surprise can pass without anyone stopping to write it down.
This step is that catch, run once per wrap, after the sections above have
settled what changed and before Link health/commit below locks the wrap in —
so anything mined lands in the same wrap commit, not a follow-up session.

Pattern borrowed from headroom's `learn` step; the implementation here is the
vault's own, no external dependency.

### Mid-session checkpoint — don't let wrap be the only catch (2026-08-05)

A long orchestration session can run for hours before wrap ever fires — a
correction or insight that surfaces mid-session and isn't banked immediately
is easy to misremember or drop by the time wrap finally reviews the whole
session from scratch. So this same three-lane review (below) isn't only a
wrap-time step: run it as a checkpoint roughly every 3rd resolved dispatch or
completed task-batch during a long session, not just once at the end.

The checkpoint is the same review, just earlier and more often — it does
**not** create a separate log, file, or review cadence. If the mid-session
pass finds something durable, write it immediately via `vault-write` (the
same `fleet/lessons/` or `projects/<name>/decisions/` destination the
end-of-wrap pass would use) — one banked lesson, whichever pass caught it
first. If it finds nothing, there's nothing to write; move on. Running the
checkpoint mid-session only shrinks what the end-of-wrap Learn pass still has
to mine — it never adds a second place lessons live.

Review the session across three lanes:

1. **Failed/errored/re-dispatched agent runs** — any run that didn't pass first
   try. What was actually wrong, and what fixed it?
2. **Operator corrections and mid-flight ruling changes** — anywhere the
   operator overrode a plan, corrected an assumption, or changed a ruling after
   it was first stated.
3. **Surprises** — bugs found, assumptions overturned, tool quirks (transcript
   evidence behaving unexpectedly, task-notification timing, journal entries
   that revealed something not already known).

For each item found in those three lanes, ask: **does a durable lesson exist
here that isn't already banked?**

- **Yes** → write it now, in this wrap, as a typed vault note per `vault-write`
  (right thing-then-aspect folder — `fleet/lessons/` for anything reusable
  across projects, `projects/<name>/decisions/` for a project-scoped call) —
  wikilinked and hub-linked per vault-write's graph-linking rule (see
  `vault-write`'s **Graph linking is part of the write** section — this step
  doesn't restate that mechanic, it just triggers it for whatever mining
  turns up).
- **No** — either it's already banked (a prior lesson/ruling already covers
  it) or it's purely situational (true only of this one session, no future
  session would benefit) — skip it, with a one-line reason either way.

**Output contract:** a short mined-lessons list on **each project `<name>-handover.md` this wrap
replaced** (not the cockpit), one line per item reviewed across the three lanes:

```
### Mined lessons (wrap learn step)
- Written: [[fleet/lessons/<slug>]] — <one-line what/why>
- Skipped (already banked): <what it was> — covered by [[<existing note>]]
- Skipped (situational): <what it was> — <why it won't recur>
- None found in <lane> this session
```

This list is the audit trail — the next session can check that mining
actually happened this wrap, not just that the checkbox was ticked.

