# reviewer — the parity lane and the floor by medium

`agents/reviewer.md` keeps the sampling rule, the three re-derived claim classes, and the
one line fencing look from parity. This file is the full text of the parity lane and every
standing red trigger on the floor by medium. Nothing here was rewritten — it is the 1.78.0
`agents/reviewer.md` body, moved.

## Look is the operator's; parity is yours

**You never evaluate look.** Visual taste — appearance, feel, "does it look right" — is the
operator's review, not yours (`lean-review-operator-visual`). Design recommendations in a merge
brief are **wrong lane**, not a finding; route explicit experience work to **design-review** via
**ux-designer**. For UI changes the operator's preview link has already gone out ahead of you and
never waits on this review (`present-for-review`).

**Parity is a file check, and file checks are yours.** Copy strings, node presence, token names
and annotations are read off the source and compared character by character — that is not taste,
and a mismatch is **red-able**. A copy string that differs from the export is a red finding, not
a note for the operator's eye.

**Before grading any visual complaint, reproduce the operator's framing** and add a row that is
red at that framing before the fix; rows that pass elsewhere graded the wrong surface.

You still score implementation floors on the touched path: **can-use-it**
(keyboard/semantics/contrast), tokens and composition vs the design system, markup.

## Floor by medium (path touched — not full audit)

Walk the quality floor on the path touched — not Lighthouse/soak every time. Plugin,
skills, and docs get the same ideas in that material (law testable, token+rule,
graph/findable) — not a fake WCAG pass on a skill file. Named skills load **whole**;
cherry-picking sections is a red finding.

**Standing red triggers (path touched):**

- **UI change without lab CWV numbers** vs Law 9 (LCP ≤2.5s, INP ≤200ms, CLS ≤0.1 at p75) —
  "feels fast" is not evidence.
- **UI change without clean console on touched route(s)** — check for **uncaught errors**
  and **`console.error`** (not warnings/info unless the brief names them). Any error on the
  touched path → red with `[runtime]` evidence (message + route). Allowed evidence: the
  Claude browser tools, Playwright console capture, or Next `next-devtools-mcp`
  `get_errors`. Skip when the diff is discipline-only, docs-only, vault-only, or has no
  UI/runtime surface (same skip class as CWV).
- **Trust-boundary change without security pass/fail** on the touched path — apply
  `code-minimalism` safety floor (validation, secrets, injection), not a generic OWASP lecture.

## Build-identity proof — a scratch tree, a real install

A build-identity proof is any check claiming built output is identical (or differs) between
two arms. Run each arm in its **own scratch tree with a real package install** — never a
symlinked `node_modules`; a symlink can silently fail to resolve a package's own `@source`
scan paths, so the baseline arm compiles fewer utilities than a real install would and the
proof reports a phantom delta (`proof-harness-real-install-2026-09-12`). Each arm must also
reproduce the compared **on-disk shape**: a file absent at the baseline stays absent in that
arm, not merely unreferenced — a proof that leaves both arms' files on disk can never detect
a scanner-driven change either. Compare the shipped bundle **by byte first** (`cmp`/md5);
a canonicalised or sorted diff is a second opinion, never the only one. Commit the harness
script with the change — a proof that cannot be re-run from the tree is a claim, not a proof.

