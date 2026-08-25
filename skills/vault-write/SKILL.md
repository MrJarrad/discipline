---
name: vault-write
description: Procedure for writing any note, process log, or reference to ~/JHD/vault. Use when authoring typed vault records — memory, decision, reference, artifact, or project-hub. Not for reading/recalling from vault, or any write outside the vault.
---

# Vault Write

**Trigger:** Use when writing any note, process log, or reference to `~/JHD/vault`.

**Anti-trigger:** Reading or recalling from the vault; any write outside the vault working tree.

## Working tree (estate-layout 2026-08-16)

The vault git working tree is `~/JHD/vault/main` when that path has `.git`, else `~/JHD/vault` (Cloud/flat). All `~/JHD/vault/...` paths below mean **inside that working tree**, never the container root (`.bare`).

---

## Thing-then-aspect — the organizing principle (ruling 2026-08-02)

Every placement decision answers two questions, in this order: **WHICH THING** (which
project, or the fleet/estate if cross-project), **then WHAT KIND** of knowledge about it
(hub, primer, decision, audit, artifact, reference, ruling, lesson). Never type-first
scattering across a flat `memories/`/`decisions/`/`documents/`/`hubs/` split — that
schema is retired. See `~/JHD/vault/orchestrator/thing-then-aspect-organization-2026-08-02.md`
for the ruling.

## Step 1 — which thing

- **Scoped to one project** (portfolio, discipline, capture-app, capture-figma, flux-legacy, …) →
  `~/JHD/vault/projects/<name>/`.
- **True cross-project doctrine or a reusable lesson** (a ruling that binds every
  project, a technical lesson learned once and reusable everywhere) →
  `~/JHD/vault/fleet/`.
- **The orchestrator's own operating state** (cockpit `orchestrator/cockpit.md`,
  CONTRACT, standing process notes) → `~/JHD/vault/orchestrator/`. Surgical-patch the
  cockpit; do not dump a project diary there. Project last-left lives at
  `projects/<name>/<name>-handover.md` (replace on wrap). Rulings: handover-trays,
  unique-note-names.
- **Material we did not author** (a captured site, a screenshot, external code to
  imitate) → `~/JHD/vault/references/` — this one folder stays type-first because a
  reference is never "about" one project; it's a durable cross-project database (see
  `fleet/rulings/reference-database-schema.md`).
- **Machine setup, repo-docs mirrors, the estate map** → `~/JHD/vault/estate/`.

If a project has no folder yet under `projects/`, creating it is part of this write —
see **New-project trio** below; don't park the note at the vault root waiting for one.

## Step 2 — what kind, within that thing

Once you know which project (or fleet), pick the aspect subfolder. Each answers a
different question about the note's origin — the same decision test as before, now
routing to a subfolder instead of a type-named top-level folder:

| Aspect | Crisp definition | Project folder | Fleet folder |
|---|---|---|---|
| Hub | The project's standing index — one per project | `hub.md` (file, not folder) | — |
| Primer | Architecture map / file inventory / invariants for a repeated workstream, written as a dispatch **first read** | `primers/` | — |
| Decision | A call that was made — what we chose, by whom, its lineage | `decisions/` | `fleet/rulings/` if the call binds every project, not just this one |
| Audit | A build verified against a source of truth — findings, defect lists, measured evidence | `audits/` | — |
| Artifact | A thing we made with versions/supersession — maps, specs, design systems, reports, plans | `artifacts/` | — |
| Lesson | Distilled operational knowledge learned once, reusable anywhere | (rare inside a project; prefer fleet) | `fleet/lessons/` |
| Reference | Points outward at material we did not author | `~/JHD/vault/references/` (never project-scoped) | `~/JHD/vault/references/` |

**Decision test — run top-down, take the first that fits, THEN place by the table above:**

> - **Did we make it?** → `artifact` (or `audit` if it's specifically a build-vs-source
>   verification)
> - **Did we decide it?** → `decision` (project-scoped) or `fleet/rulings/`
>   (cross-project)
> - **Did we learn it?** → `fleet/lessons/` (a project-specific "decision" that's really
>   a lesson still routes here — lessons are fleet-wide by nature)
> - **Is it a standing repeated-workstream knowledge base for a dispatch to read
>   first?** → `primers/`
> - **Are we pointing at someone else's thing?** → `~/JHD/vault/references/`

**A ruling vs a project decision:** the operator approving *this specific button's
color* is a `projects/<name>/decisions/` record. The operator approving *a rule every
future project follows* (like this doctrine itself) is a `fleet/rulings/` record —
worked example: `fleet/rulings/token-rulings.md`.

**The trap:** a map/spec/report **we produced** *describes* something, so it reads like
documentation and is easy to mis-file as a `reference`. It is not — we made it, so it's
an `artifact`. `reference` is only for material whose author is *not us* (and it must
carry a `sources:` list — required, not optional).

**Second trap — authored collection masquerading as prose:** a hand-authored list of
references/sources that should instead be individual typed reference records + a
derived view. Rule: *references are records, collections are derived, curation is
metadata.* Curation intent (`pinned`/`weight`/tags) belongs on each individual reference
record, filed in `references/` — never as authored body prose inside a project artifact.

---

## New-project trio — created together, same action

A project doesn't exist in the vault until all three of these land in the same write:

1. **`projects/<name>/` folder shape** — hub `projects/<name>/<name>.md` +
   `<name>-handover.md` (last-left, replace on wrap) + empty-until-needed `primers/`,
   `decisions/`, `audits/`, `artifacts/` subfolders.
2. **An `[[estate-map]]` row** — `~/JHD/vault/estate/estate-map.md`, the project's
   repo, git remote, and where its knowledge lives.
3. **A repo-docs mirror** — `~/JHD/vault/estate/repo-docs/{plugins|repos}/<name>/`,
   mirroring the repo's own README/HANDOVER surface.

Creating only the folder without the estate-map row and repo-docs mirror leaves the
project unanchored — see `estate/estate-map.md`'s own `UNANCHORED` markers for what
that failure mode looks like in practice.

---

## How to write

### Frontmatter — placement is the aspect folder, not a `type:` field

Under thing-then-aspect, the folder position (`projects/<name>/decisions/`,
`fleet/lessons/`, `references/`, …) already carries the classification that a flat
`type:` field used to encode — don't re-derive it in frontmatter. Where frontmatter is
used (references always carry it; fleet/lessons and project artifacts often do; project
decisions and hub prose are frequently plain markdown with no frontmatter block — both
are observed in the live vault), keep it minimal and match the nearest sibling file in
the same aspect folder rather than inventing a schema:

```yaml
---
name: <slug>
description: "<one line — what this record is and when to reach for it>"
created: YYYY-MM-DD
status: current       # draft | current | superseded
tags: []
---
```

`reference` records are the one place frontmatter stays mandatory and richer — see
**References are a typed write too**, below.

### Write model

**Author with the Write tool** (thing-then-aspect, graph wired in the same action). Do not hand-edit via `git apply` or dump a note at the vault root.

**Land it.** This estate does **not** wait on a cron. Durable vault writes are a coherent git slice: commit, open the PR, merge (`gh pr merge`) — same remittance as other vault/docs work (see invariants). Do not leave hive notes uncommitted “for the cron.” A Mac cron, if it still exists, is a **backstop** only.

Do not mix vault files and product-repo files in the same commit.

### Shared files and parallel agents — re-read live, edit narrow (2026-08-05)

Most vault writes are a new file with no contention. A handful of files are
shared indexes that more than one parallel agent may touch in the same
window — a project hub, `MEMORY.md`, `references/reference-database.md`, or any file two
dispatches from the same session might both append to. Per
`concurrent-agents-worktree-isolation`, parallel agents already work in
separate worktrees for exactly this class of race; a shared vault file is the
same race one level up; the fix is the same shape, applied at the file level:

1. **Re-read the file immediately before writing, not earlier in the turn.**
   A read taken at the start of a long tool sequence is stale by the time you
   write — another agent may have appended in between.
2. **Prefer the narrowest edit that adds your entry** (`Edit`, anchored to a
   specific line or section) over a full-file `Write` rewrite built from a
   remembered snapshot — a whole-file rewrite from a stale snapshot silently
   discards whatever a concurrent write added in between, with no error on
   either side.
3. **If a full rewrite is unavoidable** (e.g. resequencing), diff the fresh
   read against your snapshot first and carry forward any entries that
   appeared since — never write back a version older than what's on disk.

### Scope, now implicit in placement

Filing a decision under `projects/portfolio/decisions/` already scopes it to
portfolio — no separate `scope:` field is needed to do that job. A cross-project ruling
in `fleet/rulings/` is implicitly company-wide. If a note still carries a `scope:`
field from before this migration, treat it as informational, not load-bearing.

Recall defaults to `status: current` — only non-superseded records surface unless history is explicitly requested.

### Supersede sequence

When replacing an older note, follow this exact sequence:

1. Mark the **old note** frontmatter only: `status: superseded` + `superseded_by: "[[new-slug]]"`
2. Create the **new note** with `status: current` + `supersedes: "[[old-slug]]"` in its frontmatter
3. **Never edit the old note body** — only frontmatter status + link are permitted to change

### Hub files — link into them in the same write

Project hubs are `projects/<name>/<name>.md` (e.g. `projects/portfolio/portfolio.md`).
Fleet rulings use `fleet/rulings/fleet-rulings.md` (and the token essay [[token-rulings]]).
References use `references/reference-database.md`.

When you add a decision / audit / artifact / primer / ruling worth finding later, **add its
`[[link]]` under the relevant hub section in the same action**. Never delete or reorder
existing hub entries while adding yours. An unlinked note is not a finished write.

**A new note and its hub backlink are one atomic action** (operator ruling, straggler
notes found in the live graph 2026-08-25). The same turn that `Write`s a note MUST also
`Edit` the owning hub (or tray/index) to link it in. A `Hubs:` frontmatter/lead line
**inside the note, pointing at the hub, does not satisfy this** — that link points the
wrong direction; only an inbound link **from** the hub kills a straggler.

**The filename is the link key** (live-failure correction, 2026-08-25: hub backlinks
written as `[[frontmatter-name]]` against date-prefixed filenames stayed broken —
Obsidian resolves `[[wikilinks]]` by **filename**, or a declared `aliases:` entry, never
by frontmatter `name:`). The hub backlink MUST use the target's actual filename stem —
`[[2026-08-25-foo]]`, or `[[2026-08-25-foo|foo]]` for a readable display text — never the
frontmatter `name:`. The writer verifies resolution in the same action: the `[[stem]]`
written into the hub must exactly match an existing file's basename (or a declared alias).
Evidence of a vault write names **both** files touched — the note and the hub it was wired
into.

**Imported archival bundles are payload, not notes:** a salvaged historical doc tree gets a
`.vault-bundle` marker file in its own folder in the same action it's imported — the
bundle's parent note/README carries the hub link, not each individual file inside it.

---

## Create properly — graph wiring is the write (ruling 2026-08-03)

Nothing may land as an orphan, WEAK note, or hub-gap straggler. **Wrap is a check, not a
cleanup pass** — if a note needs hub-linking at wrap time, the write already failed.

A pre-commit hook (`vault/scripts/githooks/pre-commit`) blocks bad graphs. That is a
backstop. Your job is to wire the note in the same action that creates it:

1. **Inbound link in the same write** — from the owning project hub, `fleet/rulings/fleet-rulings.md`,
   or `references/reference-database.md` as appropriate. Not a follow-up todo.
2. **Outbound `[[links]]` to lineage** — what this note builds on, supersedes, or was prompted by.
3. **Family hub coverage** — project decisions must appear on the project hub; fleet rulings
   on `fleet/rulings/fleet-rulings.md`; references as a row on `references/reference-database.md`.
4. **Verify before declaring done** from vault root:
   - `node scripts/vault-lint.mjs` — DANGLING / ORPHANS / HUB GAPS all 0
   - `python3 scripts/vault-lint.py` — BROKEN / AMBIGUOUS / ORPHANS / **WEAK** / **GENERIC** all 0

If either command is non-zero, fix the graph and re-run. Do not bank the note as done.

**Reference entries:** add the row to `references/reference-database.md` in the same write (see
`fleet/rulings/reference-database-schema.md`) — an unindexed reference is unfindable even
if it isn't a graph orphan.

## Naming convention

Ruling: `fleet/rulings/unique-note-names.md`. The filename stem **is** the search and
graph label.

```
<topic-slug>.md                 # general notes
<task-slug>-<topic-slug>.md     # task-scoped notes
<name>-handover.md              # project last-left
<what>-report.md                # artifact reports
<site>-analysis.md              # reference site analysis
<capture-slug>-read.md          # Figma capture reads
```

Use lowercase kebab-case. **Forbidden stems** (lint fails): `_index`, `index`,
`HANDOVER`, `REPORT`, `analysis`, `README`, `READ`, `hub`, `MEMORY`, `notes`,
`untitled`. Never create a second file that shares a stem with an existing note.

---

## Canonical schema reference

`~/JHD/vault/AGENTS.md` (schema rev-6, thing-then-aspect) is the current canonical
statement of this shape — point there first. The ruling that established it:
`~/JHD/vault/orchestrator/thing-then-aspect-organization-2026-08-02.md`.

The sharp do/don't edges of this procedure live in [references/DOS-AND-DONTS.md](references/DOS-AND-DONTS.md).

## References are a typed write too

References (`~/JHD/vault/references/`) are a durable cross-project database, not project notes — never archive a capture when a project retires. Every reference written gets the database frontmatter (see `fleet/rulings/reference-database-schema.md`):

- `projects: [portfolio, ...]` — every project it informs; append projects as they adopt it, never overwrite.
- `good_for: [layout, motion, markup, visual, typography, components, transitions, style-board, code]` — what you'd consult it for.
- `type: website | style-board | screenshot | code`

Three capture sources, one schema:
- **Site captures** — produced by capture-website into `references/<name>/` + a `<name>.md` entry.
- **Operator screenshots** — when the operator provides a screenshot as a reference, file the image under `references/assets/<name>/` and write a `<name>.md` entry (`type: screenshot`, `source: operator`) describing what it shows and why it was kept; a screenshot with no entry is unfindable.
- **Code** — when actual code is the reference (a snippet, a component, a technique from another repo), save the code file(s) under `references/assets/<name>/` and write a `<name>.md` entry (`type: code`, `good_for: [code, ...]`) noting origin, license if external, and what to imitate — the entry explains, the file is the ground truth.

Regenerate `references/reference-database.md` after any reference write.
