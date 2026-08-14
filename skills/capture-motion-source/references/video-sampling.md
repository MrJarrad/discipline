# Playbook: video / no readable export (Principle, ProtoPie, screen recordings, GIF/MP4 references)

The fidelity floor: when the tool has no readable project format or export (Principle
`.prd` is SQLite+opaque blobs; ProtoPie is cloud-locked) or the source *is* a video.
Everything measured here is labeled **approximate** in the reference — say so in the
brief too, and give the doer tolerance bands instead of ±10ms contracts.

**1 — get frames, not impressions.** `ffmpeg` (load the `ffmpeg` skill) the video
into a frame sequence at native fps: `ffmpeg -i in.mp4 -vsync 0 frames/%04d.png`
plus `ffprobe` for fps/duration. For a live tool with no export, screen-record the
playback first (`playwright-recording` for browser tools, QuickTime for native).

**2 — timing by frame index.** For each animated element, find first-motion and
last-motion frames by stepping the sequence (Read renders PNGs — bisect, don't read
every frame): start = firstFrame/fps, duration = (lastFrame − firstFrame)/fps.
Precision is ±1 frame — state it.

**3 — values by pixel measurement.** Element rects across sampled frames give
from→to for position/size; opacity reads from alpha compositing against a known
background (sample the same pixel region across frames). Scale-from-center vs
from-edge is visible in how the rect's center moves — record the origin.

**4 — easing by curve fit.** Sample the animated property at 5–10 in-between frames,
normalize t and value to 0–1, and fit a cubic bezier (least-squares over cp1/cp2, or
compare against the standard candidates + the source tool's known defaults). Report
the fitted quadruple **and** the residual; if the fit is poor, the motion is likely a
spring — fit spring params instead and say which model won.

**5 — assets.** Best full-visibility frame per element, cropped, is the asset stand-
in; flag real asset sourcing as a brief blocker (video frames are not production
artwork).

Tool hints: Principle's default curve is its "ease" ≈ cubic-bezier(0.25, 0.1, 0.25,
1) and its springs are tension/friction pairs; a screen recording of Principle's
preview at 60fps is usually cleaner than filming the timeline. For GIF sources
remember GIF frame delays are per-frame and often uneven — read delays from the file
(`ffprobe`/`identify -verbose`), don't assume constant fps.
