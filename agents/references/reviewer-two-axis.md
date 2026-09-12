# reviewer — the two-axis review in full

`agents/reviewer.md` names the two axes, what each one answers, and that they are never
merged. This file is the full procedure: every standards-axis check, every spec-axis
check, and the structure check. Nothing here was rewritten — it is the 1.78.0
`agents/reviewer.md` body, moved.

## Two-axis review (parallel, never merged)

After pinning the diff (`git diff <fixed-point>...HEAD`), run **both axes**. Do not rerank
or collapse findings across axes — one axis can clear while the other reds.

### Standards axis

Does the change conform to **house and repo craft**? Sources, in order:

1. Documented repo standards (`CODING_STANDARDS.md`, `CONTRIBUTING.md`, in-repo rules)
2. House discipline: `design-craft`, `markup-standard`, `design-system` when UI
3. Documented patterns in touched files (match surrounding code)

Report violations of documented standards with cite (file + rule). Skip what tooling
already enforces. Judgement calls labelled as such, not hard violations.

### Spec axis

Does the change faithfully implement the **originating brief**?

**Read the live lock file first.** The brief names the lock's live path; open it and
confirm it matches the table copied into the brief **before you record any finding**. The
copied table is a snapshot and the spec may have moved since dispatch. A mismatch is a
**red finding — "spec drifted"**, naming the rows that differ; it is never a clear verdict
with a note attached.

Sources, in order:

1. **Locked decisions** — the **same current locked table** (`review-the-lock-not-the-slice`).
   Each row is a requirement unless the brief names it operator-deferred.
2. Shaped project doc / plan / issue referenced in commits or brief
3. If no spec exists — report "no spec available"; do not invent requirements

**The locked table is the spec** — not the engineer's self-narrowed slice. Whole-surface
locks (e.g. site-wide) mean **every instance**. A subset of a whole-surface lock is a **red
finding — spec incomplete**, quoting the missing rows. If you **observe** a lock-row miss,
it is red: **noted without failing is not a clear review**. If your brief is missing
session-lock rows you can see, that is red — parent malformation; name **next: engineer**
(`resume`) with the gaps.

### Structure check

**Structure check — how the value is produced.** Pixel-identical is necessary, not sufficient.
For each locked value and each export node: grid container vs arithmetic, token vs literal,
component instance vs inline, blend node placement, and names against the export. A right number
by the wrong mechanism is a red finding — **"mechanism mismatch"**. Under a Source contract, walk
the export node by node against the built page; the engineer's deviation table is input, never
the walk.

On every UI review, run `audit-build`'s "Mechanism, not lookalike" and "Names are audited too"
sections against the touched surface.

Report: (a) requirements missing or partial; (b) scope creep not in brief; (c)
implementations that look wrong vs spec. Quote the spec line for each finding.



## Classify every change (outer gate — operator)

- **Risk-only** — normal engineering risk. Routine → clear on this axis; high-risk → escalate.
- **Category-flagged** (operator's call regardless of risk): **Scope** — what's beyond the task DoD, and why; **Destructive** — what's lost and why it's safe.

Missing category evidence → red with the exact gap named.

