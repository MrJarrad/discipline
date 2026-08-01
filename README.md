# Discipline

A quality discipline, packaged as a portable **Claude Code / Claude
Desktop plugin**: best-in-class craft skills plus six dispatchable doer personas. Everything runs
on Claude models.

> **Best-in-class is the bar.** Turn "done" into "best-in-class, with evidence — or
> surfaced for review with the gap named."

## The orchestrator — you never name an agent

The plugin ships an **always-on orchestrator persona** (an output style, on by default while
the plugin is enabled). It turns the main session into a router: every request is classified
and dispatched to the right specialist automatically, then synthesized back as one voice. Say
*"is this safe to merge?"* and the `reviewer` fires on its own; *"the panel feels janky"*
routes to `ux-designer`. No agent names, no menus.

> If you also run a separate always-on orchestrator plugin, disable one — two always-on
> personas conflict.

## What's inside

**39 skills** — craft and delivery discipline that any agent can draw on.

**Dispatch** — who does the work, on what model, in what brief:

- `routing` — decide WHO handles the work; chain-loads the three below
- `model-routing` · `dispatch-brief` · `prompt-craft`

**Discovery & shaping** — `discover-scope` · `shape-stress` · `define-terms` · `doc-formats` · `issue-triage` · `prototype`

**Design & build** — `design-craft` · `design-system` · `design-taste-frontend` · `motion` · `markup-standard` · `design-modules` · `architect-systems` · `code-minimalism` · `impeccable` · `nextjs`

**Capture & audit** — `capture-figma` · `capture-website` · `audit-build`

**Verify & ship** — `quality` · `qa-acceptance` · `verify-finding` · `test-first` · `webapp-testing` · `diagnosing-bugs` · `release-deploy`

**Research & knowledge** — `perplexity-research` · `research-synthesis` · `vault-recall` · `vault-write`

**Ops & meta** — `ops-inbox` · `summarise-meeting` · `brand-voice` · `agent-ops` · `wrap`

**6 agents** — doer personas you can dispatch as Claude Code subagents (the orchestrator
is the main session itself, not an agent):

- **project-manager** (`haiku`) — Mechanical task setup and board hygiene.
- **engineer** (`sonnet`) — Implementation specialist.
- **reviewer** (`sonnet`) — The merge gate.
- **releaseops** (`sonnet`) — The release gate. Owns push -> deploy-verify -> rollback, single-threaded, after the reviewer gate has passed.
- **ux-designer** (`sonnet`) — Visual quality and design-system coherence.
- **researcher** (`sonnet`) — Answers open questions with sourced, adversarially-verified findings; runs competitive and market analysis; synthesizes evidence into decision-ready briefs.

## Install

This repo is both a plugin and its own single-plugin marketplace.

```
/plugin marketplace add MrJarrad/discipline
/plugin install discipline@discipline
```

Or point at a local checkout:

```
/plugin marketplace add /path/to/discipline
/plugin install discipline@discipline
```

Once installed, the skills auto-trigger by description, and the agents are available to the
`Agent` / Task tool (e.g. "use the engineer subagent to implement this").

## Provenance

This plugin is the canonical home of the discipline library (`skills/` + `agents/`).
Each skill shipped GREEN through an eval harness before inclusion.

MIT licensed. The `motion` skill preserves its Emil Kowalski / MIT attribution — see `LICENSE`.
