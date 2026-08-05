---
name: doc-formats
description: Registry + canonical templates for keyed markdown documents (SCOPE, DOCUMENTATION). Trigger before writing ANY typed markdown artifact — a scope or documentation file — or when another skill needs the correct document shape. If a sibling skill owns the doc's structure, this registry says so; check here first, then write. Not for vault filing/placement rules — that's vault-write; not for shaping a scope's actual content — that's discover-scope/shape-stress.
---

# Doc Formats

**Single source of truth for document shapes** in the repo — every skill that produces a typed
markdown artifact uses a template from here, not ad-hoc headings (see [references/REGISTRY.md](references/REGISTRY.md)).

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
(`define-terms`, `docs/adr/NNNN-slug.md`), and prototype NOTES.md (`prototype`).

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
  (`quality`).
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
