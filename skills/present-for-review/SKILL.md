---
name: present-for-review
description: >-
  Use when a build is ready for the operator: the preview link is up, send him the
  link, show him the build, present it, or UI work is engineer-done. One ready
  message with one link, or relaunch the native app.
---

# Present for review

Operator visual sign-off is the **running product** with the new build loaded —
not a screenshot, not a diff, not "it's in Applications."

The parent loads this; personas never skip present by telling the operator to find the build.
Read [references/DOS-AND-DONTS.md](references/DOS-AND-DONTS.md) when applying it. A slug in brackets names the vault ruling or lesson that holds the rule's history.

## When the link goes out

- **UI work: the operator is first eyes.** The preview link goes out the moment the build is up at engineer-done, before any reviewer is dispatched; review runs after the yes and **never gates the link**: he judges feel and direction on an uncertified preview (`2026-10-09-link-first-look-rounds`, `review-trails-the-operator-2026-09-20`). A "not right" restarts the build, not a review round.
- **Mechanism-only changes (generator, plugin, probes, gates, refactors with nothing to look at) are reviewed immediately at engineer-done, as before.** The reviewer never evaluates look. **Everything else** presents when the merge condition is met.
- **The operator's port serves the lane worktree**; the suite and the trailing review run at merge, after his yes (`doer-rules.md` § Repo and safety, `agents/reviewer.md` § Round cap). For UI work the operator is the cheapest visual gate (`doer-rules.md`): agent visual evidence is never a prerequisite for the link, nor a substitute for it.

## Before the link goes out

- **The preview is built, published and opening — hydrated, no error.** That is the whole look-round gate (`link-first-look-rounds`). Pixel proof, build-vs-export audits, the ledger's measured rows and scenario sweeps run **after the operator's yes**, sized to what merge needs.
- **Interactive or motion work: a live walk is part of link-ready** — real gestures on the deployed preview, and whenever the operator sends a recording ([PREVIEW-PROBE.md](references/PREVIEW-PROBE.md) § Live walk). Static look lanes are unchanged.
- **The driven-row check follows the yes**: one driven row per control type, because a screenshot proves look, not function; the link never waits on it, merge does (`ui-controls-never-clicked-2026-10-05`, `qa-acceptance` § The eight row classes).
- **After the yes, none of that is a review round**, and none is shown to the operator. Pixel proof is a **headed screenshot at the operator's viewport and each breakpoint family, with a pixel assertion on the region built** (a `getComputedStyle` read is not proof that anything painted), scoped by size class (`doer-rules.md` § Size class): **component** work's pixel proof is **one screenshot per Figma sample width (375 / 768 / 1280 / 1920), checked at a glance**; **line** carries no screenshot; **system** keeps the breakpoint-family proof.
- **A motion claim is proven from a real recording read frame by frame**, never from computed-style polls; a 3D page's recording needs the real GPU, so log the WebGL renderer and treat a software renderer as voiding any 3D timing claim (`hoverboard-viewer-loader-lessons-2026-09-27`, `hoverboard-loader-curve-lessons-2026-09-28`).

## Steps

### 1. Confirm the change is presentable

**Completion criterion:** UI work — the build is up and opening; do **not** wait for review or proof. Non-UI work — the merge condition is met. Never present a partial as the agreed update when the locked table was wider; say what is in and what is missing (`review-the-lock-not-the-slice`).

**Look at every disclosed gap before the operator hears it.** View a gap the doer names at zoom on the running build, then present it in his terms, so a round is not spent on a description (`lean-lane-cadence-2026-09-16`).

**Evidence never lands in the product repo.** Renders, probes and reports go to `~/JHD/vault/main/estate/captures/<product>-evidence/` with a manifest row; `scripts/evidence-archive.mjs` moves them.

### 2. Identify the live product

**Completion criterion:** Product named from workspace, handover or cockpit. No live product he signs → skip present; go to merge.

### 3. Native Mac — full quit, relaunch signed bundle

**Completion criterion:** Process gone; the **signed** bundle open with the new build (Capture: `/Applications/Capture.app` only, never `mac/.build/.../Capture`; others: the path in cockpit or handover). Capture mid-recording → do not quit; present waits until recording ends.

### 4. Web — ready message + one markdown hyperlink

**Completion criterion:** *Ready* + what to check + **one** markdown hyperlink; no Browser tab or window spawned as the present step.

- **DO:** *Ready to look. Hairline is off the pills. [jarrad.design](https://jarrad.design)*
- **DON'T:** open a tab he has to close, or ask for a hard refresh.
- **One link per ask, never a corrected link underneath** — rebuild the row with the right link, because the stale one gets opened.
- **Run `node <plugin>/hooks/scripts/preview-sha-check.mjs --branch <b> --sha <claimed> [--checks <owner/repo>]` and send the link only on exit 0** — a 200 from the preview proves nothing about which build it serves (`preview-link-relayed-before-push-verified-2026-10-05`).
- **Probe the served preview for the new code before relaying**, the check passes early. Recipe and host claims: [PREVIEW-PROBE.md](references/PREVIEW-PROBE.md).
- **The parent confirms the link opens hydrated with no error before sending it**, loading it itself; evidence is read after the yes (`link-first-look-rounds`; checks in `doer-rules.md` § Repo and safety), and an "unverified" the doer could have checked is sent back, not relayed.
- **Cloud portfolio previews:** a `preview/*` push publishes `https://preview-<branch>-jhd-preview-staging.jh-229.workers.dev`.
- **Before any look link, run the six link checks**: [PREVIEW-PROBE.md](references/PREVIEW-PROBE.md) § Link checks.

### 5. Cloud / no Mac parent

**Completion criterion:** Evidence says the Mac parent presents native; web uses hyperlink-in-chat from any parent. Never substitute "open Applications" or a screenshot.

### 6. Operator message

**Merge asks fold into the yes; the operator never gets a standalone technical question** (`2026-10-01-merge-asks-fold-into-the-yes`). The yes on a look row **is** the merge approval, cited in the merge message. Technical changes merge on the gate-run tail with no red finding, no ask, quoting the ruling in the commit; if a safety check still blocks, quote it once and fold the merge into the next look yes. Offer "reply 'merge when green' once" at most once per session. Scope and Destructive changes stay operator rows (`agents/references/reviewer-two-axis.md`). Never route around the guard (no auto-merge toggles, no settings writes).

**Completion criterion:** Short *Ready for review*: what changed, what to check, one link for web. No file paths, diffs, PR links, or "go look."

**A fix carries Problem/Solution; a feature doesn't.** A fix message leads with one-line **Problem:** (cause, plain words) and **Solution:** (what fixed it), before the link, so he isn't re-deriving cause (`2026-09-25-fix-asks-problem-solution`).

Example (fix, native): *Problem: the thin line around the pills was using the wrong line thickness from the design system. Solution: pointed it at the design system's 1-pixel line so it matches everywhere. Ready to look. Check the bar edges.*
Example (fix, web): *Problem: the thin line around the pills was using the wrong line thickness from the design system. Solution: pointed it at the design system's 1-pixel line so it matches everywhere. Ready to look. [jarrad.design](https://jarrad.design)*
Example (feature, web): *Ready to look. The pricing table now sorts by plan tier. [jarrad.design](https://jarrad.design)*

The message **ends with the `## Needed from you` block**: new asks plus checklist link (the session's projects' open rows live there), from `node <plugin>/hooks/scripts/needed-from-you.mjs --projects <prefixes> --short --new <ids>` (`skills/routing/references/OPERATOR-REPLIES.md`).

## Deploy commands stand alone

A preview build is never a promote; any production promote is its own standalone Bash call (`release-deploy` § Deploy commands stand alone).
