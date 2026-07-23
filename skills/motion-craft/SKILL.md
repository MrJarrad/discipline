---
name: motion-craft
description: Applies motion-craftineering craft for motion, interaction feel, and UI polish — animation decisions, easing, timing, springs, and press feedback. Use when building or reviewing components, choosing easing/duration, adding transitions, or when an interface needs to feel responsive and intentional rather than decorative.
---

# Design Engineering

Craft derived from Emil Kowalski's motion-craftineering philosophy — [animations.dev](https://animations.dev/) (adapted from emilkowalski/skills, MIT).

Read [references/DOS-AND-DONTS.md](references/DOS-AND-DONTS.md) when applying this skill — it holds the quick-reference tables, the required review format, and worked examples.

## Where this sits

`design-craft` owns design-system application — tokens, components, the composition ladder: the *what/where* of UI. `motion-craft` is the adjacent layer on top: motion and interaction feel — easing, timing, springs, press feedback. Apply both; neither replaces the other. Both sit under `quality` (the bar: best-in-class, verified, never fabricated).

Concretely: `design-craft` decides a popover is built from the system's popover component with the system's spacing tokens. `motion-craft` decides how that popover enters — from its trigger, in 150-200ms, ease-out. Don't re-litigate token/component choices here; don't skip motion review there.

## Core philosophy

Good taste is trained, not innate — it comes from studying why the best interfaces feel the way they do, then applying that judgment relentlessly. Most of what makes an interface feel right is never consciously noticed by users; the aggregate of invisible correctness is what compounds into "this just feels good." Beauty and feel are leverage: in a world where everyone's software works, how it feels is the differentiator.

## The animation decision framework

Work through these four questions, in order, before writing any animation code.

### 1. Should this animate at all?

Ask: how often will users see this animation?

| Frequency | Decision |
| --- | --- |
| 100+ times/day (keyboard shortcuts, command palette toggle) | No animation. Ever. |
| Tens of times/day (hover effects, list navigation) | Remove or drastically reduce |
| Occasional (modals, drawers, toasts) | Standard animation |
| Rare/first-time (onboarding, feedback forms, celebrations) | Can add delight |

**Never animate keyboard-initiated actions.** Repeated hundreds of times a day, animation makes them feel slow and disconnected from the user's input. Raycast ships no open/close animation for its command palette — that absence is correct, not an oversight.

### 2. What is the purpose?

Every animation needs a clear answer to "why does this animate?" Valid purposes: spatial consistency (a toast exits the way it entered, so swipe-to-dismiss feels intuitive), state indication (a morphing button shows a state change), explanation (a marketing animation demonstrates a feature), feedback (a button scales down on press, confirming the interface heard the user), or preventing jarring changes (elements popping in/out without transition read as broken).

If the only answer is "it looks cool" and users will see it often, don't animate.

### 3. What easing?

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

### 4. How fast?

| Element | Duration |
| --- | --- |
| Button press feedback | 100-160ms |
| Tooltips, small popovers | 125-200ms |
| Dropdowns, selects | 150-250ms |
| Modals, drawers | 200-500ms |
| Marketing/explanatory | Can be longer |

**Rule: UI animations stay under 300ms.** Perceived performance rides on this — a 180ms select feels more responsive than a 400ms one at identical actual load time, a fast-spinning spinner makes loading feel faster, and skipping the delay (and animation) on subsequent tooltips once one is already open makes a whole toolbar feel faster. Easing amplifies the effect: `ease-out` at 200ms feels faster than `ease-in` at 200ms because the user sees immediate movement.

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

Use the Before/After/Why markdown table format — see [references/DOS-AND-DONTS.md](references/DOS-AND-DONTS.md) for the exact required shape and worked examples. Never a vertical "Before: ... After: ..." list.
