---
name: present-for-review
description: >-
  Present the live product to the operator — full quit and relaunch the signed
  native app; for web, ready message plus one markdown hyperlink in chat — never
  spawn Browser windows or send the operator to Applications. Load at engineer-done
  for UI work (the operator is first eyes; agent review runs concurrently and never
  gates the link), and when the merge condition is met for everything else;
  operator visual sign-off; "present it"; never "go check Applications."
---

# Present for review

Operator visual sign-off is the **running product** with the new build loaded —
not a screenshot, not a diff, not "it's in Applications."

Read [references/DOS-AND-DONTS.md](references/DOS-AND-DONTS.md) when applying this skill.

## When the link goes out

**UI work: the operator is first eyes.** The moment the build is up at
engineer-done, the preview link goes to the operator. Agent review runs
**concurrently** on the same change and **never gates the link** — nothing waits
on a reviewer verdict to let the operator look (operator ruling 2026-08-31,
reaffirmed 2026-09-07: *"before, you are first eyes"*). The operator judges
feel and direction; the preview is explicitly uncertified, and the reviewer
never evaluates look at all.

**Everything else** presents when the merge condition is met — deterministic
gates green, no red finding open.

## Steps

### 1. Confirm the change is presentable

**Completion criterion:** For UI work — the build is up; that is the whole gate,
and you do **not** wait for review. For non-UI work — the merge condition is met
(gates green, no red finding open). In both cases: do **not** present a partial
as the agreed update when the locked table was wider
(`review-the-lock-not-the-slice`); say what is in and what is still missing.

**Evidence never lands in the product repo.** A round's renders, probes and reports go to
`~/JHD/vault/main/estate/captures/<product>-evidence/` with a manifest row — `scripts/evidence-archive.mjs`
moves them and a repo law test fails on new evidence or probe files in-tree.

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

**Orchestrator / parent** — at engineer-done for UI work (first eyes, review
concurrent), and when the merge condition is met for everything else. Personas do
not skip present by telling the operator to find the build.
