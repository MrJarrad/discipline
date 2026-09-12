# Motion — build catalog

The craft rules behind `motion`'s Build section. SKILL.md keeps the four decision
questions and the standing defect classes; everything here is the catalog those
decisions draw their values from. Nothing in this file was rewritten — it is the
1.78.0 Build section, moved.

## Where the boundary with design-craft sits

Concretely: `design-craft` decides a popover is built from the system's popover component with the system's spacing tokens. `motion` decides how that popover enters — from its trigger, in 150-200ms, ease-out. Don't re-litigate token/component choices here; don't skip motion review there.

## Core philosophy

Good taste is trained, not innate — it comes from studying why the best interfaces feel the way they do, then applying that judgment relentlessly. Most of what makes an interface feel right is never consciously noticed by users; the aggregate of invisible correctness is what compounds into "this just feels good." Beauty and feel are leverage: in a world where everyone's software works, how it feels is the differentiator.

## t90 — worked examples

Worked examples: `cubic-bezier(0.19,1,0.22,1)` @ 750ms → t90 **231ms** → passes both. `cubic-bezier(0.23,1,0.32,1)` @ 750ms → 271ms → passes both. A measured view-scale reveal at **377ms** → passes view scale, fails component scale. `cubic-bezier(0.86,0,0.07,1)` @ 750ms → 470ms → fails both. Any `ease-in-out` @ 500ms → 390ms → fails component scale.

Perceived performance rides on t90, not the declared number — a fast-spinning spinner makes loading feel faster, and skipping the delay (and animation) on subsequent tooltips once one is already open makes a whole toolbar feel faster. Easing amplifies the effect: `ease-out` at 200ms feels faster than `ease-in` at 200ms because the user sees immediate movement.

## Springs

Springs simulate physics instead of running on a fixed duration — they settle based on stiffness/damping/mass, not a clock. Use them for drag interactions with momentum, elements that should feel "alive" (Apple's Dynamic Island), gestures that can be interrupted mid-motion, and decorative mouse-tracking. Their key advantage: **interruptibility**. CSS keyframes restart from zero when interrupted; springs maintain velocity, so reversing a gesture mid-flight (click to expand, then immediately Escape) looks smooth instead of janky.

Configure with Apple's approach when possible — easier to reason about:

```js
{ type: "spring", duration: 0.5, bounce: 0.2 }
```

or traditional physics for finer control: `{ type: "spring", mass: 1, stiffness: 100, damping: 10 }`. Keep bounce subtle (0.1-0.3); reserve real bounce for drag-to-dismiss and playful contexts, not everyday UI.

Don't wire visual changes directly to a continuously-changing input (e.g., mouse position) without a spring — direct 1:1 mapping feels artificial because it has no momentum. But know when *not* to animate at all: a functional graph in a banking app should track its input exactly, with no spring smoothing, because the animation there isn't decorative.

## Component-building principles

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

## Sequencing concepts (craft — law fills the numbers)

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

## Performance

**Only animate `transform` and `opacity`.** These skip layout and paint and run on the GPU. Animating `padding`, `margin`, `width`, or `height` triggers layout, paint, and composite — all three expensive rendering steps.

**CSS variables are inheritable — updating one on a parent recalculates styles for every child.** In a list or drawer with many items, prefer setting `transform` directly on the specific element over updating a shared `--variable` on the container.

**Framer Motion (Motion) caveat: its shorthand props (`x`, `y`, `scale`) are NOT hardware-accelerated** — they run via `requestAnimationFrame` on the main thread and drop frames when the browser is busy (e.g., during page load). For guaranteed hardware acceleration, animate the full `transform` string instead: `animate={{ transform: "translateX(100px)" }}`. CSS animations run off the main thread and stay smooth under the same load — prefer CSS for predetermined animations, JS (with this caveat in mind) for dynamic/interruptible ones.

## Accessibility

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

## When reviewing UI motion

Use the Before/After/Why markdown table format — see [references/BUILD-DOS-AND-DONTS.md](references/BUILD-DOS-AND-DONTS.md) for the exact required shape and worked examples, or the **Review** section below for the full review posture and explicit Block/Approve decision. Never a vertical "Before: ... After: ..." list.
