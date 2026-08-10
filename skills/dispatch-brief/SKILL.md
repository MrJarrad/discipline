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

## Governing rulings are QUOTED with a DO/DON'T pair, never cited

**A name/path citation is not compliance.** Naming a ruling delegates its interpretation
to the reader; the ruling's own sentences in the prompt constrain them. This is a measured
failure, not a theory: a 2026-08-07 ingest brief named media §6 *and* gave its vault path,
and the dispatched engineer and its reviewer both read it and both reproduced the
forbidden pattern anyway. Operator, 2026-08-10: *"clearly decision notes alone aren't
cutting it."*

So every brief operating under a standing ruling carries the ruling's **operative
sentences quoted verbatim**. In a headless spec that's the top-level `rulings` field —
the runner injects it, clearly framed as binding, ahead of the brief body in every agent
prompt *and* every verify prompt, and journals the ruling ids per dispatch:

```json
{ "name": "...",
  "rulings": [{ "id": "media-§6",
                "source": "vault/fleet/rulings/2026-08-06-design-contract-and-media-replacement.md",
                "text": "No hash/size/mtime adjudication ever decides whether to copy a delivered asset. …",
                "do": "the drop contains 10alt; nothing wires it; it lands in public/ anyway, noted unwired.",
                "dont": "every drop file is byte-identical to what shipped, so there is nothing to do." }],
  "phases": [ … ] }
```

Quote, don't summarise — a paraphrase reintroduces exactly the interpretation gap the
verbatim text closes. For an Agent-tool dispatch there's no spec, so the same block goes
in the prompt body by hand.

**The quote alone is not enough — every ruling ships a contrast pair.** Operator, after
the abstract ruling above was read *and still breached*: *"every standing ruling and every
skill law carries at least one CONTRAST PAIR — a concrete DO (the compliant behavior in a
real scenario) and a concrete DON'T (the violating behavior, ideally phrased as the exact
reasoning a violator would use). Abstractions state the rule; the pair makes it
unmistakable to a model mid-task."*
(`vault/fleet/rulings/2026-08-10-do-dont-pairs.md`)

So write both fields, and write the `dont` as the violator's own sentence, not a negation
of the rule. The DON'T above is verbatim the reasoning that produced the 2026-08-10 §6
breach — an agent that catches itself thinking it recognises the breach before committing
it. "Don't skip the copy" would not have done that. The runner renders the pair as
`DO:` / `DON'T:` lines beneath the quoted text and journals pair presence per dispatch.

`node scripts/workflow-lint.mjs <spec>` hard-fails a placeholder `text`; warns when a
prompt cites a ruling, or reads as media/ingest/replacement work, with no `rulings` field
behind it; and warns per entry when either pair half is missing. That last one is a
warning, not a failure, because some rulings genuinely resist pairing — but the default
is a pair, and "this one resists" is a judgement you make, not one you drift into.

The reviewer gets the rulings too. A gate that can't see the ruling can't catch a breach
of it — that half is what failed in 2026-08-07.

## Evidence contract

Every brief states what the agent must return as proof of done: a commit hash plus a
clean `tsc`/build result for code, measured numbers for perf or content claims, cited
URLs for research, file paths for anything touched. Where a standing ruling governs the
work, the brief also names what compliance with that ruling looks like as evidence. A
surfaced failure beats a false "done" — the brief should say so explicitly, so the
receiving agent knows an honest blocker is an acceptable outcome and a guessed pass is
not.

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

## Context continuity — standing specialists and primers

Within a session, prefer resuming a standing specialist (SendMessage to an existing agent)
over spawning fresh whenever the work continues a domain that agent already holds —
reviewer gates, release operations, per-domain engineers. Spawn fresh only for new
domains or when a prior transcript has grown beyond useful size (then retire the prior
agent and respawn fresh against the primer).

Every repeated workstream gets a vault primer at
`projects/<project-slug>/primers/<workstream>-primer.md` (thing-then-aspect — the
project first, the primer aspect inside it; e.g.
`projects/capture-figma/primers/capture-figma-primer.md`): architecture map, file
inventory, invariants and conventions (test techniques, marker blocks), current
version/baselines, and standing rulings binding the code. Name the primer as **FIRST
READ** in the brief so the receiver starts from a knowledge base, not an empty page. If
a workstream is getting repeated dispatches and has no primer, creating one is part of
the orchestrator's job — and it isn't a project until it also has its
`projects/<name>/hub.md` + `estate/estate-map.md` row + `estate/repo-docs/` mirror
(the new-project trio, see `vault-write`).

Brief the receiver with verified facts: file:line loci, baselines (commit hash, version,
last-touched date), and hashes of key files — so the agent starts working, not exploring
the repository and re-deriving what you already know. This is the foundation of
low-overhead continuity: agents re-mapping the same codebase on every dispatch is
avoidable token cost.

## Checklist before dispatch

```
[ ] Question stated neutrally; any named candidate labeled a hypothesis, not an answer
[ ] Label is persona-model; headless spec sets the persona field
[ ] Required skills named per the work-type table above
[ ] Governing rulings are QUOTED verbatim in the brief (the spec `rulings` field);
    a name/path citation is not compliance — and the reviewer's prompt carries them too
[ ] Each ruling carries its DO/DON'T pair, the `dont` phrased as the violator's own
    reasoning; a bare abstraction has already been read and breached once
[ ] Evidence contract stated: what proof comes back, "failure beats false done"
[ ] Existing agent resumed if one holds the domain; primer cited as first read where one exists
[ ] Brief carries verified file:line loci, baselines (commit hash, version), and key-file hashes
[ ] Branch/cwd stated; out-of-bounds named; "do NOT push" for repo work
[ ] model set from the model-routing table (sonnet default); opus escalation justified in writing
[ ] caps set from the floor (mechanical ~70 / build ~110 / audit 120+); effort matched to stage
[ ] "commit incrementally" stated explicitly; continuation gets a fresh spec name + labels
[ ] Workflow spec written as its own step; backgrounded command is bare `node workflow.mjs <spec>`
[ ] Ports stated: doer verification on :3211+, operator's :3210 dev server untouched
[ ] Merge briefs: reviewer verdict before merge, tree back on main + worktrees pruned after,
    evidence artifacts committed in-repo
```
