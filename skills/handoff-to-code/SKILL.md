---
name: handoff-to-code
description: >-
  Build code from a Design Handoff export pair — the design-handoff markdown and its
  design-system-handoff JSON companion — treating the pair as the contract. Trigger on
  "consume the handoff", "build from the handoff", "handoff pair", "the export says",
  "regenerate tokens", a `*-design-system-handoff.json` or `design-handoff-*.md` path, or
  any implementation whose values come from a handoff export rather than from the canvas.
  Every node, token, copy string and annotation in the pair is built; deviations are
  returned as a table and drift stops for a ruling. Not for reading a Figma file itself —
  that's capture-figma, which owns pixels, screenshots, variant walks and live selection;
  not for measuring a built page back against the design — that's audit-build.
---

# Handoff to Code

**The handoff pair is the contract: every node, token, copy string and annotation in it is
built — never Figma pixels, never inferred values.** A value the pair does not state is not
yours to supply. The pair is read, not re-described; the brief that dispatched you points at
it rather than paraphrasing it.

## When it fires

| Situation | Skill |
| --- | --- |
| An export pair exists and code is being written from it | **this skill** |
| No export — reading the design file live (selection, screenshots, variant matrix, copy inventory) | `capture-figma` |
| A page is already built and needs measuring back against the design | `audit-build` |

`capture-figma` still supplies what a pair cannot carry: renders, interaction/prototype
detail, and spot-verified binding proofs via REST `--raw`. Reach for it *inside* step 4
when the pair is silent — not instead of it.

## Inputs — four required, one optional

| Input | What it is |
| --- | --- |
| `design-handoff-*.md` | Layer brief: node tree, sizing chains, props, Build standards, changelog. |
| `*-design-system-handoff.json` | Companion: every variable's `codeSyntax`, mode builds, `responsiveBehavior`. |
| `handoff.config.mjs` | Consumer policy — schema versions, viewport units, aliases, paths. |
| Generated tokens + theme | The CSS the JSON produced — the only place a value is stated. |
| Generated report | Audit trail; §10 names every warning. |

The fifth, optional input is the **ruling list**: decisions on top of the pair — blend modes,
behaviour, links, copy overrides. The pair wins over anything else there.

## Steps

### 1. Prove the pair and the vendored export are the same system

Read identity first: markdown's schema version + companion block; JSON's `schemaVersion`,
`contentHash`, `fingerprint.designSystemStateHash`. The markdown's `state` and JSON's
`designSystemStateHash` must match, and JSON's `contentHash` must equal the companion's
`content` hash — one design-system state, not simultaneous export. A mismatch is a
**stale-pair defect**: stop and ask for a re-export. Never build the newer half alone.

`handoff-css validate <export>.json <design-handoff>.md` — an **error** stops you, a
**warning** is a decision waiting on a human: carry it into your deviation table, and build.

**Done when** all three hashes reconcile and `schemaVersion` is one the config declares.

### 2. Regenerate, then read every warning

`handoff-css --config handoff.config.mjs --check` exits 1 on drift — red means stale tokens,
regenerate and commit first. Read the responsive/aliases report, one warning per row:

| Code | Your move |
| --- | --- |
| `VIEWPORT_UNFLAGGED` | Build the px samples; file the missing description. Never hand-convert to `dvh`/`vw`. |
| `VIEWPORT_OUTSIDE_GROUPS` | Build the per-mode value — correct, fraction is outside any group. |
| `VIEWPORT_CLASS_WITHOUT_FRACTION` | Build the per-mode value. |
| `VIEWPORT_FRACTION_DISAGREES` | Report both numbers; description won, fix is a design-file edit. |
| `BUILD_CELL_CONTRADICTORY` | Build as generated — a plugin fix, not a code fix. |

A warning you build *around* is drift. A warning you build *through* — emitting the token as
generated, naming it in your deviation table — is correct.

**Done when** every warning code is irrelevant to your nodes or carries a deviation row.

### 3. Map every binding to `codeSyntax.WEB` — an unmapped binding is a defect

Walk every `$variable` per node, find it in the companion JSON, take **`codeSyntax.WEB.value`**,
write `var(<name>)`.

- **`codeSyntax.WEB` is the name.** Not the variable's path, not a derived name, not one
  already in the stylesheet.
- **An alias is not the name.** Bind the handoff's name — an alias hides which token you
  consumed.
- **No emitted token is a defect, not a guess.** If a binding maps to no custom property, stop
  and say which binding, which node, and why. Do not inline the value the export happens to
  show, and do not invent a token name for it.

**Done when** every `$variable` has a `codeSyntax.WEB` name, or a deviation row saying why not.

### 4. Implement against tokens only, with the Build standards as the mechanism rules

The **Build standards** are the mechanism, not style advice. A right number produced by the
wrong mechanism is a defect.

1. Repeated property combinations → one named class, never re-declared or inlined.
2. Semantic structure — content *is* what the element says; headings follow document outline.
3. Token-first values — every `$token` resolves to a custom property; a matching literal is
   still a defect.
4. Component boundaries match the design — a `◆instance of` is the same component/props/
   boundary in code; never flattened, never split.
5. `[Grid]` frames are CSS Grid containers — children placed by `grid-column: span N`.
   `col-span(N/M)` maps directly. Widths computed from column maths are a defect even when
   they measure right.

**Done when** every node in scope is built and each standard applied or deviation-noted.

### 5. Copy is a lane, not a detail

The **Content Outline** is the copy inventory; node lines carry each string verbatim.

- **`⚠ placeholder` is a defect, not a guess.** Name the node and ask; an invented headline is
  worse because it looks finished.
- **The newest pair wins over any prior record.** A comment or old audit is not evidence about
  current copy — read the changelog, build current strings.
- **A copy section with zero findings still exists and says so.** Silence is not a report.

### 6. Check the built CSS back against the pair

`handoff-css conform --export <export>.json --handoff <design-handoff>.md --tokens <tokens>.css
--css <stylesheets…>` flags what the pair does not state: an unpublished `var()`
(`UNKNOWN_NAME`), a device sample as a literal (`SAMPLE_PX_LITERAL`), column maths in place of
`col-span N/M` (`GRID_ARITHMETIC`), or shipped `⚠ placeholder` copy (`PLACEHOLDER_COPY`). Red
fails; amber is a deviation row with a reason. CSS only — markup is checked by hand.

**Done when** the run is red-free, or every red has a deviation row and a ruling.

### 7. Return a deviation table, and stop for a ruling on drift

One row per node whose value did not come straight from the pair, plus one per lock:

| element | Figma binding | token used | value | status | ruling ref |
| --- | --- | --- | --- | --- | --- |

`status` is one of:

- **match** — built exactly as the pair states.
- **drift** — the pair and the code disagree and the code won. **Stop here.** Drift is not
  yours to resolve: name it, propose one fix, and wait for a ruling.
- **unflagged-viewport** — a `VIEWPORT_UNFLAGGED` (or sibling); built as generated, the
  missing signal filed against the design file.
- **hand-authored-override** — the stylesheet declares the property, the generator reported
  rather than overwrote it.

`ruling ref` cites the lock row or ruling that authorised a non-match. An empty `ruling ref`
on a non-match row is an unauthorised deviation.

An empty table means you built the pair exactly — the expected outcome, not a suspicious one.

## Schema v9 node hints (export v11, 2026-09-12)

A schema-v9 brief adds hints beyond `col-span N/M` — grid `col()`/`row()`, `aspect`,
`semantic`, `interactive`, `states`, `a11y`, `position`, `@container`, `desc` — each one
mechanism rule. Full table and grammar: `references/schema-v9-hints.md`
(`schema/design-handoff.v9.grammar.md` is the grammar it reads). Worked read:
`references/worked-example.md`. Rename ids and prop schemas: `references/export-shape.md`.

## At JHD

The house consumer is `jhd-design-system`, which vendors the export, keeps its policy in
`handoff.config.mjs`, and exposes `tokens` / `tokens:check` scripts; downstream products get
the generated CSS through the published package and never re-derive a token. House rulings on
top of a pair arrive as the brief's lock table, and a drift row waits for the operator rather
than being resolved in the branch. Everything above this section is house-independent.
