# vault-write — Do / Don't

The sharp edges of writing to `~/JHD/vault`. When any of these collide with a request, the rule wins — say so and do the right thing.

## Do

- **Pick the type by the decision test.** *Did we make it?* → `artifact`. *Did we decide it?* → `decision`. *Did we learn it?* → `memory`. *Are we pointing at someone else's thing?* → `reference`. Run it top-down; take the first that fits.
- **File by type, always.** `type:` alone picks the folder — `memory`→`memories/`, `decision`→`decisions/`, `reference`→`references/`, `artifact`→`artifacts/`, `project-hub`→`hubs/`.
- **Carry all 5 base fields** on every note: `type`, `scope`, `created`, `status`, `tags` (a list, even if empty).
- **Set `status: current`** on every new note. Draft only when explicitly asked; superseded only on the old note during a supersede.
- **Add the type's extra required field**: `reference`→`sources:`, `artifact`→`produced_by:`, `project-hub`→`owner:`.
- **Write with the Write tool.** The dumb cron commits; you never touch git.
- **On supersede**, edit only the old note's frontmatter (`status: superseded` + `superseded_by:`) and write a fresh new note (`status: current` + `supersedes:`).
- **Leave a `<!-- derived: … -->` placeholder** where a hub listing would go, and let the query layer fill it.

## Don't

- **Don't file by project.** `scope` is a recall filter, not a folder — no `projects/<x>/…`, no `orchestrator/`, no `hive/`, no `vision/` (those are frozen legacy).
- **Don't invoke git.** No `git add` / `commit` / `push` — ever. If asked to "commit the note," write the file and explain the cron handles commits.
- **Don't touch hub files when writing a record.** Hub listing sections are machine-derived; hand-editing them fights the query layer.
- **Don't hand-edit a hub listing** to "update it" — leave/keep the derived placeholder instead.
- **Don't edit the body of a superseded note.** Frontmatter status + link only; the old body is history.
- **Don't type a thing WE made as `reference`.** A map/spec/report/plan we produced reads like documentation but it's an `artifact` — `reference` is only for material whose author is *not us*. If it has a `produced_by:`, it's an artifact, not a reference.
- **Don't treat `sources:` as optional** on a `reference` — a reference with no sources is incomplete.
- **Don't restate the schema.** The canonical contract lives in `~/JHD/vault/AGENTS.md`; point at it rather than forking it here.
