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
