# Do's and Don'ts — motion (Build)

---

## Do

| Do | Why |
|----|-----|
| Apply the **should-it-animate** frequency check before writing any motion | Frequency drives the decision, not aesthetics |
| Use **`ease-out`** (custom curve) for entering/exiting UI | Starts fast, reads as responsive |
| Keep UI animation durations **under 300ms** (see table below) | Perceived performance |
| Start entrances from **`scale(0.9)`+ with `opacity: 0`** | Nothing appears from nothing |
| Make popovers **origin-aware** (`transform-origin` at the trigger) | Modals are the only centered exception |
| Add **`:active` press feedback** (`scale(0.97)`) to pressable elements | Confirms the interface heard the user |
| Animate only **`transform` and `opacity`** | GPU-only properties skip layout/paint |
| Use **CSS transitions**, not keyframes, for rapidly re-triggered UI | Transitions are interruptible; keyframes restart from zero |
| Gate hover animation behind **`@media (hover: hover) and (pointer: fine)`** | Prevents touch tap false-positives |
| Respect **`prefers-reduced-motion`** (keep opacity/color, drop movement) | Accessibility — reduced, not zero |
| Use the **Before/After/Why** markdown table when reviewing UI motion | Required format, see below |
| Use **springs** for interruptible gestures and "alive" elements | Maintain velocity when interrupted; CSS keyframes don't |

---

## Don't

| Don't | Why |
|-------|-----|
| Animate **keyboard-initiated or 100+/day actions** | Feels slow and disconnected at that frequency — never animate |
| Use **`ease-in`** on entering/exiting UI | Delays the exact moment the user is watching most closely |
| Animate from **`scale(0)`** | Reads as popping from nowhere |
| Use `transform-origin: center` on a **popover** (non-modal) | Should scale from its trigger; modals are the exception |
| Animate `padding`, `margin`, `width`, `height` | Forces layout + paint; use `transform`/`opacity` instead |
| Use **Framer Motion's `x`/`y`/`scale` shorthand** and assume GPU acceleration | Those props run on the main thread via `requestAnimationFrame`; use the full `transform` string |
| Ship a hover animation with **no pointer-capability gate** | Touch devices fire hover on tap |
| Animate purely because "**it looks cool**" on a frequently-seen element | Purpose test fails — no valid reason to animate |
| Use a vertical "Before: / After:" list format on review | Wrong format — must be a table |

---

## Branch-specific

### When asked to add or review motion on a command palette / keyboard-triggered toggle

**Do:** Recommend no animation at all; cite the frequency (100+/day) and the purpose test.

**Don't:** Add a "subtle" fade or scale "just to soften it" — subtle is still a regression at that frequency.

### When a crossfade looks off despite correct easing/duration

**Do:** Suggest a subtle `filter: blur(2px)` (cap ~20px) during the transition to mask the two-objects-overlapping artifact.

**Don't:** Keep tuning duration/easing indefinitely — blur solves a different problem than timing does.

### When reviewing UI code for motion quality

**Do:** Use the Before/After/Why table (below) — one row per issue found.

**Don't:** List issues as prose or a bulleted "Before: ... After: ..." pair.

---

## Output format (required for motion review)

When reviewing UI code for animation/motion quality, output a single markdown table:

| Before | After | Why |
| --- | --- | --- |
| `transition: all 300ms` | `transition: transform 200ms ease-out` | Specify exact properties; avoid `all` |
| `transform: scale(0)` | `transform: scale(0.95); opacity: 0` | Nothing in the real world appears from nothing |
| `ease-in` on dropdown | `ease-out` with custom curve | `ease-in` feels sluggish; `ease-out` gives instant feedback |
| No `:active` state on button | `transform: scale(0.97)` on `:active` | Buttons must feel responsive to press |
| `transform-origin: center` on popover | `transform-origin: var(--radix-popover-content-transform-origin)` | Popovers scale from their trigger (modals are exempt — keep centered) |
| Animation on keyboard shortcut | Remove animation entirely | 100+/day actions should never animate |
| Duration 400ms on a select | Reduce to 150-250ms | UI animations feel more responsive under 300ms |
| Hover scale with no media query | Wrap in `@media (hover: hover) and (pointer: fine)` | Prevents touch-tap false positives |
| `motion.div animate={{ x: 100 }}` | `motion.div animate={{ transform: "translateX(100px)" }}` | Framer Motion shorthand isn't hardware-accelerated |
| Keyframes on a rapidly-added toast | CSS transition instead | Transitions retarget smoothly; keyframes restart from zero |

Wrong format (never do this):

```
Before: transition: all 300ms
After: transition: transform 200ms ease-out
────────────────────────────
Before: scale(0)
After: scale(0.95)
```

A single markdown table with `| Before | After | Why |` columns, one row per issue — never a vertical list.

---

## Quick-reference tables

### Should it animate? (frequency)

| Frequency | Decision |
| --- | --- |
| 100+ times/day (keyboard shortcuts, command palette toggle) | No animation. Ever. |
| Tens of times/day (hover effects, list navigation) | Remove or drastically reduce |
| Occasional (modals, drawers, toasts) | Standard animation |
| Rare/first-time (onboarding, feedback forms, celebrations) | Can add delight |

### Duration by element

| Element | Duration |
| --- | --- |
| Button press feedback | 100-160ms |
| Tooltips, small popovers | 125-200ms |
| Dropdowns, selects | 150-250ms |
| Modals, drawers | 200-500ms |
| Marketing/explanatory | Can be longer |

### Custom easing curves (use these, not CSS built-ins)

```css
--ease-out: cubic-bezier(0.23, 1, 0.32, 1);      /* strong ease-out for UI interactions */
--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);  /* strong ease-in-out for on-screen movement */
--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);   /* iOS-like drawer curve, from Ionic */
```

### Spring configuration

```js
// Apple's approach (recommended — easier to reason about)
{ type: "spring", duration: 0.5, bounce: 0.2 }

// Traditional physics (more control)
{ type: "spring", mass: 1, stiffness: 100, damping: 10 }
```

Keep bounce subtle (0.1-0.3); reserve real bounce for drag-to-dismiss and playful interactions.

---

## Examples

**Good (review output):**

| Before | After | Why |
| --- | --- | --- |
| `transform: scale(0)` on dropdown entry | `transform: scale(0.95); opacity: 0` | Nothing appears from nothing |
| `ease-in` at 300ms on modal open | `ease-out` custom curve at 220ms | ease-in delays the watched moment; also over the 300ms budget |

**Good (framework applied to a new feature):**

```
Element: command palette open/close
Frequency: 100+/day (keyboard-triggered)
Decision: no animation — matches the Raycast baseline
```

**Bad:**

```
I added a nice 400ms ease-in fade when the command palette opens,
plus a bouncy scale-up from 0 so it feels more alive.
```

Wrong on three counts: animates a 100+/day keyboard action at all, uses `ease-in`, and animates from `scale(0)`.
