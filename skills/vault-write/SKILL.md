---
name: vault-write
description: Procedure for writing any note, process log, or reference to ~/JHD/vault. Use when authoring typed vault records — memory, decision, reference, artifact, or project-hub. Not for reading/recalling from vault, or any write outside the vault.
---

# Vault Write

**Trigger:** Use when writing any note, process log, or reference to `~/JHD/vault`.

**Anti-trigger:** Reading or recalling from the vault; any write outside `~/JHD/vault`.

---

## Thing-then-aspect — the organizing principle (ruling 2026-08-02)

Every placement decision answers two questions, in this order: **WHICH THING** (which
project, or the fleet/estate if cross-project), **then WHAT KIND** of knowledge about it
(hub, primer, decision, audit, artifact, reference, ruling, lesson). Never type-first
scattering across a flat `memories/`/`decisions/`/`documents/`/`hubs/` split — that
schema is retired. See `~/JHD/vault/orchestrator/thing-then-aspect-organization-2026-08-02.md`
for the ruling.

## Step 1 — which thing

- **Scoped to one project** (portfolio, discipline, capture-figma, flux-legacy, …) →
  `~/JHD/vault/projects/<name>/`.
- **True cross-project doctrine or a reusable lesson** (a ruling that binds every
  project, a technical lesson learned once and reusable everywhere) →
  `~/JHD/vault/fleet/`.
- **The orchestrator's own operating state** (HANDOVER, CONTRACT, standing process
  notes about running the vault itself) → `~/JHD/vault/orchestrator/`.
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

1. **`projects/<name>/` folder shape** — `hub.md` + empty-until-needed `primers/`,
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

**Write tool only.** A dumb cron outside the session handles git commits automatically — never invoke `git` directly. Do not run `git add`, `git commit`, `git push`, or any git operation.

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

### Hub files — link into them, don't rewrite them

`projects/<name>/hub.md` is a project's standing index (see
`projects/portfolio/hub.md` for the worked shape). Unlike the old query-layer-derived
hub listings, hubs in the current schema are hand-maintained `[[wikilink]]` indexes —
when you add a decision/audit/artifact/primer worth surfacing, add its `[[link]]` under
the relevant hub section in the same action, don't leave it to a query layer that isn't
wired. Never delete or reorder existing hub entries while adding yours.

---

## Graph linking is part of the write, not a follow-up (ruling 2026-08-03)

Nothing may land as an orphan or straggler in the vault's Obsidian graph. A
structural pre-commit gate enforces this (`vault/scripts/githooks/pre-commit`
runs `vault-lint.py` and blocks on BROKEN/AMBIGUOUS/ORPHANS) — but the gate is a
backstop, not the mechanism. Wiring the note in is your job, done in the same
write as creating it:

1. **At least one inbound link** — from the owning hub (`projects/<name>/hub.md`),
   the relevant `_index`, or a MEMORY-equivalent index — added in the same action,
   not queued as a follow-up.
2. **Outbound `[[links]]` to lineage** — the decision/artifact/reference this note
   builds on, supersedes, or was prompted by.
3. **Run `python3 scripts/vault-lint.py` from vault root before declaring done**
   and report `BROKEN`/`AMBIGUOUS`/`ORPHANS` all 0. (`wrap` runs this same check
   at session close — this is the per-write version, not a duplicate step.)

**Reference entries carry one more requirement:** add the row to
`references/_index.md` in the same write (see **References are a typed write
too**, above, and `fleet/rulings/reference-database-schema.md`) — an
unindexed reference is unfindable even if it isn't a graph orphan.

## Naming convention

```
<topic-slug>.md               # general notes
<task-slug>-<topic-slug>.md   # task-scoped notes
```

Use lowercase kebab-case.

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

Regenerate `references/_index.md` after any reference write.
