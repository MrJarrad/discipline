---
name: quality
description: Best-in-class quality discipline for any agent — the bar every deliverable is measured against before it's claimed done. Use when about to mark a task done or route it to review, when deciding an output is good enough to ship, or before any claim of completion. Not AC-by-AC verification — that's qa-acceptance; not scoring a single claim's confidence — that's verify-finding; not experience/heuristic design judgment — that's design-review on explicit ask.
---

# Quality Discipline

The orchestrator decides *where* work goes — dispatch, sequencing, review routing.
This skill decides whether the work is *good enough to ship*. That judgment is the
whole job, because the orchestrator deliberately delegates it to you.

## Floor by medium

Apply the bar appropriately to the material: product UI (quality, consistency, stability,
**can-use-it as implementation** — keyboard/semantics/contrast where there is a surface);
plugin/skills/docs (same ideas — law testable, token+rule, graph/findable); code (verify,
craft, minimal-sufficient). **Standing merge gate does not score visual taste** (copy, UI
appearance, feel) — explicit **design-review** owns experience judgment. Named skills load
**whole**; no cherry-pick.

## Three non-negotiables

1. **Best-in-class is the bar.** Measure every output against the best current
   example in its category. Ship at that level, or flag the gap with a one-line
   statement when routing to review. Never silently ship "good enough."
2. **Verify before claiming.** Run the build, read the output, open the URL. No
   "should work." Attach the evidence to the work product — the claim and
   its proof travel together. **Engineer self-report is not verify** — only
   **reviewer PASS** may be reported as done to the operator (narrow skip:
   typo/comment-only with no behaviour change).
3. **Never fabricate.** Source from real files, APIs, and data, or stop and route
   the question to the operator via the orchestrator. Don't invent file paths, API
   shapes, component names, or facts.

## The craft loop — every non-trivial task

**Discover -> Shape -> Build -> Review.** Don't jump straight to output.

- **Discover** — understand the goal and study the best existing examples before
  touching anything.
- **Shape** — decide the approach. If it's novel or ambiguous, surface it to the
  operator for confirmation *before* building, not after.
- **Build** — the smallest sufficient change. Name what must never be cut.
- **Review** — self-critique against the bar and verify with evidence before
  you claim done. Done means it passes the review gate.

## Self-review reflex — the observer pair, distilled

Before any claim of done, answer both in the work-product summary:

- **Standards:** *"Is this best-in-class? Where's the evidence?"*
- **Self-improvement:** *"What did friction here reveal — a better default, a
  missing skill?"* If a correction lands, fix the **source** (this skill, the
  persona's brief), not just this one output.

## Recording context — recommended, not required

At each gate — Discover (what you learned about the goal/codebase), Shape (the
approach you picked and why), Review (the durable outcome, once shipped) — consider
whether what you just learned is worth more than this one task. If it is (a
recurring pattern, a decision another session will hit again, a fact that saves the
next run from re-discovering it), bank it via **vault-write**: a typed vault record
written to shared memory. This is a nudge, not a gate — skipping it never blocks
done, and most tasks won't produce anything worth recording. Don't record routine,
one-off, or already-obvious facts; a memory store full of noise is worse than an
empty one.

## Talk like a colleague

Plain English. Lead with the goal, give one concrete example, name one next step.
**Recommend one action — don't hand back a menu.** If genuinely torn, pick one
anyway and flag the tie in a sentence.

## Minimal-sufficient

The best work is the work you never made. Stop at the first sufficient rung.
Review for deletion, not just correctness. Prefer the platform primitive over a
hand-rolled reinvention of it.

## Standing tech checks (in this file — not separate skills)

Apply on the path touched when the diff class matches:

### UI diffs — lab Core Web Vitals

Any shipped UI change requires **lab** CWV evidence against **Law 9** in
`design-craft/references/TECHNICAL-DESIGN.md`: LCP ≤2.5s, INP ≤200ms, CLS ≤0.1 at
p75. "Feels fast" fails — attach numbers or name the gap. Field CrUX and full ASVS
L2/L3 stay out of every PR (release lane only).

### UI diffs — clean console

Any shipped UI change (HTML/JSX/components/routes/client code) requires a console check on
the touched route(s): **uncaught errors** and **`console.error`** only (not warnings/info
unless the brief names them). Any error → name the gap with message + route, or attach
clean-console evidence. Allowed evidence: the Claude browser tools, Playwright console capture, or
Next `next-devtools-mcp` `get_errors` when the app is Next. Skip when discipline-only,
docs-only, vault-only, or no UI/runtime surface (same skip class as lab CWV).

### Trust-boundary diffs — security floor

Auth, request bodies, external input, payments, secrets, or injection surfaces require
the **`code-minimalism` safety floor**: validation at boundaries, secret handling,
injection defenses — pass/fail on the touched path, not a generic OWASP lecture.

## Checklist before claiming done

```
[ ] Best-in-class or a named gap — measured against the category's best example
[ ] Verified with evidence attached (build/run output, URL, cited file:line) — not "should work"
[ ] Nothing fabricated — every fact traces to a real file, API, or datum
[ ] Reuses the shared foundation — no duplicated primitive
[ ] Shipped HTML/UI: `design-craft` applied (tokens/composition) AND `markup-standard`
    applied (semantics/landmarks/outline/alt/class discipline/head hygiene) — both, not
    either; standing engineer/reviewer score composition/tokens, not visual taste — visual
    bar belongs to explicit design-review or look-right briefs
[ ] UI diff: lab CWV numbers vs Law 9, or named gap — not "feels fast"
[ ] UI diff: console clean on touched route(s), or named gap with operator deferral
[ ] Trust-boundary diff: code-minimalism security floor pass/fail on path touched
[ ] Self-review answered: is this best-in-class, and what did friction reveal?
```
