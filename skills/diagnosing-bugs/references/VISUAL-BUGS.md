# Visual bugs: the picture first

Moved verbatim from `skills/diagnosing-bugs/SKILL.md` (DISC-351 step 8); the skill points here.

Any visual bug, on any device or browser ("disappears", "flickers", "covered", "looks wrong"): the
first step is the operator's recording or screen frames (ask for one if missing). Frame-step the
failing moment and write down what is painted on top, in order, before any theory. Check the cheap
visual causes before timing or state logic: stacking/z-index, clipping, an ancestor's opacity, a
layer painted over. Verify the fix from pixels, never DOM state alone. Two rounds of one theory
that do not move the operator's result: re-derive from the picture, not from the last theory. When a second round of any kind fails, ask for or use the operator's recording before theorising (header-rise round 4 found the exit-ghost cause only from his 120 fps recording). A third failed round on one effect stops tuning: re-read the ask, play it back to the operator and tune only on his confirmation (the fade/blur band took rounds 8-11; the confirmed read-back fixed it in round 12; a stronger model fixed judgment, not interpretation).
(Footer, 2026-10-05: ~10 rounds of timing and state theory; one frame-step showed the arriving
image painting over it; fix was one z-index rule.) Pixel proof: `webapp-testing` § Pixel proof.
A pixel measure of a recording (word matching by box overlap, flash counts) is validated first on a known-calm reference, such as a plain window resize: if the calm reference reads busy, the measure cannot tell a moved thing from a vanished one. Measure flashing from the page's own state (`2026-10-18-text-wrap-reproduce-the-real-gesture`).

---
