# Do's and Don'ts — diagnosing-bugs

## Do

| Do | Why |
|----|-----|
| Build a **red-capable loop** before reading code for theories | This is the whole skill — everything else is mechanical once the loop exists |
| **Minimize** the repro one cut at a time | Shrinks the hypothesis space before you guess |
| Show **3–5 ranked hypotheses** before probing | Avoids anchoring on the first plausible story |
| **Tag** debug logs `[DEBUG-xxxx]` | Guarantees clean removal — one grep |
| Write the regression test **before** the fix, at a **correct seam** | Locks in the real bug pattern, not a shallow proxy |
| State the winning hypothesis in the **commit/PR message** | The next person debugging this doesn't repeat the search |

## Don't

| Don't | Why |
|-------|-----|
| Hypothesize without a loop | The exact failure mode this skill exists to prevent |
| Fix before minimizing | Wrong bug in view means wrong fix ships |
| "Log everything and grep" | Noise hides the signal you actually need |
| Refactor architecture **during** diagnosis | That's a post-mortem follow-up, not part of the fix |
| Reach for this discipline on **typos or obvious one-line errors** | Normal work — the heavy loop is overkill and slows you down |

## Branch-specific

### Performance regression
**Do:** baseline the measurement first, then bisect. Logs are usually wrong about where the time actually goes.

### No correct test seam
**Do:** document the absence as a finding and flag it as an architecture follow-up after the fix ships — not before.

### Cannot build any loop
**Do:** stop explicitly, list what you tried, and ask for environment access, a captured artifact (HAR, log dump, recording), or permission for temporary instrumentation.

## Examples

**Good:** Failing integration test → minimized to one API call → hypothesis #2 confirmed by a tagged log → regression test added at the correct seam → fix → debug logs grepped out.

**Bad:** Read the stack trace → changed a null check → user reports still broken → repeat, no closer to the cause.
