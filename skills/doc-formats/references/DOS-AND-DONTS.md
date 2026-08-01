# Do's and Don'ts — doc-formats

Read [REGISTRY.md](REGISTRY.md), [GLOSSARY.md](GLOSSARY.md), and [NAMING.md](NAMING.md) first.

---

## Do

| Do | Why |
|----|-----|
| Read the **full template** before writing | No missing sections |
| Keep **all headings** | Stable diffs across sessions |
| Check the **registry** for who already owns an artifact before templating it | Avoids duplicate/drifting docs |
| Use **REGISTRY.md** to pick the right template | Right artifact, right shape |
| Defer **content rules** to the owning skill | Separation of structure vs process |
| Tag facts **[confirmed] / [assumed] / [open]** in SCOPE docs | Matches `discover-scope`'s own vocabulary |

---

## Don't

| Don't | Why |
|-------|-----|
| Invent new section names | Breaks cross-session diffing and AI memory |
| Template an artifact **`shape-stress`, `define-terms`, or `prototype` already owns** | Creates two sources of truth for the same content |
| Create a markdown template for a **task/issue** | Tasks live in dispatch briefs (`issue-triage`); a markdown stand-in drifts out of sync |
| Put file paths in the body **outside a dedicated pointers section** | Goes stale fast |
| Edit templates from **calling skills** | Single source of truth lives here |

---

## Branch-specific

### Writing a SCOPE doc

**Do:** Read `SCOPE.template.md`, follow `discover-scope`'s gather/research/validate content rules, save
to `docs/discovery/{slug}/SCOPE.md`.

### Writing a DOCUMENTATION doc

**Do:** Read `DOCUMENTATION.template.md`, keep it to how-it-works content, save to `docs/{topic-kebab}.md`.

### When asked to write a shape, an ADR, CONTEXT.md, prototype notes, or an issue

**Do:** Redirect to the owning skill (`shape-stress`, `define-terms`, `prototype`, `issue-triage`
respectively) — this skill only supplies structure for SCOPE and DOCUMENTATION.

**Don't:** Draft a competing template for an artifact that already has an owner.

### When asked to file an "issue markdown doc"

**Do:** Explain that tasks are dispatch briefs shaped via `issue-triage`, not a standalone
markdown file, and point there instead.

**Don't:** Create a `docs/issues/*.md` file as a workaround.

---

## Output format

When applying this skill, state:

1. **Artifact chosen** — which template, and why.
2. **Owner check** — confirmation this artifact isn't already owned by a sibling skill.
3. **Storage path** — the canonical `docs/...` path per `NAMING.md`.

---

## Examples

**Good:** Asked to document how the memory ingest flow works → `DOCUMENTATION.template.md` → save to
`docs/memory-ingest.md` → all template headings present.

**Bad:** Asked to document how the memory ingest flow works → writes a bullet list in chat with no
template, no Configuration/Edge cases sections, no storage path.
