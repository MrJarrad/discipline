# Playbook: After Effects

`.aep` is an opaque binary — there is no direct read. Rank the acquisition asks:

1. **Bodymovin/Lottie export** (best): ask the operator to render the comp through
   the Bodymovin extension (or "Export → Lottie"). Then follow `lottie.md` — exact
   keyframes, beziers, and assets. AE structure note: parented nulls and precomps
   are pervasive; resolve the `parent` chain before attributing motion to a layer.
2. **Keyframe property dump**: with the project open, `Ctrl/Cmd+A` on a comp's
   layers, `U``U` to reveal animated properties, copy → paste into a text file
   gives a tab-separated keyframe dump AE users know; or an ExtendScript one-liner
   can walk `comp.layer(i).property(...)` — offer the operator a ready script.
   Yields times/values; easing tangents come as influence/speed pairs — convert:
   influence% /100 → bezier x, and speed relative to value delta → bezier y.
3. **Rendered video only** (floor): follow `video-sampling.md`; label everything
   measured-approximate.

AE-specific traps: comp fps ≠ 60 more often than not (read it, don't assume);
"Easy Ease" is influence 33.33/33.33 ≈ cubic-bezier(0.33, 0, 0.67, 1), not CSS
`ease`; graph-editor speed curves don't round-trip to a single bezier when a
keyframe has different in/out speeds — record per-segment beziers.
