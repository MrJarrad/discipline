# wrap — the seven sections in full

SKILL.md names each section and its completion criterion. This file is the full
procedure for all seven: what a cockpit patch touches, the handover file shape, ruling
lineage, memory, the toolkit gate, vault hygiene, the leftover sweep and the dying-path
verify. Nothing here was rewritten — it is the 1.78.0 SKILL.md body, moved.

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

**Infer product** (no operator naming). **capture-app** and **capture-figma** are two
products, each with its own repo since the estate split (2026-08-25): `~/JHD/capture-app`
(mac app) and `~/JHD/figma-plugins/main/capture-figma` (figma-sync, ingest-worker,
listener family):

| When | Product handover |
|---|---|
| Capture.app, helper `:7755`, Screen Recording, `mac/`, `~/JHD/capture-app` | `projects/capture-app/capture-app-handover.md` |
| Capture Figma plugin, `figma-sync/`, `:4411`, ingest, `~/JHD/figma-plugins/main/capture-figma` | `projects/capture-figma/capture-figma-handover.md` |
| Capture repo and the work is unclear | **capture-app** — never default to capture-figma |
| `~/JHD/portfolio/main` | `projects/portfolio/portfolio-handover.md` |
| `~/JHD/skillz/main` | `projects/skillz/skillz-handover.md` |
| `~/JHD/jhd-design-system` | package under Skillz — wrap **jhd-discipline** + **skillz** (no dedicated tray yet) |
| `~/JHD/ai/discipline/main` | `projects/jhd-discipline/jhd-discipline-handover.md` |
| Vault-only | Cockpit only — do not wipe a product file |

Plugin state goes to **jhd-discipline**, never legacy `projects/discipline`.

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

**Lessons ship or say why not.** Every file in `fleet/lessons/` and `fleet/rulings/` carries
`encoded: <semver> | pre-1.73.0 | queued | skipped(<reason>)`. A lesson written this session is
either encoded into the plugin in the same session or marked `queued` with the release it is
waiting on — a lesson with no `encoded:` field is a wrap failure. Run
`node <plugin>/hooks/scripts/lesson-ledger.mjs <vault-root>` and fix what it names.

### 4. Toolkit — committed and versioned (Claude plugin)

Uncommitted toolkit work is a wrap failure, not a note for next time. Verify:

- The Claude discipline plugin repo (`~/JHD/ai/discipline/main`) has every change
  committed and pushed when the session claimed toolkit work was done.
- Approved plans from this session are distilled into vault artifacts, not left
  only in the session transcript.
- If `.claude-plugin/plugin.json` version should bump for a behavior change, bump it
  in the same commit set, and update the marketplace/cache mirror so the installed
  plugin matches the repo.
- **Release checklist:** the commit gate refuses a `plugin.json` bump while any lesson or
  ruling is still `queued`, and `CHANGED.txt` names the lessons this version encoded. Run
  `node hooks/scripts/lesson-ledger.mjs <vault-root> --release <ver>` before the release
  commit and set each shipped lesson's `encoded:` to that version.
  The gate is on by default; `DISCIPLINE_LEDGER_GATE=0` is the only opt-out, for a run that
  must not consult a vault at all (an absent vault already warns and skips).

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

**Orphan backstop:** run `node <plugin>/hooks/scripts/vault-orphan-scan.mjs <vault-root>`.
Any orphan found here is a **wrap failure to fix in this same wrap** (link it from its
hub) — not a note for next time; the write-time law in `vault-write` is meant to make this
check come back clean.

### 6. Leftover — handover Open/Next + git (`leftover-not-a-board`)

Leftover is AI-first: this chat's lock, product Open/Next on unique `<name>-handover.md`, git for what is actually true. **Not** Jira/Linear/GitHub Projects — wrap does not clerk an issue board.

Ruling: vault `fleet/rulings/leftover-not-a-board.md`.

On wrap:

- **Derive or drop** product still-open from handover Open/Next — supersede lines this session shipped, parked, or abandoned.
- **Verify git** matches what handover claims (uncommitted work, unpushed commits, branch truth).
- **Write down** what git cannot see (parked intent, do-not-rebuild) on the project handover — not on a people-PM board.
- **Do not** walk an external task/issue board; no ticket clerk.

**Surface leftover** at session start (after reading handover Open), when the operator asks, when the lock changes, when a change clears its review (leftover vs lock), and in wrap confirmation. **Silence** while a locked slice is in flight — do not dump Open every turn. **Transcript summary ≠ leftover.**

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

**Evidence and probes never live in a product repo.** Before closing, each touched product's
round evidence is archived to `~/JHD/vault/main/estate/captures/<product>-evidence/` with a
manifest row (`scripts/evidence-archive.mjs`); evidence still in-tree at wrap is drift to name.

