---
name: wrap
description: Close out an orchestration session so the next one continues seamlessly — rewrite HANDOVER.md, land every ruling and memory, verify the toolkit and vault are committed, and confirm nothing durable depends on a dying scratch path. Use when ending an orchestration session or asked to hand over.
---

# Wrap

A session that ends without wrapping leaves the next one to reconstruct state from
scratch — re-deriving what was already decided, re-discovering what's already running,
or worse, silently losing a ruling nobody wrote down. Wrap is the gate: nothing "should
be fine," everything on this checklist is verified before the session is called closed.

## The seven sections — walk all of them, in order

Skipping a section because "nothing changed there this session" is a valid outcome —
state it explicitly. Skipping it by not checking is a wrap failure.

### 1. HANDOVER.md — rewritten, not appended

`orchestrator/HANDOVER.md` is a snapshot of current state, not a running log — treat an
append as a smell: old, superseded content left in place misleads the next reader more
than an honest gap does. Rewrite it to cover:

- **Current state** — what's true right now, not a history of how it got there.
- **Merged/unpushed commits per repo** — for every repo touched this session
  (`~/JHD/portfolio`, the vault itself, the discipline plugin repo), state what's merged, what's pushed, and what's sitting
  local-only. A commit that exists only on a dispatched agent's local branch is not
  "done" — name it as unpushed.
- **In-flight dispatches** — every Agent/workflow dispatch from this session is either
  resolved (merged, reviewed, closed) or explicitly documented as still running, with
  who's waiting on what.
- **Open operator items** — every question still waiting on the operator, named
  specifically (not "some design questions pending").
- **Running processes** — the capture listener on port 4411
  (`scripts/capture-listener.mjs`) is the standing example: state whether it is currently
  running, and if it died or was never started, give the exact restart command
  (`node scripts/capture-listener.mjs &`) rather than "start the listener."
- **Capture/artifact freshness** — for any Figma capture or artifact referenced this
  session, note whether it's current or stale relative to the live file/site, so the
  next session doesn't build against a snapshot it thinks is live.

### 2. Rulings — landed with lineage, same-action verified

Every operator ruling made this session lands in `memories/token-rulings.md` (or the
relevant memory file) with lineage — who ruled it, when, and what it supersedes if
anything. Walk back through the session and confirm each ruling was written in the same
action as the event, not batched here at the end from memory — a ruling recalled at
wrap time has already had a chance to drift from what was actually said.

### 3. Memory — auto-memory dir current

Check the auto-memory directory (`memories/` in the vault, and the `MEMORY.md` index)
for two things: the index actually lists every memory file present (no orphaned files,
no index entries pointing at deleted ones), and any feedback or preference surfaced this
session that should outlive it has been written down, not left in this session's
transcript alone.

### 4. Toolkit — committed, versioned, mirrored, registered

Uncommitted toolkit work is a wrap failure, not a note for next time. Verify:

- The plugin repo (`~/.claude/plugins/marketplaces/discipline/`) has every change
  committed.
- The version in `.claude-plugin/plugin.json` was bumped if the plugin's behavior
  changed this session.
- The bump is mirrored to the matching `~/.claude/plugins/cache/discipline/discipline/
  <version>/` directory — a skill edited only in the marketplace copy and not mirrored
  to cache is invisible to whatever reads from cache.
- Registration (marketplace.json, any install manifest) reflects the current version.

### 5. Vault/Obsidian hygiene

New documents produced this session are linked from a relevant hub or index — an
unlinked document is functionally invisible in a graph-navigated vault. Artifact
frontmatter (`captured`, `sources`, `status`, `supersedes` and equivalents) is current,
not stale from a template. Naming conventions (human-name-first, path-composed names,
the vault's own file-naming rules) held across everything written this session.

### 6. Tasks — board state matches reality

Whatever task/issue board is in use, walk it: every task's recorded state matches what
actually happened this session (a task marked in-progress that actually shipped is a
stale board, not a minor discrepancy). Stale tasks — abandoned, superseded, or quietly
finished without an update — get closed with an outcome stated, never left open with no
trail.

### 7. Verify — no durable reference to a dying path

Grep the session's changes for `TODO`, `tmp`, or scratch-path references that point at
this session's ephemeral scratchpad or any other path that dies with the session.
Nothing durable — a committed file, a memory, HANDOVER.md itself — may reference
`/private/tmp/...` or an equivalent session-scratch path. A durable reference to a path
that won't exist next session is a landmine for whoever reads it next.

```
grep -rn "/private/tmp/\|/tmp/claude-" <changed-paths> 2>/dev/null
```

A hit here is not automatically a bug — a session may legitimately discuss a scratch
path in prose about *this* session — but every hit needs a look before wrap closes.

## Report

State, section by section, what changed and what was verified — not just "wrapped."
A wrap report that only says "done" gives the next session nothing to check against; one
that names the specific commits, the listener's running/restart state, and which rulings
landed where lets the next session trust it without re-deriving it. Also report the
personas and skills invoked this session against the routing tables
(`skills/routing/SKILL.md`) — any mandated-skill zero on relevant work is a defect to log,
not a silent gap.

## Handover prose: compact, redact, reference, name the next step (absorbed from paperclip-work-products)

Every piece of handover prose — the HANDOVER document, a wrap summary, a blocked/parked note — follows four moves:

1. **Compact state** — one or two sentences of what changed and where things stand, not a replay of how you got there.
2. **Redact** — no API keys, tokens, credentials, or PII, even if they appeared in your working context. If unsure, redact.
3. **Reference, don't repeat** — point at the artifact, commit, or file path; never paste the diff or document body. The handover records *where*, not *what*.
4. **Name the next step** — whose move it is and what they do. Prose that ends without a next step is a dead end, not a handoff.

All four, every time — compact-but-no-next-step is still a dead end; redacted-but-pasted-stack-trace still fails move 3.

## Link health at wrap

Run `python3 scripts/vault-lint.py` from the vault root before committing the wrap. BROKEN links must be fixed (or the target restored); ARCHIVED citations are fine (historical lineage); new ORPHANS mean the note was banked without being connected — link it from the right hub before closing.

## Push at wrap

After the checkpoint commit, `git push` (vault and any repo touched). Offsite remotes exist precisely so a dead machine loses nothing — a wrap that commits but doesn't push leaves the day's knowledge on one disk. If no remote is configured yet, run `scripts/setup-remotes.sh` from the vault root (one-time, needs gh CLI).

## Section 0 — drain the runners first (absorbed from the 2026-08-01 wrap)

Wrap does not start while any workflow-runner dispatch is mid-flight. Every run
from this session is either: gate returned and merged; gate returned NO-MERGE and
the branch is explicitly parked in HANDOVER with what's missing; or turn-capped
with reviewer-verified work — in which case finish it (finisher dispatch, or the
documented-exception path: orchestrator commits the reviewer-verified diff and
runs the gate's own checks) before touching HANDOVER. A wrap written around a
live run describes a state that's false by the time it's read.

## Repo topology at wrap (same origin, multiple clones)

When a repo exists as canonical + mirror clones (e.g. ~/JHD/discipline and the
live install path), verify BOTH at wrap: same HEAD, both trees clean, both on
main. An uncommitted tree in the clone this session didn't work in is still a
wrap failure — checkpoint-commit it (credit the session that made it), merge
through origin, and fast-forward the other clone. Also check for stale
`.git/*.lock` files (compare mtime to running git processes before removing).

## Version triple-sync

A plugin version bump is one atomic change across FOUR places or it is drift:
`.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, the capture
plugin's `PLUGIN_VERSION` const in `figma-plugin/capture-figma/code.js` (the
version-sync drift-guard test encodes this — run it), and a fresh
`~/.claude/plugins/cache/discipline/discipline/<version>/` mirror.
