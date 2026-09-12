---
name: motion
description: "Build, review, and name motion — animation decisions, easing, timing, springs, press feedback; read and implement motion law from design-system or capture; review against craft and the loaded law with Block/Approve; reverse-lookup effect names. Trigger on animation feel, transitions, easing/duration, or implementing motion law. Not Figma motion specs — capture-figma; not performance profiling — performance."
---

# Motion

Craft, review bar, and vocabulary derived from Emil Kowalski's animation work — [animations.dev](https://animations.dev/) (adapted from emilkowalski/skills, MIT).

`design-craft` owns the *what/where* — tokens, components, the composition ladder. `motion` is the layer on top: feel — easing, timing, springs, press feedback. Apply both; both sit under `quality`.

| Job | Fires when | Reference |
| --- | --- | --- |
| **[Build](#build)** | authoring motion | [BUILD.md](references/BUILD.md) · [BUILD-DOS-AND-DONTS.md](references/BUILD-DOS-AND-DONTS.md) |
| **[Motion law](#motion-law)** | a law instance is named | [LAW.md](references/LAW.md) |
| **[Review](#review)** | auditing a diff | [REVIEW.md](references/REVIEW.md) · [REVIEW-DOS-AND-DONTS.md](references/REVIEW-DOS-AND-DONTS.md) |
| **[Vocabulary](#vocabulary)** | naming an effect | [GLOSSARY.md](references/GLOSSARY.md) · [VOCABULARY-DOS-AND-DONTS.md](references/VOCABULARY-DOS-AND-DONTS.md) |

---

## Build

Four questions, in order, before any animation code. The catalog behind them — philosophy, springs, component-building principles, sequencing, performance, accessibility — is [BUILD.md](references/BUILD.md).

### 1. Should this animate at all?

| Frequency | Decision |
| --- | --- |
| 100+ times/day (keyboard shortcuts, command palette toggle) | No animation. Ever. |
| Tens of times/day (hover effects, list navigation) | Remove or drastically reduce |
| Occasional (modals, drawers, toasts) | Standard animation |
| Rare/first-time (onboarding, feedback forms, celebrations) | Can add delight |

**Never animate keyboard-initiated actions** — they read as slow and disconnected from the user's input.

### 2. What is the purpose?

Valid: spatial consistency, state indication, explanation, feedback, preventing a jarring change. "It looks cool" on a frequently-seen element is not.

### 3. What easing?

- Entering or exiting -> `ease-out` (starts fast, feels responsive)
- Moving/morphing on screen (not entering/exiting) -> `ease-in-out`
- Hover/color change -> `ease`
- Constant motion (marquee, progress bar) -> `linear`
- Uncertain -> default to `ease-out`

**Never use `ease-in` for UI.** It delays the initial movement — exactly the moment the user is watching most closely.

**Use custom curves, not the CSS built-ins** — the defaults are too weak to feel intentional:

```css
--ease-out: cubic-bezier(0.23, 1, 0.32, 1);      /* strong ease-out for UI interactions */
--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);  /* strong ease-in-out for on-screen movement */
--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);   /* iOS-like drawer curve, from Ionic */
```

### 4. How fast?

| Element | Duration |
| --- | --- |
| Button press feedback | 100-160ms |
| Tooltips, small popovers | 125-200ms |
| Dropdowns, selects | 150-250ms |
| Modals, drawers | 200-500ms |
| Marketing/explanatory | Can be longer |

**Rule: measure time-to-90%-of-distance (t90), not wall-clock duration.** Wall clock past t90 is a settle nobody consciously watches.
- **Component scale** (hover, press, popover, dropdown, in-place state): **t90 ≤ 300ms.**
- **View scale** (route/page transition, full-width reveal, scroll-entrance of a whole row): **t90 ≤ 400ms.**

A long declared duration on a strong ease-out curve can still pass — worked examples in [BUILD.md](references/BUILD.md).

### Standing defect classes (craft — Block regardless of law)

| Class | Rule |
| --- | --- |
| **Flash-before-enter** | Rest paints, then hide, then play. First painted frame of an enter must be the **from-state**. |
| **Hidden-complete** | Animation reaches `to` while hidden; unhide pops finished state. Full travel must play while visible. |
| **Pause-stack** | `animation-play-state: paused` stacks a second full delay after unhide. |
| **Recipe-not-live** | Constants/tests pin a recipe the live DOM path never mounts. |

Law-specific classes (**false overlap**, **raster-soup**, **glyph-stagger**, **law-clock drift**) **Block only when a law is loaded**. See [LAW.md](references/LAW.md).

---

## Motion law

**This skill does not own the law.** House law lives with the product, not this plugin:
`~/JHD/jhd-design-system/motion-law.md` — the `design-system` skill points there.
Captured reference law lives in the capture folder as `motion-law.md`. Product-specific
rows may live in vault decisions or tempo modules named in the brief.

**Load order:** brief/capture path → house law (JHD web) → product doc named in brief → law unobserved (craft only).

**Implement:** derive clocks from the law's token map or product tempo module; wire sequencing to law rows; do not hand-copy ms when a law path exists.

**Review:** Block craft defects always; Block law violations only when a law is loaded and quoted in the review brief.

---

## Review

Read [REVIEW.md](references/REVIEW.md) — the thirteen standards, escalation triggers, remedial hierarchy and output format — before reviewing.

**Posture.** A senior motion-design reviewer with a brutal eye for craft. The bias is toward **motion that feels right**, not motion that merely runs. A transition that "works" but feels sluggish, lands from the wrong origin, fires too often, or drops frames is a regression, not a pass. Default to flagging. Approval is earned, not assumed.

**Scope fence.** Motion and animation code only. Decline requests to review unrelated logic, styling, or architecture, and point to a general code-review skill.

**Output.** A Before/After/Why findings table — never a vertical "Before: … After: …" list — then the verdict, grouped by impact tier. Cite `file:line`. Close on an explicit decision:

- **Block** — any feel-breaking regression, animation on a keyboard/high-frequency action, `scale(0)`/`ease-in` on UI, a non-GPU animation with an easy GPU fix, **flash-before-enter**, **hidden-complete**, pause-stack, recipe-not-live, or any **loaded motion law** row violated (cite law + row).
- **Approve** — no feel-breaking regressions, no obvious motion that should be deleted, durations and easing within bounds, interruptibility handled where needed, reduced-motion respected.

---

## Vocabulary

Turn a vague description of a motion or effect into the precise term. A naming lookup, not a design tool.

The glossary is [GLOSSARY.md](references/GLOSSARY.md) — **quote it verbatim; its descriptions are authoritative.** Also read [VOCABULARY-DOS-AND-DONTS.md](references/VOCABULARY-DOS-AND-DONTS.md).

Answer in this shape, best match first, then 1–2 alternates with a one-line note on how they differ:

```
**Stagger** — Animate several items one after another with a small delay between each, creating a cascade.
```

Read for intent, not keywords — users describe what they *see* or *feel*. Disambiguate close terms (*Clip-path* vs *Mask*). When nothing matches, name the closest and call it an approximation; never invent a term.
