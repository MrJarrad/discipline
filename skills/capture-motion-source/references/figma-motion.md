# Playbook: Figma motion / Smart-Animate prototypes

Figma is the one source with a first-class MCP read — use data, not the editor UI.

1. **`get_motion_context`** on the file/node URL — returns the motion/timeline data
   for files using Figma's motion feature. This is the primary read; it gives
   per-property keyframes, durations, and curves directly.
2. **Prototype interactions** (classic Smart-Animate): `get_design_context` +
   `get_metadata` expose reactions per node — trigger, action, transition type,
   duration, and easing (named or custom bezier with points). Smart-Animate infers
   the *what* (matched layer names tween position/size/opacity/rotation), so the
   spec must record both keyframe states: capture the source and destination
   frames' geometry (capture-figma methods) and diff them — the diff *is* the
   timeline row set.
3. **Screenshots** of both states via `get_screenshot` for the artwork layer of
   the reference.

Figma named-easing aliases (resolve to numbers in the reference):

| Figma name | curve |
|---|---|
| Ease in | cubic-bezier(0.42, 0, 1, 1) |
| Ease out | cubic-bezier(0, 0, 0.58, 1) |
| Ease in and out | cubic-bezier(0.42, 0, 0.58, 1) |
| Ease in back / out back / in-out back | read the custom points from the reaction data — Figma exposes them |
| Gentle / Quick / Bouncy / Slow (springs) | spring params (mass/stiffness/damping) — record as spring, don't bezier-fit silently |

Trap: a prototype transition's single duration+easing applies to *all* tweened
properties at once — there is no per-property timing in Smart-Animate. If the
observed motion needs staggers, the file is using the motion feature (case 1) or
chained frames; find which before writing the spec.
