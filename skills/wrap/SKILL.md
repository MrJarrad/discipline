---
name: wrap
description: Close out an orchestration session so the next one continues seamlessly — patch the cockpit, replace each touched project's `<name>-handover.md`, land rulings and memory, verify the toolkit and vault are committed, and confirm nothing durable depends on a dying scratch path. Use when ending an orchestration session, or asked to "hand over", "wrap up", or "close out this session". Not a single mid-session ruling or lesson write — that's vault-write directly; wrap is the full session-close pass, not a per-event log.
---

# Wrap

## Hard fail (non-negotiable)

- Closing a **non-trivial** product session with **handover-only** (skipping other wrap sections) is a wrap/routing failure — not a shortcut.
- **Forbidden** to tell the operator: "partial wrap is enough", "handover update is probably enough", or any equivalent heuristic.
- **MUST** load this skill file and follow it end-to-end; do not improvisationally Write vault files.
- Vault notes, lessons, rulings → read and follow **`vault-write`** first (placement, hub-link, lint). Ad-hoc vault Write without vault-write is a defect.
- Lint exit ≠ 0 → wrap has **not** succeeded; do not claim wrapped.
- **Operator-facing report:** compact outcomes only (what's banked, what's next — handover prose four moves). Section-by-section walk is the agent's internal contract (and mined-lessons on project handovers), not the designer's UI unless asked.

## Orchestrator self-check (before ending a turn where a product was touched)

```
[ ] Handover current?
[ ] If closing: wrap skill complete (not handover-only)?
[ ] No parent product edits?
[ ] Vault writes went through vault-write?
```

**Claude note:** Vault **working tree** is `~/JHD/vault/main`. Toolkit for Claude is the
plugin repo `~/JHD/discipline/main` plus its marketplace/cache mirror — verify the
installed plugin matches the repo at wrap. Section 4 below applies whenever that repo
was edited this session.

A session that ends without wrapping leaves the next one to reconstruct state from
scratch — re-deriving what was already decided, re-discovering what's already running,
or worse, silently losing a ruling nobody wrote down. Wrap is the gate: nothing "should
be fine," everything on this checklist is verified before the session is called closed.

## The seven sections — walk all of them, in order

Skipping a section because "nothing changed there this session" is a valid outcome —
state it explicitly. Skipping it by not checking is a wrap failure.

### 1. HANDOVER — cockpit patch + project files (not one rewrite)

Ruling: vault `fleet/rulings/handover-trays.md`. **Any chat may wrap.** Do not ask which
window is home.

`orchestrator/cockpit.md` is the **cockpit** (machine, in-flight chats) — short, live
facts only. Each `projects/<name>/<name>-handover.md` is that project's last close-out
(dated snapshot). Ruling: `fleet/rulings/unique-note-names.md`
— never a generic `HANDOVER.md` stem.

**Infer product** (no operator naming). **capture-app** and **capture-figma** are two products (they currently share `~/JHD/capture/main`):

| When | Product handover |
|---|---|
| Capture.app, helper `:7755`, Screen Recording, `mac/` | `projects/capture-app/capture-app-handover.md` |
| Capture Figma plugin, `figma-sync/`, `:4411`, ingest | `projects/capture-figma/capture-figma-handover.md` |
| Capture repo and the work is unclear | **capture-app** — never default to capture-figma |
| `~/JHD/portfolio/main` | `projects/portfolio/portfolio-handover.md` |
| `~/JHD/skillz/main` | `projects/skillz/skillz-handover.md` |
| `~/JHD/design-system/main` | package under Skillz — wrap **jhd-discipline** + **skillz** (no dedicated tray yet) |
| `~/JHD/discipline/main` | `projects/jhd-discipline/jhd-discipline-handover.md` |
| `~/JHD/cursor-discipline/main` | `projects/jhd-discipline/jhd-discipline-handover.md` |
| Vault-only | Cockpit only — do not wipe a product file |

Plugin state (Claude live plugin, or the Cursor snapshot) goes to **jhd-discipline**, never legacy `projects/discipline`.

On wrap:

- Re-verify live cockpit facts this session owns (listener, Claude parked, in-flight).
- **Surgical patch** those cockpit sections; keep every other cockpit line unless this
  session proved it stale. Never rewrite the cockpit as one project's diary.
- **Replace `<name>-handover.md` for every project this session touched** (current workspace
  plus any other — e.g. capture-app + jhd-discipline). Never rewrite untouched products.
  Put shipped/open/next-step and Figma-artifact freshness on the **project** file, not
  the cockpit. Do not put listener/Environment liveness on a project file.
- In-flight list: add/remove **this chat's** line only.
- Merged/unpushed commits for a repo belong on that project's handover.
- Open operator items for a project belong on that project's handover.

If `projects/<name>/` does not exist for a live product (jhd-discipline), create the
new-project trio in the same wrap (`vault-write`).

A project handover is last-left, not still-true. Date it. After a long gap the next
session must say the date, then trust git + the hub.

### 2. Rulings — landed with lineage, same-action verified, thing-then-aspect placed

Every operator ruling made this session lands **by thing, then aspect**: a call that
binds every project goes to `fleet/rulings/` (e.g. `fleet/rulings/token-rulings.md`); a
call scoped to one project goes to `projects/<name>/decisions/`. Every ruling carries
lineage — who ruled it, when, and what it supersedes if anything. Walk back through the
session and confirm each ruling was written in the same action as the event, not
batched here at the end from memory — a ruling recalled at wrap time has already had a
chance to drift from what was actually said.

### 3. Memory — fleet lessons and the auto-memory index current

A reusable technical lesson learned this session lands in `fleet/lessons/`, not a flat
`memories/` folder (that schema is retired — see `vault-write`). Separately, check the
auto-memory directory (if present under the vault estate sync —
`estate/auto-memory/` — or the local Claude project memory path) and its `MEMORY.md` index for two things:
the index actually lists every memory file present (no orphaned files, no index entries
pointing at deleted ones), and any feedback or preference surfaced this session that
should outlive it has been written down, not left in this session's transcript alone.

### 4. Toolkit — committed and versioned (Claude plugin)

Uncommitted toolkit work is a wrap failure, not a note for next time. Verify:

- The Claude discipline plugin repo (`~/JHD/discipline/main`) has every change
  committed and pushed when the session claimed toolkit work was done.
- Approved plans from this session are distilled into vault artifacts, not left
  only in the session transcript.
- If `.claude-plugin/plugin.json` version should bump for a behavior change, bump it
  in the same commit set, and update the marketplace/cache mirror so the installed
  plugin matches the repo.
- If the Cursor snapshot tree (`~/JHD/cursor-discipline/main`) was also edited this
  session, commit that repo separately — its version fields are its own concern.

### 5. Vault/Obsidian hygiene — structure conformance, thing-then-aspect

Every new record produced this session lands inside its project's aspect subfolder
(`projects/<name>/{primers,decisions,audits,artifacts}/`) or `fleet/{rulings,lessons}/`
for cross-project material — nothing new goes to the vault root or to a retired
flat-by-type folder (`memories/`, `documents/`, `hubs/`, root-level `decisions/`). A new
project gets its full trio (folder shape + `estate/estate-map.md` row + `estate/repo-docs/`
mirror) in the same action it's created, not staggered across sessions.

New records are linked from their project hub (`projects/<name>/<name>.md`) — an unlinked record is
functionally invisible in a graph-navigated vault. Artifact frontmatter (`created`,
`sources`, `status`, `supersedes` and equivalents) is current, not stale from a
template. Naming conventions (human-name-first, path-composed names, the vault's own
file-naming rules) held across everything written this session. Link health is verified
in the dedicated check below (both linters); do not leave hub wiring for that check to invent.

### 6. Leftover — handover Open/Next + git (`leftover-not-a-board`)

Leftover is AI-first: this chat's lock, product Open/Next on unique `<name>-handover.md`, git for what is actually true. **Not** Jira/Linear/GitHub Projects — wrap does not clerk an issue board.

Ruling: vault `fleet/rulings/leftover-not-a-board.md`.

On wrap:

- **Derive or drop** product still-open from handover Open/Next — supersede lines this session shipped, parked, or abandoned.
- **Verify git** matches what handover claims (uncommitted work, unpushed commits, branch truth).
- **Write down** what git cannot see (parked intent, do-not-rebuild) on the project handover — not on a people-PM board.
- **Do not** walk an external task/issue board; no ticket clerk.

**Surface leftover** at session start (after reading handover Open), when the operator asks, when the lock changes, after reviewer PASS (leftover vs lock), and in wrap confirmation. **Silence** while a locked slice is in flight — do not dump Open every turn. **Transcript summary ≠ leftover.**

### 7. Verify — no durable reference to a dying path

Grep the session's changes for `TODO`, `tmp`, or scratch-path references that point at
this session's ephemeral scratchpad or any other path that dies with the session.
Nothing durable — a committed file, a memory, a handover note itself — may reference
`/private/tmp/...` or an equivalent session-scratch path. A durable reference to a path
that won't exist next session is a landmine for whoever reads it next.

```
grep -rn "/private/tmp/\|/tmp/claude-" <changed-paths> 2>/dev/null
```

A hit here is not automatically a bug — a session may legitimately discuss a scratch
path in prose about *this* session — but every hit needs a look before wrap closes.

## Report

**Operator-facing (default):** compact outcomes — what's banked, what's next. Follow handover
prose four moves below. Do **not** dump seven-section tables, "wrap skill", or plugin names
unless the operator asked for the machinery.

**Internal (agent contract):** walk all seven sections in order; state per section what
changed and what was verified — not just "wrapped." Name specific commits, listener state,
and where rulings landed. Log personas/skills invoked against routing tables
(`skills/routing/SKILL.md`) — mandated-skill zero on relevant work is a defect, not a silent gap.

## Handover prose: compact, redact, reference, name the next step (absorbed from paperclip-work-products)

Every piece of handover prose — the HANDOVER document, a wrap summary, a blocked/parked note — follows four moves:

1. **Compact state** — one or two sentences of what changed and where things stand, not a replay of how you got there.
2. **Redact** — no API keys, tokens, credentials, or PII, even if they appeared in your working context. If unsure, redact.
3. **Reference, don't repeat** — point at the artifact, commit, or file path; never paste the diff or document body. The handover records *where*, not *what*.
4. **Name the next step** — whose move it is and what they do. Prose that ends without a next step is a dead end, not a handoff.

All four, every time — compact-but-no-next-step is still a dead end; redacted-but-pasted-stack-trace still fails move 3.

## Learn — mine the session for lessons before the lint/commit gate (operator ruling 2026-08-03)

Wrap does not end at re-stating what happened — it also asks whether the session
just taught something durable that mid-session vault-write discipline didn't
already catch. Relying purely on "someone banks it as it happens" leaves a gap:
a correction or a surprise can pass without anyone stopping to write it down.
This step is that catch, run once per wrap, after the sections above have
settled what changed and before Link health/commit below locks the wrap in —
so anything mined lands in the same wrap commit, not a follow-up session.

Pattern borrowed from headroom's `learn` step; the implementation here is the
vault's own, no external dependency.

### Mid-session checkpoint — don't let wrap be the only catch (2026-08-05)

A long orchestration session can run for hours before wrap ever fires — a
correction or insight that surfaces mid-session and isn't banked immediately
is easy to misremember or drop by the time wrap finally reviews the whole
session from scratch. So this same three-lane review (below) isn't only a
wrap-time step: run it as a checkpoint roughly every 3rd resolved dispatch or
completed task-batch during a long session, not just once at the end.

The checkpoint is the same review, just earlier and more often — it does
**not** create a separate log, file, or review cadence. If the mid-session
pass finds something durable, write it immediately via `vault-write` (the
same `fleet/lessons/` or `projects/<name>/decisions/` destination the
end-of-wrap pass would use) — one banked lesson, whichever pass caught it
first. If it finds nothing, there's nothing to write; move on. Running the
checkpoint mid-session only shrinks what the end-of-wrap Learn pass still has
to mine — it never adds a second place lessons live.

Review the session across three lanes:

1. **Failed/errored/re-dispatched agent runs** — any run that didn't pass first
   try. What was actually wrong, and what fixed it?
2. **Operator corrections and mid-flight ruling changes** — anywhere the
   operator overrode a plan, corrected an assumption, or changed a ruling after
   it was first stated.
3. **Surprises** — bugs found, assumptions overturned, tool quirks (transcript
   evidence behaving unexpectedly, task-notification timing, journal entries
   that revealed something not already known).

For each item found in those three lanes, ask: **does a durable lesson exist
here that isn't already banked?**

- **Yes** → write it now, in this wrap, as a typed vault note per `vault-write`
  (right thing-then-aspect folder — `fleet/lessons/` for anything reusable
  across projects, `projects/<name>/decisions/` for a project-scoped call) —
  wikilinked and hub-linked per vault-write's graph-linking rule (see
  `vault-write`'s **Graph linking is part of the write** section — this step
  doesn't restate that mechanic, it just triggers it for whatever mining
  turns up).
- **No** — either it's already banked (a prior lesson/ruling already covers
  it) or it's purely situational (true only of this one session, no future
  session would benefit) — skip it, with a one-line reason either way.

**Output contract:** a short mined-lessons list on **each project `<name>-handover.md` this wrap
replaced** (not the cockpit), one line per item reviewed across the three lanes:

```
### Mined lessons (wrap learn step)
- Written: [[fleet/lessons/<slug>]] — <one-line what/why>
- Skipped (already banked): <what it was> — covered by [[<existing note>]]
- Skipped (situational): <what it was> — <why it won't recur>
- None found in <lane> this session
```

This list is the audit trail — the next session can check that mining
actually happened this wrap, not just that the checkbox was ticked.

## Link health at wrap (verification check — not a cleanup pass)

Notes must already be created properly (`vault-write`). Wrap **verifies**; it does not
absorb graph debt. If lint fails here, fix the notes that were banked wrong this session
(and treat that as a vault-write failure), then re-check.

From vault root, **both** must exit 0:

```bash
node scripts/vault-lint.mjs
python3 scripts/vault-lint.py
```

**Fail wrap (non-negotiable):** any DANGLING/BROKEN, AMBIGUOUS, ORPHANS, HUB GAPS, **WEAK**, or **GENERIC** (forbidden filename stems — `unique-note-names`).
Do not add entries to `KNOWN_GAPS` to clear a wrap — wire the hub link instead.
ARCHIVED citations are fine (historical lineage).

## Estate sync at wrap

Run `~/JHD/vault/main/estate/sync-estate.sh` (or flat `~/JHD/vault/estate/sync-estate.sh`) before the wrap commit — it banks live machine
setup (LaunchAgents, claude-usage logs, auto-memory, **captures/live**) one-way into
`estate/`, and stages any changes for the wrap commit. Skipping it means the estate map
and banked Capture sync silently drift from the live machine between sessions.

**Mid-session (multiple Capture plugin syncs):** do not wait for wrap — run
`~/JHD/vault/main/estate/publish-captures.sh` after each sync (rsync + commit + push
`estate/captures/`) so Cloud can `git pull` the tip immediately.
## Push at wrap

After the checkpoint commit, `git push` (vault and any repo touched). Offsite remotes exist precisely so a dead machine loses nothing — a wrap that commits but doesn't push leaves the day's knowledge on one disk. If no remote is configured yet, run `scripts/setup-remotes.sh` from the vault root (one-time, needs gh CLI).

## Section 0 — drain the runners first (absorbed from the 2026-08-01 wrap)

Wrap does not start while any Agent / subagent dispatch is mid-flight. Every run
from this session is either: gate returned and merged; gate returned NO-MERGE and
the branch is explicitly parked on the **cockpit** in-flight list with what's missing; or turn-capped
with reviewer-verified work — in which case finish it (finisher dispatch, or the
documented-exception path: orchestrator commits the reviewer-verified diff and
runs the gate's own checks) before touching handover files. A wrap written around a
live run describes a state that's false by the time it's read.

## Repo topology at wrap (same origin, multiple clones)

When a repo exists as canonical + mirror clones (e.g. ~/JHD/discipline/main and the
live install path), verify BOTH at wrap: same HEAD, both trees clean, both on
main. An uncommitted tree in the clone this session didn't work in is still a
wrap failure — checkpoint-commit it (credit the session that made it), merge
through origin, and fast-forward the other clone. Also check for stale
`.git/*.lock` files (compare mtime to running git processes before removing).

## Version sync (Claude)

A plugin version bump is drift unless `.claude-plugin/plugin.json` matches what you
shipped this session **and** every product checkout that consumes Claude overlays is
updated in the same catchup — a bump nobody installed is unfinished work. If the Cursor
snapshot tree was edited, its own version fields stay that repo's concern.
