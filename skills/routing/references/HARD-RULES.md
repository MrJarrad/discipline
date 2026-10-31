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
   review record (`2026-10-09-every-merge-reviewed`; notes-only vault PRs (jhd-vault, markdown records, indexes, queue/backlog rows only; scripts, hooks, CI, settings get a reviewer) are the orchestrator's own merge, `2026-10-18-orchestrator-merges-own-vault-notes`). Checked: `hooks/bin/merge-review-gate.mjs` refuses `mcp__github__merge_pull_request` unless it pins `expectedHeadSha` and a reviewer verdict on that head (comment or review, shape in `agents/reviewer.md` § Verdict) saying `merge: yes` was read in the session; a MrJarrad/jhd-vault PR passes only when it is shown notes-only: by `node <plugin>/hooks/scripts/vault-pr-files.mjs --vault <vault> --pr <n>` (names only, bound to the head; use this) or by `get_files` reads (every patch in context; s44 spent 43.8k chars on three); the gate fails closed. `merge-after-review.mjs` refuses the same (#361, `2026-10-18-helper-waits-for-go`). **Resume pulls main first:** `git fetch origin main`, cockpit and handover from `origin/main`, every "running" lane re-checked
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
   figma-daemon, interactive-auth MCPs; (c) **this machine's own state**.

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
   The parent runs `lane-sweep.mjs` on every completion notification, and for a landed or stopped lane also `lane-sweep.mjs --clean-artifacts <worktree>...`, which removes that worktree's `node_modules` and `.next` and refuses a root clone, so source and the shared DS clone are never touched. Before a heavy dispatch the parent runs `cloud-dispatch` § Capacity before dispatch. A full suite over
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
   completed"*). Save `list_sessions` (every page) to files and run `node <plugin>/hooks/scripts/helper-sweep.mjs --self <own id>
   --sessions <file>… --keep <helpers whose PR waits on a look or review> --merged <helpers whose PR merged>`. It sorts every
   un-archived helper: archive (completed, and its parent wrapped or was archived, or its PR merged), keep, surface (blocked,
   review-ready, failed or quiet past 12 hours under a wrapped parent). Call `archive_session` on each archive row; the surface
   list is taken over or reported in the status; a refused archive is one line in the status, never dropped.
   **At session start the parent sends each Re-point row its message** (DISC-221, s43: every s42 helper kept reporting to
   the wrapped s42 parent): the sweep's `## Re-point` list carries one `send_message` text per helper whose parent wrapped,
   naming the new parent's id; send it once, that turn. DO: send the row's message as printed. DON'T: wait for the helper to
   write to the old parent and re-point it by hand.
   **A parent session is never archived** (operator 2026-10-31: *"it's important the we don't archive the parent sessions though,
   i'm a bit nervous about that"*): a helper is a session with a parent and a title starting "Helper ·"; every other session,
   wrapped, "← talk here" or otherwise, is a parent, lands in no list, and is never passed to `archive_session` by any session.
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
23. **A yes opens a lane the same turn** (DISC-221, s43: PF-938's text glow got the operator's yes and no lane was opened
   until he asked). When the operator says yes to a build row, the parent dispatches it that turn and writes the lane's branch
   or PR into the row's Notes. `session-resume.mjs` lists every open row carrying an operator yes and no lane id as
   "approved, not started". DO: dispatch, then add `lane claude/text-glow` to the row. DON'T: bank the yes and move on.
