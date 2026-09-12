---
name: issue-triage
description: Move a raw issue to ready-for-agent — verify the claim, write a testable brief, or capture the rejection. Trigger on "there are discrepancies", "I noticed some issues", "a couple of things are off", any list of defects from the operator or an audit, or before handing any vague/unverified issue to a specialist. Not the fix itself — that's the assigned agent's job.
---

# Issue Triage

Every task that reaches a doer subagent must clear a quality bar first. This skill is that gate: it turns a raw request into either a **ready-for-agent brief**, a **redirect for more information**, or a **durable out-of-scope record** — never a silent drop and never a guess dressed up as clarity.

Read [references/DOS-AND-DONTS.md](references/DOS-AND-DONTS.md) before triaging.

## Part-name fidelity before a lane opens

Before a lane opens on a feedback row that names a physical/visual part or element,
resolve the term against the project glossary (`define-terms`) and quote it back to the
operator using **the name of the actual thing, wherever it's defined** — a layer,
component, class, token, style, or file — a confirmation is one line, never a question
menu. Never substitute the nearest-sounding existing name (ring/rim/lip/edge can be
different things); if the glossary doesn't already have their term, ask "which one?" —
don't guess it from a screenshot (hoverboard 2026-09-08). A feedback row about a
property the operator could settle in one line — a material or physical part, a code
convention, a library or approach, a behaviour, content, a data shape, a naming
choice — routes through `grilling`'s assumption gate before a lane opens.

- **DO:** "Row 4: `disc` edge (operator: 'the part that peeks out of the thruster')"
- **DON'T:** "Row 4: ring rim smoothing"

**Crop before lane.** Before a feedback row opens a lane, reproduce the operator's framing —
crop, viewport, lighting mode — and name the part visible in it. When an ask can move two
mechanisms with different costs, the row names both and the operator picks.

**One ask may be two levers.** "Make it bigger" can mean the frame token or the content scale;
splitting it into two rows and pricing each is the triage, not the doer's guess.

## Designed means build — adjust vs clean-rebuild

When a defect set is against a design that already answers the question (Figma or an
authored brief), classify the slice before writing the brief — this decides whether the
brief is an adjustment or a rebuild, not something the doer discovers mid-build:

- **Value conform** (a color, spacing, copy string, or single-property delta) →
  **adjust slice** against the existing implementation.
- **Structural or compositional divergence** (anatomy differs, not just values) **or**
  three-plus stacked adjustment slices already landed on the same surface → **clean-rebuild
  slice**, built fresh from the Design Handoff export + read sequence, treating the
  existing implementation only as wiring reference (routes, data, motion hooks) — never as
  the structural base. **Fresh means fresh:** the brief names the export and the wiring loci
  only; it never names the existing component as the file to start from, and a rebuild that
  edits that file in place is not a rebuild.
- **The design is the decision.** An element placed in the authored layouts is a build
  mandate, not an open question to escalate. Escalate only what the design genuinely
  doesn't answer — a design-answered question is never an operator escalation.

Source: operator ruling `fleet/rulings/designed-means-build.md` — "it's in the designs it
should be built. I think often we spend time adjusting things [that are] existing when it
will probably be faster just to rebuild clean." (`dispatch-brief` briefs the resulting
slice; this skill owns the classification call.)

## The ready-for-agent bar

An issue is ready when the claim is verified, the fix is testable, and the brief names the
contract rather than restating it. Anything short of that is triaged further or written up
as a rejection with the reason — never handed to an agent as-is.

The full bar, how to categorize before verifying, what to check before recommending a
state, the agent-brief template, the out-of-scope knowledge base, the redirect rules, how
to resume a triage in progress, and the five intake buckets:
[TRIAGE-PROCEDURE.md](references/TRIAGE-PROCEDURE.md).

Read [DOS-AND-DONTS.md](references/DOS-AND-DONTS.md) when applying this skill.
