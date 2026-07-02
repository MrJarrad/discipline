---
name: issue-triage
description: Move a raw Paperclip issue to ready-for-agent — verify the claim, write a testable brief, or capture the rejection in the out-of-scope knowledge base. Use when an issue is vague, unverified, or you're deciding whether it's safe to hand to a doer agent.
---

# Issue Triage

Every issue that reaches a doer agent must clear a quality bar first. This skill is that gate: it turns a raw request into either a **ready-for-agent brief**, a **redirect for more information**, or a **durable out-of-scope record** — never a silent drop and never a guess dressed up as clarity.

Read [references/DOS-AND-DONTS.md](references/DOS-AND-DONTS.md) before triaging.

## The ready-for-agent bar

An issue is ready-for-agent only when all of these are true. If any one is missing, it is **not** ready — say which line failed instead of forcing it through.

- **Clear goal** — one sentence states what to build or fix, in plain language.
- **Acceptance criteria** — testable, checkable statements of done. "Works better" is not an AC; "returns 404 for an unknown id" is.
- **Right assignee** — the task matches the doer's lane (coder work to a coder, design work to a designer, research to a researcher). Wrong-lane assignment is a triage failure even if everything else is clean.
- **Scoped** — boundaries are explicit: what's in, what's explicitly out, what must not be touched.
- **Dependencies noted** — anything this issue is blocked by or blocks is named, so two agents never collide on the same surface.
- **No ambiguity** — a doer agent should be able to start without interviewing the reporter. If you had to guess at intent to write the brief, it isn't ready.

This bar is the same one `flux-quality`'s Discover→Shape→Build→Review loop assumes has already been cleared before Build starts — triage is what clears it. It also verifies the readiness that `paperclip-task-setup` builds toward when turning a plan into tasks: task-setup makes a task well-formed at creation time; issue-triage checks inbound, possibly messy, issues against the same bar before they're allowed through.

## Categorize before you verify

Every issue gets exactly one category, because it drives how you verify:

- **bug** — something is broken. Verify by reproducing it.
- **enhancement** — new capability or improvement. Verify by confirming feasibility in the repo.

And exactly one state:

| State | Meaning |
|---|---|
| `needs-triage` | Not yet evaluated |
| `needs-info` | Waiting on the reporter for missing detail |
| `ready-for-agent` | Clears the bar above — a doer agent can pick it up |
| `ready-for-human` | Needs human judgment a doer agent shouldn't make alone |
| `wontfix` | Will not be actioned |

If category and state seem to conflict (e.g., a "bug" that's really a feature request), stop and ask rather than pick one silently.

## Before recommending a state

1. **Check for redundancy.** Search the codebase for an existing implementation of the same concept — not just a keyword match on the issue title. If it's already built, that's `wontfix` (already implemented), not a fresh ready-for-agent.
2. **Check the out-of-scope knowledge base** (below) for a prior rejection of the same request. Don't re-litigate a decision that's already been made and recorded.
3. **Verify the claim.** For a bug, reproduce it or say plainly you couldn't. For an enhancement, confirm it's feasible in this codebase. An unverified bug claim is `needs-info`, never `ready-for-agent` — a strong brief needs a confirmed reproduction or feasibility note, not a hopeful restatement of the report.
4. **State your recommendation with reasoning**, including what you found in the codebase, and wait for confirmation before writing the final brief when the call is non-obvious. Skip the wait only when the issue is already unambiguous or someone has explicitly told you the target state.

## Writing the agent brief

Every `ready-for-agent` issue carries a brief with this shape:

```markdown
## Agent brief

### Summary
One paragraph — what to build or fix.

### Verification
What was confirmed — repro steps, code path, or feasibility note.

### Acceptance criteria
- [ ] AC 1 — testable
- [ ] AC 2

### Constraints
- Scope boundaries — what not to touch
- Any relevant prior decisions

### Codebase pointers
- Relevant modules or patterns (name the concepts, not an exhaustive file list)
- Suggested testing seam

### Open questions
None — or list blockers. If blockers remain, the issue is not ready-for-agent.
```

If you cannot fill in every section honestly, the issue is `needs-info` or `needs-triage` — not `ready-for-agent`. A brief with a blank Verification section, or an Open Questions list that isn't empty, is not a brief; it's a placeholder.

## The out-of-scope knowledge base

Rejected enhancement requests are recorded, not silently dropped and not just closed with a one-line comment — otherwise the same idea resurfaces every few months and gets re-litigated from scratch.

**When to write an entry:** only on `wontfix` for an **enhancement**. Never for bugs, never for already-implemented requests (those point at the existing code, they don't need a rejection record), never for "not now" deferrals that aren't actually decided against.

**Where:** one markdown file per rejection, in a durable location in the repo (e.g. `.out-of-scope/`) — durable meaning it survives the issue being closed or archived, and future triage passes can search it before recommending a state.

**Shape of an entry:**

```markdown
# <Short title>

**Rejected:** YYYY-MM-DD
**Issue:** <id, if applicable>

## Request
What was asked.

## Reason
The load-bearing rationale — why this won't be actioned.

## Alternatives considered
If any.
```

Link the entry from the closing comment so the decision and its reasoning travel together.

## When to redirect instead of triage

Not every request that lands in your lap is an issue to triage:

- **If someone is asking you to actually do the work** ("implement this," "fix the bug now"), that's execution, not triage — stay in your lane and hand off to the appropriate doer skill instead of triaging first.
- **If the issue is already well-formed** — clear goal, ACs, right assignee, scoped, dependencies noted — don't manufacture objections or extra process. Confirm it clears the bar and pass it through.
- **If the request needs fleshing out** before it can be verified at all (vague goal, no reproduction steps, unclear scope), that's a `needs-info` state with specific questions for the reporter — not a guess at what they meant.

## Resuming a triage in progress

If prior triage notes exist on the issue, read them first. Don't re-ask questions the reporter already answered. Check for new activity since the last pass and present the updated picture before recommending a state change.
