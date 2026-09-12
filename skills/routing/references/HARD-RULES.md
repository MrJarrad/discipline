# routing — the twelve hard rules in full

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
2. **Figma reads go through `capture-figma` on the dispatched persona.** A pasted
   figma.com URL, "fresh sync", "the figma version", "discrepancies with figma", or
   any need for instance `componentProperties`, tokens/variables/variants/component
   names/copy from a design file → brief names file+node; the **doer** loads
   `capture-figma` and reads via REST (`scripts/figma-node.mjs` /
   `scripts/figma-capture.mjs`, or banked capture JSON). Parent capture-figma
   **locates** only (file key, node id, frame; MCP ping the tab is fine). A brief that
   pastes the finished prop table is a steer — name the node; live props win. Figma
   screenshots in chat are context, never a substitute.
3. **Built-vs-design checks go through `audit-build`** ("the blocks are off",
   "doesn't match figma", post-port verification) — dispatched to UX Designer.
4. **Live-site references go through `capture-website`** ("look at this site",
   "like pentagram does", any external URL offered as a reference).
5. **Explore/Plan are reconnaissance only.** The orchestrator may use built-in
   Explore/Plan for its own codebase orientation before writing a brief — never
   as a substitute for work a persona owns, and never for anything the operator
   asked to be researched, designed, built, reviewed, or released.
6. **The fleet merges and ships, never the orchestrator** (operator ruling,
   2026-07-26). **The reviewer informs; CI and the parent decide.** Reviewer returns
   severity-ranked findings (red / amber / note), never a bare merge verdict and never
   a write. **Merge condition: deterministic gates green + no red finding open** —
   the parent remits, loading **`present-for-review`** first when a live product
   exists, then dispatching merge execution to Engineer (mid-stream integration) or
   Release Ops (release-gated). **Engineer complete is not merged.** After engineer
   lands, solicit review before the operator hears "fixed" — except on the small-fix
   path (single file, no behaviour claim, gates green), which ships on engineer
   verification + parent check with no reviewer (`lean-review-operator-visual`).
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

