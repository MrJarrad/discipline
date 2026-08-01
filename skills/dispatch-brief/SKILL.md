---
name: dispatch-brief
description: How to write any dispatch prompt — an Agent tool call or a workflow spec — so it's neutral, evidence-bound, and scoped. Use before authoring any dispatch/brief/workflow-spec prompt. Not for choosing WHO to dispatch — that's routing; not for task creation mechanics — that is issue-triage.
---

# Dispatch Brief

The orchestrator never writes code or does design work — it only writes briefs. A brief
that steers the answer, skips the required skills, or leaves scope or evidence unstated
produces work that looks done and isn't. Load this before authoring any Agent tool call
or `workflow` spec.

## Neutral briefs never steer

State the question and the constraints. Never a predicted answer. If you name a
candidate — a tool, a library, an approach — label it explicitly as **a hypothesis to
refute, on equal footing with unnamed alternatives**, not a preferred answer wearing a
disguise. "Investigate whether X is the cause (one hypothesis among several — the fix
may lie elsewhere)" is neutral. "Fix the bug in X" when X is unconfirmed is a steer.

If you catch a steer after dispatch, don't wait for the agent to finish — send a
correction immediately.

## Persona + model

Every dispatch label uses `persona-model` style: `engineer-sonnet:task-slug`,
`reviewer-opus:pricing-audit`. Headless specs set the `persona` field explicitly — never
leave it to be inferred from the prompt text. Status lines name "persona (model) into
repo" (e.g. "engineer-sonnet into portfolio-v2"), so a glance at the run log tells you
who's doing what, on what model, in which repo. The Agent-tool `description` field
itself must lead with `persona (model):` so the thread UI names the dispatch — e.g.
"Researcher (sonnet): competitive scan" — never a bare or anonymous agent run.

Model tier is chosen from the model-routing skill's table — load it alongside this skill; never inherit the session model.

## Mandatory skill invocations

Frontmatter skill bindings on an agent don't guarantee the agent invokes them — the
brief must name the exact skills the receiving agent is required to invoke
(`Skill: discipline:<name>`) for the work type at hand.

| Work type | Required skills |
|---|---|
| Build / fix | `quality` + `test-first` (+ `design-craft` + `markup-standard` if UI is touched) |
| Review | `qa-acceptance` + `verify-finding` (+ `markup-standard` if UI is touched) |
| Research | `research-synthesis` + `perplexity-research` |
| Capture | `capture-figma` or `capture-website` |
| Motion | `motion` |

## Workflow-spec visibility

Write the workflow spec text as its own quiet step — a file, not a heredoc echoed to the
terminal. The backgrounded command is ONLY `node workflow.mjs <spec>`: nothing else. The
operator's task panel renders whatever the backgrounded command prints, so a command that
also cats or echoes spec text buries the runner's live per-agent output under a wall of
prompt text the operator never asked to watch.

## Ports

Doers run verification servers on `:3211` and up. The operator's live dev server on
`:3210` is never started, stopped, or reused by a dispatched agent — state that boundary
in the brief, don't assume the doer infers it.

## Caps and continuity

- Set `maxTurns` from a floor, never a guess: mechanical work ~70, build work ~110, audit
  work 120+. Round up for multi-file or multi-repo scope.
- **Commit incrementally** is mandatory brief language, not a suggestion: the agent commits
  after each coherent slice, so a turn-cap hit strands nothing uncommitted. State this
  explicitly in every brief — don't assume it's implied by the maxTurns number.
- A continuation never reuses the prior round's runner label or session — mint a new spec
  name and new labels each round. Brief the continuation to treat whatever is sitting in
  the working tree as an untrusted draft to verify, not a trusted starting point.

## Evidence contract

Every brief states what the agent must return as proof of done: a commit hash plus a
clean `tsc`/build result for code, measured numbers for perf or content claims, cited
URLs for research, file paths for anything touched. A surfaced failure beats a false
"done" — the brief should say so explicitly, so the receiving agent knows an honest
blocker is an acceptable outcome and a guessed pass is not.

## Scope fence

State the branch and cwd explicitly (per-agent cwd for multi-repo dispatch). State what
is out of bounds — files, repos, or concerns the agent must not touch even if adjacent
work is tempting. For any repo work: **do NOT push** — the orchestrator reviews and
pushes, not the doer.

## Reviewer-gate sequencing

Any brief that ends in a merge states the order explicitly: the reviewer's written verdict
completes **before** any merge executes, never after or alongside. Once a merge lands,
the brief requires the doer to leave the shared working tree on `main` and to remove/prune
any worktrees it created — a stray branch checkout or leftover worktree is the next
agent's false alarm. Evidence artifacts (measurement tables, audit output, before/after
diffs) get committed in-repo alongside the change; a finding that only exists in session
output is lost the moment the session ends.

## Checklist before dispatch

```
[ ] Question stated neutrally; any named candidate labeled a hypothesis, not an answer
[ ] Label is persona-model; headless spec sets the persona field
[ ] Required skills named per the work-type table above
[ ] Evidence contract stated: what proof comes back, "failure beats false done"
[ ] Branch/cwd stated; out-of-bounds named; "do NOT push" for repo work
[ ] model set from the model-routing table (sonnet default); opus escalation justified in writing
[ ] caps set from the floor (mechanical ~70 / build ~110 / audit 120+); effort matched to stage
[ ] "commit incrementally" stated explicitly; continuation gets a fresh spec name + labels
[ ] Workflow spec written as its own step; backgrounded command is bare `node workflow.mjs <spec>`
[ ] Ports stated: doer verification on :3211+, operator's :3210 dev server untouched
[ ] Merge briefs: reviewer verdict before merge, tree back on main + worktrees pruned after,
    evidence artifacts committed in-repo
```
