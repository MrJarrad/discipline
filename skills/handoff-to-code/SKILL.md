---
name: handoff-to-code
description: >-
  Build code from a Design Handoff export pair. Load it first on a
  design-handoff-*.md or *-design-system-handoff.json path, a Figma link to export,
  consume or build from the handoff, the export says, regenerate tokens, or a
  brownfield brief. Live Figma reads: capture-figma;
  build audits: audit-build.
---

# Handoff to Code

**The handoff pair is the contract: every node, token, copy string and annotation in it is
built — never Figma pixels, never inferred values.** A value the pair does not state is not
yours to supply. The pair is read, not re-described; the brief points at it. The Figma MCP does not replace the pair: it cannot return
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

`design-handoff-script` makes the brief from a Figma link; a **live read** of the layer through Figma
MCP, made first, adds what REST cannot read. It joins one Design System Handoff export per source
file. That **set** is the contract: the pair means the brief plus every export it names
(`references/export-set.md`; inputs: `references/steps.md` § Inputs).

## Brownfield — existing code, no Design System Handoff export

The brief is the set. `handoff-css match --handoff <design-handoff>.md --src <code paths…> --rulings <ruling table>.md`
proposes the closest existing code match for every variable and component.
**A proposal is a question, never a binding.** Each item is ruled `use`, `new` or `skip` in the
ruling table; a `use` whose code has gone is `RULING_STALE`. **Done when** `match` exits 0: every
item ruled, none stale. Rules: `references/brownfield.md`.

**Raw values** (values bound to no variable): `match --export` pairs each with the project's own
token; one the token reproduces is built with it. Otherwise **Build the exact value and
write a deviation row (`assumed-ask`, `ruling ref` the raw row's `figma`) — never stop, never round
it to a neighbour.** Listed raw values never fail `match` (exit 0). Tolerances:
`references/steps.md` § Raw values in brownfield.

## Steps

### 1. Prove the pair and the vendored export are the same system

The markdown's `state`, the JSON's `designSystemStateHash` and the companion's `content` hash must
agree: one design-system state. A mismatch is a **stale-pair defect**: bring the set up to date yourself — run the command `validate` names, then validate again. Never build the newer half alone.
`handoff-css validate` checks the set; a warning is a deviation row, and you build. **The one thing to ask a person for is a Design System Handoff plugin run, named by file.**
**A link-run finding is a reported item, never a reason to inline a value.**

**Spec text comes from the live read when it carries it, else from the spec index.** `SPEC_NOT_INDEXED`
is a finding: name the spec and ask (`references/steps.md` § 1).

**Done when** all three hashes reconcile for every set member and every listed spec is read.

### 2. Regenerate, then read every warning

`handoff-css --config handoff.config.mjs --check` exits 1 on drift: regenerate and commit first.

| Code | Your move |
| --- | --- |
| `VIEWPORT_UNFLAGGED` | Build the px samples; file the missing description; never hand-convert to `dvh`/`vw`. |
| `VIEWPORT_OUTSIDE_GROUPS`, `VIEWPORT_CLASS_WITHOUT_FRACTION` | Build the per-mode value. |
| `VIEWPORT_FRACTION_DISAGREES` | Report both numbers; the fix is a design-file edit. |
| `BUILD_CELL_CONTRADICTORY` | Build as generated: a plugin fix. |
| `UNCONVERTED` | Build the raw value as generated, as a deviation; never hand-divide. |

A warning you build *around* is drift. A warning you build *through* — emitting the token as
generated, naming it in your deviation table — is correct. `MERGE_*`: `references/steps.md` § 2. **Done when** every warning code is irrelevant to your nodes or carries
a deviation row.

### 2b. Write down how the system is built, before you touch it

Run `handoff-css profile --export <design-system-handoff>.json --out <dir>` and read the
`system-profile.md` it writes before judging anything missing: `references/steps.md` § 2b.

### 3. Map every binding to `codeSyntax.WEB` — an unmapped binding is a defect

Walk every `$variable` per node, find it in the set member that owns it, take
**`codeSyntax.WEB.value`**, write `var(<name>)`.

- **`codeSyntax.WEB` is the name.** In brownfield the name is the one the ruling table records: a `use` ruling's code name, or the brief's own CSS name for `new`.
- **An alias is not the name.** Bind the handoff's name.
- **No emitted token is a defect, not a guess.** Say which binding and node. Do not inline the value the export happens to show, and do not invent a token name for it. A name comes to exist only through 3b.

**Done when** every `$variable` has a `codeSyntax.WEB` name, or a deviation row saying why not.

### 3b. A need with no name — reuse, then add

**Reuse first; add only when nothing fits.** `handoff-css resolve` ranks what exists; a whole new
ramp comes only from `handoff-css ramp --export`, after one question and a yes. Full step:
`references/steps.md` § 3b.

### 3c. A component or block that may already exist — reuse, then add

`handoff-css components` ranks the system's components before you add one; a new one is one
question to the designer: `references/steps.md` § 3c.

### 4. Implement against tokens only, with the Build standards as the mechanism rules

The **Build standards** are the mechanism, not style advice. A right number produced by the
wrong mechanism is a defect. Tokens only: a matching literal is still a defect.
`[Grid]` frames are CSS Grid containers. `col-span(N/M)` maps directly. Widths computed from column maths are a defect even when they measure right.

**Every property the Figma panel shows is a ledger row, nested exposed ones included.** One
table row is one return row; a table row with no return row is red. An `(open)` row is a chat
question, never a reason to stop.

**A placed instance's settings are ledger rows, and what it changes is layout config the build carries.**
A setting not listed in the brief uses the component's own, so build the component's default for it and nothing more.
Each listed row is built as the value here; a changed row with no ledger row is red.

All twelve standards: `references/steps.md` § 4. Keyframes: `references/motion.md`.

**Done when** every node in scope is built and each standard applied or deviation-noted.

### 5. Copy is a lane, not a detail

The **Content Outline** is the copy inventory; node lines carry each string verbatim.

**`⚠ placeholder` is a defect, not a guess.** **The newest pair wins over any prior record.** A copy
section with zero findings still exists and says so.

### 5b. The brief's asks — each line says what to build

A brief ends with `## Asks`, answered in chat. **answered** and **waiting on Figma**: build the
answer; **assumed**: build the suggestion. **An open ask is a reported item, never a guess.** Every
waiting, assumed or open ask is a deviation row. Writing a note into the file on the person's yes:
`references/write-back.md`. Ledger: `references/steps.md` § 5b.

### 6. Check the built CSS back against the pair

Run `handoff-css conform` against every rendering of the export's nodes, not the component file
alone.
In brownfield, pass the brief's JSON as `--export`, the project's token stylesheet as `--tokens`, and each ruled `use` name declared outside it as `--allow-name`;
each `UNMAPPED_BINDING` is a ruled item. Codes: `references/steps.md` § 6.
**Done when** the run is red-free, or every red has a deviation row and a ruling.

### 7. Return a deviation table, and stop for a ruling on drift

One row per node whose value did not come straight from the pair, plus one per lock:

| element | Figma binding | token used | value | status | ruling ref |
| --- | --- | --- | --- | --- | --- |

`status`: **match** · **resolved-to-export** (the export wins without asking. Ask only when the export binds no token where one is expected, or building
  the export's value breaks something — never over plain value drift.) · **unflagged-viewport** ·
**hand-authored-override** · **assumed-ask** · **not-built**. Definitions: `references/steps.md` § 7.
Every unbuilt item is a row.

`ruling ref` cites the lock row or ruling that authorised a non-match. An empty `ruling ref` on a non-match row is an unauthorised deviation.

Schema v9 hints and style classes: `references/steps.md`.

## At JHD

The house consumer is `jhd-design-system`, which vendors the export, keeps its policy in
`handoff.config.mjs`, and exposes `tokens` / `tokens:check` scripts; downstream products get
the generated CSS through the published package and never re-derive a token. House rulings on
top of a pair arrive as the brief's lock table, and a drift row waits for the operator rather
than being resolved in the branch. Everything above this section is house-independent.
