# Brief craft — what a doer cannot know unless the brief says it

Each line is a failure a brief caused or could have prevented (portfolio, hoverboard and
cloud sessions, 2026-09-28 → 10-01). The brief states the fact; it does not restate the rule.

1. **A literal `Skills:` line, on its own line.** The dispatch gate refuses a brief that names its
   skills only under Constraints — learned by refusal once. The template shows it:
   `Skills: quality, qa-acceptance`.
2. **Subagents never see the operator's messages.** A brief for an operator-requested structural
   change (a `git mv`, a route rename) quotes the operator verbatim, with any standing authority
   ruling, or the safety guard blocks the doer on the parent's paraphrase ("Modify Shared
   Resources").
3. **Say how the read-back stop is answered**: "return the read-back as your final message and
   end your turn; you will be resumed". Doers skipped the stop believing no reply channel existed.
4. **A variant that may be dropped stops before the irreversible step**: "return, then upload on
   go". A STOP that lands after the upload and push is too late.
5. **Preview auth names the token file** (`~/.config/jhd/cf-access-token`) and the read-in-process
   rule. "Load the file the skill names" got the doer refused for credential exploration.
6. **Doers cannot open PRs.** Engineer personas carry no `mcp__github__*` tools and `gh` is 403 in
   cloud: the brief says "push via git; the parent opens the PR".
7. **Name the reference the operator praised, and read it first (rung 2).** "Gil's /profile handles
   this well" answered in one read what three builds did not. Quote the operator's gesture and
   framing for any bug ("refresh repeatedly", on desktop) — the doer reproduces that, not a nearby one.
8. **A fix-round brief leads with the edit verbs and `file:line` targets**, mechanical edits before
   verification, states the anti-pattern ("the reviewer BLOCKs if `<file>` is unchanged"), requires
   distinctness proofs (md5s) for multi-artifact evidence, and escalates the tier on a repeated
   no-op round. A "do not touch X" fence from round 2 is not "do not touch code": one cloud doer
   shipped only the docs.
9. **A prototype lane ends with a "FINAL — productionize handoff"** (beats, knob defaults, files,
   gaps); a fresh engineer shipped #194 at pixel parity on the first pass from it.
10. **A cloud brief names the lane's recipe by pointer** (`cloud-dispatch`; the repo's `CLAUDE.md`
    "Cloud sessions"), never pastes it; a Mac-queue brief opens "You ARE the job; the `running/`
    entry is your own claim".
11. **Local agents launched from Bash are labelled like Agent dispatches**: `description` reads
    `local — persona (model): task` (operator, 2026-10-01: *"Ideally, the local agent bash uses the
    same naming conventions as other agents, e.g (local) sonnet etc."*). The background-task list
    shows only that description; `agent-dispatch-gate.mjs` refuses `claude -p`/`--cloud`,
    `workflow.mjs` and Mac-queue launches without it. Plain dev servers and watchers are not gated.
12. **Audit and props briefs link the banked defaults ruling, and the parent greps `fleet/rulings`
    before any operator-ask row** (`figma-defaults-reasked`, 2026-10-02: a props audit flagged
    Figma-vs-code default differences and a queue row asked the operator to change a default the
    operator had already ruled all-on). Audits check names and value sets, not defaults.
13. **A branch more than one lane pushes names every other lane on it** and requires fetch + rebase
    immediately before each push; the parent messages each running lane when the branch moves
    (three lanes shared `preview/companion-playground`; held only by that messaging, `session10-codify-candidates-2026-10-05` 2).
