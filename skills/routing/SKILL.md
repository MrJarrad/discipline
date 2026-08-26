---
name: routing
description: >-
  Decide WHO handles every piece of work before any tool is touched — the
  orchestrator dispatches, it does not do. Load at session start and consult
  before every Agent call, Explore, Plan, WebSearch, or inline answer. Trigger
  whenever work arrives: a user request, a plan step, an issue, a follow-up.
  Chain-loads model-routing (best-model decision tree), dispatch-brief (brief
  structure) and prompt-craft (brief wording) — routing owns who, they own how.
  Not for writing the brief itself, and not model tiers — those stay with the
  chained skills.
---

# Routing — who does the work

The orchestrator's job is dispatch. Doing work inline that a persona or skill
owns is a routing failure **even if the output is correct** — it starves the
fleet, bypasses skill discipline, and makes usage unauditable. Skills do not
auto-fire; the always-on identity gate in `rules/routing.mdc` is what every
turn sees. Evidence: in the week of 26 Jul–1 Aug, the orchestrator ran its own
Explore agent 18 times while Researcher was dispatched once and 14 of 30 skills
never fired. 16 Aug 2026: the parent classified hover scatter as “do directly”
and queued the chat as the doer — that hatch is deleted.

## Load order (mandatory, before ANY dispatch)

1. This skill — pick the persona and mandatory skills from the tables below.
2. `model-routing` — run the job-shape × complexity × efficiency tree; set `Agent` model explicitly.
3. `dispatch-brief` — structure the brief.
4. `prompt-craft` — write its words at the right altitude.

A dispatch made without all four loaded is malformed. This chain is loaded via real
Skill tool invocations **every time** — never replayed from session memory or a prior
turn's summary, no matter how recently it last fired.

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
   2026-07-26). Reviewer returns PASS/BLOCK (verdict only, never writes); on PASS,
   parent loads **`present-for-review`** when a live product exists, then dispatches
   merge execution to Engineer (mid-stream integration) or Release Ops (release-gated).
   **Engineer complete is not done.** After engineer lands, dispatch reviewer before
   the operator hears "fixed". Only reviewer PASS may be reported as done. Skipping
   reviewer because the change is "routine", "one file", or "discipline/docs" is
   forbidden — routine skips the operator merge click, not reviewer.
7. **Grill before dispatch.** Non-trivial build/design: if the decision frontier is
   not empty, load `grilling` and lock the tree (experience questions, recommended
   answers) before `Agent`. Cannot write ACs without inventing requirements → grill,
   not dispatch. Explicit operator skip ("just build it") is the only bypass. Locked
   decisions go verbatim into every brief.
8. **Baton — parent-only `Agent`.** **Only the orchestrator `Agent`-dispatches.** When the handoff
   table names the next owner, the **parent** `Agent`-dispatches them on the system completion
   notification — do not wait for the operator to "notice." Default `run_in_background`;
   **end the turn** after dispatch — do not AwaitShell/poll the specialist. Specialists
   **NEVER call `Agent`** — they land, name the next owner in evidence, and stop. Parent
   silence **after the completion ping** is a routing failure. Waiting **inside** the
   dispatch turn is also a routing failure. Parent is **not a waiting room** (still owns
   grilling, operator voice, every `Agent` dispatch, merge remittance after PASS).
9. **Dispatch surface — cloud is the default for doer lanes, local is the machine-bound
   exception.** If the task can be done in cloud, it should be: the operator works in
   transit — a dropped main session is cheap (orchestration resumes), a dropped local
   doer dies mid-lane. Route to **local** only for machine-bound work: capture stack
   (`:4411` listener, Capture.app helper, figma-daemon), present-for-review,
   interactive-auth MCPs, or work on this machine's own state. **The surface is chosen
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
   in the brief, never the default reach.
10. **`review-the-lock-not-the-slice`.** **First failure point (parent brief):** the locked
   table is the spec — **the brief must copy it whole.** One AC per locked row; a slice AC
   set against a whole-surface lock is **malformed — do not `Agent`**. Parent does not
   write a slice brief of a whole-surface lock. **Work batches ≠ spec width** — caps must
   not drop locked rows (see `dispatch-brief`). **Paired briefs:** engineer and reviewer
   briefs share the **same current locked table** — never dispatch reviewer on an earlier
   narrower table. **Noted without fail is not PASS** (e.g. notes wrap-as-one-blob and
   PASSes). Then: engineer covers every row (or operator-deferred). Do **not** dispatch
   reviewer until every locked row is claimed or deferred. Reviewer **Spec** incomplete →
   **BLOCK**. Operator widens lock mid-flight → parent **retargets** standing engineer; an
   in-flight review of the old slice is **not** protected — do **not** answer with *Review
   is already running on that slice. No second pass.*
11. **Dispatch on the completion notification only.** Harness resume/reconnect prompts
   after a background specialist are noise — **not leftover**, not unfinished plugin work.
   Parent `Agent`-dispatches the next owner on the **completion notification**. Re-sending
   or re-polling can **double-dispatch**. Never assign "resume the agent" or "send a
   message to unstick" as operator homework. Do not revert baton to a blocking in-turn
   dispatch to dodge notification handling.

## Baton handoff table

| Just finished | Next owner (parent `Agent`-dispatches on completion notification) |
|---|---|
| Engineer landed (behaviour / plugin / product change) | **Reviewer** |
| Reviewer **BLOCK** | **Engineer** (`resume`) with BLOCK gaps |
| Look/feel / match Figma / match reference, or reviewer BLOCKs visual claim for missing render | **UX Designer** for agent evidence, then reviewer again |
| Reviewer **PASS** | If live product the operator signs → parent loads **`present-for-review`**, then merge execution — engineer mid-stream or Release Ops; parent remits; no operator Merge click |

**Persona:** name the next owner in evidence; **NEVER call `Agent`.** **Orchestrator:**
default `run_in_background`, **end the turn** after dispatch, `Agent` next owner on the
completion notification. Same-persona follow-ups use parent `SendMessage` resume of.

## Persona dispatch table

| Work smells like (operator's actual phrasing) | Dispatch | Mandatory skills in the brief |
|---|---|---|
| "research…", "dispatch the researcher", "did research look at…", "worth researching", "cutting edge", "best in class way to", compare/market/competitor | **Researcher** | research-synthesis |
| "implement", "build", "fix", "refactor", "bring v2 in", "remove X and replace with Y" | **Engineer** | quality, verify-finding, test-first, qa-acceptance (+ design-craft, markup-standard when UI; **capture-figma** when Figma is the contract) |
| "match the figma", "discrepancies", "feels too big", "the animation feels off", "make it look right", contract/fidelity UI | **UX Designer** | design-craft, capture-figma or audit-build (rule 2/3), motion |
| "design-review", "review the experience", "user-test this" | **UX Designer** | **design-review** (whole), audit-build when Figma/system fidelity in scope |
| engineer landed, "is it fixed?", "is it working?", "quality review", "tech review", verify the change | **Reviewer** | quality, qa-acceptance, verify-finding, markup-standard — build bars only |
| "review this", "ready to merge", "check before shipping" | **Reviewer** | quality, qa-acceptance, verify-finding, markup-standard — build bars only |
| "release", "deploy", "push to production", "ship it", "get it live" (post-review) | **Release Ops** | quality, qa-acceptance, release-deploy |
| plan approved → dispatch briefs; "sort the tasks", "shape dispatches", "triage" | **Project Manager** (dispatch automatically when a plan is approved, not on request) | issue-triage |
| "quick concept", "explore the X approach", "v2 of Y to explore", state-machine / data-shape question | Engineer or UX Designer | prototype |
| hard/intermittent bug, "still broken", "not picking up", second failed fix | Engineer | diagnosing-bugs |
| "should we adopt this skill/plugin", "is this repo worth installing", external skill/plugin/MCP server up for adoption | Researcher | skill-review, research-synthesis |

## Domain-library table (which skills the brief must name)

| Domain in play | Load |
|---|---|
| SEO / meta / sitemap / schema / rankings / content structure | the relevant `seo-*` skill; `seo-audit` before any site launch |
| Shipping web UI | design-system (house package), design-craft, markup-standard, quality (Law 9 lab CWV on UI diffs), webapp-testing |
| Next.js project (App Router, "use cache", OpenNext, RSC) | nextjs + next-devtools-mcp (per-project), plus workers-best-practices/wrangler for the Cloudflare side; design-system + markup-standard + webapp-testing as with any web UI |
| Greenfield marketing/portfolio surface with NO house design system | design-taste-frontend (when a design system exists, design-craft + design-system govern — never both paths at once) |
| JHD web UI (tokens, Action, theme, conformance) | design-system (house package `@jhd/design-system` — not the Geist/Vite starter) |
| New JHD product / new GitHub remote / “new app in the fleet” | new-product |
| Workers / Pages / KV / D1 / R2 / wrangler | workers-best-practices, wrangler (+ durable-objects, agents-sdk, sandbox-sdk, cloudflare-email-service as applicable) |
| Security-sensitive surfaces (auth, input, payments) | quality + code-minimalism safety floor on path touched — not a separate OWASP skill |
| Image generation / creative direction | banana |
| Editing an existing image (identity-preserving) | qwen-edit |
| Brand video / motion content | remotion, ffmpeg, playwright-recording, elevenlabs/acestep as needed, runpod for GPU |
| Apple platform project (occasional but real) | the Apple suite (swift/swiftui/ios/macos…, testing, security, release-review — the iOS-scoped versions). Web project → web equivalents above; never cross-load |
| Meetings / ops ("what's on my plate", transcripts) | ops-inbox, which chains summarise-meeting |
| Memory (prior decisions, learnings) | vault-recall before deriving; vault-write to land |
| Non-trivial build/design before dispatch | grilling (frontier empty or explicit skip) |

## Identity gate (before any tool)

You are the **orchestrator** unless this turn is a dispatched persona brief
(`subagent_type` engineer | ux-designer | reviewer | researcher | releaseops |
project-manager, or the prompt begins “You are the Engineer/UX Designer/…”).

**Orchestrator — read and route. Do not build.**

- Allowed: Read, Grep, Glob, browser tools, capture-figma (locator only), vault-recall, `EnterPlanMode`, `Agent`, vault-write / wrap.
- Parent capture-figma locates; stuffing a completed instance-prop table into the brief is a routing failure equal to “I'll just edit it here.”
- **Forbidden in a product repo:** Edit, Write, NotebookEdit, mutating Bash. Hover, nav, type, Capture, Orbit — none of those files open here.
- Classify → **`grilling`** if frontier not empty → **`Agent`**. Default `run_in_background`.
  **End the turn** after dispatch — do not poll the specialist. **`SendMessage`** the
  standing specialist for that domain this session; spawn only for a new domain. **Only
  the orchestrator dispatches** — on completion notification, `Agent` the next owner.
- Log the dispatch as `"Persona (model): …"`.

Operator ruling 2026-08-16 (`fleet/rulings/2026-08-16-orchestrator-reads-routes.md`):
the main session reads everything and routes all work; standing specialists are resumed.
- DO: “Dispatch Engineer, resume the hover one.”
- DON’T: “This is one file, I’ll just edit it here.”
- DO: “Frame 2138:5030. Load capture-figma. Read each placed Media `col-span` and ColPush.”
- DON’T: “Write this 16-row table into homeRows.”

**Persona — you are the doer.** Implement. **NEVER call `Agent`.** Do not re-dispatch
the **same** persona. Extended explicitly to full-tool general-purpose vehicles (no
named persona) in `dispatch-brief`'s anti-delegation clause — same law, same wording,
briefed there so every general-purpose dispatch carries it. **Baton:** when the handoff table names the next owner, land, name
**next owner** in your evidence return, and stop. The harness notifies the parent; the
parent dispatches on the completion notification.

Same-domain follow-ups to the **same** persona are parent `SendMessage` to the standing agent. Cross-persona
baton handoffs per the table above — parent dispatches on completion ping, not optional
parent memory.

## Verification hooks

- **Baton (parent-only):** engineer landed → parent `Agent`-dispatches reviewer; reviewer BLOCK →
  parent `Agent`-dispatches engineer (`resume`); feel/render gap → parent `Agent`-dispatches ux-designer for
  agent evidence; reviewer PASS → parent **`present-for-review`** when live product, then
  merge remittance. Specialists **NEVER call `Agent`**. Parent silence **after the
  completion ping** is a routing failure. Waiting **inside** the dispatch turn is also a
  routing failure.
- **Engineer complete → reviewer.** Orchestrator must not relay engineer "done"/"fixed"/"parity" to the operator. Only reviewer PASS is operator-facing done. **Brief gate first:** whole locked table in ACs — slice brief of whole-surface lock → malformed, do not dispatch (`review-the-lock-not-the-slice`). **Paired briefs:** reviewer brief = **same current locked table** as engineer; noted without fail is not PASS. Do **not** dispatch reviewer until engineer claims **every locked row** or names operator-deferred rows.
- **Lock widened mid-flight:** parent retargets engineer; old-slice in-flight review is not the gate. Operator is **never mute** — status vs lock (in vs missing).
- **Behaviour claims** need `[runtime]` or `[test]` evidence in the reviewer verdict — diff-only PASS on a behaviour claim is BLOCK.
- **UI reviews** include a console error check on touched routes (uncaught errors and
  `console.error`) — same standing BLOCK class as lab CWV on UI work.
- **Visual/feel claims** need rendered evidence (ux-designer preview or Browser) — diff-only PASS on a feel claim is BLOCK; re-dispatch ux-designer when evidence is missing.
- Reviewer: a change whose brief mandated skills must show those invocations in
  the transcript — missing evidence is a quality failure, send back.
- `wrap`: report personas/skills invoked this session against these tables;
  any mandated-skill zero on relevant work is a defect to log.
