# Markdown naming — doc-formats

Canonical rules for **delivery artifacts** and **templates** in the repo. `doc-formats` owns
structure and naming; each artifact's owning skill (see `REGISTRY.md`) owns content and process.

---

## Artifact filenames

### Fixed slot (one per initiative/project)

UPPERCASE **artifact token** + `.md`:

| Artifact | Filename | Path example | Owner |
| -------- | -------- | ------------- | ----- |
| Scope | `SCOPE.md` | `docs/discovery/{slug}/SCOPE.md` | `discover-scope` (template: `doc-formats`) |
| Context | `CONTEXT.md` | repo root, or `{area}/CONTEXT.md` | `define-terms` |

### Many per project

Dated or kebab-case + `.md`:

| Artifact | Pattern | Example | Owner |
| -------- | ------- | ------- | ----- |
| Shape | `{YYYY-MM-DD}-{slug}.md` | `docs/shapes/2026-07-01-wave6-memory-capture.md` | `shape-stress` |
| Documentation | `{topic-kebab}.md` | `docs/memory-view.md` | template: `doc-formats` |
| ADR | `{nnnn}-{slug}.md` | `docs/adr/0001-idempotency.md` | `define-terms` |
| Prototype notes | `NOTES.md` inside `docs/prototypes/{slug}/` | `docs/prototypes/refund-state-machine/NOTES.md` | `prototype` |

Not templated as markdown at all: **issues/tasks** — see `REGISTRY.md`.

### Collection folders

**lowercase plural**, matching the existing repo convention (`docs/shapes/`, `docs/prototypes/`,
`docs/discovery/`, `docs/adr/`) — not `Shapes/` or `Prototypes/`.

---

## Skill templates (`templates/`)

| Kind | Pattern | Examples |
| ---- | ------- | -------- |
| **Artifact body** | `{ARTIFACT}.template.md` | `SCOPE.template.md`, `DOCUMENTATION.template.md` |

The artifact token in a template's filename is UPPERCASE and matches the output artifact class.

---

## YAML frontmatter

### Required on every delivery artifact templated here

```yaml
---
artifact: scope | documentation
slug: kebab-case-identifier
last_updated: YYYY-MM-DD
---
```

### Common optional fields

| Field | Values | When |
| ----- | ------ | ---- |
| `title` | Human string | scope, documentation |
| `status` | e.g. `discovering`, `shipped` | pipeline state, if the calling skill tracks one |
| `audience` | `developers` \| `stakeholders` \| `ai` | documentation |

### Do not use

| Avoid | Use instead |
| ----- | ----------- |
| `type: scope` | `artifact: scope` |
| `project:` alone | `slug:` (matches `discover-scope`'s and `shape-stress`'s own vocabulary) |
| `updated:` | `last_updated:` |
| Mixed-case filenames like `Scope.md` | `SCOPE.md` |

### Headings (H1)

Pattern: `# {Artifact label} — {title}`

Examples: `# Scope — Inventory sync`, `# Wave 6 — Memory + capture` (shape doc's own convention, owned by
`shape-stress`).

---

## Cross-skill pointers

- Template bodies: **`doc-formats`** → `templates/{ARTIFACT}.template.md`
- Which template, and what's owned elsewhere: **`doc-formats`** → `references/REGISTRY.md`
- Shape doc's six-section contract: **`shape-stress`**
- CONTEXT.md / ADR shape: **`define-terms`**
