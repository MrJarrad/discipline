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

## Following and settling

Motion that follows an input (cursor, drag, wheel, a held toggle) or settles after one. Enter/exit/stagger stays with the t90 rules above. Numbers are measured from 14 React Bits components, not from this house's own prototype; feel is a `prototype` lane before any row locks. Lineage: `fleet/rulings/config-panel-standard-and-nice-motion-2026-10-05.md`, draft `2026-10-05-nice-motion-law-draft.md`.

- **N1 Input is a target.** A continuous input never writes straight to the output; each channel goes through one low-pass (lerp or spring). Defect: output equals the raw pointer/scroll value.
- **N2 One feel per component.** 1-4 moving channels, all on one spring config or ω within 7-11 /s. Defect: a channel with its own unrelated stiffness.
- **N3 Soft time constants.** First-order follow: τ 70 ms-1 s, nothing continuous under 70 ms. Spring: ω 7-8 /s (critically damped) is the reference. Instant feedback (press, tint) stays 100-200 ms.
- **N4 No overshoot on the main channel.** Spring damping ratio ζ ≥ 1 on position, size, rotation. Overshoot only on a discrete "moment", ≤ 10% (≤ 35% only on a clamped secondary squash channel).
- **N5 Position drives, speed is a small capped extra.** Main pose comes from position. Velocity may add one secondary effect (squash, blur, caption tilt, landing offset), normalised and clamped to 1 (e.g. `vel / 2200`). Defect: main pose driven by speed or acceleration.
- **N7 Interruptible, state kept.** A retarget mid-flight keeps position and velocity (no restart). Follow maths are dt-based (`1-(1-a)^k` or closed-form spring), never per-frame constants; cap dt at 0.04-0.05 s.

## Component-building principles

**Buttons must feel responsive.** Add `transform: scale(0.97)` on `:active` with a fast transition (~160ms ease-out). This applies to any pressable element; keep the scale subtle (0.95-0.98).

**Never animate from `scale(0)`.** Nothing in the real world disappears to nothing and reappears from nothing. Start entrances from `scale(0.9)` or higher, combined with `opacity: 0` — a barely-visible initial scale reads as natural, not glitchy.

**Popovers are origin-aware.** Scale in from the trigger, not from center (`transform-origin: var(--radix-popover-content-transform-origin)` or equivalent). **Modals are the exception** — they aren't anchored to a trigger, so they keep `transform-origin: center`.

**Prefer CSS transitions over keyframes for anything rapidly re-triggered.** Transitions can be interrupted and retargeted mid-flight; keyframes restart from zero. Toasts, toggled states, and anything a user might fire repeatedly in quick succession should use transitions.

**Retargeting a running animation still shows as a jump** if the retarget itself is coarse — re-arming a CSS transition or bursting `playbackRate` changes reads as a stutter even though the property is technically transition-driven. Pace the motion once and keep it on a single timeline; two strips running on separate timelines desync from each other even when each one individually looks smooth (hoverboard, 2026-09-27 — item 3).

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

**iOS WebKit presents no frames while the main thread is busy — that holds even for compositor-driven CSS animations.** Smoothness during a heavy load phase (asset decode, hydration, a build step) needs every main-thread task kept under ~16ms across the animation's whole run: split the build phase, move decode/parse work to a Worker, pre-bake textures, and code-split rather than trusting "it's CSS, it's off the main thread" alone (hoverboard, 2026-09-27 — `hoverboard-viewer-loader-lessons-2026-09-27` item 2).

**Bake textures on the same GL backend the renderer ships with.** Canvas2D `lighter`/additive compositing is not bit-reproducible across rasterizers, and alpha-tested detail (fur, particles) amplifies the drift — a texture baked on one GL backend can visibly mismatch on another (hoverboard, 2026-09-27 — item 6).

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

## From-state is CSS; JS only reveals

Operator, 2026-09-30: *"is the flash / anything else an issue because we're java scripting
thing that should be css"* — yes. The stylesheet owns an element's initial visual state; a
canvas with no CSS default is visible from first paint and depends on JS hiding it in time,
and a fast refresh beats JS (hoverboard refresh-flash, 2026-09-30).

- Any enter animation's from-state is authored in CSS; JS never sets it.
- **A default-hidden rule targets the one element that has a reveal path** — never a bare
  selector (`canvas { opacity: 0 }` also hid the `.wireframe-overlay` canvas nothing reveals).
  The done-when enumerates every other element the selector matches.
- **A default-hidden element needs a fallback reveal**, guarded to run only if the entrance
  never ran — otherwise a build error leaves a blank page where it used to leave the last frame.

## Motion proof reads real paths

A motion fix proven only by a synthetic constant-speed scroll is not proven: three rounds passed
headless while the operator saw "only the first text block". Measure real reading paths
(flick-and-coast, stop-start), and when the operator names a reference that "handles this well",
read the reference first (rung 2) — a time-based, once-at-top-80% model answered in one read what
three builds did not (portfolio cloud session 3, 2026-10-01).

## Motion proof is painted, on-device, in order

Operator lessons 2026-10-02/03 (`flash-fix-broke-fade`, stagger 51dab4b). The done-when of any motion change states all three:

- **Painted frames, never computed style.** Sample painted frames across the whole transition (CDP screencast or a recording). A computed read says 0 before anything paints: #232 kept the blur but moved the fade to children that did not paint under a fixed backdrop-filter sibling until the route committed, with computed opacity green throughout. A fix that changes which element animates re-checks the animation itself, not only the bug it targeted.
- **The deployed preview is the proof surface.** A local-build pass is not device proof (stagger 51dab4b passed locally and failed on the operator's phone). When the preview cannot be driven (an Access block), the gap is stated in the operator's queue row, never left implicit.
- **The painted script asserts on-screen order.** Assert which element appears at each step by position at that breakpoint, as well as the gaps between steps; gaps alone pass a wrongly ordered stagger.

## Name the model before tuning

Operator lesson 2026-10-05 (hoverboard cursor companion: ~5 feel rounds tuned a riderless pendulum-and-tow model; asking "have we modelled a rider" fixed it in one round).

- **Name the real-world thing the motion imitates** and research how it actually moves (Researcher lane) before tuning; state that model to the operator in plain words.
- **Two "not right" rounds on one model: question the model, not the knobs.**
- **Directions and signs (lean, turn, swing) are verified on the rendered output** at the operator's framing, or flagged unverified; never asserted from the internal variable (the bank shipped reversed because the sign was checked in code).
- **Reference before physics.** Ask for, or measure, a reference the operator likes before modelling (source or recording; one React Bits study plus a 3-channel position-driven board fixed what seven physics-tuning rounds left "wobbly/confused/fighting", `session10-codify-candidates-2026-10-05` 6).
- **When the operator is unsure, ship a switch/knob** so they compare by feel.
- **After one device-vs-headless disagreement**, the next round starts from the operator's recording (`webapp-testing` § Pixel proof).

## Feel rows (input/scroll/hover speed)

A row about how fast something should feel — scroll speed, hover-dwell, drag response —
starts as a `prototype` lane (`skills/prototype/SKILL.md` rule 9), not a guessed number
tuned in place. Render the current value live on screen and expose it as a URL query-param
knob so the operator turns their own dial against their own real gesture (wheel, trackpad,
touch) — never a scripted/synthetic input. The shipped duration/easing/speed is read off
that pick, not invented then adjusted from feedback (row 119 history,
`orchestrator/operator-queue.md`).

## When reviewing UI motion

Use the Before/After/Why markdown table format — see [references/BUILD-DOS-AND-DONTS.md](references/BUILD-DOS-AND-DONTS.md) for the exact required shape and worked examples, or the **Review** section below for the full review posture and explicit Block/Approve decision. Never a vertical "Before: ... After: ..." list.
