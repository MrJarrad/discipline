---
name: handoff-to-code
description: >-
  Build code from a Design Handoff export pair — the design-handoff markdown and its
  design-system-handoff JSON companion — treating the pair as the contract. Trigger on
  "consume the handoff", "build from the handoff", "handoff pair", "the export says",
  "regenerate tokens", a `*-design-system-handoff.json` or `design-handoff-*.md` path, a
  Figma link to export with the design-handoff script, a brief for a project that already
  has its own tokens and components and no Design System Handoff export (brownfield), or any
  implementation whose values come from a handoff export rather than from the canvas.
  Every node, token, copy string and annotation in the pair is built; deviations are
  returned as a table and drift stops for a ruling. Not for reading a Figma file itself —
  that's capture-figma, which owns pixels, screenshots, variant walks and live selection;
  not for measuring a built page back against the design — that's audit-build.
---

# Handoff to Code

**The handoff pair is the contract: every node, token, copy string and annotation in it is
built — never Figma pixels, never inferred values.** A value the pair does not state is not
yours to supply. The pair is read, not re-described; the brief that dispatched you points at
it rather than paraphrasing it. The Figma MCP does not replace the pair: it cannot return
per-mode code-named tokens, generated CSS, the changelog or the pair hashes
(`2026-10-17-keep-design-handoff`).

## When it fires

| Situation | Skill |
| --- | --- |
| An export pair exists and code is being written from it | **this skill** |
| No export — reading the design file live (selection, screenshots, variant matrix, copy inventory) | `capture-figma` |
| A page is already built and needs measuring back against the design | `audit-build` |

`capture-figma` still supplies what a pair cannot carry: renders, interaction/prototype
detail, spot-verified binding proofs via REST `--raw`, and the live-annotation spot check. Reach for it *inside* step 4
when the pair is silent — not instead of it.

## The export is a set

The Design Handoff export is made by **`design-handoff-script`** from a Figma link (the
plugin's in-Figma export is superseded); you may run it yourself when you hold a link and a
token. It joins one Design System Handoff export per source file — this file and each library
the layer uses, by key. That **set** is the contract: the pair below means the brief plus every
export it names. Command, joins, `linkRun` codes, spec index: `references/export-set.md`.

## Brownfield — existing code, no Design System Handoff export

When the project already has its own tokens and components and no Design System Handoff
export exists for its design file, the brief is the set: its token rows carry each variable's
CSS name and mode values, its component list each component. When one exists, give it —
`SET_MEMBER_MISSING` still stops you.

`handoff-css match --handoff <design-handoff>.md --src <code paths…> --rulings <ruling table>.md`
proposes, for every Figma variable and component, the closest existing code match with its
evidence (name, value, usage) and a confidence, and lists every item with no match.
**A proposal is a question, never a binding.** Each item is ruled in the project's ruling table
— `use` a code name, add the brief's name as `new`, or `skip` — and the next run reads that
table back; a `use` whose code has gone is `RULING_STALE` and is ruled again. Step 3 then binds
each variable to its ruled name. Output shape, confidence rules and the table:
`references/brownfield.md`.

**Done when** `match` exits 0: every item ruled, none stale.

## Inputs — four required, one optional

| Input | What it is |
| --- | --- |
| `design-handoff-*.md` + `.json` | Layer brief: node tree, sizing chains, props, Build standards, changelog, **Link-run findings** (`linkRun`). |
| `*-design-system-handoff.json` | Companion, one per source the brief lists: every variable's `codeSyntax`, mode builds, `responsiveBehavior`. |
| `handoff.config.mjs` | Consumer policy — schema versions, viewport units, aliases, paths. |
| Generated tokens + theme | The CSS the JSON produced — the only place a value is stated. |
| Generated style classes | `styles.generated.css` (schema 12+) — one class per Figma style. Bind the class; never re-author its declarations. |
| Generated report | Audit trail; §10 names every warning. |

The fifth, optional input is the **ruling list**: decisions on top of the pair — blend modes,
behaviour, links, copy overrides. The pair wins over anything else there.

## Steps

### 1. Prove the pair and the vendored export are the same system

Read identity first: markdown's schema version + companion block; JSON's `schemaVersion`,
`contentHash`, `fingerprint.designSystemStateHash`. The markdown's `state` and JSON's
`designSystemStateHash` must match, and JSON's `contentHash` must equal the companion's
`content` hash — one design-system state, not simultaneous export. A mismatch is a **stale-pair defect**: bring the set up to date yourself — run the command `validate` names, then validate again. Never build the newer half alone.

`handoff-css validate <design-handoff>.json <design-handoff>.md <every design-system-handoff>.json
--spec-index <index>.md` checks the whole set. An **error** means not yet one state: `STALE_PAIR`
names its fix — `design-handoff --regenerate …` when the brief is the older half, the run the
brief names when the export is; `SET_MEMBER_MISSING` names the export to add. A new export is
added with `handoff-css vendor <export>.json [<export>.md] --into design/handoff` — a new
`v<N>-<date>` folder, `latest` repointed to it — never copied into `latest/`, which writes
through the link into the version it points at. A **warning** is a
decision waiting on a human: carry it into your deviation table, and build.
`SCHEMA_NEWER_THAN_CHECKER` is one: the export is ahead of this checker — build, and note the
version. **The one thing to ask a person for is a Design System Handoff plugin run, named by file.**
`DS_EXPORT_OUT_OF_DATE` is that ask, ready to relay: variables cannot be read without the plugin. Each link-run finding is one of those warnings; its move is in
`references/export-set.md`. **A link-run finding is a reported item, never a reason to inline
a value.**

**Specs are read from the spec index, never from the design tool.** The export lists each spec
without its text; `validate --spec-index` prints the file that holds it — read it as part of the
pair. `SPEC_NOT_INDEXED` is a finding: name the spec and ask; never build from a guess of it.

**Done when** all three hashes reconcile for every set member, `schemaVersion` is one the
config declares, and every listed spec's file is read.

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
| `UNCONVERTED` / `build.status: unresolved` | Build the raw value as generated; file the missing divisor against the plugin as a deviation — never hand-divide. |

A warning you build *around* is drift. A warning you build *through* — emitting the token as
generated, naming it in your deviation table — is correct.

**Done when** every warning code is irrelevant to your nodes or carries a deviation row.

### 3. Map every binding to `codeSyntax.WEB` — an unmapped binding is a defect

Walk every `$variable` per node, find it in the set member that owns it (the brief's Sources
name which export covers each library's variables), take **`codeSyntax.WEB.value`**,
write `var(<name>)`.

- **`codeSyntax.WEB` is the name.** Not the variable's path, not a derived name, not one
  already in the stylesheet — unless a ruling chose it. In brownfield the name is the one the
  ruling table records: a `use` ruling's code name, or the brief's own CSS name for `new`.
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
6. Alignment is written from the container's `alignItems`/`justifyContent` and the child's
   `alignSelf`/`justifySelf` as stated, never inferred.
7. A Spacer instance never renders a DOM node — the export's `spacer(edge:start|end|both|mid)`
   marker says which: `start`/`end` builds as `margin-block-start`/`-end` (or inline) on the
   block it edges, `mid` (between siblings) builds as the container's `gap`, always token-bound,
   never a literal.
8. A component set's property `defaultValue` in an export is a display convention — Figma
   components are left "everything on" so the set shows all it can do — never the build
   default and never a deviation. Code defaults come from locked rulings and from the
   instances placed in the examples and pages; a ruling (e.g. no header overlay) sets the
   default, and the Figma-named prop stays exposed with that value set per route.
9. Annotations never restate or contradict a component property: a property is the only
   home for what it can express. Annotations carry motion, interaction and behaviour only;
   a note that lists a property's options or states its value is a defect, and code-only
   concepts (parallax, per-asset settings) are notes, never a requested Figma property.
10. A locked `aspectRatio` builds the ratio, never the fixed height — `schema-v9-hints.md` § Aspect lock.

**Done when** every node in scope is built and each standard applied or deviation-noted.

### 5. Copy is a lane, not a detail

The **Content Outline** is the copy inventory; node lines carry each string verbatim.

- **`⚠ placeholder` is a defect, not a guess.** Name the node and ask; an invented headline is
  worse because it looks finished.
- **The newest pair wins over any prior record.** A comment or old audit is not evidence about
  current copy — read the changelog, build current strings.
- **A copy section with zero findings still exists and says so.** Silence is not a report.

### 6. Check the built CSS back against the pair

Before running it, enumerate every rendering of the export's nodes — grep for the style
classes, slot names, and any file that duplicates a component's markup — and run `conform`
against all of them. A pass on the component file alone leaves sibling renderings unchecked.

`handoff-css conform --export <export>.json --handoff <design-handoff>.md --tokens <tokens>.css
--css <stylesheets…>` flags what the pair does not state: an unpublished `var()`
(`UNKNOWN_NAME`), a device sample as a literal (`SAMPLE_PX_LITERAL`), column maths in place of
`col-span N/M` (`GRID_ARITHMETIC`), or shipped `⚠ placeholder` copy (`PLACEHOLDER_COPY`). Red
fails; amber is a deviation row with a reason. CSS only — markup is checked by hand.

In brownfield, pass the brief's JSON as `--export`, the project's token stylesheet as
`--tokens`, and each ruled `use` name declared outside it as `--allow-name`; each
`UNMAPPED_BINDING` that follows is a ruled item, and its deviation row cites the ruling.

**Done when** the run is red-free, or every red has a deviation row and a ruling.

### 7. Return a deviation table, and stop for a ruling on drift

One row per node whose value did not come straight from the pair, plus one per lock:

| element | Figma binding | token used | value | status | ruling ref |
| --- | --- | --- | --- | --- | --- |

`status` is one of:

- **match** — built exactly as the pair states.
- **resolved-to-export** — the pair and prior code disagreed on a value; the export wins
  without asking. Ask only when the export binds no token where one is expected, or building
  the export's value breaks something — never over plain value drift.
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

## Style classes (export schema 12+, 2026-09-12)

From schema 12 the companion states its own CSS: every style carries a `cssClass`
(`selector` + `declarations[]` already bound to `var(--token, fallback)`), every TEXT
style a type ramp v2, and a weight STRING its `fontWeightNumeric`. The generator writes
them to `styles.generated.css` verbatim (handoff-css P21/P22).

**Bind the generated class.** `<h2 class="title-style1-200">` — do not re-author its
font-size, line-height, letter-spacing or weight anywhere, and do not keep a
hand-authored `@utility` of the same name: Tailwind compiles `@utility title-style1-200`
to the same `.title-style1-200`, so the two are one selector from two files and the
report's §11 lists every such shadow for deletion.

Two class-level findings in §11 are **export defects, not yours to patch**:
`STYLE_CLASS_LITERAL` (a value frozen outside a `var()` that the style itself binds) and
`STYLE_CLASS_UNSCOPED` (a selector that is the style's bare leaf name). Report them; a
rewritten selector or an invented `var()` in your branch is a deviation.

## At JHD

The house consumer is `jhd-design-system`, which vendors the export, keeps its policy in
`handoff.config.mjs`, and exposes `tokens` / `tokens:check` scripts; downstream products get
the generated CSS through the published package and never re-derive a token. House rulings on
top of a pair arrive as the brief's lock table, and a drift row waits for the operator rather
than being resolved in the branch. Everything above this section is house-independent.
