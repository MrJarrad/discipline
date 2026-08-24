---
name: capture-motion-source
description: Capture a motion-design source — Jitter, After Effects, Figma motion/prototypes, Principle, Lottie files, or a plain video — into a normalized, measured motion spec (layers, timings, exact easing beziers, assets), bank it as a vault reference, and derive a neutral recreation brief for any target surface (Figma motion, CSS/JS, Remotion, native). Trigger on "analyse this animation", "recreate this in Figma/code", any jitter.video URL, a Lottie/.aep file, or a motion reference video. Not for live websites — that's capture-website; not for reading Figma design files for tokens/anatomy — that's capture-figma.
---

# Motion Source Capture

An animation watched is an animation guessed. Every recreation that starts from
"about a second, feels ease-out" ships wrong. The job: turn whatever the motion
source is into **measured numbers**, so any doer on any surface can rebuild it
exactly.

Two deliverables, same turn (bank-on-receipt applies to the source itself):
1. **Vault reference** — `references/<slug>.md` per the reference-database schema,
   holding the normalized spec below. The numbers survive; the session doesn't.
2. **Recreation brief** — authored under `Skill: discipline:dispatch-brief` for the
   operator's chosen target surface. The reference is the source of truth; the
   brief restates its numbers, maps easings to the target's vocabulary, and cites
   it.

## The normalized motion spec

Whatever the source, the capture converges on this shape — the interchange format
between any source playbook and any target brief:

- **Stage** — canvas size, background (exact hex if parsed, labeled approximate if
  pixel-sampled), total duration, native fps if any, loop behavior.
- **Layers** — name, z-order, geometry, what the artwork *is* (composition
  described; full-frame still vs positioned element changes the recreation
  approach).
- **Timeline rows** — one per animated property span: layer, property
  (scale/opacity/x/y/rotation/…), from → to values, start, duration, easing as a
  **cubic-bezier quadruple** (or spring params — never a tool's easing name),
  transform origin.
- **Pattern summary** — derive, don't just dump rows: per-layer cycle, stagger,
  deliberate overlaps ("next in starts 150ms before previous out ends so the
  stage is never empty" is intent a brief must carry), choreography groups.
- **Motion law** — bank `motion-law.md` in the capture folder using the same shape as
  [`motion`](../motion/references/LAW.md) / [capture-website motion-law template](../capture-website/references/motion-law-template.md).
  Pattern summary rows feed the law table (overlap, pile, raster, type enter, clocks).
  Video/tape is primary evidence — especially for sources with no DOM.
- **Assets** — extracted files where the source embeds them, named by playback
  order, exact px dimensions; else a named blocker in the brief.

## Source playbooks

Read the matching playbook in `references/` before touching the source — each holds
that tool's decode mechanics, easing-alias table, and traps:

| Source | Playbook | Fidelity path |
|---|---|---|
| Jitter share link | `jitter.md` | editor DOM decode; Lottie export as optional ground truth |
| Lottie / dotLottie (any exporter) | `lottie.md` | direct parse — highest fidelity, prefer whenever obtainable |
| After Effects | `after-effects.md` | .aep is opaque — Bodymovin export or keyframe dump |
| Figma motion / Smart-Animate | `figma-motion.md` | `get_motion_context` MCP first, reaction data second |
| Principle / no readable export | `video-sampling.md` | screen-record + frame sampling (fidelity floor) |
| Plain video (MP4/GIF reference) | `video-sampling.md` | same frame-sampling method |

An unlisted source still fits the pipeline: find its most data-like artifact
(export format > editor DOM/API > pixels), decode with the nearest playbook's
method, and add a playbook for it while the mechanics are fresh.

## Pipeline (source-agnostic)

1. **Acquire the most data-like form.** Ranked: machine-readable export > editor
   DOM/API read > frame-sampled pixels. Ask the operator for an export when
   sign-in gates it — but don't stall on the ask; decode what's reachable and
   upgrade when the export lands.
2. **Inventory** — layers, stack order, playback order, stage anatomy.
3. **Decode timings** — parsed values where possible; measured geometry (timeline
   rulers, frame indices) otherwise. Every number traces to a parse or a
   measurement, never to watching playback.
4. **Decode easings** — as bezier quadruples or spring params. Every tool's named
   easings are aliases for curves that differ tool-to-tool; resolve the alias to
   numbers (per the playbook's table) before it crosses into a brief.
5. **See the artwork** — screenshot or extract each layer's visual; describe
   composition. Extract embedded assets when the format carries them; verify one
   visually before trusting a name mapping.
6. **Normalize + pattern-derive** into the spec above and **`motion-law.md`** (law shape).
7. **Bank + brief** — vault reference + `motion-law.md`, then `discipline:dispatch-brief`; require
   `discipline:motion` of the receiver and add the target-surface mapping
   below.

## Target-surface mapping (goes in the brief)

- **Figma motion** — require `figma:figma-use-motion` + `figma:figma-use` of the
  receiver. Timings in ms; easings as *custom* curves (stock Figma named easings
  rarely match source curves — say so explicitly). Smart-Animate keyframe frames
  at boundary times are the fallback when timeline motion is unavailable; the
  receiver states which they used.
- **Code (CSS/WAAPI/JS)** — beziers map 1:1 to `cubic-bezier()`; staggers become
  delays; scale-from-center needs explicit `transform-origin`. Composited
  transforms + opacity only — anything else is a `motion-craft` review flag.
  Springs don't map to CSS beziers: keep spring params and target WAAPI/JS, or
  fit a bezier and label it a fit.
- **Remotion** — frames at the composition fps: `interpolate()` +
  `Easing.bezier(...)`, springs via `spring()`. Load `remotion` /
  `remotion-official` for conventions.
- **SwiftUI / native** — beziers via `timingCurve(...)`; prefer the platform
  spring where the source used one. Route through the platform skill
  (`ios`/`macos`).

Evidence contract for any target: implemented values vs spec in a table (±10ms for
parsed sources; the playbook's stated tolerance for sampled ones), a playable loop
export, and blocker-beats-placeholder for missing assets.

## Verification bar

- Every number traces to a parsed value or a measured rect — none from eyeballing
  playback.
- Timeline totals cross-check the stated duration.
- When two acquisition paths exist (editor read + export), cross-check one against
  the other and record the check; a mismatch means two versions — say so, don't
  average.
- Uniformity across layers claimed only after spot-checking at least two.
- Parsed values labeled exact; pixel-sampled or frame-sampled ones labeled
  approximate.

## Out of scope

Recreating the animation yourself (the dispatched doer's job), capturing live-site
motion (capture-website's `capture-motion.mjs`), and reading Figma design files for
tokens/anatomy (capture-figma).
