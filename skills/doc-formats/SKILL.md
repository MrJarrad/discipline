---
name: doc-formats
description: Canonical templates and naming for Paperclip's keyed markdown documents — SCOPE and DOCUMENTATION — plus the registry that says which template to use and where sibling skills already own a doc's structure. Use when writing a typed markdown artifact, or when another skill needs the correct document shape before writing.
---

# Doc Formats

**Single source of truth for document shapes** in `paperclip-lab` — every skill that produces a typed
markdown artifact uses a template from here, not ad-hoc headings. Paperclip issues are native objects,
not markdown files — this skill never templates those (see [references/REGISTRY.md](references/REGISTRY.md)).

Read [references/GLOSSARY.md](references/GLOSSARY.md), [references/DOS-AND-DONTS.md](references/DOS-AND-DONTS.md),
[references/REGISTRY.md](references/REGISTRY.md), and [references/NAMING.md](references/NAMING.md) before writing.

Templates live in `templates/` next to this file.

---

## Template index

| Template | Use when | Owning skill |
| -------- | -------- | ------------ |
| [SCOPE.template.md](templates/SCOPE.template.md) | Discovery scope — confirmed/assumed/open, before shaping | `discover-scope` |
| [DOCUMENTATION.template.md](templates/DOCUMENTATION.template.md) | Explaining how a shipped feature/flow/subsystem works | any skill writing docs |

**Not templated here — owned elsewhere, see [references/REGISTRY.md](references/REGISTRY.md):** the shaped
project doc (`shape-stress`, six sections), CONTEXT.md (`define-terms`, glossary only), ADRs
(`define-terms`, `docs/adr/NNNN-slug.md`), prototype NOTES.md (`prototype`), and Paperclip issues
(native objects via `paperclip-task-setup` — never a markdown file).

---

## Workflow

### 1. Pick the format

Use [references/REGISTRY.md](references/REGISTRY.md) — one template per artifact, and confirm no sibling
skill already owns this artifact's structure before reaching for a template here. Do not mix a
DOCUMENTATION doc's sections into SCOPE or invent a new artifact class when an existing one already fits.

### 2. Copy the template

Read the full template file. Preserve **all headings** — populate them; use `N/A` or `-` for empty
optional blocks.

### 3. Write

- Follow the content rules of the **calling skill** (e.g. `discover-scope`'s gather/research/validate
  cycle for SCOPE content).
- This skill owns **structure and naming**; calling skills own **process** and the quality bar
  (`flux-quality`).
- No file paths in doc bodies except in a dedicated pointers section (see `REGISTRY.md`).

### 4. Save at the canonical path

See [references/NAMING.md](references/NAMING.md) for the exact `docs/` path per artifact. Fixed-slot
artifacts (SCOPE, CONTEXT) get an UPPERCASE filename; many-per-project artifacts (DOCUMENTATION, ADR) get
a dated or kebab-case filename.

---

## Related

| Skill | When |
| ----- | ---- |
| `discover-scope` | SCOPE content rules — this skill only supplies the template shape |
| `shape-stress` | Owns the shaped project doc's six sections — don't template that here |
| `define-terms` | Owns CONTEXT.md and `docs/adr/` — don't template those here |
| `prototype` | Owns the prototype NOTES.md verdict capture |
| `paperclip-task-setup` | Issues are native Paperclip objects, never a markdown template |
