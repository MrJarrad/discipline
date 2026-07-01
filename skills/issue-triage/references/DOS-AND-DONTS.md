# Do's and Don'ts — issue-triage

---

## Do

| Do | Why |
|----|-----|
| **Verify** the bug repro or enhancement feasibility before recommending ready-for-agent | Strong briefs, not hopeful restatements |
| Check **redundancy** in the codebase by domain concept, not just title keywords | Avoids duplicate work |
| Check the **out-of-scope knowledge base** for prior rejections | Avoids re-litigating settled decisions |
| **State your recommendation with reasoning** and wait for confirmation on non-obvious calls | Keeps a human in the loop on judgment calls |
| Write the **full agent brief** (summary, verification, ACs, constraints, pointers, open questions) for ready-for-agent | That's the contract a doer agent needs to start without an interview |
| Record a **wontfix enhancement** in the out-of-scope KB with the load-bearing reason | Durable memory beats a one-line close comment |
| **Re-check prior triage notes** before asking the reporter anything | Don't waste their time re-asking what's already answered |
| Pick the **right assignee lane** as part of the readiness bar | Wrong-lane assignment stalls work even when everything else is clean |

---

## Don't

| Don't | Why |
|-------|-----|
| Apply **ready-for-agent** without a full brief | Doer agents start guessing, or stall |
| Write an out-of-scope entry for an **already-implemented** request | KB is for rejected enhancements, not shipped work |
| **Re-ask** questions already answered in prior triage notes | Wastes the reporter's time |
| **Implement** during triage | That's execution — stay in your lane, hand off instead |
| Skip **verification** on a bug claim | An unverified bug is `needs-info`, never ready-for-agent |
| Leave **open questions** on a brief marked ready-for-agent | Any blocker means the issue isn't ready yet |
| **Manufacture objections** on an issue that already clears the bar | Pass well-formed issues through; don't invent process |

---

## Branch-specific

### When the issue is a bug claim

**Do:** Reproduce it, or say plainly you could not. Attach the repro (command, steps, or code path) to the brief's Verification section.

**Don't:** Mark ready-for-agent on an unconfirmed report — that's `needs-info`.

### When the issue is an enhancement request

**Do:** Confirm feasibility in the actual codebase — check what exists, what it would take to add.

**Don't:** Assume feasibility from the title alone.

### When the issue duplicates rejected past work

**Do:** Surface the existing out-of-scope entry, link it, and recommend `wontfix` (or `needs-triage` if circumstances have genuinely changed).

**Don't:** Re-run the same debate from scratch.

### When asked to actually do the work, not triage it

**Do:** Recognize this is execution, not triage — redirect to the doer skill or agent whose lane it matches.

**Don't:** Start implementing under the issue-triage banner.

### When the issue is already well-formed

**Do:** Confirm it clears the readiness bar and pass it through as ready-for-agent.

**Don't:** Invent extra questions or process just to look thorough.

---

## Output format

State, for every issue you triage:

1. **Category + state** — one of each, with one-sentence reasoning.
2. **What was verified** — repro, feasibility check, or redundancy search, with what you found.
3. **Outcome** — the brief (if ready-for-agent), the specific questions (if needs-info), or the out-of-scope entry (if wontfix enhancement).
4. **Next step** — who or what picks this up next.

---

## Examples

**Good:**

```
Category: bug. Verified repro: steps 1-3 reproduce the 500 on empty payload.
No existing fix in codebase (checked error-handling module). No prior
out-of-scope entry. State: ready-for-agent. Brief attached with ACs,
verification, and testing seam.
```

**Bad:**

```
Looks like a real bug from the title. Marking ready-for-agent.
```

No repro, no brief, no check for an existing fix — this is a guess dressed up as a decision.
