---
name: present-for-review
description: >-
  Present the live product after reviewer PASS — full quit and relaunch the signed
  native app; for web, ready message plus one markdown hyperlink in chat — never
  spawn Browser windows or send the operator to Applications. Load after reviewer
  PASS (and ux-designer when look/feel) when the change has a live product the
  operator signs off on; operator visual sign-off; "present it"; never "go check
  Applications."
---

# Present for review

Operator visual sign-off is the **running product** with the new build loaded —
not a screenshot, not a diff, not "it's in Applications." Parent orchestrator
loads this skill **after reviewer PASS** (and ux-designer when look/feel) when
the change has a live product. Engineer bundles before review; present is the
last step before the operator looks.

Read [references/DOS-AND-DONTS.md](references/DOS-AND-DONTS.md) when applying this skill.

## Steps

### 1. Confirm agent review cycle is complete

**Completion criterion:** Reviewer returned **PASS**; ux-designer ran when the
change is look/feel. If either is missing → do **not** present; dispatch the
missing gate first. Do **not** present a partial as the agreed update when the
locked table was wider (`review-the-lock-not-the-slice`).

### 2. Identify the live product

**Completion criterion:** Product named from workspace / handover / cockpit
(Capture.app, Squish, portfolio, Skillz, …). Risk-only or discipline-only
work with **no** live product the operator signs → skip present; proceed to
merge remittance.

### 3. Native Mac — full quit, relaunch signed bundle

**Completion criterion:** Process is gone; signed Applications bundle is open
with the new build.

- If Capture is **mid-recording** → do **not** quit; tell the operator present
  is blocked until recording ends.
- Else: **full quit** the app, wait until the process is gone, then `open` the
  **signed** bundle the product names.
- Capture: `/Applications/Capture.app` only — never `mac/.build/.../Capture`.
- Squish and other native apps: Applications path from cockpit / handover.

### 4. Web — ready message + one markdown hyperlink

**Completion criterion:** Operator chat message is *Ready* + what to check + **one**
markdown hyperlink — no new Browser tab or window spawned as the present step.

- **DO:** *Ready to look. Hairline is off the pills. [jarrad.design](https://jarrad.design)*
- **DON'T:** Open a new Browser tab/window they have to close.
- **DON'T:** *The hairline pass is in Applications — go look.* (native homework still banned)
- **DON'T:** Ask for a hard refresh or *nothing else until you look* — web present is one markdown hyperlink in chat; operator is never muted.
- Agent-internal Browser for reviewer/ux-designer evidence is separate — not the operator packet.
- Do not dump a screenshot as the review packet.

### 5. Cloud / no Mac parent

**Completion criterion:** Evidence states Mac parent must present native; web may
use hyperlink-in-chat from any parent.

- Cloud VM cannot quit the operator's Mac app.
- Return that the Mac parent must run native present (quit + relaunch).
- Do **not** substitute "open Applications" or a screenshot.

### 6. Operator message

**Completion criterion:** Short *Ready for review* — what changed, what to check.
Native: after quit+relaunch. Web: include **one** markdown hyperlink in the same
message. No file paths, diffs, PR links, or "go look."

Example (native): *Ready to look. Hairline is off the pills; same fill. Check the bar edges.*
Example (web): *Ready to look. Hairline is off the pills. [jarrad.design](https://jarrad.design)*

## Who loads this

**Orchestrator / parent** after reviewer PASS when the change has a live product
the operator signs. Personas do not skip present by telling the operator to find
the build.
