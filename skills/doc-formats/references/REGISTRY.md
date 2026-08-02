# Registry — doc-formats

Which template to use — and, just as important, which artifacts are **already owned** by a sibling skill
and must not be re-templated here.

---

## Templated here

### SCOPE

**Template:** `SCOPE.template.md`
**Purpose:** Discovery scope — confirmed vs assumed vs open; pre-shaping.
**Owning skill (content/process):** `discover-scope`
**Storage:** `docs/discovery/{slug}/SCOPE.md`

### DOCUMENTATION

**Template:** `DOCUMENTATION.template.md`
**Purpose:** Explain how a shipped feature, flow, or subsystem works — for onboarding and AI context.
**Owning skill (content/process):** whichever skill or agent ships the feature; no dedicated
skill owns this content today — this is the genuine gap `doc-formats` fills.
**Storage:** `docs/{topic-kebab}.md`
**Update when:** the feature ships or its behaviour changes materially.

---

## Owned elsewhere — do not template here

### The shaped project doc

**Owning skill:** `shape-stress` — exactly six sections (Context, Exploration & References, Outcomes,
Acceptance Criteria, Constraints & Known Risks, Out of Scope). **Storage:** `docs/shapes/{date}-{slug}.md`.
Read `shape-stress`'s own SKILL.md for the section contract — don't duplicate it here, and don't invent a
seventh section.

### CONTEXT.md and ADRs

**Owning skill:** `define-terms` — CONTEXT.md is glossary-only living memory at the repo root (or one per
bounded context, via a `CONTEXT-MAP.md`); ADRs are `docs/adr/NNNN-slug.md`, created lazily on the first
qualifying decision. Both have their own shape rules in `define-terms` — reference, don't restate.

### Prototype verdicts

**Owning skill:** `prototype` — a `NOTES.md` next to the throwaway code, capturing the question + answer.
**Storage:** `docs/prototypes/{slug}/NOTES.md`. Lighter than any template here; don't force the
DOCUMENTATION shape onto a prototype verdict.

### Issues

**Owning skill:** `issue-triage` — a task is a **dispatch brief** (title, goal, acceptance
criteria, persona, dependencies), shaped via `issue-triage`/`dispatch-brief`, never a standalone
markdown file in this repo. There is no `ISSUE.template.md` — templating an issue as markdown would just
be duplicate, driftable state next to the real one.

---

## Vault placement — when a repo doc gets banked

These templates live in the product repo's own `docs/`. If a copy or summary is worth
banking into `~/JHD/vault` (per the vault's own bank-on-receipt rule), place it
thing-then-aspect — which project first, which aspect second — never at the vault root
by document type:

| Repo artifact | Vault home when banked |
|---|---|
| SCOPE | `projects/<name>/decisions/` (it records what was confirmed/decided before shaping) |
| DOCUMENTATION | `projects/<name>/artifacts/` (a produced deliverable) |
| Shaped project doc (`shape-stress`) | `projects/<name>/artifacts/` |
| CONTEXT.md / ADR (`define-terms`) | Left in-repo; not routinely mirrored — the repo-docs mirror at `estate/repo-docs/{plugins|repos}/<name>/` is the vault-side pointer, not a copy |
| Prototype NOTES.md | `projects/<name>/audits/` if it verified a build claim, otherwise left in-repo |

See `vault-write`'s SKILL.md for the full thing-then-aspect decision test; this table
only maps `doc-formats`' own artifact types onto it.

## Cross-template rules

See [references/NAMING.md](NAMING.md) for filenames.

1. **One artifact = one template** — never merge SCOPE and DOCUMENTATION sections, and never re-template
   an artifact a sibling skill already owns.
2. **Headings are stable** — sessions and agents diff against the same section order.
3. **Assumptions tagged** — `[confirmed]` / `[assumed]` / `[open]` in prose or tables, matching
   `discover-scope`'s own tagging vocabulary.
4. **Links, not walls** — full URLs in an Exploration/References-style section; no dumped file trees.
