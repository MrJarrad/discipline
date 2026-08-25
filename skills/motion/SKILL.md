---
name: motion
description: "Build, review, and name motion — animation decisions, easing, timing, springs, press feedback; read and implement motion law from design-system or capture; review against craft and the loaded law with Block/Approve; reverse-lookup effect names. Trigger on animation feel, transitions, easing/duration, or implementing motion law. Not Figma motion specs — capture-figma; not performance profiling — performance."
---

# Motion

Craft, review bar, and vocabulary derived from Emil Kowalski's animation work — [animations.dev](https://animations.dev/) (adapted from emilkowalski/skills, MIT).

`design-craft` owns design-system application — tokens, components, the composition ladder: the *what/where* of UI. `motion` is the adjacent layer on top: motion and interaction feel — easing, timing, springs, press feedback. Apply both; neither replaces the other. Both sit under `quality` (the bar: best-in-class, verified, never fabricated).

Concretely: `design-craft` decides a popover is built from the system's popover component with the system's spacing tokens. `motion` decides how that popover enters — from its trigger, in 150-200ms, ease-out. Don't re-litigate token/component choices here; don't skip motion review there.

This skill does four jobs, kept as sections because they fire at different moments:

- **[Build](#build)** — craft catalog for authoring motion (easing, durations, springs, gestures). Universal feel rules — not a site's law.
- **[Motion law](#motion-law)** — load, interpret, and implement the active law instance (house, capture, or brief).
- **[Review](#review)** — audit a diff against craft **and** the loaded law; reach an explicit Block/Approve.
- **[Vocabulary](#vocabulary)** — reverse-lookup: turning a vague description of an effect into its precise term.

---

## Build

Read [references/BUILD-DOS-AND-DONTS.md](references/BUILD-DOS-AND-DONTS.md) when applying this section — it holds the quick-reference tables, the required review format, and worked examples.

### Core philosophy

Good taste is trained, not innate — it comes from studying why the best interfaces feel the way they do, then applying that judgment relentlessly. Most of what makes an interface feel right is never consciously noticed by users; the aggregate of invisible correctness is what compounds into "this just feels good." Beauty and feel are leverage: in a world where everyone's software works, how it feels is the differentiator.

### The animation decision framework

Work through these four questions, in order, before writing any animation code.

#### 1. Should this animate at all?

Ask: how often will users see this animation?

| Frequency | Decision |
| --- | --- |
| 100+ times/day (keyboard shortcuts, command palette toggle) | No animation. Ever. |
| Tens of times/day (hover effects, list navigation) | Remove or drastically reduce |
| Occasional (modals, drawers, toasts) | Standard animation |
| Rare/first-time (onboarding, feedback forms, celebrations) | Can add delight |

**Never animate keyboard-initiated actions.** Repeated hundreds of times a day, animation makes them feel slow and disconnected from the user's input. Raycast ships no open/close animation for its command palette — that absence is correct, not an oversight.

#### 2. What is the purpose?

Every animation needs a clear answer to "why does this animate?" Valid purposes: spatial consistency (a toast exits the way it entered, so swipe-to-dismiss feels intuitive), state indication (a morphing button shows a state change), explanation (a marketing animation demonstrates a feature), feedback (a button scales down on press, confirming the interface heard the user), or preventing jarring changes (elements popping in/out without transition read as broken).

If the only answer is "it looks cool" and users will see it often, don't animate.

#### 3. What easing?

Decision tree:
- Entering or exiting -> `ease-out` (starts fast, feels responsive)
- Moving/morphing on screen (not entering/exiting) -> `ease-in-out`
- Hover/color change -> `ease`
- Constant motion (marquee, progress bar) -> `linear`
- Uncertain -> default to `ease-out`

**Never use `ease-in` for UI.** It delays the initial movement — exactly the moment the user is watching most closely — so it reads as sluggish even at an identical duration to `ease-out`.

**Use custom curves, not the CSS built-ins** — the defaults are too weak to feel intentional:

```css
--ease-out: cubic-bezier(0.23, 1, 0.32, 1);      /* strong ease-out for UI interactions */
--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);  /* strong ease-in-out for on-screen movement */
--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);   /* iOS-like drawer curve, from Ionic */
```

Find stronger custom variants at easing.dev or easings.co rather than hand-rolling curves.

#### 4. How fast?

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

Worked examples: `cubic-bezier(0.19,1,0.22,1)` @ 750ms → t90 **231ms** → passes both. `cubic-bezier(0.23,1,0.32,1)` @ 750ms → 271ms → passes both. A measured view-scale reveal at **377ms** → passes view scale, fails component scale. `cubic-bezier(0.86,0,0.07,1)` @ 750ms → 470ms → fails both. Any `ease-in-out` @ 500ms → 390ms → fails component scale.

Perceived performance rides on t90, not the declared number — a fast-spinning spinner makes loading feel faster, and skipping the delay (and animation) on subsequent tooltips once one is already open makes a whole toolbar feel faster. Easing amplifies the effect: `ease-out` at 200ms feels faster than `ease-in` at 200ms because the user sees immediate movement.

### Springs

Springs simulate physics instead of running on a fixed duration — they settle based on stiffness/damping/mass, not a clock. Use them for drag interactions with momentum, elements that should feel "alive" (Apple's Dynamic Island), gestures that can be interrupted mid-motion, and decorative mouse-tracking. Their key advantage: **interruptibility**. CSS keyframes restart from zero when interrupted; springs maintain velocity, so reversing a gesture mid-flight (click to expand, then immediately Escape) looks smooth instead of janky.

Configure with Apple's approach when possible — easier to reason about:

```js
{ type: "spring", duration: 0.5, bounce: 0.2 }
```

or traditional physics for finer control: `{ type: "spring", mass: 1, stiffness: 100, damping: 10 }`. Keep bounce subtle (0.1-0.3); reserve real bounce for drag-to-dismiss and playful contexts, not everyday UI.

Don't wire visual changes directly to a continuously-changing input (e.g., mouse position) without a spring — direct 1:1 mapping feels artificial because it has no momentum. But know when *not* to animate at all: a functional graph in a banking app should track its input exactly, with no spring smoothing, because the animation there isn't decorative.

### Component-building principles

**Buttons must feel responsive.** Add `transform: scale(0.97)` on `:active` with a fast transition (~160ms ease-out). This applies to any pressable element; keep the scale subtle (0.95-0.98).

**Never animate from `scale(0)`.** Nothing in the real world disappears to nothing and reappears from nothing. Start entrances from `scale(0.9)` or higher, combined with `opacity: 0` — a barely-visible initial scale reads as natural, not glitchy.

**Popovers are origin-aware.** Scale in from the trigger, not from center (`transform-origin: var(--radix-popover-content-transform-origin)` or equivalent). **Modals are the exception** — they aren't anchored to a trigger, so they keep `transform-origin: center`.

**Prefer CSS transitions over keyframes for anything rapidly re-triggered.** Transitions can be interrupted and retargeted mid-flight; keyframes restart from zero. Toasts, toggled states, and anything a user might fire repeatedly in quick succession should use transitions.

**Use blur to mask an imperfect crossfade.** When two states swap and no combination of easing/duration removes the sense of "two objects overlapping," add a subtle `filter: blur(2px)` (cap around 20px — heavier blur is expensive, especially in Safari) during the transition to visually bridge the states.

**Animate entry with `@starting-style`** where browser support allows, instead of a `useEffect`-driven `mounted` flag:

```css
.toast {
  opacity: 1;
  transform: translateY(0);
  transition: opacity 400ms ease, transform 400ms ease;
  @starting-style {
    opacity: 0;
    transform: translateY(100%);
  }
}
```

**Asymmetric timing for deliberate actions.** Slow where the user is deciding, fast where the system responds — e.g. a hold-to-delete press fills over 2s linear, but releasing (whether cancelling or completing) snaps back or confirms in ~200ms ease-out.

**Stagger multi-element entrances.** A cascading small delay (30-80ms) between siblings feels more natural than everything appearing at once. Keep it decorative — never block interaction while stagger is still playing.

### Sequencing concepts (craft — law fills the numbers)

How movers relate in time is **defined by the loaded motion law** when one exists. These concepts name what a law row describes — they are not hardcoded clocks:

- **Duration is a function of the property; distance is a function of the element; velocity is derived, never authored.** Hold duration constant for a property; set travel relative to the element's size. Fix distance or curve when a move feels wrong — not duration by default.
- **Distinct families overlap or hand off** — this skill implements whichever the **loaded**
  law defines, never a universal default. When a loaded law defines overlap as
  follow-not-start-together (e.g. the JHD house law's current definition: follower delay
  **> 0** and **<** leader duration, both in motion together — simultaneous start and
  exclusive handoff are defects against that law), implement that. A different loaded law
  may define overlap differently; apply what it says.
- **Identical siblings pile or queue** — the loaded law states stagger step and overlap %. Pile and queue are opposite; apply what the law specifies.
- **Visual raster** — when law specifies column order: columns left → right; within a column, top → bottom; unit = cell contents, not glyphs.
- **Clear the stage, hold still, type-enter recipe, clocks, cold vs in-app, scroll chrome** — each is a law row when present. See [Motion law](#motion-law).

### Standing defect classes (craft — Block regardless of law)

| Class | Rule |
| --- | --- |
| **Flash-before-enter** | Rest paints, then hide, then play. First painted frame of an enter must be the **from-state**. |
| **Hidden-complete** | Animation reaches `to` while hidden; unhide pops finished state. Full travel must play while visible. |
| **Pause-stack** | `animation-play-state: paused` stacks a second full delay after unhide. |
| **Recipe-not-live** | Constants/tests pin a recipe the live DOM path never mounts. |

Law-specific defect classes (**false overlap**, **raster-soup**, **glyph-stagger**, **law-clock drift**, etc.) **Block only when a law is loaded** and the implementation violates it. See [references/LAW.md](references/LAW.md).

### Performance

**Only animate `transform` and `opacity`.** These skip layout and paint and run on the GPU. Animating `padding`, `margin`, `width`, or `height` triggers layout, paint, and composite — all three expensive rendering steps.

**CSS variables are inheritable — updating one on a parent recalculates styles for every child.** In a list or drawer with many items, prefer setting `transform` directly on the specific element over updating a shared `--variable` on the container.

**Framer Motion (Motion) caveat: its shorthand props (`x`, `y`, `scale`) are NOT hardware-accelerated** — they run via `requestAnimationFrame` on the main thread and drop frames when the browser is busy (e.g., during page load). For guaranteed hardware acceleration, animate the full `transform` string instead: `animate={{ transform: "translateX(100px)" }}`. CSS animations run off the main thread and stay smooth under the same load — prefer CSS for predetermined animations, JS (with this caveat in mind) for dynamic/interruptible ones.

### Accessibility

**Respect `prefers-reduced-motion`.** Reduced motion means fewer and gentler animations, not zero — keep opacity/color transitions that aid comprehension, remove movement/position-based motion.

```css
@media (prefers-reduced-motion: reduce) {
  .element { animation: fade 0.2s ease; /* no transform-based motion */ }
}
```

**Gate hover animations behind a pointer-capability query.** Touch devices fire `:hover` on tap, causing false-positive animations:

```css
@media (hover: hover) and (pointer: fine) {
  .element:hover { transform: scale(1.05); }
}
```

### When reviewing UI motion

Use the Before/After/Why markdown table format — see [references/BUILD-DOS-AND-DONTS.md](references/BUILD-DOS-AND-DONTS.md) for the exact required shape and worked examples, or the **Review** section below for the full review posture and explicit Block/Approve decision. Never a vertical "Before: ... After: ..." list.

---

## Motion law

Read [references/LAW.md](references/LAW.md) when implementing or reviewing motion against a product or reference contract.

**This skill does not own the law.** House law lives with the product, not this plugin:
`~/JHD/jhd-design-system/motion-law.md` — the `design-system` skill points there.
Captured reference law lives in the capture folder as `motion-law.md`. Product-specific
rows may live in vault decisions or tempo modules named in the brief.

**Load order:** brief/capture path → house law (JHD web) → product doc named in brief → law unobserved (craft only).

**Implement:** derive clocks from the law's token map or product tempo module; wire sequencing to law rows; do not hand-copy ms when a law path exists.

**Review:** Block craft defects always; Block law violations only when a law is loaded and quoted in the review brief.

---

## Review

Read [references/REVIEW-DOS-AND-DONTS.md](references/REVIEW-DOS-AND-DONTS.md) before reviewing.

A specialized review job. It does ONE thing: review animation and motion code against a high craft bar. It does not write features, fix unrelated bugs, or review non-motion code. If asked to review general code, decline and point to a general code-review skill instead.

This is the *review* counterpart to this skill's own **Build** section above — both sit under `quality` (the bar). Build is where the exact rule catalog and precise values live; this section is how you audit a diff against them and reach a decision.

### Operating Posture

You are a senior motion-design reviewer with a brutal eye for craft. Your bias is toward **motion that feels right**, not motion that merely runs. A transition that "works" but feels sluggish, lands from the wrong origin, fires too often, or drops frames is a regression, not a pass. Default to flagging. Approval is earned, not assumed.

### The Ten Non-Negotiable Standards

Every animation in the diff is measured against these. A violation is a finding.

1. **Justified motion.** Every animation must answer "why does this animate?" — spatial consistency, state indication, feedback, explanation, or preventing a jarring change. "It looks cool" on a frequently-seen element is a block.

2. **Frequency-appropriate.** Match motion to how often it's seen. Keyboard-initiated and 100+/day actions get **no** animation. Tens/day gets reduced motion. Occasional gets standard. Rare/first-time can have delight.

3. **Responsive easing.** Entering/exiting elements use `ease-out` or a strong custom curve. `ease-in` on UI is a block — it delays the moment the user watches most. Built-in CSS easings are too weak; expect custom cubic-beziers.

4. **Perceived-latency gate.** Measure time-to-90%-of-distance (t90) under the animation's declared curve, not wall-clock duration. Component-scale motion (hover, press, popover, dropdown, in-place state) needs t90 ≤ 300ms; view-scale motion (route/page transition, full-width reveal, whole-row scroll-entrance) needs t90 ≤ 400ms. A long declared duration on a strong ease-out curve can still pass — cite the **Build** section's t90 rule and worked examples rather than flagging on the raw duration number.

5. **Origin & physical correctness.** Popovers/dropdowns/tooltips scale from their trigger (`transform-origin`), not center. Never animate from `scale(0)` — start from `scale(0.9–0.97)` + opacity. (Modals are exempt — they stay centered.)

6. **Interruptibility.** Rapidly-triggered or gesture-driven motion (toasts, toggles, drags) must be interruptible — CSS transitions or springs that retarget from current state, not keyframes that restart from zero.

7. **GPU-only properties.** Animate `transform` and `opacity` only. Animating `width`/`height`/`margin`/`padding`/`top`/`left` (or Framer Motion `x`/`y`/`scale` shorthands under load) is a performance finding.

8. **Accessibility.** `prefers-reduced-motion` is honored (gentler, not zero — keep opacity/color, drop movement). Hover animations are gated behind `@media (hover: hover) and (pointer: fine)`.

9. **Asymmetric enter/exit.** Deliberate actions (a press, a hold, a destructive confirm) animate slower; system responses snap. Symmetric timing on a press-and-release or hold interaction is a finding.

10. **Cohesion.** Motion matches the component's personality and the rest of the product — playful can be bouncier, a dashboard stays crisp. Mismatched personality, or a jarring crossfade where a subtle blur would bridge two states, is a finding. When unsure whether motion feels right, the strongest move is often to delete it.

11. **Flash-before-enter.** First painted frame is the from-state — rest then animate is a **Block**.

12. **Hidden-complete.** Motion must not finish while hidden then pop at `to` — **Block**.

13. **Loaded motion law.** When a law is named in the brief, every row in that law is a review standard. Quote the law source; Block violations of overlap, raster, type-enter, clocks, gates, or chrome rows it defines. When no law is loaded, do not Block for missing site-specific recipes.

### Aggressive Escalation Triggers

Flag these on sight, hard:

- `transition: all` (unbounded property animation)
- `scale(0)` or pure-fade entrances with no initial transform
- `ease-in` on any UI interaction; weak built-in easing on a deliberate animation
- Animation on a keyboard shortcut, command-palette toggle, or 100+/day action
- t90 exceeding its band with no stated reason (component-scale >300ms, view-scale >400ms)
- `transform-origin: center` on a trigger-anchored popover/dropdown/tooltip
- Keyframes on toasts, toggles, or anything added/triggered rapidly
- Animating layout properties (`width`/`height`/`margin`/`padding`/`top`/`left`)
- Framer Motion `x`/`y`/`scale` props on motion that runs while the page is busy
- Updating a CSS variable on a parent to drive a child transform (style recalc storm)
- Missing `prefers-reduced-motion` handling on movement
- Ungated `:hover` motion
- Symmetric enter/exit timing on a press-and-release or hold interaction
- Everything-at-once entrance where a 30–80ms stagger belongs
- **Flash-before-enter** — rest visible on first paint, then hidden, then animated; or unhide onto rest instead of from-state (**Block**)
- **Hidden-complete** — animation runs to `to` while `visibility: hidden` / `display: none`; clip mask never travels, text pops in finished (**Block**)
- **Pause-stack** — `animation-play-state: paused` through hide/unhide stacks a second full delay (**Block**)
- **Recipe-not-live** — recipe wired in tests or constants but absent from the live mount path (**Block**)
- **Law violation** — any row in the **loaded** motion law contradicted by the diff (**Block** — cite law source + row)

### Remedial Preference Hierarchy

When proposing fixes, prefer earlier moves over later ones:

1. **Delete the animation** (high-frequency / no purpose / keyboard-triggered).
2. **Reduce it** — shorter duration, smaller transform, fewer animated properties.
3. **Fix the easing** — swap `ease-in`→`ease-out`/custom curve; use a strong cubic-bezier.
4. **Fix the origin/physicality** — correct `transform-origin`; replace `scale(0)` with `scale(0.95)`+opacity.
5. **Make it interruptible** — keyframes → transitions, or a spring for gesture-driven motion.
6. **Move it to the GPU** — layout props → `transform`/`opacity`; shorthand → full `transform` string; WAAPI for programmatic CSS.
7. **Asymmetric timing** — slow the deliberate phase, snap the response.
8. **Polish** — blur to mask crossfades, stagger for groups, `@starting-style` for entry, spring for "alive" elements.
9. **Accessibility & cohesion** — add reduced-motion + hover gating; tune to match the component's personality.

### Required Output Format

Two parts, in this order.

#### Part 1 — Findings table (REQUIRED)

A single markdown table. One row per issue. Never a "Before:/After:" vertical list.

| Before | After | Why |
| --- | --- | --- |
| `transition: all 300ms` | `transition: transform 200ms ease-out` | Specify exact properties; `all` animates unintended properties off-GPU |
| `transform: scale(0)` | `transform: scale(0.95); opacity: 0` | Nothing appears from nothing — `scale(0)` looks like it came from nowhere |
| `ease-in` on dropdown | `ease-out` + custom curve | `ease-in` delays the moment the user watches most; feels sluggish |
| `transform-origin: center` on popover | `var(--radix-popover-content-transform-origin)` | Popovers scale from their trigger, not center (modals are exempt) |

#### Part 2 — Verdict (REQUIRED)

Group remaining commentary by impact tier, highest first. Omit empty tiers.

1. **Feel-breaking regressions** — sluggish easing, comes-from-nowhere, fires on high-frequency/keyboard actions, **flash-before-enter**, **hidden-complete** (motion not fully playing).
2. **Missed simplifications** — animations that should be removed or drastically reduced.
3. **Performance** — non-GPU properties, dropped-frame risks, recalc storms.
4. **Interruptibility & timing** — keyframes where transitions/springs belong; symmetric timing that should be asymmetric.
5. **Origin, physicality & cohesion** — wrong origin, mismatched personality, jarring crossfades.
6. **Accessibility** — reduced-motion and pointer/hover gating.

Close with an explicit decision:

- **Block** — any feel-breaking regression, animation on a keyboard/high-frequency action, `scale(0)`/`ease-in` on UI, a non-GPU animation with an easy GPU fix, **flash-before-enter**, **hidden-complete**, pause-stack, recipe-not-live, or any **loaded motion law** row violated (cite law + row).
- **Approve** — no feel-breaking regressions, no obvious motion that should be deleted, durations and easing within bounds, interruptibility handled where needed, reduced-motion respected.

Be specific and cite `file:line`. When a finding needs a precise value (a curve, a duration, a spring config), pull it from the **Build** section above rather than approximating.

### Guidelines

- Prefer CSS transitions/`@starting-style`/WAAPI for predetermined motion; JS/springs for dynamic, interruptible, gesture-driven motion.
- When unsure whether motion feels right, recommend reviewing it in slow motion / frame-by-frame and with fresh eyes the next day rather than guessing.
- Stay scoped. This skill reviews motion and animation code only — decline requests to review unrelated logic, styling, or architecture, and point to a general code-review skill.

---

## Vocabulary

Read [references/VOCABULARY-DOS-AND-DONTS.md](references/VOCABULARY-DOS-AND-DONTS.md) when applying this section.

Turn a vague description of a motion or effect into the precise term, so the user knows what to ask for. This is a naming lookup, not a design or implementation tool — it pairs well with this skill's own **Build** and **Review** sections above, but is self-contained on its own.

### Quick Start

The user describes an effect loosely. You return the matching term(s) in this format:

```
**Stagger** — Animate several items one after another with a small delay between each, creating a cascade.
```

If several terms could fit, list the best match first, then 1–2 alternates with a one-line note on how they differ.

### Instructions

1. **Read for intent, not keywords.** Users describe what they *see* or *feel* ("springy", "slides off", "draws itself in"), not the technical name. Map the sensation to the glossary below.
2. **Quote the glossary verbatim.** Its descriptions are authoritative — use them as-is, don't paraphrase.
3. **Disambiguate close terms.** When two compete (*Clip-path* vs *Mask*, *Pop in* vs *Bounce*, *Shared element transition* vs *Layout animation*), contrast them so the user can pick.
4. **When nothing matches exactly,** name the closest term and say plainly it's an approximation, or describe the effect in the glossary's vocabulary (e.g. "that's a *stagger* of *scale-in* entrances").
5. **Stay within this glossary.** If a term genuinely isn't here, say so rather than inventing one — though you may explain the concept using these words.
6. **Keep it tight.** A naming question wants a name, not an essay. Lead with the term; expand only if asked.

### Examples

**Example 1 — feel-based**
User: "What's it called when a popover seems to grow out of the button you clicked instead of from its middle?"
Output:
```
**Origin-aware animation** — An element animates out of its trigger, like a popover growing from the button that opened it instead of from its own center which is the default in CSS.
```

**Example 2 — disambiguation**
User: "The thing where one image turns into another image."
Output:
```
**Morph** — One shape smoothly turns into another shape, e.g. Dynamic Island.

Close alternates:
- **Crossfade** — if they simply fade over each other in the same spot.
- **Shared element transition** — if an element travels and transforms from one position into another.
```

**Example 3 — physics feel**
User: "That iOS scroll where it resists and snaps back when you pull too far."
Output:
```
**Rubber-banding** — Resistance and snap-back when you drag past a boundary (the iOS overscroll feel).
```

### Glossary

#### Entrances & Exits — how elements appear and disappear
- **Fade in / Fade out** — Element appears or disappears by changing opacity.
- **Slide in** — Element enters by sliding in from off-screen (left, right, top, or bottom).
- **Scale in** — Element grows from smaller to full size as it appears, often paired with a fade.
- **Pop in** — Element appears with a slight overshoot, like it bounces into place.
- **Reveal** — Content is uncovered gradually, often by animating a clip-path or mask.
- **Enter / Exit** — The animation an element plays when it's added to or removed from the screen.

#### Sequencing & Timing — coordinating multiple elements or moments
- **Keyframes** — Defined points in an animation (0%, 50%, 100%) that the browser fills the gaps between.
- **Interpolation / Tween** — Generating all the in-between frames between a start and end value, so motion is continuous.
- **Stagger** — Animate several items one after another with a small delay between each, creating a cascade.
- **Orchestration** — Deliberately timing multiple animations so they feel like one coordinated motion.
- **Delay** — Time before an animation starts.
- **Duration** — How long an animation takes.
- **Fill mode** — Whether an element keeps its first or last frame's styles before the animation starts or after it ends (e.g. forwards).
- **Stepped animation** — An animation that is divided into discrete steps, like a countdown timer.

#### Movement & Transforms — changing an element's position, size, or angle
- **Translate** — Move an element along the X or Y axis.
- **Scale** — Make an element bigger or smaller.
- **Rotate** — Spin an element around a point.
- **Skew** — Slant an element along the X or Y axis, shearing it out of its rectangular shape.
- **3D tilt / Flip** — Rotate in 3D space (rotateX / rotateY) to add depth.
- **Perspective** — How strong the 3D effect looks — a lower value exaggerates depth, like the viewer is closer.
- **Transform origin** — The anchor point a scale or rotation grows or spins from.
- **Origin-aware animation** — An element animates out of its trigger, like a popover growing from the button that opened it instead of from its own center which is the default in CSS.

#### Transitions Between States — connecting one state, view, or element to another
- **Crossfade** — One element fades out as another fades in, in the same spot.
- **Continuity transition** — A change that keeps the user oriented by visually connecting before and after. For example, making the same rectangle bigger and smaller.
- **Morph** — One shape smoothly turns into another shape, e.g. Dynamic Island.
- **Shared element transition** — An element travels and transforms from one position into another, like a thumbnail expanding into a card.
- **Layout animation** — When an element's size or position changes, it animates to the new spot instead of snapping.
- **Accordion / Collapse** — A section smoothly expands and collapses its height to show or hide content.
- **Direction-aware transition** — Content slides one way going forward and the opposite way going back, so navigation has a sense of direction.

#### Scroll — motion tied to scrolling or navigating between views
- **Scroll reveal** — Elements fade or slide into place as they enter the viewport.
- **Scroll-driven animation** — An animation whose progress is tied directly to scroll position.
- **Parallax** — Background and foreground move at different speeds while scrolling, creating depth.
- **Page transition** — An animation that plays when navigating from one page or route to another.
- **View transition** — The browser morphs between two states or pages, connecting shared elements.

#### Feedback & Interaction — responding to the user's actions
- **Hover effect** — Visual change when the cursor moves over an element.
- **Press / Tap feedback** — A subtle scale-down when an element is clicked, so it feels physical.
- **Hold to confirm** — A progress effect that fills up while the user holds a button.
- **Drag** — Moving an element by grabbing it, often with momentum when released.
- **Drag to reorder** — Dragging items in a list to rearrange them, while the others shift to make room.
- **Swipe to dismiss** — Dragging an element off-screen to close it, like a drawer or toast.
- **Rubber-banding** — Resistance and snap-back when you drag past a boundary (the iOS overscroll feel).
- **Shake / Wiggle** — A quick side-to-side jitter signaling an error or rejected input.
- **Ripple** — A circle expanding from the point of a tap, confirming the press.

#### Easing — how speed changes over an animation
- **Easing** — The rate at which an animation speeds up or slows down.
- **Ease-out** — Starts fast, ends slow. The default for most UI and anything responding to the user.
- **Ease-in** — Starts slow, ends fast. Usually avoided; can feel sluggish.
- **Ease-in-out** — Slow, fast, slow. Good for elements already on screen moving from A to B.
- **Linear** — Constant speed. Avoid for UI; reserve for spinners or marquees.
- **Cubic-bezier** — A custom easing curve you define for precise control.
- **Asymmetric easing** — A curve that accelerates and decelerates at different rates. Feels more alive than a symmetric one.

#### Spring Animations — physics-based motion as an alternative to fixed-duration easing
- **Spring** — Motion driven by physics (tension, mass, damping) rather than a set duration.
- **Stiffness / Tension** — How strongly the spring pulls toward its target. Higher feels snappier.
- **Damping** — How quickly a spring settles. Lower damping means more bounce and oscillation.
- **Mass** — How heavy the animated element feels. More mass makes it slower and more sluggish.
- **Bounce** — A spring that overshoots and settles, adding playfulness.
- **Perceptual duration** — How long a spring feels finished, even though it keeps micro-settling underneath.
- **Momentum** — Motion that carries velocity, especially after a drag or interruption.
- **Velocity** — How fast and in which direction an element is moving. A spring carries it into the next animation when interrupted, so a flicked element keeps its speed.
- **Interruptible animation** — An animation that can be smoothly redirected mid-flight instead of finishing first.

#### Looping & Ambient Motion — animations that run on their own
- **Marquee** — Text or content that scrolls continuously in a loop.
- **Loop** — An animation that repeats, a set number of times or infinitely.
- **Alternate (yoyo)** — A loop that plays forward then reverses each iteration, instead of jumping back to the start.
- **Orbit** — An element circling around another in a continuous path.
- **Pulse** — A gentle repeating scale or opacity change to draw attention.
- **Float** — A gentle, continuous up-and-down drift that makes a static element feel alive and weightless.
- **Idle animation** — Subtle motion that plays while an element is just sitting there, waiting to be interacted with.

#### Polish & Effects — the small touches that separate good from great
- **Blur** — A blur filter used to soften an element or mask tiny imperfections.
- **Clip-path** — Clipping an element to a shape, used for reveals, masks, and before/after sliders.
- **Mask** — Hiding or revealing parts of an element using a shape or gradient — like clip-path, but with soft, fadeable edges.
- **Before / after slider** — A draggable divider that wipes between two overlaid images to compare them.
- **Line drawing** — An SVG path that draws itself in, like an invisible pen tracing it.
- **Text morph** — Text that animates character by character when it changes, drawing attention to the new value.
- **Skeleton / Shimmer** — A placeholder with a moving sheen shown while content loads.
- **Number ticker** — Digits rolling or counting up to a value.
- **Tabular numbers** — Fixed-width digits so numbers don't shift around as they change. Essential for tickers, timers, and counters.
- **Typewriter** — Text appearing one character at a time, as if being typed.

#### Performance — what keeps motion smooth instead of stuttering
- **Frame rate (FPS)** — Frames drawn per second. 60fps is the baseline for smooth motion; 120fps on newer displays.
- **Jank** — Visible stutter when the browser drops frames because it can't keep up with the animation.
- **Dropped frame** — A frame the browser missed its deadline to draw, causing a tiny hitch in motion.
- **Compositing** — Letting the GPU move or fade an element on its own layer without redoing layout or paint.
- **will-change** — A CSS hint that an element is about to animate, so the browser can promote it to its own layer ahead of time.
- **Layout thrashing** — Animating properties like width, height, top, or left that force the browser to recalculate layout every frame, causing jank.

#### Principles to Know — concepts that guide when and how to animate
- **Purposeful animation** — Motion should serve a function — orient, give feedback, show relationships — not just decorate.
- **Anticipation** — A small wind-up in the opposite direction before a move, hinting at what's about to happen.
- **Follow-through** — Parts of an element keep moving and settle slightly after the main motion stops, adding weight.
- **Squash & stretch** — Deforming an element as it moves to convey weight, speed, and flexibility.
- **Perceived performance** — The right animation makes an interface feel faster, even when it isn't.
- **Frequency of use** — The more often a user sees an animation, the shorter and subtler it should be.
- **Spatial consistency** — Animating so an element keeps its identity and position across states, so users never lose track of where things went.
- **Hardware acceleration** — Animating transform and opacity lets the GPU keep motion smooth.
- **Reduced motion** — Respecting the user's prefers-reduced-motion setting by toning down or removing motion.
