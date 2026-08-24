# Do's and Don'ts — shape-stress

---

## Do

### Six-section workflow

| Do | Why |
|----|-----|
| Shape from **conversation context** first | An external scoping doc is optional, not a gate |
| Run the **stress loop** until the finished checklist is green | Coverage before the shape is treated as done |
| Run a **`grilling` cycle** each stress loop iteration | Shared interview primitive; don't reinvent it here |
| **Surface contradictions** immediately; log them until resolved | Silent overwrites break trust in the shape |
| Use all **six sections** every time | Matches the shape every downstream consumer expects |
| Tag **Assumption** vs **Confirmed** in the draft | Honest thin context beats invented certainty |
| Check **Outcomes ↔ Acceptance Criteria** alignment every cycle | Outcomes are value; ACs are the verifiable bar for that value |
| Check **Out of Scope** against Outcomes and ACs every cycle | Scope exclusions that contradict the shape are a bug, not a detail |
| Stop at **checklist green + user sign-off** | That's the actual finish line, not "looks done" |

### Interview mode (via `grilling`)

| Do | Why |
|----|-----|
| **Load `grilling`** for interview mode — frontier rounds, experience questions | One primitive; experience altitude is non-negotiable |
| Patch the six-section draft after each grilling round | Answers feed the shape, not a separate artifact |
| Ask what to stress-test when "grill this" arrives with no plan | Can't walk a tree that doesn't exist yet |
| Stop at **shared understanding** — frontier empty + confirm | Not every micro-decision needs resolving before build |

---

## Don't

### Six-section workflow

| Don't | Why |
|-------|-----|
| **Treat v0 as finished** without running the stress loop | Skips the quality gate this skill exists to enforce |
| **Reimplement grilling** in this skill | Duplicates the primitive; drifts from experience altitude |
| Run a **blank-slate requirements interview** | Wrong tool — stresses an existing draft, not zero-to-one discovery |
| Put **implementation seams** in project-level ACs | Wrong artifact layer |
| Invent **Confirmed** facts without tagging Assumption | Misleads whoever reads the shape next |
| **Silently overwrite** a Confirmed fact | Surface as contradiction instead |
| Restate **`quality`'s** bar here | This skill feeds Shape; it doesn't redefine "best-in-class" |

### Interview mode

| Don't | Why |
|-------|-----|
| Ask **engineering fork** questions | Operator is a designer — `grilling` reframes as experience |
| Run the full interview on a **bugfix or clear implementation request** | Out of scope |
| Assume a detailed plan exists when the user gave none | Clarify what to stress-test first |
| Start building or editing code during the interview | Stress the plan, not implement |

---

## Branch-specific

### Thin context only

**Do:** Draft v0 from the thread; mark assumptions; let the stress loop run
`grilling` on open branches.

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
3. **`grilling` round** — frontier questions + recommended answers (experience altitude).
4. **Patch** — what changed in the draft once answered, and how it's tagged
   (Assumption / Confirmed).

---

## Examples

**Good:**

```
Section: Acceptance Criteria
Checklist: 5/8 green — ACs and Out of Scope not yet cross-checked

Grilling (frontier round):
❓ Q1 — Sync direction
The draft says inventory can only increase, but Out of Scope excludes real-time
bidirectional sync. When warehouse and shop disagree, does the shop always follow
the warehouse on the next batch, or does someone get alerted?

➡️ Recommended: Shop follows warehouse on batch sync only; no real-time either way.

Patch: Added AC "sync direction is one-way, warehouse -> shop, batch only"
(Confirmed). Checklist now 6/8.
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

**Bad — engineering question:**

```
Should we use optimistic locking or last-write-wins for conflict resolution?
```

**Good — same decision, experience altitude:**

```
If two people edit the same record at once — does the later save win silently,
or do we stop and show what changed?
```

**Bad — grilling a bugfix:**

```
User: Fix the TypeScript error in utils.ts line 42.
→ Let's stress-test your plan for shared understanding...  ❌
```
