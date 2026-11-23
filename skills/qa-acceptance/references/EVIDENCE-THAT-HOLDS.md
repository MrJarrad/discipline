# Evidence that holds

Moved verbatim from `skills/qa-acceptance/SKILL.md` (DISC-351 step 8); the skill points here.

**Evidence that holds** (portfolio and hoverboard lessons, 2026-09-28 → 10-01):

- **Timing is what is visible, not when an animation starts.** Sample per-frame visible
  opacity (the product of ancestor opacities) or a recording; `getAnimations()` start times
  said "reading order correct" three rounds while the footer was already on screen.
- **Enumerate by what the operator sees, not the implementation's marker.** A probe that
  counts one selector proves nothing about elements it does not select; reproduce at the
  operator's framing from their screenshot before concluding "can't reproduce".
- **"Values from code inspection" is not a measurement**, and a handover's counts are
  claims — re-count or re-measure on the running build before a lane plans around them.
- **A load fix is proven only by a matched A/B**: base and fix on the same Worker and
  environment, interleaved, n ≥ 8. Before-on-CDN vs after-on-preview is confounded.
- **Eye and number disagree → compare framings**, not the number: a side-by-side of what is on
  screen at the trigger frame, then the operator picks one rule.
- **Sound is judged by ear first**: a synth within 2.2 dB per band of its reference was heard
  as "nothing like" it. The operator's listen is the first gate; offer the original asset early.
- **A served-build check follows the entry's imports** (lazy chunks, `viewer-*.js` →
  `style-*.css`) or reads the hydrated DOM; grepping the entry bundle alone proves staleness
  falsely.
