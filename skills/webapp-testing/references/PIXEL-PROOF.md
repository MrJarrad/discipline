# Pixel proof

Moved verbatim from `skills/webapp-testing/SKILL.md` (DISC-351 step 8); the skill points here.

A visual "is it on screen" claim is verified from pixels (recording or screenshot at the operator's framing), never from DOM state alone. Opacity, node identity and `elementFromPoint` read "visible" under a layer that paints over; DOM probes explain a pixel failure, they never pass one (footer, 2026-10-04: ~250 headless runs and two probe generations held while the phone showed it covered for 1-3 s).

**Headless is not the device.** Linux headless WebKit is not iOS Safari; a timeline (WAAPI `startTime`) proves intent, not what the phone paints. After one device-vs-headless disagreement, the next round's first step is the operator's own path from a recording (ask for it in that same reply), and its done-when names a device-faithful check. A third headless-only round is a routing failure.

**Drive the operator's real gesture.** A DOM `a.click()` is not the operator's click: it never hovers, so it skips the hover state his path sets (Time Circuits rounds 1-3 and header-rise rounds 1-2 passed on scripted clicks while the real hover-then-click set `html[data-gallery-project-hover]`, whose blur and recede caused every bug he saw). Any lane touching navigation, hover or page transitions drives a real mouse in headed Chrome: move, dwell, press. The brief names his device.

**Probe the operator's gestures and the page's real type** (`2026-10-18-text-wrap-reproduce-the-real-gesture`): every motion probe carries a
hover-wobble segment (small drifts across a line's edge, the way the operator hovers) and a scroll segment beside
travel, because clean sweeps hid a 125-per-second re-break; fixtures include a tall-type case (word boxes taller
than the line pitch), where rules written on short boxes deadlocked.

**Measure motion on the deployed page honestly** (`2026-10-17-measure-motion-on-the-deployed-page-honestly`):
install a fake clock **before** `goto`, and pause from the page's own time (`await page.evaluate(() => Date.now())`
plus a margin), never node's; report the subject's travel (x/y range) with every run, so a run where it never
moved reads as measuring nothing; count only what shows by the page's own visibility rule (cut, faded, clipped
are not visible); and run the measure on a known-good build first: it must read the known answer before its
number is trusted.

**Cloud device check:** `MrJarrad/jhd-device-tests` runs a tap path on a preview in real Mobile Safari (iOS Simulator, free runner), records the screen and returns a pixel verdict (`held` / `covered`); its README holds the trigger and request format. It reproduced the footer bug 6/6 and passed the fix 6/6.
