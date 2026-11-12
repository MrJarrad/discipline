# routing — the hard rules in full

SKILL.md carries each rule as the one line that decides a dispatch. This file is the
full text: the evidence behind each rule, the failure that produced it, and the
sub-clauses a contested case needs. Nothing here was rewritten — it is the 1.78.0
SKILL.md body, moved.

# Routing — who does the work

The orchestrator's job is dispatch. Doing work inline that a persona or skill
owns is a routing failure **even if the output is correct** — it starves the
fleet, bypasses skill discipline, and makes usage unauditable. Skills do not
auto-fire; the always-on identity gate in `rules/routing.mdc` is what every
turn sees. Evidence: in the week of 26 Jul–1 Aug, the orchestrator ran its own
Explore agent 18 times while Researcher was dispatched once and 14 of 30 skills
never fired. 16 Aug 2026: the parent classified hover scatter as “do directly”
and queued the chat as the doer — that hatch is deleted.

## Hard rules (non-negotiable)

1. **Research never stays home.** Any lookup, comparison, market/competitor
   question, "what's the best X", "cutting edge", or sourced question about the
   live world → dispatch **Researcher**, whose method is `research-synthesis`
   (WebSearch + WebFetch; never training memory). Never answer research from
   memory; never substitute Explore/general-purpose for live-world research.
   **Question shape, not only topic:** "is X good for Y", "compare", "should we use" goes to
   the Researcher; the parent may give at most a one-line holding answer labelled unverified
   (session 9, 2026-10-04: Xcode Cloud answered inline with services named from memory).
2. **Figma reads go through `capture-figma` on the dispatched persona.** A pasted
   figma.com URL, "fresh sync", "the figma version", "discrepancies with figma", or
   any need for instance `componentProperties`, tokens/variables/variants/component
   names/copy from a design file → brief names file+node; the **doer** loads
   `capture-figma` and reads via REST (`scripts/figma-node.mjs` /
   `scripts/figma-capture.mjs`, or banked capture JSON). Parent capture-figma
   **locates** only (file key, node id, frame; MCP ping the tab is fine). A brief that
   pastes the finished prop table is a steer — name the node; live props win. Figma
   screenshots in chat are context, never a substitute. **Figma MCP tools reach only the
   generic `claude` agent type** — `ux-designer` lanes cannot see the deferred `use_figma`
   tools; a `claude`-type lane with an explicit ToolSearch `select:` list can. **In a cloud
   session no subagent gets them**: brief the REST route (`capture-figma/references/LANES-AND-TOOLS.md` § No-export lanes);
   the parent alone holds the MCP and `use_figma` writes. The annotation
   setter re-escapes `&` on every whole-array write: write every entry from decoded text in one
   shot and re-read. A `use_figma` annotation lands on the nearest instance of the text you walk
   from (`.ActionButtonTitle`): walk up to the outermost instance whose name has no `.` prefix first.
3. **Built-vs-design checks go through `audit-build`** ("the blocks are off",
   "doesn't match figma", post-port verification) — dispatched to UX Designer.
4. **Live-site references go through `capture-website`** ("look at this site",
   "like pentagram does", any external URL offered as a reference).
5. **Explore/Plan are reconnaissance only.** The orchestrator may use built-in
   Explore/Plan for its own codebase orientation before writing a brief — never
   as a substitute for work a persona owns, and never for anything the operator
   asked to be researched, designed, built, reviewed, or released.
6. **The fleet merges and ships, never the orchestrator** (operator ruling,
   2026-07-26). **The reviewer informs; the gate-run tail and the parent decide.** Reviewer returns
   severity-ranked findings (red / amber / note), never a bare merge verdict and never
   a write. **Merge condition: deterministic gates green + no red finding open** —
   the parent remits, loading **`present-for-review`** first when a live product
   exists, then dispatching merge execution to Engineer (mid-stream integration) or
   Release Ops (release-gated). **Engineer complete is not merged.** After engineer
   lands, solicit review before the operator hears "fixed". **Every merge has a reviewer verdict first** — a one-line test-only PR gets a LIGHT pass; "small, gates green" is not a
   review record (`2026-10-09-every-merge-reviewed`; notes-only vault PRs (jhd-vault, markdown records, indexes, queue/backlog rows only; scripts, hooks, CI, settings get a reviewer) are the orchestrator's own merge, `2026-10-18-orchestrator-merges-own-vault-notes`). Checked: `hooks/bin/merge-review-gate.mjs` refuses `mcp__github__merge_pull_request` unless it pins `expectedHeadSha` and a reviewer verdict on that head (comment or review, shape in `agents/reviewer.md` § Verdict) saying `merge: yes` was read in the session; a MrJarrad/jhd-vault PR passes only when it is shown notes-only: by `node <plugin>/hooks/scripts/vault-pr-files.mjs --vault <vault> --pr <n>` (names only, bound to the head; use this; `<plugin>` as an absolute path, the one the gate's refusal prints) or by `get_files` reads (every patch in context; s44 spent 43.8k chars on three); the gate fails closed. `merge-after-review.mjs` refuses the same (#361, `2026-10-18-helper-waits-for-go`). **Resume pulls main first:** `git fetch origin main`, cockpit and handover from `origin/main`, every "running" lane re-checked
   against live PR/branch state before any dispatch (`resume-reads-vault-main-first-2026-10-10`).
   **One review per change; LIGHT is the standing tier** — see `agents/reviewer.md`
   for the tier and round-cap law.
7. **Grill before dispatch.** Non-trivial build/design: if the decision frontier is
   not empty, load `grilling` and lock the tree (experience questions, recommended
   answers) before `Agent`. Cannot write ACs without inventing requirements → grill,
   not dispatch. Explicit operator skip ("just build it") is the only bypass. Locked
   decisions go verbatim into every brief.
8. **Baton — parent-only `Agent`.** **Only the orchestrator `Agent`-dispatches.** When the handoff
   table names the next owner, the **parent** `Agent`-dispatches them on the system completion
   notification — do not wait for the operator to "notice." Default `run_in_background`;
   **end the turn** after dispatch — do not AwaitShell/poll the specialist. Specialists
   are doers (`doer-rules.md` § You are the doer) — they land, name the next owner in evidence, and stop. Parent
   silence **after the completion ping** is a routing failure. Waiting **inside** the
   dispatch turn is also a routing failure. Parent is **not a waiting room** (still owns
   grilling, operator voice, every `Agent` dispatch, merge remittance when the merge
   condition is met).
9. **Dispatch surface — operator's rule: "if a task can be done in cloud, it is."**
   Every dispatched agent is a doer — build, fix, verify, triage, review, audit,
   research alike; the cloud default covers all of them, and the only test is
   capability, never lane taxonomy. Why: the operator works in transit — a dropped main
   session is cheap (orchestration resumes), a dropped local doer dies mid-lane.

   **Local is justified by exactly three needs**, named in one clause in the brief:
   (a) **verifying the deployed surface** or presenting it for review — the only
   operator-facing surface is the deployed URL, and cloud egress 403s `*.workers.dev`;
   (b) **machine-bound stacks** — `:4411` capture listener, Capture.app helper,
   figma-daemon, interactive-auth MCPs; (c) **this machine's own state**. A read-only task
   (research, reading files, a search) needs none of the three, so it goes to cloud too: an `Agent`
   call from the parent runs local (s46, DISC-232: *"I mean the general rule is if it can be cloud it should be"*).
   A `local —` brief says which, on one line: `Local because: (a) …`, `(b) …` or `(c) …`;
   `agent-dispatch-gate` refuses a local dispatch without it.

   **A cloud capability gap that is not machine-bound is a setup defect to close**, never a
   reason to route to the Mac queue (operator, 2026-10-03: "there shouldn't be anything a cloud
   session can't do unless it's actually something like running my mac"). When a cloud action is
   refused, name which layer refused it (Claude's permission check, GitHub access, or network
   policy) and give the operator the one-time setting that closes it.

   **A Mac job carries only the Mac-bound step** (operator, 2026-10-02: "why is this task going to a
   local agent?"): split a release into cloud steps (gate, push) and a Mac step (plugin install),
   and the brief names why each step is machine-bound. A Mac job that reads the vault pulls it
   first — a stale checkout refused a gate on lessons already encoded. Cloud pushes branches but
   not tags (git proxy 403 on `refs/tags`): release tags go via a Mac job until the proxy allows them.
   **Queuing a Mac job merges the vault branch to main in the same action** — the runner claims only
   from main, and a Drop-recording job sat pending on the session branch for over an hour (`session10-codify-candidates-2026-10-05` 3);
   the job's first step names the vault sha it expects (`vault-write` § Banked means on vault main).
   Mid-session too (DISC-221, s43: a tag job waited until its notes PR merged): the notes-only PR that files the job is
   the parent's own merge, that turn. DO: file the job, merge its PR, then report it queued. DON'T: leave it for wrap.
   **A Mac job cannot open an Access-gated preview** — `*.workers.dev` previews 302 to Cloudflare Access, and only the
   cloud proxy injects credentials. A Mac GPU measurement on a preview needs an Access service token in the Mac's
   environment (never the vault) or a local build; until one exists, ask the operator for the one-line device check.
   **A round ends at its merge** (`merge-each-approved-round-2026-10-06`: "one open change per approved
   round or slice, merged to main as soon as it is approved and its gates are green"). Stacking a new
   round on an unmerged branch is malformed; a lane's done-when is the merge of that round.

   **Egress-gap scope (operator correction, 2026-08-30).** The `*.workers.dev` gap
   blocks only the check of the **deployed** surface. A doer slice verifying its
   own build on its own port (`doer-rules.md` § Ports) is **not** machine-bound — cloud VMs build and
   Playwright-verify localhost fine. "Faster", "interactive", or "read-only" is not a clause either.
   Misused 2026-08-30 to run five engineer slices local; operator flagged "all local".

   **The surface is chosen
   when a lane opens, not per task** — same-domain follow-ups resume the standing
   specialist on whatever surface it already lives; never bounce a domain between local
   and cloud mid-stream (context is the asset). **Outgrown/mis-surfaced lane = explicit
   handoff:** wrap the lane's evidence into a fresh brief on the right surface and
   re-dispatch — a deliberate handoff with a named context cost, not a retroactive
   routing failure. **Overlay gate (front-loaded precondition):** cloud dispatch
   requires the target repo to already carry committed discipline overlays — cloud
   doers get only what the repo commits, the local plugin does not travel. No overlays
   means overlay refresh (`plugin-update-syncs-everywhere`) is the standing blocker to
   clear before dispatch; a local dispatch on an overlay-less repo is a named fallback
   in the brief, never the default reach. **Visible on every dispatch:** the `Agent`
   `description` leads with the surface — `cloud — persona (model): task` / `local —
   persona (model): task` — and a local brief carries the one-clause machine-bound
   justification; the mechanic lives in `dispatch-brief`'s "Persona + model" section —
   this rule is the law, that skill is the enforcement point.
10. **`review-the-lock-not-the-slice`.** **First failure point (parent brief):** the locked
   table is the spec — **the brief must copy it whole.** One AC per locked row; a slice AC
   set against a whole-surface lock is **malformed — do not `Agent`**. Parent does not
   write a slice brief of a whole-surface lock. **Work batches ≠ spec width** — caps must
   not drop locked rows (see `dispatch-brief`). **Paired briefs:** engineer and reviewer
   briefs share the **same current locked table** — never dispatch reviewer on an earlier
   narrower table, and the reviewer brief names the lock's **live path** so the reviewer
   re-reads it rather than trusting the snapshot — a drifted spec is a **red finding**.
   **Noted without failing is not a clear review** (e.g. notes wrap-as-one-blob and clears
   it). Then: engineer covers every row (or operator-deferred). Do **not** solicit review
   until every locked row is claimed or deferred. Spec incomplete → **red**. Operator widens lock mid-flight → parent **retargets** standing engineer; an
   in-flight review of the old slice is **not** protected — do **not** answer with *Review
   is already running on that slice. No second pass.*
11. **Dispatch on the completion notification only.** Harness resume/reconnect prompts
   after a background specialist are noise — **not leftover**, not unfinished plugin work.
   Parent `Agent`-dispatches the next owner on the **completion notification**. Re-sending
   or re-polling can **double-dispatch**. Never assign "resume the agent" or "send a
   message to unstick" as operator homework. Do not revert baton to a blocking in-turn
   dispatch to dodge notification handling.
12. **"pause"/"resume" load `pause-resume`, not `wrap`.** "pause", "I need to pause",
   "wind down", "stop for now", "let's stop here" → no new dispatches, stop running
   agents at their next safe point, bank a one-screen snapshot, confirm in one line.
   "resume", "pick up where we left off", "carry on from the snapshot" → read the
   snapshot, re-dispatch each interrupted lane as a fresh continuation. Pause is not
   `wrap` — wrap remains the full session close.
13. **The full suite/build runs once per PR in a cloud gate-run lane (no GitHub Actions on private repos), its tail posted on the PR — never inside each lane.** A lane's own
   gates are only the touched ones its size class names (`doer-rules.md` § Size class).
   The parent runs `lane-sweep.mjs` on every completion notification, and for a landed or stopped lane also `lane-sweep.mjs --clean-artifacts <worktree>...`, which removes that worktree's `node_modules` and `.next` and refuses a root clone, so source and the shared DS clone are never touched. When a lane's PR merges the parent removes its worktree in the same step (`git worktree remove <path>`; s76: fourteen finished worktrees took the disk to 100%). Before every heavy dispatch the parent reads `df` as well as load: `cloud-dispatch` § Capacity before dispatch. DO: remove the worktree as the merge lands, then read `df`. DON'T: leave finished worktrees for the wrap. A full suite over
   the Bash tool's foreground timeout is its own gate-run lane, dispatched and polled,
   never run from the parent shell (`doer-rules.md` § Repo and safety), and it posts its tail on the PR (`doer-rules.md` § Gate-run tail). A lane stops
   only its own pids (`doer-rules.md` § Repo and safety).
14. **Never relay a backlog or queue status unchecked** (ruling `lists-never-stale`,
   2026-10-08). Before the parent tells the operator what is open, in flight or done,
   it runs `hooks/scripts/list-drift-check.mjs --vault <root> --repo <path>...` (or
   checks merged PRs and lock rows by hand). A row is judged against the default
   branch of its own project's repo: a bare `#n` never resolves against another
   project's repo, and a PR the check cannot resolve is `unknown`, never done.
   `lane-end.mjs` flips the row in the lane's own commit and runs the check last; `wrap`
   runs it before the report (`wrap/references/REPORT-AND-LEARN.md`).
   **An ask that cites rows is checked first** (DISC-221, s43: closed rows offered as "which look next?"):
   `row-add.mjs --to queue` refuses a row naming its project's IDs unless each is open and
   `list-drift-check.mjs` ran in the last 15 minutes. DO: run the check, then add "HB-196 or HB-197?".
   DON'T: copy row IDs from the handover into a new ask.

15. **Heavy lanes are capped per container** (step-failures audit, 2026-10-15). On one 4-core
   container about ten lanes ran suites, builds and headless browsers together: load averaged
   38-44, and the failures were `timeout`/exit-143 kills and suites that pass alone. A heavy step
   (full suite, build, headless browser) counts one; `nproc / 2` is a **ceiling on all heavy lanes
   together**, not a quota — a container may run fewer, never more. Inside it the per-kind rules still
   hold: never two full suites at once (`doer-rules.md:166`) and one browser repro at a time, no parallel
   Chromium (`skills/dispatch-brief/references/HOUSE-RULES.md:36`). Before dispatching a lane whose brief names a heavy step the parent runs `cloud-dispatch` § Capacity before dispatch
   (disk, load, heavy count); over it, the lane goes to a child cloud session. Lighter lanes (read, write, review) are uncapped.
   A doer under load runs touched-file tests and leaves the full suite to the gate-run lane (`doer-rules.md` § Repo and safety).

16. **Lanes sharing a repo** (preview-builds-and-stale-heads, 2026-10-14). Up to three lanes pushed one
   `own-tool/slice-2` and `preview/own-tool-2`: four read stale local refs and reported the wrong head, and two
   Workers builds failed about two minutes in while another was running (same code built clean locally; the
   Builds log was unreadable). The parent states the live head (`git ls-remote origin <branch>`) in every go
   message when lanes share a branch; each lane `git fetch`es and rebases before each push, never force. Added
   2026-10-15: the parent serialises `preview/*` pushes per repo: a lane's brief says when it may push, and a lane that is
   ready asks the parent rather than pushing. The parent knows a push is in flight from its own record of the
   last push plus the versions list; when it stops being in flight is defined once, in
   `present-for-review/references/PREVIEW-PROBE.md` item 6. Five portfolio preview builds failed while several
   lanes pushed at once.

17. **Finish before opening** (ruling `2026-10-15-finish-before-opening`, operator 2026-10-15: *"do we often leave
   tasks open or switch to other tasks with finishing things. I've noticed in the canvas session when i start talking
   about something else we sort of end up half doing a job and not finishing and switching focus."* Accepted: *"this
   sounds good, wouldn't we just despatch more workers to accomodate though?"*; the limit is not workers but the
   operator's looks, one-at-a-time preview builds that rate-limit, and branches drifting from main). One session
   counted 3 shipped, 7 try-outs open and unmerged, 3 mid-build pile-ups, one ask missed.
   (a) **Cap:** at most 3 look-lanes (try-outs waiting on or heading to the operator's eyes) open per session. A new
   look topic beyond that is a backlog row (`row-add.mjs`, his words verbatim) unless he says "now". Work that needs
   no look (gate runs, reviews, fixes, releases, research) is not counted; the capacity rule (15) still bounds it.
   (b) **Finish line:** after his yes a try-out goes review, gate, merge, or is explicitly parked or dropped, before
   its slot takes a new look topic.
   (c) **No mid-build piling:** a new ask about a lane that is already building queues for that lane's next round
   unless tiny (one value or word), and the queued asks print under `## Build in Progress` (output style).
   Checked: (a) `session-resume.mjs` counts Next-block lanes marked `look: yes` that are still open and warns at 3 or
   more (`wrap/references/SECTIONS.md` writes the key); inside a live session the count is the parent's, since no
   hook sees which lanes are look-judged. (b) and (c) are judgment: they turn on the operator's words.

18. **A fix round changes only what the operator named** (DISC-169, session 25: round 2 of the glow and of the text
   wrap each rebuilt the whole effect; operator: *"we went way to far in the wrong direction"*). The round-2 brief and
   the doer's read-back each carry a `Stays the same` list (every behaviour, value and look the operator did not
   name); the round changes the named thing and nothing on that list. On a look lane, swapping the mechanism
   (how the effect is made, not a value inside it) is a new try-out: it waits for the operator's yes first.
   Checked: judgment, from the operator's words; `BRIEF-CRAFT` item 18 and `agents/engineer.md` carry the clauses.
19. **Helper sessions are archived once their lane lands** (DISC-175, operator 2026-10-15: *"can we also archive
   helper sessions once they're complete as part of the dicsipline update"*; DISC-195, 2026-10-19: *"do we need to optimise anything in
   discipline so it's more clear what do with helpers?"*). A helper is a `create_session` child (`cloud-dispatch` § Capacity before
   dispatch). The whole recipe (source repo and `add_repo`s, title and tags, model, read-back and go, the return on the PR, the sweep,
   the archive) is `cloud-dispatch/references/HELPER-SESSIONS.md`; read it before the first `create_session`. At lane end, after its
   result is banked (the PR comment or evidence file is read), the parent calls `archive_session` on it. When the next round of a lane
   starts, the superseded round's helper is archived then. A helper whose result is not yet banked is never archived.
   **The helper sweep runs at session start and at wrap** (DISC-211; DISC-212, operator 2026-10-28: *"archive it when it's task is
   complete or if another session takes over"*; 2026-10-31: *"aren't being archived when completed or possibly worse aren't being
   completed"*). **At wrap** save `list_sessions` (every page) to files and run `node <plugin>/hooks/scripts/helper-sweep.mjs --self <own id>
   --sessions <file>… --keep <helpers whose PR waits on a look or review> --merged <helpers whose PR merged> --landed <session-dir>/landed-helpers`; wrap writes the Keep and
   Surface ids, and its own id, on the cockpit wrap block's `Helpers:` line. **At session start** call `get_session` only on the ids in
   that `Helpers:` line, save each result, and run the same sweep with one `--sessions` per file; the start sweep never pages
   `list_sessions` (DISC-224, s44: 25.3k chars). It sorts every
   un-archived helper: archive (completed, and its parent wrapped or was archived, or its PR merged), keep, surface (blocked,
   review-ready, failed or quiet past 12 hours under a wrapped parent). Call `archive_session` on each archive row; the surface
   list is taken over or reported in the status; a refused archive is one line in the status, never dropped.
   **Rule 1: a helper whose work has landed ends archived, with no sidebar step for the operator** (DISC-291, operator s78: *"the helper session must archive/must be archived when completed"*). The sweep archives a completed helper under a live parent once it is landed (`--merged`, `--landed`) or has been quiet past 12 hours. It never archives one with an open PR (`--keep`: DISC-280, archiving closes the draft) or one waiting on an operator answer recorded in the queue (`--waiting <ids>`); under a wrapped parent those are Re-point rows, not Archive rows. The Stop hook holds the turn (up to 3 times) until every Archive row has an `archive_session` call after the sweep; a refused call counts, and its refusal is one named line in the status.
   **Rule 2: a helper still holding open work when its parent wraps is adopted by the next parent** (DISC-291, operator s78: *"helpers with work continuing across parent sessions need to be continued by the parent session"*). Adopt = re-point (the Re-point row's message, whatever generation the old parent was), track (the sweep prints a `Helpers:` line of every helper still open, and wrap writes that line to the cockpit, plus its own id; a count, "orphans" or "the operator's sidebar" is never a substitute for ids, and the Stop hook holds a wrap whose last cockpit write adds one, seen through Edit, Write or a Bash heredoc; a cockpit written by a script from a file is invisible to it), archive later (this parent's own sweep). At session start run `helper-sweep.mjs --cockpit <cockpit.md>` (it prints ids and is not the sweep; the sweep is the call with `--sessions`) for the ids on the last five `Helpers:` lines and `get_session` each, so a helper an intermediate wrap dropped is still found.
   **At session start the parent sends each Re-point row its message** (DISC-221, s43: every s42 helper kept reporting to
   the wrapped s42 parent): the sweep's `## Re-point` list carries one `send_message` text per helper whose parent wrapped,
   naming the new parent's id; send it once, that turn. DO: send the row's message as printed. DON'T: wait for the helper to
   write to the old parent and re-point it by hand.
   **A Re-point or any parent-id message carries the parent's own session id read from `get_session` (no id) and pasted, never retyped from the Claude-Session footer** (s74: a mistyped id made both helpers flag the mismatch).
   **Both are checked and fed by script** (DISC-268, operator 2026-11-08): the Stop hook holds the turn (up to 3 times) until every Re-point row has a `send_message` after the sweep; `lane-end --helper <session id>` records a helper whose work landed in `<session-dir>/landed-helpers`, and `helper-sweep.mjs --landed <that file>` archives it, so finished helpers do not idle across sessions.
   **A parent session is never archived** (operator 2026-10-31: *"it's important the we don't archive the parent sessions though,
   i'm a bit nervous about that"*): a helper is a session with a parent and a title starting "Helper ·"; every other session,
   wrapped, "← talk here" or otherwise, is a parent, lands in no list, and is never passed to `archive_session` by any session.
   **Hooks enforce it** (DISC-262, operator 2026-11-07: *"just archive the helpers we don't archive parent sessions, there was meant to be something in discipline that handles all this"*): `hooks/bin/archive-guard.mjs` denies `archive_session` unless this session's transcript showed that id (via `get_session` or `list_sessions`) with a "Helper ·" title and a parent and an open-PR lookup (session id, then each branch; DISC-315, `HELPER-SESSIONS` § 4) shows no open PR for it; `hooks/bin/helper-sweep-stop.mjs` blocks an orchestrator session's Stop (one that read the cockpit, or ran the wrap skill) once per session and phase until `helper-sweep.mjs` has run successfully (after the wrap skill, at wrap). A saved `get_session`/`list_sessions` result may keep its `<other-session>` wrapper; the sweep and the guard both read the JSON inside it. DO: `get_session` the helper first, then archive. DON'T: archive from memory of an id.
   **A helper starts without a go** (`2026-10-18-helper-waits-for-go`: round 17 sat 90 minutes at "reply go to start").
   Every `create_session` prompt opens with "This message is your task — run it now." (s38: a helper read a prompt opening
   with anything else as a background notice and never started), then the parent's session id and "start now, no go needed",
   then the step "First run: mkdir -p ~/.claude && echo <parent id> > ~/.claude/helper-session".
   The parent checks each new helper with `get_session` within 5 minutes of dispatch and on every wake,
   and answers a blocked helper the same turn.
   **A helper's return reaches the parent** (DISC-216, operator 2026-10-29: *"do we need to fix something in discplines so
   helpers are communicating better?"*; s37 a return sat ~8h unread). Every `create_session` brief closes with "Send the full
   return to the parent with send_message (session_id "@parent")." The Stop hook `parent-return-stop.mjs` holds a helper
   (marked by `~/.claude/helper-session`; no env var marks one, `CLAUDE_CODE_CHILD_SESSION=1` is set in the orchestrator too)
   once when its turn ends with a return and no `send_message`. The parent arms one `send_later`
   sweep about 50 minutes out per `create_session` dispatch as the backstop, and deletes it when the return arrives.
   **DO:** prompt opens "This message is your task — run it now. Brief from your parent (session session_01…); start now, no go needed. First run: mkdir -p ~/.claude && echo session_01… > ~/.claude/helper-session", closes with the send_message line; one `send_later` armed; `get_session` 5 minutes later.
   **DON'T:** dispatch the helper and next look at it when the operator asks "how are we looking?".
20. **Redirect a running lane on one channel** (`2026-10-08-redirect-a-running-lane-on-one-channel`): a `SendMessage` redirect resumes
   that agent even after it has returned; until its next hand-back arrives the work is in flight there, so never dispatch a second lane
   for it meanwhile. To move the redirect to a fresh agent, `TaskStop` the old one first and say so in the new brief. One worktree, one
   agent applies to redirects too.
21. **A merge's gates include every test that renders the touched component** (`look-yes-merge-needs-suite-of-touched-area-2026-10-12`):
   before any merge, including a trailing-review merge on the operator's yes, run `git grep -l <ComponentName> -- '*.test.*'` and those
   files, not a hand-picked directory (a footer fix merged on "perfect" turned main red via `nav-optical-edge.test.tsx`). An unexplained
   failure in a lane's run is red until named.
22. **Agents may mark a reviewed draft PR ready** (ruling `2026-10-15-agents-may-undraft-reviewed-prs`): in MrJarrad repositories, once it
   has a passing gate run and a reviewer verdict with no red finding. The operator saved the allow entry in the Default environment's setup
   script on 2026-10-15, effective from the next session; where a session's safety check still refuses, un-drafting stays the operator's
   click. This supersedes "never the helper" in `release-deploy/references/RELEASE-PATH.md` for that case only.
   **A wake-event turn that changed nothing is not a return** (DISC-294, s79: 5+ "no change" notes on pf #584). A wake-event turn (a GitHub bot edit, a green check suite) is a return only when it made an edit, a push, a commit or a GitHub write, or says `next: parent`; `parent-return-stop.mjs` lets any other wake turn end with no chat text at all (the s81 wake rule; the result goes to the Status doc). DO: end the turn when an event changes nothing. DON'T: send the parent "no change" per event while waiting on the operator.
23. **A yes opens a lane the same turn** (DISC-221, s43: PF-938's text glow got the operator's yes and no lane was opened
   until he asked). When the operator says yes to a build row, the parent dispatches it that turn and writes the lane's branch
   or PR into the row's Notes. `session-resume.mjs` lists every open row carrying an operator yes and no lane id as
   "approved, not started". DO: dispatch, then add `lane claude/text-glow` to the row. DON'T: bank the yes and move on.
24. **The first status reply comes before housekeeping** (DISC-224, operator 2026-10-31: *"is there anything we should disconnect or
   do to make session start less heavy on context?"*; s44 merged 15 PRs and paged 40 sessions before its first reply, 22% of
   the window). A starting or resuming parent sends its first status reply from three reads only: `session-resume.mjs`,
   `needed-from-you.mjs` and the cockpit. Merges, the helper sweep, re-point messages and PR or session reads come after it, in a
   turn the parent starts itself with one `send_later` (`delay_minutes: 1`) armed before the reply. Measured by
   `node <plugin>/hooks/scripts/start-cost.mjs <transcript.jsonl> --max 40000` (tool-result chars through the first status reply;
   s44: ~176.7k). DO: arm the follow-up, reply,
   then merge and sweep. DON'T: read PR files and session lists before the operator has a status.

Compare refs without touching the working tree (s74): to compare lint, tests or files against another ref, add a throwaway
worktree (`git worktree add`) and read there. DO: compare against another ref in a throwaway `git worktree add`. DON'T: check another ref's files out over the working tree (`git checkout <ref> -- .` overwrote 13 just-committed vault files).

Reviewed branches stay still (s75): once a reviewer is dispatched on a PR, push nothing more to that branch until it merges; new notes wait or go on their own branch. DO: a fresh branch for the next note. DON'T: push a note commit onto a branch a reviewer has a verdict on (#1029: two commits landed past the reviewed head; the merge gate refused). Not a hook: a push cannot be tied to a PR's reviewer without false denies.

Figma contracts need Figma tools (s75): a brief that says "read the Figma live" goes only to a vehicle that has the Figma tools (a helper session); the parent checks the persona's tool list before choosing in-session. DON'T: send it to an in-session reviewer (no Figma tools, no ToolSearch: "merge: no, contract unverified", pf #580). Not a hook: a phrase match on the brief false-denies briefs that mention Figma without needing it live.

Load sheds heavy lanes (s75): at the first load warning the next heavy lane (suite, build, browser) goes to a helper session; reviewers that only read git stay in-session. DON'T: read the warning and override it (seven lanes in one 4-core container, load 17: a ten-minute probe took 54). Text only: a hook sees no container load.

Run the proof command plain (s75): run the proof command plain, exactly as the gate prints it, never piped through `cut`, `head` or `grep` (`vault-pr-files.mjs` through `cut` was not counted and the merge was refused). Checked: `merge-review-gate.mjs` counts only a plain run and its refusal says so.

Helpers never merge (s77): a helper brief ends at "PR open, review-ready" and never asks for a merge; the parent merges reviewed PRs itself, after `add_repo` with `access: "push"`. DO: end the brief at the PR rung and merge from the parent. DON'T: message a helper "now merge it" (G1 pf #579 and H1 discipline #176 both refused, correctly: a session message is not the operator's go).

Newest plugin copy runs the scripts (s77): in a cloud session run list and gate scripts from the newest plugin copy on disk, or name the version that ran. DO: `ls` the plugin cache and pick the highest version. DON'T: file a row for a bug the newest copy already fixed (DISC-286 was filed from 1.181.0 and fixed in 1.183.0).

Session start banks the Status doc's unread answers (s78): before the first status, read the Status doc's comment threads addressed to Claude, answered or not, since the last wrap, and bank each (`vault-write`, `lane-end.mjs --id`). DO: bank first, then report. DON'T: report a row open that the operator answered on the doc after the wrap (PF-1566 "4" and PF-1507 "chrome and safari" were missed).

A list built from the backlog is checked before it is shown (s78): `list-drift-check.mjs --repo <paths>` with the product repo attached for each row's cited PRs, and grep the decisions for "dropped" and "parked". DO: check, then present. DON'T: show a Go-live list carrying rows already merged or dropped (PF-1338 merged 8 Nov, PF-1322 dropped).

**A parent keeps its projects at lane capacity** (DISC-295, ruling `2026-11-12-orchestrator-takes-charge-of-the-backlog`, operator 2026-11-12: *"take a bit more charge over all the items that need doing … there isn't much proactivity with builds in progress"*). Before a status reply and at wrap, write the lanes (id, project, `running` or `waiting-operator`, from `get_session` on each helper) to a file and run `node <plugin>/hooks/scripts/lane-capacity.mjs --vault <vault> --projects <session prefixes> --lanes <file>`. `lane-capacity.mjs` reads the lanes against portfolio 5, discipline 1, handoff-toolkit 1, and the open `Agent.` backlog rows, and prints the rows to dispatch. A lane waiting on the operator's look does not count. Refill the moment a lane lands. `lane-capacity-stop.mjs` holds a status reply or wrap once while a project is under capacity with open rows; a gap is cleared by a dispatch or by `--reason <PFX>="why"`. DO: dispatch the printed rows, then reply. DON'T: list the next wave at wrap, or wait for the operator to pick the next item.

**One look row per lane, and every item shows its Status** (DISC-297, operator s80, doc comment on PF-1581: *"these 2 items are the kind of thing that should just be review together. Generally we may be getting a bit granular with reviews."*; on the doc: *"i'm getting a bit confused with what i should be looking at"*; Status dropdown: *"yes"*). A lane has one "Waiting on you" row: a new round of the same lane REPLACES that row's text and link, never appends (Problem/Solution and the single current link only); related asks on one lane or screen are presented together for one review; an answered item leaves "Waiting on you" in the same turn (the vault keeps the record); every item carries the Status chip: Ready for you / You're on it / Claude's on it / Done (the parent sets Ready for you or Claude's on it; the tick plus Done marks finished). `queue-page-sync.mjs` flags `noStatus`, `appended`, `sameLane` and `leaveWaiting` against the live doc; fix each before the reply. DO: rewrite the lane's row for round 2, delete the answered item now. DON'T: add a second row or a second link for the same lane, or leave an answered item until wrap. **Answers update the chip (DISC-302, operator s81: *"can you make sure status in the needed from you doc get updated with responses"*):** the turn the operator answers an item, its Status chip changes to Done and its "Look now:" lead goes; `queue-page-sync.mjs` prints each as `chipChanges` (a chars-range replace of the dropdown carrying a new dropdown chip, proven s81), and `needed-from-you-stop.mjs` refuses a reply when a row answered this turn (`lane-end.mjs --id`) has no chip change in the Status doc write. **One doc, grouped by project (DISC-305, operator s81: *"a way to group different projects within the doc may be worthwhile"*):** The Status doc is called "Status" (operator s81: *"I think status is correct"*), one doc for all projects, with a `###` heading per project inside each section; `status-layout.mjs` owns those headings and where an item sits (`queue-page-sync.mjs` is the row-level step and prints no heading fields); the reply heading stays `## Needed from you` and its link line reads `Full list: [Status](<url>)`.

**The Status doc layout** (DISC-310, operator s82: *"perhaps the whole structure of the doc needs to have a structure rethink or be thought about properly. I agree with this, but the doc needs be consistent, easy to maintain and scan"*; his "yes" to the layout): the doc is `# Status`, a `date · you` line, then the sections are the chip values (operator s82 on the draft layout: *"would it be better to perhaps group by status and sub group by project? I guess we don't really need running now as a specific section if there's a claude's on it status do we?"*): `## Ready for you`, `## You're on it`, `## Claude's on it` (running lanes live here; there is no Running now), `## Up next`, `## Done this session`, then `Backlogs` (one link per project). Each section has a `###` heading per session project (Portfolio, Discipline, Handoff toolkit), "Nothing." when a project is empty. An item's section always matches its chip; a section move is the connector's `move` (it keeps block ids, children and comment threads); delete plus insert (`replaceItem`, carrying the whole item with every child) only where the chip itself must change, because the connector cannot set a chip in place, so a chip never goes stale; the plan names every comment thread an op would drop (`droppedComments`) and refuses (`refused`) any op over an unanswered one; one row is one section: a row on the doc twice keeps the live lane's item (`removeDuplicate`), and a row with Mac work still queued (`holds`) is never Done; when the operator flips a chip the next run moves the item and banks an open queue row as answered (`answered`). Up next is each project's first five from its backlog's `## Up next` ordered list (Portfolio: `projects/portfolio/portfolio-go-live.md`, with "Launch: N of M done" and a link); a row already Waiting or Running is not also Up next. A ticked item MOVES to "Done this session" (never ticked in place), which is cleared at wrap with no note line; the doc has no Go-live section (the list lives in the vault file). `status-layout.mjs --vault <vault> --projects <PFX,...> --doc <file with the xml of the doc's body node>` prints the edit ops and the session applies them with the connector, never by hand (`--doc -` reads stdin; `--doc-json <file|->` takes the connector's JSON result as it arrives); an empty `ops` means the doc is already in the layout. **Refill from Up next:** the moment a lane lands or parks on the operator, start the top Up next item of that project, with no asking. **Tick go-live on merge:** a merged row that is a go-live line is ticked in the go-live file the same turn: `go-live-tick.mjs --vault <vault> --rows <ids> --apply` writes the tick and prints the launch line, then `status-layout.mjs` prints the doc ops. An id the vault does not hold is `unknown` (stale checkout: pull the vault first), never landed. DO: run `status-layout.mjs` after every row change and at wrap. DON'T: hand-edit the doc, tick an item in place, or keep a Go-live section.

**One Status item format** (DISC-307, operator s81: *"ideally though we would consistently format things like i've done for pf-15131 or something even more improved if you have more ideas"*; then *"that's feeling much easier to digest, i made one more change though"*). Every item on the Status doc is the Status chip, then bold "(ID) Title." plus one bold state line (*Ready for your look.*, *Needs your decision.*, *Waiting on you.*), then nested bullets in this fixed order: **Problem:**, **Solution:**, **Decision:** (only when there is a choice; **Recommended:** and **Alternative:** are each their own nested bullet under it), **Look:** (a link and what to do, ending "Say yes, or what's off."). A short item is the chip, bold "(ID) Title." and one plain line. `queue-page-sync.mjs` emits this shape for every `toAdd` item (`formatItem`), reading Problem / Solution from the row text, Decision from the Recommended cell, Look from the link; the parent writes a round's replacement text in the same shape (DISC-297). DO: one item, this shape, every time. DON'T: free prose in an item, or Recommended and Alternative on one line.

**Status in the Status doc is enforced, and a stale plugin is loud** (s79, operator: *"it's not been what the last couple of session automatically did"*; DISC-288 shipped in 1.196.0 but the container loaded 1.181.0). With the Status doc named in the vault, `needed-from-you-stop.mjs` refuses a status reply that reprints the queue inline instead of the `Full list:` link, and one that follows no write to the Status doc this turn. `plugin-freshness.mjs` warns at session start when the loaded plugin is older than the newest release and holds a status reply while it is, naming `claude plugin update discipline@discipline` then `/reload-plugins`. A stale cache loads none of the plugin's hooks: the vault's `.claude/settings.json` runs a copy of `plugin-freshness.mjs` (`start` on SessionStart, `stop` on Stop). DO: update the doc, then reply with the new asks and the link. DON'T: print the full queue in the thread because the loaded rules are old. **Cause of a stale cloud plugin (DISC-298, s81):** the environment's setup script (`plugin marketplace update` + `plugin update`) runs once when the container image is built and the image is then restored, not rebuilt, so a session loads the plugin as of the image's date (`~/.claude/environment-manager/setup-script-output` is dated; s81 loaded 1.184.0 from an 8 Nov image). The plugin cannot update itself before it loads: the freshness warning names the image date, and the fix is the setup-script refresh line, which the parent proposes after each discipline release (at most one release a day, one approval card; personal plans have no server-managed settings; DISC-299, DISC-303, `release-deploy` RELEASE-PATH).
