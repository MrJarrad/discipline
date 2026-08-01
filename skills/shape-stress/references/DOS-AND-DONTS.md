# Do's and Don'ts — shape-stress

---

## Do

### Six-section workflow

| Do | Why |
|----|-----|
| Shape from **conversation context** first | An external scoping doc is optional, not a gate |
| Run the **stress loop** until the finished checklist is green | Coverage before the shape is treated as done |
| Run an **interview-mode cycle** each stress cycle — one question + one recommendation | Shared interview mechanic; don't reinvent it here |
| **Surface contradictions** immediately; log them until resolved | Silent overwrites break trust in the shape |
| Use all **six sections** every time | Matches the shape every downstream consumer expects |
| Tag **Assumption** vs **Confirmed** in the draft | Honest thin context beats invented certainty |
| Check **Outcomes ↔ Acceptance Criteria** alignment every cycle | Outcomes are value; ACs are the verifiable bar for that value |
| Check **Out of Scope** against Outcomes and ACs every cycle | Scope exclusions that contradict the shape are a bug, not a detail |
| Stop at **checklist green + user sign-off** | That's the actual finish line, not "looks done" |

### Interview mode

| Do | Why |
|----|-----|
| Ask **exactly one question** per response | Multiple at once lets the user cherry-pick the easy branch and skip the hard one |
| Pair every question with **your recommended answer** | A bare question isn't a stress-test — the user needs something concrete to react to |
| Walk the **design tree** one branch at a time | Parent decisions (auth model, data ownership) constrain children (sync strategy, UI states) |
| Wait for the answer before asking the next question | One-at-a-time is the entire mechanism |
| **Explore the codebase** first when the answer is discoverable in code | Don't ask the user to restate what a `grep` would show you |
| Ask what to stress-test when "grill this" arrives with no plan | Can't walk a design tree that doesn't exist yet |
| Stop at **shared understanding** — major branches resolved | Not every micro-decision needs resolving before build starts |

---

## Don't

### Six-section workflow

| Don't | Why |
|-------|-----|
| **Treat v0 as finished** without running the stress loop | Skips the quality gate this skill exists to enforce |
| Ask **multiple stress questions** in one turn | Breaks the interview mechanism this loop depends on |
| Run a **blank-slate requirements interview** | Wrong tool — the six-section loop stresses an existing draft, not zero-to-one discovery |
| Put **implementation seams** (file paths, module names, slice-template sections) in project-level ACs | Wrong artifact layer — those belong one layer down, in the build slice |
| Invent **Confirmed** facts without tagging Assumption | Misleads whoever reads the shape next |
| **Silently overwrite** a Confirmed fact when new context contradicts it | Surface it as a contradiction instead |
| Restate **`quality`'s** bar here | This skill feeds Shape; it doesn't redefine "best-in-class" |

### Interview mode

| Don't | Why |
|-------|-----|
| Ask multiple questions in one message | The core anti-pattern this mode exists to prevent |
| Run the full interview on a **bugfix or clear implementation request** | Out of scope — that's normal work, not a plan to grill |
| Assume a detailed plan exists when the user gave none | Clarify what to stress-test before opening a design-tree walk |
| Ask the user something the codebase already answers | Wastes their time and skips legwork you could do yourself |
| Start building or editing code during the interview | The job is stress-testing the plan, not implementing it |

---

## Branch-specific

### Thin context only

**Do:** Draft v0 from the thread; mark assumptions; let the stress loop surface
gaps one question at a time.

**Don't:** Block on a missing scoping document as a hard gate before drafting.

### User says "skip stress" / "ship this now"

**Do:** Name what's not green in the checklist once, then proceed if they insist.

**Don't:** Refuse without saying why, and don't re-litigate it a second time once
they've overridden it.

### Draft already looks complete

**Do:** Run the checklist anyway — "looks complete" and "checklist green" are not
the same claim.

**Don't:** Skip straight to sign-off because every section has words in it.

### A contradiction surfaces mid-loop

**Do:** Stop, name both claims plainly ("earlier this said X, now Y — which
wins?"), and resolve before patching further.

**Don't:** Pick the newer claim silently and keep going.

---

## Output format

Each stress cycle, state:

1. **Section under stress** — which of the six, and what's open in it.
2. **Checklist state** — which of the 8 finished-checklist items are green, which
   aren't.
3. **The one question** — via interview mode, with its recommended answer.
4. **Patch** — what changed in the draft once answered, and how it's tagged
   (Assumption / Confirmed).

---

## Examples

**Good:**

```
Section: Acceptance Criteria
Checklist: 5/8 green — ACs and Out of Scope not yet cross-checked

Question (via interview mode): The draft says "warehouse data can only increase
inventory" as an AC, but Out of Scope excludes "real-time bidirectional sync."
Does that mean one-way batch sync only, no real-time in either direction?

Recommended answer: Yes — one-way, batch, warehouse-to-Shopify only.

Patch: Added AC "sync direction is one-way, warehouse -> Shopify, never the
reverse" (Confirmed). Checklist now 6/8.
```

**Bad — ships v0 without stressing:**

```
Here's the shaped project: Context, Outcomes, ACs, Constraints, Out of Scope,
References. Looks good — publishing now.
```

**Bad — AC smuggles in implementation:**

```
Acceptance Criteria:
- Update src/jobs/inventory-sync.ts to run every 5 minutes
- Add unit tests in __tests__/sync.test.ts
```

**Bad — batched stress questions:**

```
What's the sync direction? Also, what's the rate limit? And should Out of Scope
mention historical reconciliation?
```

### Interview mode examples

**Good:**

```
Real-time sync needs a single user identity across devices first.

How should users sign in so todos stay attached to one account on every device?

My recommendation: require sign-in from day one with OAuth (Google + Apple);
skip anonymous-only mode unless offline-first is a hard requirement.
```

**Bad — batched questions:**

```
What's your auth strategy? And how will you handle conflicts? Also what database?
```

**Bad — grilling a bugfix:**

```
User: Fix the TypeScript error in utils.ts line 42.
→ Let's stress-test your plan for shared understanding...  ❌
```
