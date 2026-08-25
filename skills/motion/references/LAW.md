# Motion law — shape and load order

The **motion skill** does not own a site's motion law. It reads, implements, and reviews against whatever law is in play. Craft (frequency, easing, t90, springs, GPU, accessibility) lives in this skill's Build section. **Law** is the product- or reference-specific contract: sequencing grammar, type-enter recipe, clocks, chrome rules.

House law for JHD web products lives with the product, not this plugin:
`~/JHD/design-system/main/motion-law.md` (`MrJarrad/jhd-design-system`) — the
`design-system` skill points there. Captured reference law: capture folder →
`motion-law.md`. Product-specific law: brief, vault decision, or product repo doc named
in the dispatch.

---

## Load order

Resolve the active law **before** authoring or reviewing motion:

1. **Brief or capture folder** — if the dispatch names a reference path or banks `motion-law.md`, that instance is authoritative for this job.
2. **House law** — JHD web products (`portfolio`, `skillz`, future house-system consumers): load `~/JHD/design-system/main/motion-law.md` — the `design-system` skill points there; the plugin does not carry a local copy.
3. **Product repo doc** — if the product names a motion-law file (e.g. `site-tempo.ts` + vault decision), load that when the brief says so.
4. **Unobserved** — if no law is loaded, apply craft only. Do **not** invent overlap rules, clip-wipe recipes, or clocks. Say law unobserved; do not claim parity.

Review **Blocks against the loaded law** when one is present. Craft defect classes (flash-before-enter, hidden-complete, pause-stack, recipe-not-live) Block regardless of law.

---

## Law shape (any instance)

A complete motion law documents the following. Rows may be marked **observed** or **inferred** in captures; **locked** in house/product law.

| Section | What it states |
| --- | --- |
| **Families — overlap** | When two animations are *different families* in one sequence, does the follower start while the leader is still travelling? If the law defines overlap, does it require the follower delay strictly between **0** and the leader's duration — i.e. **follow**, not start-together? What does it name as a defect (perceptible gap, simultaneous start, exclusive handoff)? |
| **Siblings — pile** | When *identical siblings* run the same animation, what is the stagger step (typically 4–20% of item duration)? Siblings pile; they do not queue with a full handoff. |
| **Visual raster** | For choreographed sibling sets: columns **left → right**; within a column, **top → bottom**. **Unit = cell contents** (line, card, tile) — not glyphs inside a line. Defects: **raster-soup**, **glyph-stagger**. |
| **Clear the stage** | Before the next *readable* family appears, must extras be gone / slot driven to floor? No finished content readable under leftovers? |
| **Hold still** | Which element holds position and changes only exposure (dim/brighten) while others move? |
| **Type enter** | Mechanism for entering type (e.g. clip-wipe with hard overflow + rise, fade, scale-in). Recipe: duration, stagger step, travel %, easing — bound to tokens where the system provides them. |
| **Clocks** | Named durations and delays per family (nav load, content enter, route transition, hover). Map to design-system tokens when house law applies. |
| **Cold vs in-app** | If the law distinguishes reload from in-app navigation, state both gates explicitly. |
| **Scroll / chrome** | If the law covers scroll-linked header, floor bars, secondary nav — state mechanism (opacity fade, fixed, no replay). Omit if not in scope. |
| **Route / hero** | If the law covers page transitions (flight duration, perspective, breath before wipe) — state explicitly. Omit if product-specific and not in this law. |
| **Evidence** | Captures cite engine + artifact (`motion-samples.json`, tape, `capture-motion-source` spec). Canvas/WebGL sites cannot complete law from CSS clocks alone — tape required. |

---

## Implementing from law

- Import clocks from the law's token map or product tempo module — never hand-copy ms into components when a law + token path exists.
- Sequencing helpers (overlap, pile, raster) must match the loaded law's rows, not craft defaults alone.
- When house law and a capture disagree, the **brief** decides which instance applies — the skill does not merge them silently.

---

## Reviewing against law

When a law is loaded:

- **Block** any row the implementation violates (overlap, raster, type-enter recipe, clocks, cold/in-app gate, scroll chrome).
- **Block** craft defect classes regardless of law (see Build standing defect classes).
- **Do not Block** product-specific rows (nav column order, hero flight) unless the loaded law includes them.

When no law is loaded:

- Review craft only (Ten Standards, t90, GPU, accessibility).
- Do not Block for missing clip-wipe recipe or overlap — law unobserved.

---

## Relation to other skills

| Skill | Role |
| --- | --- |
| **design-system** | House motion law for JHD web — grammar + type-enter bound to package tokens |
| **capture-website** | Writes `motion-law.md` for a reference site (full design law includes type, color, layout, spacing, motion) |
| **capture-motion-source** | Fills the motion slice of the same law shape from video/Jitter/AE/Lottie |
| **motion** (this skill) | Craft + reader — load law, implement, review |
