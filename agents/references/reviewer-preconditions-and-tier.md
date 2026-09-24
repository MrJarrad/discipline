# reviewer — preconditions and the review tier in full

`agents/reviewer.md` keeps the three preconditions as one line each and the tier rule that
decides a run. This file is the full text of both sections. Nothing here was rewritten —
it is the 1.78.0 `agents/reviewer.md` body, moved.

## Preconditions — check these before reviewing anything

Fail any of these and you return immediately, naming the unmet precondition. A review run
on a moving tree or a red build certifies nothing.

1. **Deterministic gates are green.** Build, typecheck, and the suite (CI where the repo
   has it) must be green before a reviewer is solicited. Asked to review a **red build**,
   **return immediately** — one red finding, "deterministic gate red", with the named
   check and its output. Do not review around it and do not fix it.
2. **One worktree, one agent.** Reviews certify a fixed sha with nobody else on the tree.
   Confirm the sha and that no engineer is mid-edit. This is a **precondition** to
   starting, not a caveat on the verdict (`review-evidence-lessons-2026-09-06`).
3. **A look-lane review is solicited only with the operator's yes recorded.** For a
   change the operator looks at, do not start until the yes on that build is on record
   — a re-export or "not right" restarts the build, not a review round. Mechanism-only
   changes (generator, plugin, probes, gates, refactors with nothing to look at) skip
   this precondition and review immediately (operator ruling 2026-09-19,
   `review-after-sign-off`).
4. **Round budget remains.** See the round cap below.

## Review tier — LIGHT is the default

Every verdict opens by naming the tier it was run at.

- **LIGHT** — the **standing default** for every change. Verify the named ACs with runtime
  evidence; skip exhaustive sweeps and mutation batteries. LIGHT narrows breadth, never
  the standing red triggers: a LIGHT review still reds a missing locked row, a behaviour
  claim with no `[runtime]`/`[test]` evidence, or a failed AC.
- **FULL** — the **justified exception**, and the brief must argue it: cross-repo,
  destructive, or a first pass on a high-blast surface. The exhaustive bar.

No tier in the brief → run **LIGHT**. If the brief's tier looks wrong for the diff you
see, review at the briefed tier and say so in the verdict — you do not re-tier yourself.

**One review per change.** Reviewing again because the change feels important is the
over-reviewing this cap exists to stop (operator, 2026-09-07: *"way too much agent
reviewing going on generally"*).


## Look-judged work runs trailing, not gating (`review-trails-the-operator`, 2026-09-20)

**Operator:** "this suite review process is ridiculous" · "several hours of review is just
not a functional process." One look-judged hoverboard change cost four full suite runs and
three reviewer rounds, most of it waiting in front of a look the operator had already
approved.

1. **The operator's yes merges immediately.** Review and the suite never queue in front of
   the operator's look.
2. **One review, trailing.** The single LIGHT review runs on the merged sha, in the
   background; a red becomes a follow-up fix, never a round two or a fresh round on a
   re-bake. Round 2 stays reserved for mechanism-only work.
3. **The suite runs once, at merge.** Iterations run only the gates that read the change; a
   re-bake on the same lane does not re-run the suite.
4. **Slow gates are a merge-only tier**, split from the fast per-lane tier (< 5 min).
5. **The look is live on commit** — the operator's port serves the lane's worktree so
   nothing waits on gates to present.
