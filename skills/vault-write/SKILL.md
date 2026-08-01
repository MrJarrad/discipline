---
name: vault-write
description: Procedure for writing any note, process log, or reference to ~/JHD/vault. Use when authoring typed vault records — memory, decision, reference, artifact, or project-hub. Not for reading/recalling from vault, or any write outside the vault.
---

# Vault Write

**Trigger:** Use when writing any note, process log, or reference to `~/JHD/vault`.

**Anti-trigger:** Reading or recalling from the vault; any write outside `~/JHD/vault`.

---

## What to write — pick the type by the decision test

The write seam checks that `type` **exists**, not that it is **true**. Picking the right type is your job, here, before you write. Each type answers a different question about where the note *came from*:

| Type | Crisp definition |
|---|---|
| `reference` | Points **outward** at material we did **not** author — a product, article, external spec, style board. We're *citing*, not *claiming*. |
| `artifact` | A thing **we made** — a deliverable with versions/supersession: maps, specs, design systems, reports, plans. |
| `decision` | A **call that was made** — what we chose, by whom, its lineage. |
| `memory` | **Distilled operational knowledge** — a lesson, recipe, or piece of state we learned. |
| `project-hub` | A project-scoped index/hub. |

**Decision test — run top-down, take the first that fits:**

> - **Did we make it?** → `artifact`
> - **Did we decide it?** → `decision`
> - **Did we learn it?** → `memory`
> - **Are we pointing at someone else's thing?** → `reference`

The trap: a map/spec/report **we produced** *describes* something, so it reads like documentation and is easy to mis-type as `reference`. It is not — we made it, so it is an `artifact`. `reference` is only for material whose author is *not us* (and it must carry a `sources:` list — required for that type, not optional). Process logs go in as `type: memory`.

**Second trap — authored collection masquerading as document:** a hand-authored list of references/sources that should instead be individual typed `reference` records + a derived view. Rule: *references are records, collections are derived, curation is metadata.* Curation intent (`pinned`/`weight`/tags) belongs on each individual reference record — not in authored body prose. Worked example: `vision/visual-direction-references.md` (post-`9f2e53f`) — 18 individual reference records in `references/`; the old monolithic file is now a slim `document` carrying only the curation rationale + `[[links]]`; the reference list is derived by tag, never hand-authored.

---

## Where it goes — type-based folder routing

| Type | Folder |
|---|---|
| `memory` | `memories/` |
| `decision` | `decisions/` |
| `reference` | `references/` |
| `artifact` | `artifacts/` |
| `project-hub` | `hubs/` |

**Do NOT file by project.** Scope is frontmatter, not folder. Every note lands in its type folder regardless of which project it belongs to.

**Legacy folders** (`orchestrator/`, `hive/`, `vision/`, `projects/`) are frozen — do not add new notes there.

---

## How to write

### Required frontmatter — 5 fields, all mandatory

```yaml
---
type: memory          # enum: memory | decision | reference | artifact | project-hub
scope: portfolio      # company | <project-slug>
created: YYYY-MM-DD
status: current       # draft | current | superseded
tags: []              # always a list, even if empty
---
```

### Type-specific additional required fields

| Type | Required extra field |
|---|---|
| `reference` | `sources:` — list of URLs or slugs (required, not optional) |
| `artifact` | `produced_by:` — agent or process that created it |
| `project-hub` | `owner:` — agent or team responsible |

`memory` and `decision` have no additional required fields beyond the base 5.

### Write model

**Write tool only.** A dumb cron outside the session handles git commits automatically — never invoke `git` directly. Do not run `git add`, `git commit`, `git push`, or any git operation.

### Scope semantics

`scope` is a recall filter, not a storage hierarchy:
- `scope: company` → surfaces everywhere by default
- `scope: <slug>` → surfaces when working in that project context

Neither value changes where the file is stored — the folder is determined by `type` only.

Recall defaults to `status: current` — only non-superseded records surface unless history is explicitly requested.

### Supersede sequence

When replacing an older note, follow this exact sequence:

1. Mark the **old note** frontmatter only: `status: superseded` + `superseded_by: "[[new-slug]]"`
2. Create the **new note** with `status: current` + `supersedes: "[[old-slug]]"` in its frontmatter
3. **Never edit the old note body** — only frontmatter status + link are permitted to change

### Hub files — do not touch

When writing a new record, **do NOT touch any hub file.** Hub listing sections (e.g. `## Related References`, `## Active Decisions`) are machine-written by the query layer and update automatically from the new note's frontmatter.

Use this placeholder when the query layer is not yet wired:

```markdown
<!-- derived: scope:portfolio type:reference status:current -->
```

---

## Naming convention

```
<topic-slug>.md               # general notes
<task-slug>-<topic-slug>.md   # task-scoped notes
```

Use lowercase kebab-case.

---

## Canonical schema reference

→ `~/JHD/vault/AGENTS.md`

The sharp do/don't edges of this procedure live in [references/DOS-AND-DONTS.md](references/DOS-AND-DONTS.md).

## References are a typed write too

References (`~/JHD/vault/references/`) are a durable cross-project database, not project notes — never archive a capture when a project retires. Every reference written gets the database frontmatter (see memories/reference-database-schema.md):

- `projects: [portfolio, ...]` — every project it informs; append projects as they adopt it, never overwrite.
- `good_for: [layout, motion, markup, visual, typography, components, transitions, style-board, code]` — what you'd consult it for.
- `type: website | style-board | screenshot | code`

Three capture sources, one schema:
- **Site captures** — produced by capture-website into `references/<name>/` + a `<name>.md` entry.
- **Operator screenshots** — when the operator provides a screenshot as a reference, file the image under `references/assets/<name>/` and write a `<name>.md` entry (`type: screenshot`, `source: operator`) describing what it shows and why it was kept; a screenshot with no entry is unfindable.
- **Code** — when actual code is the reference (a snippet, a component, a technique from another repo), save the code file(s) under `references/assets/<name>/` and write a `<name>.md` entry (`type: code`, `good_for: [code, ...]`) noting origin, license if external, and what to imitate — the entry explains, the file is the ground truth.

Regenerate `references/_index.md` after any reference write.
