---
name: present-for-review
description: >-
  Present the live product to the operator — full quit and relaunch the signed
  native app; for web, ready message plus one markdown hyperlink in chat — never
  spawn Browser windows or send the operator to Applications. Load at engineer-done
  for UI work (the operator is first eyes; review runs after the yes and never
  gates the link), and when the merge condition is met for everything else;
  operator visual sign-off; "present it"; never "go check Applications."
---

# Present for review

Operator visual sign-off is the **running product** with the new build loaded —
not a screenshot, not a diff, not "it's in Applications."

Read [references/DOS-AND-DONTS.md](references/DOS-AND-DONTS.md) when applying this skill.

## When the link goes out

**UI work: the operator is first eyes.** The moment the build is up at
engineer-done, the preview link goes to the operator — before any reviewer is
dispatched. Review runs **after the operator's yes** and **never gates the
link** — nothing waits on a reviewer verdict to let the operator look (operator
ruling 2026-08-31, reaffirmed 2026-09-07: *"before, you are first eyes"*; ruling
2026-09-19: *"in general, do you think it would be better to focus our review
gates to once things are signed off?"* → *"yes, bank and encode it"*). The
operator judges feel and direction; the preview is explicitly uncertified. A
re-export or a "not right" restarts the build, not a review round. Mechanism-only
changes (generator, plugin, probes, gates, refactors with nothing to look at)
are reviewed immediately at engineer-done, as before. The reviewer never
evaluates look at all.

For UI work the operator is the cheapest visual gate (`doer-rules.md`) — agent visual
evidence is never a prerequisite for the link, and never a substitute for it.

**Everything else** presents when the merge condition is met — deterministic
gates green, no red finding open.

## Before the link goes out

**Pixel proof at the operator's framing, and a complete coverage ledger** — both in the doer's
return before the link is sent (operator ruling 2026-09-20, `accuracy-before-the-link`):

- A **headed screenshot at the operator's viewport and at each breakpoint family, with a pixel
  assertion on the region built**. A `getComputedStyle` read is not proof that anything
  painted — a footer that never painted reached the operator three times on computed-style
  evidence.
- A **coverage ledger** with a row for every item in the lane's contract (`qa-acceptance` §
  The coverage ledger). A missing row is red; the parent sends nothing on a ledger with holes.

Neither is a review and neither is shown to the operator: they gate the parent, not the link's
speed. The operator still judges look, first and alone.

## Steps

### 1. Confirm the change is presentable

**Completion criterion:** For UI work — the build is up; that is the whole gate,
and you do **not** wait for review. For non-UI work — the merge condition is met
(gates green, no red finding open). In both cases: do **not** present a partial
as the agreed update when the locked table was wider
(`review-the-lock-not-the-slice`); say what is in and what is still missing.

**Look at every disclosed gap before the operator hears it.** When the doer's return names a
visual gap — "clips a few tips", "one row still off" — the parent **views it at zoom on the
running build first**, then presents it in the operator's own terms. Relaying a gap you have
not looked at spends an operator round on a description (`lean-lane-cadence`, 2026-09-16).

- **DO:** open the build, zoom the named region, present *"Ready to look. Two tips clip at the top-left corner — everything else is on."*
- **DON'T:** forward the doer's sentence unseen and let the operator discover it is the whole surface.

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

The message **ends with the `## Needed from you` queue in full** — every open
`orchestrator/operator-queue.md` row's complete text, or *"Nothing needed from you."*
(`output-styles/discipline.md`).

## Who loads this

**Orchestrator / parent** — at engineer-done for UI work (first eyes; reviewer
dispatched only after the operator's yes), and when the merge condition is met
for everything else. Personas do
not skip present by telling the operator to find the build.
