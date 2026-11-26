# Baton handoff table

Moved verbatim from `skills/routing/SKILL.md` (DISC-351 step 8); the skill points here.

| Just finished | Next owner (on the completion notification) |
|---|---|
| **Doer read-back returned** | **Parent** answers or says go — same agent, same context, continues |
| Engineer landed, **look-judged** | **Operator**: link when preview opens (`link-first-look-rounds`); proof, merge on yes → **Reviewer trailing** |
| Engineer landed (behaviour / plugin / product) | **Reviewer**, once gates are green |
| Engineer landed, **small fix** (single file, gates green) | **Reviewer** (LIGHT) like any other change — every merge has a reviewer verdict first, however small (`2026-10-09-every-merge-reviewed`; notes-only vault PRs excepted, `2026-10-18-orchestrator-merges-own-vault-notes`); brief **states the review record** |
| **Operator says yes to a try-out** | Yes first (`reviewer.md` precondition 3), then **Reviewer** gates merge, or park aloud, before that slot reopens (rule 17) |
| **Researcher returns** | **Parent** turns the return into a queue decision row (`row-add.mjs`) the turn it lands; never leaves it in chat |
| **Prototype / knob lane** | **Operator** — the pick; no reviewer, no suite |
| Reviewer returns **red** | **Engineer** (`resume`) — round 2, red only |
| Reviewer returns **amber / note** only | Merges green; follow-ups ship **in-session, before wrap** (discipline always; elsewhere `line` size, else banked — `wrap` § Follow-ups ship before wrap) |
| **Round 2 red still open** | **Operator** — halt at the cap (`agents/reviewer.md` § Round cap); `node <plugin>/hooks/scripts/needed-from-you.mjs --projects <prefixes>` row |
| **Doer returns "already satisfied/true" on an operator-raised row** | **Parent** reproduces at the operator's own framing before relaying — a claim, not a result (2026-09-23, `reproduce-lane-already-works-before-relay`) |
| Look/feel / Figma or reference match | **UX Designer** (reviewer never evaluates look) |
| Merge condition met | Live product → **`present-for-review`**, parent remits |
| **Progress file silent 15 minutes** | **Parent reads the worktree diff directly** — no stop yet; an ETA reply quotes the dispatch time against the last milestone (`doer-rules.md` § You are the doer) |
| **Progress file silent 30 minutes** | **Parent stops the lane** — fresh `Agent`, re-briefed from the last recorded milestone (`doer-rules.md` § You are the doer) |
| **Lane stopped/interrupted** (session end, crash, notification status stopped) | **Parent reads the worktree diff + progress file** — **fresh** `Agent` only, never a resume (`lanes-survive-interruption`, Resume section above) |
| **Merged main changes unreleased** | **Parent** releases (`RELEASE-PATH.md` § Release follows merge); no operator row, one line after |
| **Lane landed** | **Parent runs** `node <plugin>/hooks/scripts/lane-end.mjs` on the completion notification — sweep, queue-row replace + verify, backlog-row flip (`--backlog`), evidence commit + push, drift check, PR gate-run tail read — one call (`spend-levers` rule 5, `lists-never-stale`); archive its helper (rule 19) |
| **Preview build / rulebook sync / DS regen / merge-after-review** | **Parent runs the script** — [MECHANICAL-SCRIPTS.md](MECHANICAL-SCRIPTS.md) |

**In a Claude Project** (`2026-11-26-s114-projects-layout`) the coordinator thread is the parent: it starts the session-start sequence, and there is no parent-session chain to continue. Every ask there that needs the operator's answer (a look, a merge go, a destructive or scope call, an approval) is a decision card (`2026-11-26-s115-asks-go-on-decision-cards`): one question, one recommended option, one named alternative, never plain text; a card's tap is his answer, a relayed "yes" is not; `## Needed from you` still names the open ask with its link, and the question lives on the card. A thread that finishes its task starts its project's next Claude-startable backlog row unasked (`2026-11-26-s115-pickable-work-never-sits`): status `open`, no open thread or PR owns it, not waiting on the operator; rows waiting on him (his media, review, Figma export, go-live) stay parked. A 9:00 and 14:00 London sweep starts any such row no thread owns.
