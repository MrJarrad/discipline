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
| `design-handoff-*.md` | The layer brief: node tree, sizing chains as bound-variable names, instance props, annotations, Build standards, Content Outline, changelog. |
| `*-design-system-handoff.json` | The companion: every variable with its `codeSyntax` per platform, description, mode builds, `responsiveBehavior`. |
| `handoff.config.mjs` | The consumer's policy — which schema versions are read, viewport groups and units, aliases, Tailwind namespaces, paths. |
| Generated tokens + theme | The CSS the JSON produced. The only place a value is stated in code. |
| Generated report | The audit trail. Its responsive/aliases section (§10) is where every warning is named. |

The fifth, optional input is the **ruling list** for the task: decisions **on top of** the
pair, carrying only what the file cannot — blend modes, behaviour, links, copy overrides.
Anything else in that list is a paraphrase of the pair, and the pair wins.

## Steps

### 1. Prove the pair and the vendored export are the same system

Read the identity fields before anything else:

- the markdown's **`design-handoff` schema version** and its companion block — companion
  schema, content hash, `state`;
- the JSON's **`schemaVersion`**, `contentHash`, and `fingerprint.designSystemStateHash`.

The markdown's `state` and the JSON's `designSystemStateHash` must be the same string, and
the JSON's `contentHash` must equal the markdown's companion `content` hash. They are not a
claim of simultaneous export — they are the claim that both files describe one design-system
state. A mismatch is a **stale-pair defect**: stop and ask for a re-export. Do not build the
newer half against the older half.

Then check the JSON's `schemaVersion` against the generator config's declared versions. An
unlisted version is rejected by the generator on purpose — a superseded schema still parses,
so silence would be the dangerous outcome. Vendoring the export in the consuming repo is what
makes the run reproducible from the repo alone.

One command checks all of it, plus the shape of both files:

```
handoff-css validate <export>.json <design-handoff>.md
```

An **error** stops you — a malformed export, or a `COMPANION_STATE_MISMATCH`. A **warning**
is a decision waiting on a human: read it, carry it into your deviation table, and build.

**Done when** all three hashes reconcile and the schema version is one the config declares.

### 2. Regenerate, then read every warning

Run the generator in check mode — `handoff-css --config handoff.config.mjs --check`, which
writes nothing and exits 1 if any committed artifact would change. A red check before you
have touched anything means the committed tokens are stale: regenerate
(`handoff-css --config handoff.config.mjs`) and commit that as its own change first. The CLI
summary prints one line per warning **code**; the occurrences are in the report.

Then read the report's `Responsive classes (P11) and aliases (P12)` section, which names every
warning with its token and detail, alongside the untrusted-build-cell and alias tables.
Warnings are the generator refusing to guess, and each one is a decision waiting on a human:

| Code | What it means | Your move |
| --- | --- | --- |
| `VIEWPORT_UNFLAGGED` | A variable inside a declared viewport group states no fraction, so it kept its px samples. | Build the px samples and file the missing description as a defect against the design file. Never hand-convert it to `dvh`/`vw`. |
| `VIEWPORT_OUTSIDE_GROUPS` | A fraction was stated for a variable outside every declared group, so it was ignored. | Correct: type and tracking are not fractions of the screen. Build the per-mode value. |
| `VIEWPORT_CLASS_WITHOUT_FRACTION` | A responsive class with no fraction behind it — a hint, not a value. | Build the per-mode value. |
| `VIEWPORT_FRACTION_DISAGREES` | The description and the export's own rule state different fractions; the description won. | Report both numbers in the deviation table; the fix is one edit in the design file. |
| `BUILD_CELL_CONTRADICTORY` | A build cell contradicts itself, so its `css` was not emitted. | Build the token as generated. The count going to zero is a plugin fix, not a code fix. |

A warning you build *around* is drift. A warning you build *through* — emitting the token as
generated and naming the warning in your deviation table — is correct.

**Done when** every warning code in the report is either irrelevant to the nodes you are
building or carries a deviation row.

### 3. Map every binding to `codeSyntax.WEB` — an unmapped binding is a defect

Walk the markdown's node tree and collect every `$variable` on every node you are building —
sizes, gaps, padding, fills, stroke widths, text styles. For each one, find the variable in
the companion JSON and take **`codeSyntax.WEB.value`**. That string is the custom-property
name; write it as `var(<that name>)`.

Three rules make this the whole of the mapping:

- **`codeSyntax.WEB` is the name.** Not the variable's own path, not a name you derive from
  it, not a name that happens to exist in the stylesheet. `device/screen-height/full` is
  `--device-screen-height-full` because the export says so.
- **An alias is not the name.** A generated alias block may publish a second, shorter name
  that hops onto the token. Bind the name the handoff states; the alias exists for legacy
  call sites, and using it hides which token you actually consumed.
- **No emitted token is a defect, not a guess.** If a binding maps to no custom property in
  the generated CSS — excluded by policy, hidden and unreachable, or simply absent — stop.
  Say which binding, which node, and which of those it is. Do not inline the value the
  export happens to show, and do not invent a token name for it.

**Done when** every `$variable` on every built node has a `codeSyntax.WEB` name, or a
deviation row saying why it has none.

### 4. Implement against tokens only, with the Build standards as the mechanism rules

The markdown's **Build standards** are not style advice — they are the mechanism each value
must be produced by. A right number produced by the wrong mechanism is a defect.

| Standard | The mechanism it names |
| --- | --- |
| 1 — repeated property combinations become a class | One named class applied by name, named for its role, never re-declared per surface and never inlined. |
| 2 — semantic structure | Elements describing what the content *is*: `<nav>`, `<ul>`, landmarks; heading levels follow the document outline, not visual size. |
| 3 — token-first values | Every `$token` resolves to a custom property. A literal that happens to match the export's px sample is a defect, not a shortcut. |
| 4 — component boundaries match the design | A `◆instance of` is a component in code with the same name, props and boundary — never flattened inline, never split across two components. |
| 5 — grid frames are CSS Grid containers | A `[Grid]` frame is `display: grid`; children are placed by `grid-column: span N`. `col-span(N/M)` maps directly. Widths computed from column maths are a defect even when they measure right. |

Pixel dimensions in the markdown are reference only. The responsive grid table, the sizing
tokens, `fill`/`hug`, and the variant axes are the implementation; the numbers are how the
design happened to sample them.

**Done when** every node in scope is built, and each of the five standards has been applied
or has a deviation row.

### 5. Copy is a lane, not a detail

The markdown's **Content Outline** is the copy inventory, per component and per device
variant, and the node lines carry each string verbatim. Build the strings as written.

- **`⚠ placeholder` is a defect, not a guess.** A text node flagged placeholder means the
  design has not stated the copy. Name the node and ask. Shipping "Title" and shipping your
  own invented headline are both wrong; the second is worse because it looks finished.
- **The newest pair wins over any prior record.** A code comment, an older audit, a previous
  brief, or a screenshot in a chat is not evidence about current copy. The pair's changelog
  section states what moved since the last export — read it, then build the current strings.
- **A copy section with zero findings still exists and says so.** Silence is not a report.

### 6. Check the built CSS back against the pair

Before the deviation table, run the check in the other direction:

```
handoff-css conform --export <export>.json --handoff <design-handoff>.md \
                    --tokens <generated tokens>.css --css <your stylesheets…>
```

It reads what you built and says which of it the pair does not state: a `var()` name the
export never publishes (`UNKNOWN_NAME`), a device sample pasted as a literal
(`SAMPLE_PX_LITERAL`), column maths where the brief says `col-span N/M` (`GRID_ARITHMETIC`),
a `⚠ placeholder` string shipped as copy (`PLACEHOLDER_COPY`). Red fails; amber is a row in
your table with a reason. It reads CSS only — a binding that lives in markup is still yours
to check by hand.

**Done when** the run is red-free, or every red has a deviation row and a ruling.

### 7. Return a deviation table, and stop for a ruling on drift

One row per node whose built value did not come straight from the pair, plus one row per lock
row:

| element | Figma binding | token used | value | status | ruling ref |
| --- | --- | --- | --- | --- | --- |

`status` is one of:

- **match** — built exactly as the pair states.
- **drift** — the pair and the code disagree and the code won. **Stop here.** Drift is not
  yours to resolve: name it, propose one fix, and wait for a ruling.
- **unflagged-viewport** — a `VIEWPORT_UNFLAGGED` (or sibling) warning; per-mode value built
  as generated, and the missing signal filed against the design file.
- **hand-authored-override** — the consuming stylesheet declares the property itself and the
  generator reported rather than overwrote it.

`ruling ref` cites the lock row or ruling that authorised a non-match. An empty `ruling ref`
on a non-match row is an unauthorised deviation.

An empty table means you built the pair exactly. That is the expected outcome, not a
suspicious one.

## Export shape — what the companion and a live capture carry

An export carries more than a flat token list, and the implementation reads all of it:

- **Stable ids for rename detection.** Variables and styles carry an OPTIONAL `id` (the
  design tool's persistent id); components carry `key`, which already served this purpose.
  When an id is present on both sides of a sync, correlate by id first — a renamed entry
  reads as a rename, never as a spurious removed+added pair. Treat ids as
  available-but-optional: older exports without them fall back to name-only diffing, and
  that fallback is not itself a defect.
- **Components, standalone and sets, with full prop schemas.** Standalone components and
  component sets each carry their typed prop schema (VARIANT props with their option list,
  BOOLEAN/TEXT/INSTANCE_SWAP props with defaults and, for INSTANCE_SWAP, preferred component
  keys) — read this as the props API, not a flat list.
- **Per-variant layer bindings — the component-internals chain.** Each variant in a component
  set may carry `bindings`: an array of `{ layer, property, value }` recording which layer
  *inside* the component binds which property to which variable (alias) or holds it raw.
  Read a variant's bindings before assuming its internals are uniform across the matrix.
- **Per-variable responsive behaviour.** A dimensional variable's `responsiveBehavior.rules`
  are published **per layout variant** — the same variable can be `mode-stepped` at the
  default variant and `fluid-clamp` at another, and each is honoured on its own. The
  variable's own `description` may state a viewport fraction in the exact form
  `N% of screen height` / `N% of screen width`; that convention is a supported input, because
  design-tool variables carry no viewport semantics and a description is the only place a
  designer can state the fraction today.

## Worked example — a navigation footer

From a real pair (`design-handoff` v6 + `design-system-handoff` schema 8).

The companion states the token:

```
$device/screen-height/full · WEB `--device-screen-height-full` · 📝 100% of screen height
  Responsive behavior: default=100dvh
```

The markdown states the component set and its grid:

```
NavigationFooter (COMPONENT_SET) #4719:258951
  Responsive via: `device` property (md+ → sm)
  Responsive grid: 12-col
  | size (w×h) | $device/width×$device/screen-height/full |
  | section    | col-span 3/12 (md+) · col-span 6/12 (sm) |
  | colGap     | $grid/gap-sm |

  device=md+ (COMPONENT) #4719:258479 $device/width×$device/screen-height/full [V]
    menu (FRAME) #4709:256923 fill×hug [Grid, colGap:$grid/gap-sm] overlay(columns:12)
      section (FRAME) #4709:256924 fill×hug col-span(3/12)
```

Reading it in order:

1. The footer's own size is two bindings, so it is two custom properties —
   `width: var(--device-width); height: var(--device-screen-height-full)`. The token itself
   resolves to `100dvh` because the variable's description states the fraction and its group
   is declared viewport-relative in the config. **Nothing in code restates `100dvh`** — the
   token is the single place the value is stated.
2. `menu` is a `[Grid]` frame with a 12-column overlay, so it is `display: grid` with
   `grid-template-columns: repeat(12, minmax(0, 1fr))` and `column-gap: var(--grid-gap-sm)`.
3. `section` is `col-span(3/12)`, so it is `grid-column: span 3`. At `sm` the same child is
   `col-span(6/12)` → `grid-column: span 6`, and the table's note that `sm` wraps to two rows
   is the grid doing that on its own, not a second layout.
4. `fill×hug` is a sizing chain, not a missing value: `fill` is the grid placement above,
   `hug` is content height. Neither gets a literal.
5. The `device` property is the variant axis, so `md+` and `sm` are one component with one
   prop — not two components.

## DO / DON'T — this week's failures

**Column maths instead of the grid**

- **DO:** `.footer-section { grid-column: span 3; }` inside a `display: grid` container with
  twelve columns and `column-gap: var(--grid-gap-sm)`.
- **DON'T:** `width: calc((100% - 11 * var(--grid-gap-sm)) / 12 * 3 + 2 * var(--grid-gap-sm))`.
  It can measure identically at one width and still be a defect: the mechanism the handoff
  named is a grid container, and "on the grid" without the container is a steer to arithmetic.

**Binding the alias instead of the handoff's name**

- **DO:** `height: var(--device-screen-height-full)` — the `codeSyntax.WEB` name the companion
  states for `$device/screen-height/full`.
- **DON'T:** `height: var(--screen-height-full)` because that name already existed in the
  stylesheet. A legacy alias hop is not the export's name; binding it hides which token was
  consumed and survives the next regeneration only by luck.

**Trusting a code comment over the current pair**

- **DO:** Build the copy string on the node line of the pair you were pointed at, and read the
  changelog section for what moved since the last export.
- **DON'T:** Keep the existing string because a comment above it cites an audit from a previous
  week. The audit is a record of an older export; the pair in the brief is the contract.

## At JHD

The house consumer is `jhd-design-system`, which vendors the export, keeps its policy in
`handoff.config.mjs`, and exposes `tokens` / `tokens:check` scripts; downstream products get
the generated CSS through the published package and never re-derive a token. House rulings on
top of a pair arrive as the brief's lock table, and a drift row waits for the operator rather
than being resolved in the branch. Everything above this section is house-independent.
