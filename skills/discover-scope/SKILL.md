---
name: discover-scope
description: Turn a raw ask into a validated scope through gather → research → validate cycles growing a living SCOPE doc. Trigger on "new concept", "I'd like to explore", "there will likely be a large amount of updates", "I'm reconsidering a few things", starting any client or product discovery, or when requirements are clearly still forming mid-conversation. Not for shaping a settled idea into a plan — that's shape-stress.
---

# Discover Scope

Build a **scope**, iteratively — not a shaped plan, not code. Each cycle: gather →
research (readonly) → validate → update the living SCOPE doc. This is the
**Discover** phase of `quality`'s craft loop (Discover -> Shape -> Build ->
Review): understand the problem and study what's real before anything gets
proposed or built.

Read [references/DOS-AND-DONTS.md](references/DOS-AND-DONTS.md) when applying this
skill — quick-reference tables, branch-specific guidance, and a worked example.

## Where this sits

`discover-scope` owns exploring and validating the *problem* — turning a raw ask
into a SCOPE doc that's honest about what's known, assumed, and still open.
`shape-stress` (a sibling skill) owns *converging* a shape from context that's
already gathered — six sections, stressed until a finished checklist is green.
**Boundary: `discover-scope` feeds `shape-stress` — discovery produces the
validated SCOPE that shaping then converges into a finished, buildable plan.**
Don't shape inside this skill; don't restart discovery inside `shape-stress`.

## The discovery cycle

One lap: **Gather** -> **Research** (when it beats asking) -> **Validate** new
facts against the SCOPE doc -> **Update** the doc -> optional **Ideas backlog**.
Repeat every session until shaping readiness, or until the user pauses.

Track cycles plainly:

```
Discover scope - <initiative>
- [ ] Gather - stakeholder input captured
- [ ] Research - launched (if warranted) or skipped with reason
- [ ] Validate - new facts checked against SCOPE.md
- [ ] Update - SCOPE.md written/refreshed
- [ ] Ideas - backlog updated (if any)
- Open questions: N
- Contradictions: N
```

### 1. Gather

Pull details from the user — pasted notes, transcripts, a raw ask. **One focused
question at a time**, or a short batch of 2-3 tightly related ones — never a
requirements questionnaire. If the user pasted raw material, extract what it
already answers before asking anything new.

Tag every answer as you take it in:

| Tag | Meaning |
| --- | ------- |
| **Confirmed** | Stated explicitly by the user/stakeholder |
| **Assumed** | Reasonable inference — needs validation |
| **Open** | Genuinely unknown — goes to Open questions |

**Done when:** this cycle's new facts are listed and the next question (if any)
is named.

### 2. Research open questions (readonly)

When a real source can answer an open question faster or more reliably than
asking — codebase constraints, existing docs, public market facts, technical
feasibility — go research it instead of guessing or asking the user something
you can look up yourself. Keep it readonly: this step explores and reports, it
never writes code or scope decisions on its own.

Fan out across independent lanes (codebase, docs, market, feasibility) rather
than one serial lookup — parallel research subagents work well here. Follow
`quality`'s never-fabricate bar: **source every finding, or flag it as
still open** — never invent a fact, a file path, or a number to fill a gap. For
the research method itself (decompose, fan out, source-or-stop, adversarially
verify, synthesize with confidence), use `research-synthesis` (WebSearch +
WebFetch). Don't restate the method here — just apply it.

Merge findings into the SCOPE doc yourself; don't paste raw research dumps in.

**Done when:** research findings are merged (with sources) or skipped with a
one-line reason ("nothing to look up yet").

### 3. Validate (on every new fact)

Whenever new context arrives — a reply, a research finding, a correction:

1. Read the current SCOPE doc (or start one from the structure below if this is
   cycle one).
2. Cross-check the new fact against existing **Confirmed** facts and
   **Assumptions**.
3. On **contradiction**, surface it immediately: *"Earlier we had X (confirmed),
   now Y — which wins?"* Log it under Contradictions until resolved.
4. Downgrade Assumptions that new evidence disproves. Promote Assumed ->
   Confirmed only on explicit confirmation — never on inference alone.

Never silently overwrite a Confirmed fact.

**Done when:** contradictions are flagged, or "no conflicts" is stated briefly.

### 4. Update the SCOPE doc

A SCOPE doc is a **living artifact** — it grows and gets corrected every cycle,
it is not written once and filed away. Keep these sections:

| Section | Contents |
| ------- | -------- |
| **Summary** | 2-4 sentences: what's being discovered, current confidence |
| **Problem (confirmed)** | Only Confirmed facts — what pain actually exists |
| **Goals** | Numbered; each tagged `[confirmed]` or `[assumed - validate]` |
| **Non-goals** | Explicit out-of-scope — prevents scope creep |
| **Users & stakeholders** | Who cares, who decides, who uses |
| **Constraints** | Timeline, budget, compliance, technical, political |
| **Assumptions** | Table: assumption / status (unvalidated, validated, rejected) / evidence |
| **Open questions** | Table: question / owner / blocking? |
| **Ideas backlog** | Table: idea / source (user, research, agent) / notes — not committed |
| **Contradictions** | Table: was / now / status — unresolved only |
| **Research log** | Brief bullets: cycle date, lane, one-line finding + source |
| **Shaping readiness** | The checklist below, checked off as it clears |

Keep it tight — under ~200 lines; link out to deep research rather than pasting
it inline. Merge this cycle's deltas rather than rewriting the doc from scratch.

**Done when:** the doc is saved and the user sees a 3-5 line delta summary of
what changed this cycle.

### 5. Ideas (optional)

When research or conversation surfaces an option nobody has committed to, file
it in **Ideas backlog** — never in Goals. Research may propose ideas; only the
user's explicit commitment moves something into Goals.

**Done when:** new ideas are tagged with a source, or "none this cycle."

### 6. Next cycle or exit

- **More to learn** -> ask the single highest-leverage open question; loop again.
- **User says it's ready to shape/build** -> run the shaping readiness checklist;
  if gaps remain, name them plainly; if it's clear, hand off to `shape-stress`.

## Shaping readiness (exit bar)

Scope is ready to hand to `shape-stress` when:

- [ ] Problem statement is **Confirmed** (one paragraph)
- [ ] At least one **Goal** is confirmed; **Non-goals** are explicit
- [ ] No unresolved **Contradictions**
- [ ] **Open questions** are either answered or explicitly deferred with an owner
- [ ] Real constraints are captured (timeline, budget, compliance, technical —
      whatever applies)

Thin context is not a reason to stop early — tag more as Assumption and keep
looping. It's also not a reason to stall: if the user wants to shape early with
known gaps, name the gaps and let them decide.

## Living vs. done

A SCOPE doc is "living" for as long as discovery is active — it should be edited
in place, cycle over cycle, with deltas surfaced each time, never silently
rewritten. It's "done" (for this phase) only once the shaping readiness checklist
is fully green *and* the user has signed off — at that point it hands off to
`shape-stress` and stops changing under this skill. If new facts surface after
handoff, that's a new discovery cycle, not a shaping edit.
