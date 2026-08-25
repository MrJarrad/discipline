---
name: vault-recall
description: Procedure for reading and recalling from ~/JHD/vault as shared memory across sessions. Use when starting a task or during work to check for prior decisions, learnings, references, or artifacts before deriving new answers. Not for writing to the vault — that's vault-write.
---

# Vault Recall

**Trigger:** Use when starting a task or during any work to recall decisions, learnings, captured references, or prior analysis from shared memory across sessions.

**Anti-trigger:** Writing or authoring vault records; any read outside the vault working tree.

## Working tree (estate-layout 2026-08-16)

The vault git working tree is `~/JHD/vault/main` when that path has `.git`, else `~/JHD/vault` (Cloud/flat). All `~/JHD/vault/...` paths below mean **inside that working tree**, never the container root (`.bare`).

---

## Entry points — thing-then-aspect (ruling 2026-08-02)

Vault reads mirror vault writes: **which thing, then what kind.** Start with the thing,
not the aspect.

- **Working in a specific product** (portfolio, jhd-discipline, capture-app, capture-figma, skillz, …) →
  read `projects/<name>/<name>-handover.md` first if it exists (dated last-left), then the
  project hub (`projects/<name>/<name>.md`). Follow hub `[[wikilinks]]` into
  `primers/`, `decisions/`, `audits/`, `artifacts/`. Infer `<name>` by **product**, not
  “the capture folder”: Capture.app / helper / Screen Recording →
  **capture-app** (`~/JHD/capture-app`); Capture Figma plugin / `figma-sync` / ingest →
  **capture-figma** (`~/JHD/figma-plugins/main/capture-figma`); unclear capture-repo work
  → **capture-app** (never default to capture-figma). `portfolio/main` → portfolio;
  `skillz/main` → skillz; `~/JHD/jhd-design-system` → house web package (Skillz extract —
  read skillz tray); `~/JHD/ai/discipline/main` (Claude plugin, live) and
  `~/JHD/ai/discipline-cursor` (Cursor snapshot) → jhd-discipline (not legacy
  `projects/discipline`).
- **Doing repeated work in a workstream** (a repo you keep dispatching into) → read
  `projects/<name>/primers/<workstream>-primer.md` first — the dispatch-brief skill
  requires it be cited as FIRST READ. If no primer exists yet, that's a signal to write
  one after the dispatch, not to skip the read.
- **Checking cross-project doctrine or a binding rule** → `~/JHD/vault/fleet/rulings/`.
- **Checking a reusable technical lesson** → `~/JHD/vault/fleet/lessons/`.
- **Checking the state of the whole estate** (every `~/JHD` directory, git state,
  where its knowledge lives) → `~/JHD/vault/estate/estate-map.md`.
- **Checking a repo's own knowledge surface without leaving the vault** →
  `~/JHD/vault/estate/repo-docs/{plugins|repos}/<name>/`.
- **Looking for material we did not author** (a captured site, a code snippet, an
  operator screenshot) → `~/JHD/vault/references/`, filterable by its database
  frontmatter (`projects:`, `good_for:`, `type:`) rather than by project folder.
- **Orchestrator's own operating files** (cockpit, contract) →
  `orchestrator/cockpit.md` (machine / in-flight — read **after** this project's
  handover), `orchestrator/CONTRACT.md`. Do not load every `projects/*/*-handover.md`.
  Rulings: `handover-trays`, `unique-note-names`.

When there is no hub route yet (a project too new to have one, or you're unsure which
project a note belongs to), `grep` across `projects/*/` and `fleet/` directly rather
than guessing a single folder — the folder is determined by thing-then-aspect, not by a
`category`/`scope` frontmatter field to filter on.

---

## Recall defaults — what gets returned

**Status filter:** Recall returns only `status: current` records by default. Non-superseded records only.

**History mode:** Only when explicitly asked for history (e.g., "show me the superseded versions") return `status: superseded` records. Include `superseded_by:` links to see the lineage.

---

## Check-before-derive rule — the gate

**Before making a project-scoped decision**, check `projects/<name>/decisions/` for prior calls + lineage.

**Before making a call that would bind every project**, check `fleet/rulings/` first — it may already be settled doctrine.

**Before re-learning or distilling a technique**, check `fleet/lessons/` for a recipe or lesson already captured.

**Before re-capturing an external source**, check `references/` for what we already hold.

A vault hit replaces re-derivation; a miss is a signal to write the record after the work (via **vault-write**).

---

## Trust discipline — verify against reality

Recalled notes are **point-in-time claims**. Before acting on them, verify:
- File paths and flag names against current codebase
- Build/deploy status against live systems
- Project and dispatch assignments against the current session state

A note may be authored correctly but now stale. Stale signals a new record (superseding the old) via **vault-write**, not a contradiction. A project `<name>-handover.md` is last-left with a date — if that date is old, say so, then trust git + the hub. Do not treat it as still-green. Live health (listener, Claude parked) lives only in the cockpit.

---

## The vault context map

The vault holds our graph organized thing-then-aspect: `orchestrator/` + one
`projects/<name>/` folder per project (hub, primers, decisions, audits, artifacts) +
`fleet/` for cross-project rulings and lessons + `references/` + `estate/` — all linked
by `[[wikilinks]]`. Recall means landing on the right project's hub (or `fleet/` for
doctrine) and following its edges to assemble working context for the task at hand.
