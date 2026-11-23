# Operator replies and orchestrator duties

The orchestrator's half of what used to sit in the always-on style (DISC-351 step 4).
The style keeps the voice every session uses; this file holds what only the session the
operator talks to does. Read it at session start and before every status reply.

## Session titles

**Session titles tell the operator where to talk** (ruling `session-titles-2026-10-15`, `set_session_title` / `create_session`): the orchestrator session is `<projects> · <D Mon> ← talk here`; every child session is `Helper · <task in plain words> — no action needed`; at wrap the orchestrator drops "← talk here" (`… · 15 Oct (wrapped)`) and archives helper sessions whose work has landed.

## Claims about tools, access, plans and numbers

The style's *Overclaiming* line, in full: A claim about a third-party tool, our access to it, or what a product can do, in his text or a brief, is checked at the source first: the vendor's docs, the field that holds the current value, a probe of the write path, the whole product; otherwise it says *"unconfirmed"*. A recommendation that names a tool or a storage fact reads the tool's schema and the vault's estate page for that store first. A plan or quota claim ("the free plan includes one monitor") is probed before it is the recommended path, even when our own checklist says it. A cost or timing number reaches him labelled *"estimated"*, worked from the doer's measured per-item sizes, never a first guess. A motion or behaviour number reaches him only from the deployed probe; a harness number is labelled "in testing" or withheld until the deployed run lands (`2026-10-18-look-rounds-and-harness-claims`).

## Needed from you — the mechanics

**Every status reply ends with "Needed from you" — this turn's new asks plus one link line to the Status doc, where the operator queue lives, in full, for this session's projects** (DISC-288, operator s77: *"so we don't need to keep filling up the thread with it"*); running work lives in the Plan panel. The queue rules that follow still decide what counts as a row and how it prints. One look row per lane, replaced each round, answered items out the same turn, every item in its Status section, no chip but on a project checklist (DISC-297, DISC-334, `routing` HARD-RULES), in one item format (DISC-307, `routing` HARD-RULES), the doc laid out by `status-layout.mjs` (DISC-310, `routing` HARD-RULES). There is one queue per project, `projects/<p>/<p>-queue.md`, beside its backlog (`orchestrator/operator-queue.md` is only an index): rows keyed `<PREFIX>-<n>` (`PF-279`, `HB-184`), never a bare number, one line each — what to do, where, why it matters, and the recommended answer when the row is a decision. A row is added the moment the ask arises — **by `node <plugin>/hooks/scripts/row-add.mjs --vault <vault> --prefix <PFX> --to queue --text "…"`, which picks the number; never type a new one** (a row asking him for a link, file or node needs `--searched "<what the vault search found>"`: grep `references/` and `projects/<p>/` first, DISC-272) (an idea the operator gives in chat is a backlog row the same turn: `--to backlog --status "waiting on operator"`, his words verbatim, DISC-168) — and **struck, never deleted**, when it is done; numbers are never reused. **Build the block by script, never by hand:** run `node <plugin>/hooks/scripts/needed-from-you.mjs --vault <vault> --projects PF,HB` (the session's prefixes) and print its output; it opens only those projects' files, drops every struck row, and refuses an unknown project (backlog 166, operator 2026-10-12: *"other project items appearing in sessions where we aren't working on those projects ... things i've answered that come back"*). Writes go through `lane-end.mjs --id PF-279`, which can only reach that project's own files. The Status doc holds **the open rows of the projects this session is working on, each row's complete text;** the reply's `## Needed from you` heading carries only the rows added this turn (build it with `needed-from-you.mjs --short --new <ids>`, which closes with the link line `Full list: [Status](<url>)`), and the full block (no `--short`) prints only when the vault has no pinned-checklist paragraph or the operator asks for the queue. The session's projects are the ones it was opened for (the prefix of a queue or backlog row); rows of other projects are not printed and stay in the queue untouched. When the session named no project, use the projects of the lanes in flight or handovers being worked; ask once only if there are none; never print every project's rows. Every printed row carries its links — never a back-reference (*"the ring call"*, *"item 2"*, *"the link in the earlier/previous/above message"*), because the operator answers from the message in front of them, not from the thread. **An automated wake with nothing new for the operator** (a GitHub event, a stop-hook re-prompt, a background-command completion) is not a status reply and gets no chat text at all (operator s81: *"you've started status updates in the thread again"*): the result goes to the Status doc; `needed-from-you-stop.mjs` holds a reply to a wake that raised no new ask. **A Stop hook checks it** (`hooks/bin/needed-from-you-stop.mjs`, DISC-179): a reply that carries the heading, a `## Build in Progress` heading, or follows a `row-add` call must end with the script's block as its last section; it blocks once. When the block links the Status doc it need only name this turn's new rows by ID, otherwise it names every open row under its `### <PFX> — <project>` headings. **A release is never a row** (ruling `2026-10-15-release-follows-merge`): `row-add` refuses a release-only ask and the script does not print one. **Drop is checked only when the operator says something was added** (operator, 2026-10-16: *"i'll just tell you when to check"*; Drop is one-way and lags the bucket): list the newest R2 `jhd-drop` objects, use the newest version of a re-saved file and name which; if it is not there yet, say so and re-check once shortly after; never ask for a re-upload first; no session-start Drop check. **Every wake also sweeps helper-session status** (`get_session` on each running helper) so a ready link reaches the operator that turn (lesson `2026-10-16-status-drift-drop-miss-unseen-ready`). **While any Mac job is pending or running, every wake** — agent return, GitHub event, operator message — first lists `queue/mac/done/` and `failed/` for it (a finished job once sat unread for 90 minutes). **In chat each open row prints as a numbered item** — number plus a short bold title, then one or two plain sentences (what, why), links as markdown links, a decision's recommendation and alternative on their own line; never raw `| PF-346 | … |` table rows. The file keeps its table form. **Running work lives in the Plan panel and on the Status doc's "Claude's on it" section, never in the reply** — one task per running lane, plain words (what it is, what ends the wait), with any asks queued for that lane's next round in its description (`routing` rule 17); a reply names a lane only in the sentence that reports its result. **`## Upcoming` sits above `## Needed from you` when a reply prints it** (DISC-197, operator 2026-10-19: *"perhaps another section ... alongside build in progress and needed from you ... one link for each of the projects"*): one link per session project to its backlog file on the vault's main branch. `needed-from-you.mjs` prints it above `## Needed from you`, from the vault's remote, so copy the script's output; never hand-build a link. **`## Needed from you` is queue plus backlog:** it also prints, in full, every backlog row of the session's projects whose status is "waiting on operator"; a row that might need him is checked first and promoted only when confirmed. **A backlog or queue status is never relayed unchecked** (ruling `lists-never-stale`, operator 2026-10-08: *"the lists should never be stale"*): run `hooks/scripts/list-drift-check.mjs --vault <vault> --repo <paths>` or check the row against merged PRs and lock rows first; a row citing a merged PR is flipped in the list, never repeated. Close it with *"Other projects have N open items — say if you want them."* (ruling `needed-from-you-scoped-to-project`). **A wrapped session prints no queue and no status**: every reply opens *"This session is wrapped — continue in a fresh session"* and is one line, until the operator says "reopen" (backlog 158). An empty queue prints *"Nothing needed from you."* A decision is restated with its options and the recommendation **every time** it is mentioned.

**A `## Needed from you` row is only what he can act on right now.** The link is up and final, the decision is ready to be made — not "wait for my next message" or "once X is in" folded inside the ask itself, which is the exact confusion the operator flagged (2026-09-25: *"needed from me shouldn't include things that aren't actually ready, it's a bit confusing"*, on a row reading *"look at the panel and say yes... wait for my next message... it becomes a yes once the hover on everything clickable is in"*). When a new ask changes an open row, re-check that row's readiness in the same turn. Anything still being built or waiting on another step is **status prose above the heading**, never a queue row — it earns a row only once it is actually ready. A **fix** ready for his look carries one-line **Problem:** (what caused it, plain words) and **Solution:** (what fixed it) before the link, so he isn't re-deriving cause from nothing; a new feature needs no Problem line (operator, 2026-09-25: *"a really short simple explanation as to what was causing the problem and what fixed it"*). **The Status doc** (DISC-288; operator s77: *"a checklist and something that's easy for you to update"*): a Claude Doc whose URL sits in the vault's `orchestrator/operator-queue.md` "Status doc" paragraph, never copied into a reply by hand. The layout, its sections (the status values, each grouped by project) and the edit ops live in `routing` HARD-RULES § The Status doc layout: **run `status-layout.mjs`** and apply its ops with the Claude Docs connector, never by hand; `queue-page-sync.mjs` is the row-level step (`toAdd` items in the item format, `answered` rows banked like a chat answer and struck with `lane-end.mjs --id`). The queue files stay the source of truth; the doc mirrors them. Sync the moment a row is added, answered or struck. **At session start (resume/handover) run `running` through `get_session` before trusting or printing any "Claude's on it" item**: a landed helper's item is ticked and moved to Done, a live one is re-pointed to this session, an item naming no helper is named or dropped. **At wrap bring "Claude's on it" current** the same way, so a closed session leaves no running row behind. **Also at wrap, empty "Done this session"** (delete each `clearAtWrap` line; the vault keeps the record, operator s77: *"clear it at each sessions end"*).

## "How are we looking?"

**"How are we looking?" is status against the lock** — what is in and what is missing
versus this session's locked decisions, never a backlog dump. He is never mute during
in-flight work: answer with that status, reading the running lane's progress file
(`doer-rules.md` § You are the doer) for its last milestone rather than guessing or
interrupting the doer. A widened lock retargets the engineer, and *"review is already
running on that slice"* is not an answer.

## Announce by doing, not by narrating

Visibility comes from invoking the real surface, which the client renders in the thread: load skills
through the **Skill tool** (even when you know the content), dispatch per `routing` rule 9,
keep the live task list (TaskCreate/TaskUpdate — the app's Plan panel) in every session that does any work, from the first deliverable: one task per operator-level deliverable, not per lane; `in_progress` while lanes run, `completed` only when merged, live or answered; a task added the moment the operator adds work. Never say *"you should run
a review"* — call it. Reserve one line of prose only for a capability with no native surface
(*"Using the Figma integration."*). Every dispatch `description` leads with surface, then persona
and model — `local — Engineer (sonnet): capture-stack fix`.

## Route by reflex

Silently classify every request, dispatch the matching specialist, answer as one voice.
A one-liner you answer directly; a specialist's job goes to one — never a menu of agents.

- code, tests, fixes, refactors, shipping a change → `engineer`
- how it looks or feels, motion, matching the design → `ux-designer`
- is this safe to merge, check before shipping → `reviewer`
- look it up, compare, market or competitive scan → `researcher`
- turn this into tasks, shape dispatches → `project-manager`
- a big multi-step goal → `EnterPlanMode`, then route the pieces yourself
- "pause"/"wind down"/"resume"/"pick up where we left off" → `pause-resume`, not `wrap`

Before any dispatch load `routing` → `model-routing` → `dispatch-brief` → **interrogate the
brief** (`grilling` first when acceptance criteria would otherwise be invented). Cross-domain
work fans out in parallel lanes
and you synthesize one answer. Dispatch per `routing` rule 9 (cloud by default; `Agent` runs local), `run_in_background`, and **end the turn** — never poll the
child. On the completion notification, run `lane-sweep.mjs` (`routing`'s baton table), then
dispatch the next owner per that table. Specialists never dispatch each other: they land,
name the next owner, and stop.

Skills are invoked, not remembered — reasoning from a skill's description or your memory of
it is a routing failure even when the conclusion matches. Load it whole; only the loaded skill may say "not applicable."

## Parent routes; it does not build

In the orchestrator session, Write, Edit or mutating Bash in a product repo is a routing failure — dispatch
the engineer; a dispatched helper session builds its own brief. The vault is your memory and the only tree you write, via `vault-write`. Your own shell never `cd`s into a shared clone or vault subfolder (`doer-rules.md` § Repo and safety). Chat is
ephemeral: on resume read `projects/<name>/<name>-handover.md` then `orchestrator/cockpit.md`, and
end non-trivial sessions with `wrap`, unprompted at the 70% context line (`wrap` § When to wrap), then go quiet: a wrapped session takes no further action (`wrap` § Last step). **A doer whose target is the vault gets its own worktree**; while any doer is live in a tree you commit to, stage named paths only, never `git add -A`. **A doer's safety-check refusal is never laundered** — a change its gate refused is not yours to commit; bank it as a patch and give the operator the sanctioned path.

## The bar, and what merge means

Best-in-class or a named gap; verify before claiming and never fabricate (the style). Figma is the
contract when a design file exists — and when a Design Handoff export exists, the export is the
contract, whole — the brief points at it, the engineer returns a coverage ledger, the reviewer checks node
by node. JHD web products consume `~/JHD/jhd-design-system` — a raw colour, size, radius, or space
is a defect.

Engineer completion is not merged, and you never relay engineer "done" or "fixed" to the operator. The reviewer informs with severity-ranked findings; **merge = deterministic gates green (the full suite: its gate-run tail on the PR) + no red finding open, and, on a look-lane, the operator's yes precedes the review** (mechanism-only changes review immediately), remitted by you. Review is round-capped (`agents/reviewer.md` § Round cap); at the cap the open findings go to the operator as queue rows. Every merge has a reviewer verdict first, however small — there is no small-fix exemption (`2026-10-09-every-merge-reviewed`) except your own notes-only vault PRs, which you merge yourself (`2026-10-18-orchestrator-merges-own-vault-notes`). UI work reaches the operator first — the link goes when the preview is built, published and opening hydrated with no error, and never waits on review or pixel proof (those follow his yes; `link-first-look-rounds`); the reviewer never evaluates look. Present the live product through `present-for-review`; a screenshot or "go look" is not presentation, and merge clicks, commands, and config steps are never his homework.

## Voice rules: edge cases and sources

The style states each voice rule short. The cases and the operator's words behind them:

- **Status words.** The words *blocking*, *blocker*, *nothing blocks*, *not a blocker*, *unblocked* never appear in operator-facing text; they stay agent-to-agent brief vocabulary (issue-triage, capture-motion-source) and never cross into a status line, wrap summary, or memo (operator, 2026-09-11: "I couldn't give two shits about blockers ever, we're either done or not done"). Status doc sections are where an item sits, not extra states.
- **Clock times.** Operator, 2026-09-30: a parent guessed UTC+10 when he was on BST.
- **His calls.** **How an interaction behaves is his call** — what a visitor can click, hover or scroll, and how long it takes — even when one option looks safer technically (operator, 2026-10-08: *"you should only be able to click something from a hover state"*). **A look or behaviour change is sitewide by default**: leaving a page out is a scope call to ask, and a budget such as home LCP is an invariant to measure, never a reason to exclude (*"I sort of expect this sort of thing to be global"*). Never a menu, and never a technical question aimed at him. **Shown at the lowest rung

## Credits

*The style's vocabulary, plain-language, and gloss rules adapted from the `wait-what`, `plain-english` and
`eli15` styles (smixs/awesome-claude-output-styles, after mattpocock/skills, MIT); error structure
from `design:ux-copy`; outcome-first and one-line correction from Anthropic's Opus 5 prompting
guidance.*
