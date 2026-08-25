# vault-write — Do / Don't

The sharp edges of writing to `~/JHD/vault`, thing-then-aspect. When any of these collide with a request, the rule wins — say so and do the right thing.

## Do

- **Place by thing, then aspect.** Which project (or `fleet/`, `orchestrator/`, `references/`, `estate/`) first; which aspect subfolder (`primers/`, `decisions/`, `audits/`, `artifacts/`, or `hub.md`) second.
- **Pick the aspect by the decision test.** *Did we make it?* → `artifact` (or `audit` if it's a build-vs-source verification). *Did we decide it?* → `decisions/` (project) or `fleet/rulings/` (cross-project). *Did we learn it?* → `fleet/lessons/`. *Is it a repeated-workstream first-read?* → `primers/`. *Are we pointing at someone else's thing?* → `~/JHD/vault/references/`.
- **Create the new-project trio together.** A project isn't real in the vault until it has: `projects/<name>/` folder shape, an `estate/estate-map.md` row, and an `estate/repo-docs/{plugins|repos}/<name>/` mirror — same write, not staggered.
- **Set `status: current`** on every new note that carries frontmatter. Draft only when explicitly asked; superseded only on the old note during a supersede.
- **`reference` records still require `sources:`** — a reference with no sources is incomplete, regardless of the schema simplification elsewhere.
- **Write with the Write tool, then land the slice.** Author the note (graph wired). Then commit / PR / merge the vault working tree — do not leave hive notes for a cron.
- **On supersede**, edit only the old note's frontmatter (`status: superseded` + `superseded_by:`) and write a fresh new note (`status: current` + `supersedes:`).
- **Link new records into the project hub** (`projects/<name>/hub.md`) in the same action — hubs are hand-maintained indexes now, not query-layer derived.
- **`Edit` the hub in the same turn as the `Write`** that creates the note — one atomic action, evidence names both files.

## Don't

- **Don't write the note and say "hub — to be linked later."** That is the straggler factory: a `Hubs:` line inside the note points AT the hub, but nothing links back, so the note sits orphaned in the graph until someone notices (four found in the live vault, 2026-08-25). Link it now, in this turn, or don't call the write done.

- **Don't file by type at the vault root.** `memories/`, `decisions/`, `documents/`, `hubs/`, `artifacts/` as top-level folders are the retired flat-by-type schema — every one of those aspects now lives *inside* `projects/<name>/` or `fleet/`.
- **Don't skip remittance.** Writing the file is not done. Commit + PR + merge the vault working tree. A cron is a backstop, not a reason to skip git. Don't mix vault and product files in one commit.
- **Don't leave a project's knowledge unanchored.** A `projects/<name>/` folder with no `estate-map.md` row and no `repo-docs` mirror is exactly the failure the estate map flags as `UNANCHORED` — don't reproduce it.
- **Don't edit the body of a superseded note.** Frontmatter status + link only; the old body is history.
- **Don't type a thing WE made as `reference`.** A map/spec/report/plan we produced reads like documentation but it's an `artifact` — `reference` is only for material whose author is *not us*.
- **Don't treat `sources:` as optional** on a `reference` — the one field this schema still hard-requires.
- **Don't restate the schema.** `~/JHD/vault/AGENTS.md` (rev-6, thing-then-aspect) is
  the current canonical statement — point there first, alongside the ruling
  (`~/JHD/vault/orchestrator/thing-then-aspect-organization-2026-08-02.md`). Don't fork
  a third description of the schema here.
