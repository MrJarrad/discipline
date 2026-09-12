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

## Step 2 — what kind, within that thing

Inside the thing, the write is one of the typed kinds — **memory, decision, reference,
artifact, project-hub, lesson, ruling**. Pick the kind before writing a line; the kind
fixes the folder, the filename shape and the frontmatter. Every kind, with its folder,
schema and worked example: [WRITING.md](references/WRITING.md).

## How to write

Frontmatter is minimal by default — the record's own keys, nothing decorative.

**`fleet/lessons/` and `fleet/rulings/` carry one more mandatory key: `encoded:`** — the
plugin version that shipped the rule, or `pre-1.73.0` \| `queued` \| `skipped(<reason>)`.
A lesson nobody encoded is a lesson nobody follows; `hooks/scripts/lesson-ledger.mjs` lints
the field and the commit gate — on by default, `DISCIPLINE_LEDGER_GATE=0` to opt out —
refuses a release bump while any `queued` remains. Index files are exempt: a file whose
stem equals its folder (`fleet/lessons/lessons.md`) or its `fleet-` form
(`fleet/lessons/fleet-lessons.md`), plus any file whose frontmatter carries `kind: index`.

```yaml
encoded: 1.73.0       # | pre-1.73.0 | queued | skipped(hoverboard-rig-specific)
```

`reference` records are the one place frontmatter stays mandatory and richer.

The write model, the per-kind templates, prose guidance and worked examples:
[WRITING.md](references/WRITING.md).

## Create properly — graph wiring is the write

A note nobody can reach is not written. The write includes its graph wiring: the hub link
in, the links out, and the index entry — done in the **same action** as the file, never as
a follow-up (ruling 2026-08-03). Naming convention, the canonical schema, and the rules for
typed `reference` records: [WRITING.md](references/WRITING.md).

Read [DOS-AND-DONTS.md](references/DOS-AND-DONTS.md) when applying this skill.

