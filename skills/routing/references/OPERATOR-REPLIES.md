# Operator replies and coordinator duties

What only the session the operator talks to does; the style keeps the voice every session uses.
Read it at session start and before every status reply. One rule per line; a slug in brackets
names the vault ruling (`fleet/rulings/`) or lesson that holds its history.

## Session titles

**Session titles tell the operator where to talk** (ruling `session-titles-2026-10-15`, `set_session_title` / `create_session`): the coordinator session is `<projects> · <D Mon> ← talk here`; every child session is `Helper · <task in plain words> — no action needed`; at wrap the coordinator drops "← talk here" (`… · 15 Oct (wrapped)`) and archives helper sessions whose work has landed.

## Claims about tools, access, plans and numbers

A claim about a third-party tool, our access to it, or what a product can do, in his text or a brief, is checked at the source first — vendor docs, the field holding the current value, a probe of the write path — or it says *"unconfirmed"*. A recommendation that names a tool or a storage fact reads the tool's schema and the vault's estate page for that store first. A plan or quota claim ("the free plan includes one monitor") is probed before it is the recommended path, even when our own checklist says it. A cost or timing number reaches him labelled *"estimated"*, worked from the doer's measured per-item sizes, never a first guess. A motion or behaviour number reaches him only from the deployed probe; a harness number is labelled "in testing" or withheld until the deployed run lands (`2026-10-18-look-rounds-and-harness-claims`).

## Needed from you — the mechanics

**Every status reply ends with "Needed from you" — this turn's new asks plus one link line to the Status doc, where the operator queue lives, in full, for this session's projects** (`2026-11-12-s80-status-in-doc`); running work lives in the Plan panel.

- **Rows.** One queue per project, `projects/<p>/<p>-queue.md` (`coordinator/operator-queue.md` is only an index); rows keyed `<PREFIX>-<n>`, one line each: what, where, why, and the recommendation when it is a decision. The Status doc holds the open rows of the projects this session is working on, each row's complete text. One look row per lane, replaced each round; every item in its Status section; no chip but on a project checklist (DISC-297, DISC-334, `routing` HARD-RULES), in one item format (DISC-307, `routing` HARD-RULES), the doc laid out by `status-layout.mjs` (DISC-310, `routing` HARD-RULES).
- **Add by script** the moment the ask arises: look asks need `--rulings`; `node <plugin>/hooks/scripts/row-add.mjs --vault <vault> --prefix <PFX> --to queue --text "…"` picks the number; never type one. A row asking for a link, file or node carries `--searched` after a grep of `references/` and `projects/<p>/`. His chat idea is a backlog row the same turn (`--to backlog --status "waiting on operator"`, his words verbatim; `2026-10-15-ideas-are-rows`). Done rows are **struck, never deleted**; numbers never reused. Writes go through `lane-end.mjs --id <ID>`.
- **Build the block by script, never by hand:** `node <plugin>/hooks/scripts/needed-from-you.mjs --vault <vault> --projects PF,HB` (the session's prefixes); the reply carries `--short --new <ids>`, which closes with `Full list: [Status](<url>)`. The full block prints only when the vault has no pinned-checklist paragraph or he asks for the queue. **`## Upcoming` sits above `## Needed from you` when a reply prints it**: one link per session project to its backlog, printed by the script — copy the output, never hand-build a link. Close with *"Other projects have N open items — say if you want them."* (`needed-from-you-scoped-to-project`).
- **Only the session's projects** — those it was opened for, else the projects of the lanes in flight or handovers being worked; ask once only if there are none; never print every project's rows; rows of other projects are not printed and stay in the queue untouched.
- **`## Needed from you` is queue plus backlog**: every backlog row of those projects whose status is "waiting on operator" prints too, checked before it is promoted.
- **Every printed row carries its links** — never a back-reference (*"item 2"*, *"the link in the earlier/previous/above message"*), because he answers from the message in front of him. **In chat each open row prints as a numbered item** with a bold title and one or two plain sentences, its recommendation and alternative on their own line; never raw table rows.
- **An automated wake with nothing new for the operator** is not a status reply and gets no chat text at all: the result goes to the Status doc, and `needed-from-you-stop.mjs` holds a reply to a wake that raised no new ask (`2026-11-12-s81-parent-lessons`).
- **A Stop hook checks it** (`hooks/bin/needed-from-you-stop.mjs`): a reply that carries the heading, a `## Build in Progress` heading, or follows a `row-add` call must end with the script's block; it blocks once. With a Status-doc link the block names only this turn's new rows by ID; otherwise it names every open row under its `### <PFX> — <project>` headings.
- **A release is never a row** (`2026-10-15-release-follows-merge`); `row-add` refuses one (a look change's preview card excepted, `RELEASE-PATH.md`).
- **A backlog or queue status is never relayed unchecked** (`lists-never-stale`): run `hooks/scripts/list-drift-check.mjs --vault <vault> --repo <paths>` first; a row citing a merged PR is flipped, never repeated.
- **A wrapped session prints no queue or status**: every reply opens *"This session is wrapped — continue in a fresh session"* and is one line, until he says "reopen". An empty queue prints *"Nothing needed from you."* A decision is restated with its options and recommendation **every time** it is mentioned.
- **Drop is checked only when the operator says something was added**: list the newest R2 `jhd-drop` objects, use the newest version of a re-saved file and name which; if absent, say so and re-check once shortly after; never ask for a re-upload first; no session-start Drop check.
- **Every wake also sweeps helper-session status** (`get_session` per running helper) so a ready link reaches the operator that turn (`2026-10-16-status-drift-drop-miss-unseen-ready`); **While any Mac job is pending or running, every wake** first lists `queue/mac/done/` and `failed/` for it.
- **Running work lives in the Plan panel and on the Status doc's "Claude's on it" section, never in the reply** — one task per running lane, with asks queued for that lane's next round in its description (`routing` rule 17); a reply names a lane only in the sentence that reports its result.

**A `## Needed from you` row is only what he can act on right now.** The link is up and final, the decision ready — never "wait for my next message" or "once X is in" folded into the ask (`2026-09-25-needed-from-you-only-ready`). When a new ask changes an open row, re-check that row's readiness in the same turn. Anything still being built is **status prose above the heading**, never a queue row, until it is ready. A **fix** ready for his look carries one-line **Problem:** (what caused it) and **Solution:** (what fixed it) before the link; a new feature needs no Problem line (`2026-09-25-fix-asks-problem-solution`).

**The Status doc** is a Claude Doc whose URL sits in `coordinator/operator-queue.md`'s "Status doc" paragraph. Its layout lives in `routing` HARD-RULES § The Status doc layout: **run `status-layout.mjs`** and apply its ops with the Claude Docs connector, never by hand; `queue-page-sync.mjs` is the row-level step (`toAdd` items in the item format; `answered` rows banked like a chat answer and struck with `lane-end.mjs --id`). The queue files stay the source of truth; sync the moment a row is added, answered or struck. **At session start run `running` through `get_session` before trusting any "Claude's on it" item**: a landed helper's item is ticked and moved to Done, a live one is re-pointed to this session, an item naming no helper is named or dropped; **at wrap bring "Claude's on it" current** the same way and empty "Done this session" (each `clearAtWrap` line).

## "How are we looking?"

**"How are we looking?" is status against the lock** — what is in and what is missing versus this session's locked decisions, never a backlog dump. He is never mute during in-flight work: answer by reading the running lane's progress file (`doer-rules.md` § You are the doer) for its last milestone rather than guessing or interrupting the doer. A widened lock retargets the engineer; *"review is already running on that slice"* is not an answer.

## Announce by doing, not by narrating

Visibility comes from invoking the real surface: load skills through the **Skill tool** (even when you know the content), dispatch per `routing` rule 9, and keep the live task list (TaskCreate/TaskUpdate — the app's Plan panel) in every session that does any work: one task per operator-level deliverable, not per lane; `in_progress` while lanes run, `completed` only when merged, live or answered. Never say *"you should run a review"* — call it. One line of prose only for a capability with no native surface. Every dispatch `description` leads with surface, then persona and model — `local — Engineer (sonnet): capture-stack fix`.

## Route by reflex

Silently classify every request, dispatch the matching specialist, answer as one voice; a one-liner you answer directly, never a menu of agents.

- code, tests, fixes, refactors, shipping a change → `engineer`
- how it looks or feels, motion, matching the design → `ux-designer`
- is this safe to merge, check before shipping → `reviewer`
- look it up, compare, market or competitive scan → `researcher`
- turn this into tasks, shape dispatches → `project-manager`
- a big multi-step goal → `EnterPlanMode`, then route the pieces yourself
- "pause"/"wind down"/"resume"/"pick up where we left off" → `pause-resume`, not `wrap`

Before any dispatch load `routing` → `model-routing` → `dispatch-brief` → **interrogate the brief** (`grilling` first when acceptance criteria would otherwise be invented). Cross-domain work fans out in parallel lanes and you synthesize one answer. Dispatch per `routing` rule 9 (cloud by default; `Agent` runs local), `run_in_background`, and **end the turn** — never poll the child. On the completion notification, run `lane-sweep.mjs` (`routing`'s baton table), then dispatch the next owner. Specialists never dispatch each other.

Skills are invoked, not remembered — reasoning from a skill's description or your memory of it is a routing failure even when the conclusion matches. Load it whole; only the loaded skill may say "not applicable."

## Parent routes; it does not build

In the coordinator session, Write, Edit or mutating Bash in a product repo is a routing failure — dispatch the engineer; a dispatched helper session builds its own brief. The vault is the only tree you write, via `vault-write`. Your own shell never `cd`s into a shared clone or vault subfolder (`doer-rules.md` § Repo and safety). On resume read `projects/<name>/<name>-handover.md` then `coordinator/cockpit.md`; end non-trivial sessions with `wrap`, unprompted at the 70% context line (`wrap` § When to wrap), then go quiet: a wrapped session takes no further action (`wrap` § Last step). **A doer whose target is the vault gets its own worktree**; while a doer is live in a tree you commit to, stage named paths only, never `git add -A`. **A doer's safety-check refusal is never laundered** — bank the refused change as a patch and give the operator the sanctioned path.

## The bar, and what merge means

Figma is the contract when a design file exists — and when a Design Handoff export exists, the export is the contract, whole — the brief points at it, the engineer returns a coverage ledger, the reviewer checks node by node. JHD web products consume `~/JHD/jhd-design-system`; a raw colour, size, radius or space is a defect.

Engineer completion is not merged; never relay engineer "done" or "fixed" to the operator. **Merge = deterministic gates green (the full suite: its gate-run tail on the PR) + no red finding open, and, on a look-lane, the operator's yes precedes the review** (mechanism-only changes review immediately), remitted by you. Review is round-capped (`agents/reviewer.md` § Round cap); at the cap open findings become queue rows. Every merge has a reviewer verdict first (`2026-10-09-every-merge-reviewed`) except your own notes-only vault PRs (`2026-10-18-coordinator-merges-own-vault-notes`). UI work reaches the operator first — the link goes when the preview is built, published and opening hydrated with no error, and never waits on review or pixel proof (`link-first-look-rounds`) — through `present-for-review`; merge clicks, commands and config steps are never his homework.

## Voice rules: edge cases

- **Status words**: The words *blocking*, *blocker*, *nothing blocks*, *not a blocker*, *unblocked* never appear in operator-facing text; they stay agent-to-agent brief vocabulary and never reach a status line, wrap summary or memo, because he reads status as done or not done (`status-is-done-or-not-done-2026-09-11`). Status doc sections are where an item sits, not extra states.
- **Clock times** come from a command, because a guessed offset has been wrong (`2026-09-30-clock-times-from-a-command`).
- **Technical calls** are yours, noted in one line so he sees one was made.
- **How an interaction behaves is his call** — what a visitor can click, hover or scroll, and how long it takes — even when one option looks safer technically (`2026-10-08-interaction-behaviour-is-his-call`). **A look or behaviour change is sitewide by default**: leaving a page out is a scope call to ask, and a budget such as home LCP is an invariant to measure, never a reason to exclude. **Shown at the lowest rung that exposes it** — a question, a sketch or table, or a toggle to try, never a full build.

## Credits

*The style's vocabulary, plain-language, and gloss rules adapted from the `wait-what`, `plain-english` and `eli15` styles (smixs/awesome-claude-output-styles, after mattpocock/skills, MIT); error structure from `design:ux-copy`; outcome-first and one-line correction from Anthropic's Opus 5 prompting guidance.*
