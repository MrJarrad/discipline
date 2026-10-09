# wrap — link health, estate sync, push, runners, topology, version sync

The six closing checks in full. SKILL.md names each one and what it must end on; this is
the procedure for each. Nothing here was rewritten — it is the 1.78.0 SKILL.md body,
moved.

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

**The vault lands on `main`, and the report proves it.** Cloud sessions write the vault on a
`claude/*` branch; the next session reads `main`, so notes left on the branch start it from
yesterday's cockpit. Operator, verbatim: *"it seems dangerous that vault was almost not pushed to main, that's crucial for wrap"*.
Merge (or fast-forward) the session's vault branch into `main`, then verify
`git ls-remote origin main` contains the wrap commit **before** the wrap report. A wrap report
that does not name the `main` sha is incomplete (a "full wrap" was reported once with every note
still on the branch; caught only when the operator asked).

## Section 0 — drain the runners first (absorbed from the 2026-08-01 wrap)

Wrap does not start while any Agent / subagent dispatch is mid-flight. Every run
from this session is either: gate returned and merged; gate returned NO-MERGE and
the branch is explicitly parked on the **cockpit** in-flight list with what's missing; or turn-capped
with reviewer-verified work — in which case finish it (finisher dispatch, or the
documented-exception path: orchestrator commits the reviewer-verified diff and
runs the gate's own checks) before touching handover files. A wrap written around a
live run describes a state that's false by the time it's read.

## Repo topology at wrap (same origin, multiple clones)

When a repo exists as canonical + mirror clones (e.g. ~/JHD/ai/discipline/main and the
live install path), verify BOTH at wrap: same HEAD, both trees clean, both on
main. An uncommitted tree in the clone this session didn't work in is still a
wrap failure — checkpoint-commit it (credit the session that made it), merge
through origin, and fast-forward the other clone. Also check for stale
`.git/*.lock` files (compare mtime to running git processes before removing).

**The worktree fence.** On a bare-layout repo, wrap runs `git worktree list` per repo and
confirms `main` is on `main` and every other entry sits under `worktrees/`. Cleanup never
removes a worktree by grep/pattern over that list — an explicit path under `worktrees/`
only, and `main` is never a removal target (`doer-rules.md` § Repo and safety). Prefer
`hooks/scripts/lane-sweep.mjs --worktrees <repo>`, which lists worktrees under
`<repo>/worktrees/` whose branch is merged into `origin/main` and removes only those,
refusing any path outside `worktrees/` (operator lesson 2026-09-21,
`never-remove-a-worktree-by-pattern`: a pattern-matched `git worktree remove --force`
deleted four `main` trees across bare-layout repos, losing untracked state and killing the
operator's live dev server).

## Version sync (Claude)

A plugin version bump is drift unless `.claude-plugin/plugin.json` matches what you
shipped this session **and** every product checkout that consumes Claude overlays is
updated in the same catchup — a bump nobody installed is unfinished work.

**Two surfaces, both current.** The plugin ships from the GitHub marketplace
(`MrJarrad/discipline` main) and is installed on both surfaces — Claude Code on the Mac
and Claude web. Web install is **done**, with marketplace auto-sync **on** — a version
bump propagates there without a separate operator step. Wrap still verifies web is
current (one line: confirm/mention the synced version), not surfaces it as a pending
install. Mac refreshes agent-side (`claude plugin update discipline@discipline`) as
before. If auto-sync ever lapses, wrap reverts to naming the gap explicitly, same as any
other drift.

**Thin overlays, not scattered copies.** Product repos carry a thin tripwire `CLAUDE.md`
block (floor + plugin-presence self-check), never a full rules copy — overlay scatter is
the named anti-pattern.

## Stand down at wrap (last step; ruling `wrapped-sessions-go-quiet`, 2026-10-09)

Run after the report and the final push, because it silences the session. Never archive it.

1. List every open PR (number, branch) and every running lane (run id) in the handover. This comes first, before any monitor is switched off, so the next session can pick each one up.
2. Stop every background watcher and scheduled wakeup this session armed (`TaskStop`, `unwatch_url`, pending `send_later`).
3. Disable, never delete, the transient and watcher routines and crons this session created (`update_trigger` with `enabled: false`, `CronDelete` for session crons); deleting a routine also deletes its run sessions, which are evidence. A routine the operator asked for as recurring stays enabled; name it in the handover. A fired-once trigger needs nothing.
4. `unsubscribe_pr_activity` for every PR it subscribed, and switch off any CI monitor it bound.
5. Record the wrap for the hook: `node "${CLAUDE_PLUGIN_ROOT}/hooks/bin/context-fill.mjs" --wrapped <session_id>` (the id is in the context-fill nudge). The 70% nudge stays silent for the rest of that session, even if the operator reopens it; one warning at 90% fill still fires, once.
6. Write "wrapped — inactive" in the handover, with where work continues.
7. From here, an automated event gets no action. At most one line: "Wrapped — this session is inactive; work continues in <next session / handover>." No queue reprint, no announcement on shared PRs. Only a genuine operator message reopens the session.
