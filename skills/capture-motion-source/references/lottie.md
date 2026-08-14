# Playbook: Lottie JSON / dotLottie

The highest-fidelity source form — everything is exact. Prefer it whenever any tool
can export one (Jitter, After Effects via Bodymovin, Figma plugins, Rive→Lottie).

**Never Read the raw file** — exports run to tens of MB, almost all of it
base64-embedded assets in `assets[].p`. Parse with node. dotLottie (`.lottie`) is a
zip: unzip, then treat `animations/*.json` the same way.

## Where everything lives

- **Stage:** root `w`/`h` (px), `fr` (fps), `ip`/`op` (in/out frame) →
  duration = `(op − ip) / fr`.
- **Layers:** root `layers[]`; `ty` 0 = precomp, 2 = image, 3 = null, 4 = shape,
  5 = text. `ind` is z-index, `parent` chains transforms, `refId` points into
  `assets[]`. Animations often live on nulls or nested precomp layers — walk the
  refId chain; don't assume top-level.
- **Keyframes:** `ks.s` scale, `ks.o` opacity, `ks.p` position, `ks.r` rotation.
  `a:1` means animated; `k[]` holds keyframes with `t` (frame) and `s` (value).
- **Easing — exact:** keyframe tangents `o:{x,y}` = cp1 and `i:{x,y}` = cp2 of the
  cubic bezier between that keyframe and the next. `h:1` = hold (step).
- **Colors — exact:** shape fills `ty:"fl"`, `c.k` as 0–1 RGB (×255 → hex).
- **Transform origin:** `ks.a` (anchor point) relative to layer — this is the
  scale/rotation origin; briefs must carry it.

## Assets

Embedded images: decode `assets[].p` base64 into the reference folder, named by
playback order — this removes the missing-assets blocker from the recreation brief
entirely. Map image→layer by walking each animated precomp's refId chain; **verify
one image visually** before trusting the mapping. Then bank a **stripped** copy
(`motion-stripped.json`, payloads replaced by `<stripped:WxH.png>` placeholders —
KBs, not MBs) next to the PNGs; never commit the raw export to the vault.

## Cross-check

If the Lottie arrived alongside another acquisition path (editor read, video),
cross-check timings between the two and record the check. Mismatch = two versions
of the file; report which is newer, don't average.
