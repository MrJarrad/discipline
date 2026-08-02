# vault-write — Do / Don't

The sharp edges of writing to `~/JHD/vault`, thing-then-aspect. When any of these collide with a request, the rule wins — say so and do the right thing.

## Do

- **Place by thing, then aspect.** Which project (or `fleet/`, `orchestrator/`, `references/`, `estate/`) first; which aspect subfolder (`primers/`, `decisions/`, `audits/`, `artifacts/`, or `hub.md`) second.
- **Pick the aspect by the decision test.** *Did we make it?* → `artifact` (or `audit` if it's a build-vs-source verification). *Did we decide it?* → `decisions/` (project) or `fleet/rulings/` (cross-project). *Did we learn it?* → `fleet/lessons/`. *Is it a repeated-workstream first-read?* → `primers/`. *Are we pointing at someone else's thing?* → `~/JHD/vault/references/`.
- **Create the new-project trio together.** A project isn't real in the vault until it has: `projects/<name>/` folder shape, an `estate/estate-map.md` row, and an `estate/repo-docs/{plugins|repos}/<name>/` mirror — same write, not staggered.
- **Set `status: current`** on every new note that carries frontmatter. Draft only when explicitly asked; superseded only on the old note during a supersede.
- **`reference` records still require `sources:`** — a reference with no sources is incomplete, regardless of the schema simplification elsewhere.
- **Write with the Write tool.** The dumb cron commits; you never touch git.
- **On supersede**, edit only the old note's frontmatter (`status: superseded` + `superseded_by:`) and write a fresh new note (`status: current` + `supersedes:`).
- **Link new records into the project hub** (`projects/<name>/hub.md`) in the same action — hubs are hand-maintained indexes now, not query-layer derived.

## Don't

- **Don't file by type at the vault root.** `memories/`, `decisions/`, `documents/`, `hubs/`, `artifacts/` as top-level folders are the retired flat-by-type schema — every one of those aspects now lives *inside* `projects/<name>/` or `fleet/`.
- **Don't invoke git.** No `git add` / `commit` / `push` — ever. If asked to "commit the note," write the file and explain the cron handles commits.
- **Don't leave a project's knowledge unanchored.** A `projects/<name>/` folder with no `estate-map.md` row and no `repo-docs` mirror is exactly the failure the estate map flags as `UNANCHORED` — don't reproduce it.
- **Don't edit the body of a superseded note.** Frontmatter status + link only; the old body is history.
- **Don't type a thing WE made as `reference`.** A map/spec/report/plan we produced reads like documentation but it's an `artifact` — `reference` is only for material whose author is *not us*.
- **Don't treat `sources:` as optional** on a `reference` — the one field this schema still hard-requires.
- **Don't restate the schema.** The canonical shape lives in the ruling
  (`~/JHD/vault/orchestrator/thing-then-aspect-organization-2026-08-02.md`) and this
  skill; `~/JHD/vault/AGENTS.md` is the pre-migration schema and is stale — don't cite it
  as current, and don't fork a third description of the schema here.
