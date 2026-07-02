# Glossary — doc-formats

Canonical **document shapes** for `paperclip-lab` — structure lives here; each artifact's owning skill
owns process and content.

## Contents

- [Artifacts](#artifacts)
- [Rules](#rules)

---

## Artifacts

### Format template

A markdown scaffold with fixed headings — agents fill content, never rename sections.

_Avoid:_ an ad-hoc DOCUMENTATION doc in chat with no template

### SCOPE document

Discovery-phase living document — confirmed vs assumed vs open, non-goals, contradictions. Template:
`SCOPE.template.md`. Content and process owned by `discover-scope`.

_Avoid:_ writing SCOPE content without tagging confirmed/assumed/open

### DOCUMENTATION document

Explains how a shipped feature, flow, or subsystem works, for onboarding and AI context. Template:
`DOCUMENTATION.template.md`.

_Avoid:_ duplicating the full SCOPE or shape doc inside a DOCUMENTATION doc

### Registered artifact

Any typed markdown doc that maps to exactly one template and one storage path (see `NAMING.md`). An
artifact is registered here **or** explicitly owned by a sibling skill (`REGISTRY.md`) — never both, and
never neither.

_Avoid:_ inventing a new artifact class when an existing one already fits

---

## Rules

### Heading stability

Templates define section order for diff-friendly updates across sessions.

_Avoid:_ renaming "Open questions" to "Things we don't know"

### One artifact, one owner

Every artifact class has exactly one owning skill for its content/process (see `REGISTRY.md`) — this
skill only supplies structure and naming for the artifacts it templates.

_Avoid:_ `doc-formats` re-templating an artifact `shape-stress`, `define-terms`, or `prototype` already owns

### Issues are not markdown

A Paperclip issue is a native object, not a file. Never create an `ISSUE.template.md` or a markdown
stand-in for issue state.

_Avoid:_ a `docs/issues/*.md` file drifting out of sync with the real issue

---

## Related skills

| Skill | When |
| ----- | ---- |
| `discover-scope` | SCOPE content |
| `shape-stress` | Shaped project doc content |
| `define-terms` | CONTEXT.md / ADR content |
| `prototype` | Prototype NOTES.md content |
| `paperclip-task-setup` | Issue creation (native, not markdown) |
