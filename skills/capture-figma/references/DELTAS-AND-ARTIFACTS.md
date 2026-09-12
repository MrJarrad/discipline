# capture-figma — change taxonomy, artifacts and recapture mechanics

The listener's change vocabulary, the update classification, operating constraints, the translate-never-transcribe rule, the two output artifacts and their frontmatter, the alpha-composite ruling, and the recapture procedure with its caveats. Nothing here was rewritten — it is the 1.78.0 SKILL.md body, moved.

## Change taxonomy — the listener's reading vocabulary for "what changed"

The listener (`scripts/capture-listener.mjs`) computes a richer change record than any
exporter's own changelog — its own changelog is add/remove-only; `changes.jsonl` adds
per-mode and per-binding modification detail. Read a delta report using this vocabulary,
not ad-hoc prose:

- **Per-mode value changes** — a variable's value changed old→new within one mode,
  keyed by variable path + mode. This is the base case: neither an alias nor a rename.
- **Renames** — `variablesRenamed` / `stylesRenamed` / `componentsRenamed`: an entry's
  stable id matched across syncs while its name changed (`{ bucket, id, oldName,
  newName }`). Never confuse with a removed+added pair — that's the point of the id.
- **`alias_repointed`** — a per-mode value change where BOTH the old and new value are
  alias strings pointing at different targets (`{ path, mode, aliasFrom, aliasTo, type }`
  in `changed.aliasRepoints`) — a structural rewire, not a value edit.
- **`binding_broken`** — alias → raw: a variable that used to point at another variable
  now holds a literal value. Same `aliasRepoints` array, same shape, `type` distinguishes
  it from a repoint.
- **`binding_added`** — raw → alias: the reverse of broken — a literal became an alias.
- **`layer_binding_*`** (`layer_binding_repointed` / `layer_binding_broken` /
  `layer_binding_added` / `layer_binding_removed`) — the same four-way classification,
  one layer down: applied to a component set VARIANT's internal `bindings` (matched
  variants diffed by `layer`+`property`) rather than a top-level variable. Kept in its
  own `changed.layerBindings` array and its own `summary.layerBindings` count — a
  different chain (component internals) from top-level variable/style aliasing, never
  merged into `repointed`.
- **`copy_*`** (`copy_changed` / `copy_added` / `copy_removed`) — the same id-first,
  path-fallback correlation applied to the top-level `copy` array (Copy lane, above):
  `copy_changed` is a matched entry whose `text` differs old→new, `copy_added`/
  `copy_removed` are path-only-on-one-side. Kept in its own `changed.copy` array and its
  own `summary.copy` count — text is diffed the same structural way as every other
  bucket, never left to eyeballing.

Use this vocabulary when writing a delta report or a capture document's changelog
section — "what changed" is answered in these terms, not "some values moved."

## Updates — classify the delta by layer

A design system changes continuously; re-extraction's first job is classifying WHAT moved, because each kind implies a different code change:

1. **Primitive value changed** (dimension-800: 24→28) → one token edit in code; flows everywhere automatically. Largest blast radius, smallest diff.
2. **Semantic re-mapped** (font-size-default re-points size/600→size/700; subtitle-default 16→20) → one alias edit; consumers of the alias move, consumers of the raw primitive don't.
3. **Binding changed** (a component now uses subtitle/300 instead of /200, or size-100 buttons instead of size-200) → a component edit; nothing else moves. WARNING from a real misread: different components binding different values of one alias can look like drift or migration when it is actually a variant/mode axis — check the variant/mode dimension before diagnosing (the button-height 28-vs-40 case).
4. **Anatomy/variant changed** (sub-component added/removed, variant axis grown, elements deleted — the Pagination label removal) → component refactor.
5. **Canvas-only override** (an instance detached from the system) → drift: fix the file, not the code.

Procedure: diff the current read against the banked observation log (that's what the log is FOR — never re-extract into a vacuum); name the layer per delta; record supersessions in the log (ADDENDUM style) so the next reader inherits the lineage.

## Operating constraints

- **Active-tab constraint**: the Figma MCP reads the active desktop tab. Switch tabs
  yourself via computer-use (screenshot the Figma window, click the target tab, confirm,
  then extract) — it is self-serve; never ask the operator to switch.
- **Node ids**: log every node id you visit next to what you observed. Re-walks are cheap
  when ids are banked; expensive when they're not.
- **Cropped previews**: if a symbol preview is cropped (tall desktop variants), say so and
  mark the value unresolved — propose a value and flag it for tune, don't present it as read.
- **Annotation pins are invisible to extraction** — verified 2026-07-20: Figma annotations appear in none of the MCP surfaces (metadata, screenshots, design context). Machine-readable intent lives in names, props (including booleans like has-description), variant axes, and variable bindings — those all travel. Prose-only rules go in the vault observation log via the operator; never assume a pin was seen.

## Translate, never transcribe

Figma px values are inputs to the *system*, not literals for the code. The build speaks
tokens: map a measured 64px title to the nearest ramp step (text-800), a 76px nav to the
system's height token, a 105% line-height to the coded title leading. When a measured
value falls between steps, that's a finding to surface — either the ramp grows or the
design snaps — never a hardcoded exception. Same for behavior: a 1280-wide frame showing a
full-bleed image translates to the block's `flush` prop, not `width: 1280px`.

## Output of an extraction — two artifacts, separately schemad

A capture is not one document. It's two, cross-referencing, each with its own frontmatter
and vault path — this is the codified convention, not a one-off from any particular
capture. Filed thing-then-aspect, under the owning project's `artifacts/` (e.g.
`projects/capture-figma/artifacts/` for this plugin's own captures, or
`projects/<consuming-project>/artifacts/` when the capture is for another project's UI):

1. **Architecture map** (`projects/<name>/artifacts/<file-name>-architecture-map.md`) —
   Step 1's anatomy, the skeleton. Frontmatter: `file` (human-name-first, key in
   parens), `captured` (date), `sources` (what was pulled and when — pinned REST
   snapshot id / MCP session, plus any operator screenshots), `status` (e.g.
   "architecture baseline," in-flight caveats), `supersedes` (the previous map this
   replaces, or "nothing" for a first capture). Body: pages in canvas order with role
   and frame counts, the PRODUCER/CONSUMER archetype, library manifest, per-page
   findings — everything from Steps 1, 3, and 4's structural layers.
2. **Variables ledger** (`projects/<name>/artifacts/<file-name>-variables-ledger.md`) — Step 2's values.
   Frontmatter: `file_key`, `file_name`, `capture_date`, `version` (the pinned version id,
   or an explicit "unpinned" note with why), `coverage` (a list of `page_id`/`page_name`
   pairs actually pulled), `method` (which tool and mode — e.g. "MCP get_variable_defs per
   page, single-mode" or "active exporter + capture listener, all modes"). Body: variables and
   styles grouped by collection/type, sorted alphabetically within each group (recapture
   discipline's determinism rule applies here too), with discrepancies and coverage gaps
   called out as their own sections.

Both documents live at ONE stable vault path per file/system forever (recapture discipline,
below, applies to each independently — a variables recapture doesn't require re-writing the
architecture map, and vice versa). Per-item content in either document: node id, measured
dims where relevant, the token mapping (measured → system token), variant matrix if a
component, verbatim copy, and an explicit **unobserved/unresolved list**. Claims without a
node id or variable behind them are marked as inference.

### One vocabulary source among several for define-terms

The architecture map's layer/component name list feeds `define-terms`' glossary — one
source among several (design files, code classes/tokens, file names) for the names of
actual things the glossary keys against, verbatim, not against whatever synonym gets used
in conversation. A recapture that renames or adds layers updates the glossary the same
pass; don't let the sources drift apart.

## Alpha composites — Figma's alias-with-opacity gap

Figma color variables cannot alias another variable AND apply an opacity (long-standing
platform limitation). So material/action tokens built as ink-at-opacity are stored as raw
hex8 — this is NOT canvas drift. On meeting a raw hex8: decompose it (RGB + alpha byte),
match the RGB part against the primitives, and report it as a derived token ("= content/
default/primary @ 5%"), citing the variable's description field where the recipe should
live. Quantization ruling (operator, 2026-07-22): the stated percentage governs; the hex
byte is rounding (0d = 5.098% ≈ 5%, 1a = 10.2% ≈ 10%). Never flag byte-vs-percent deltas
as mismatches, and never "correct" code percentages to byte values.

## Recapture and change tracking

A capture that can't be compared to the next one is half-done. Recapture discipline
turns a snapshot into a changelog — using only the MCP tools, on any Figma file.

1. **Pin every capture.** The MCP surface has no version-list endpoint, so pin with
   what it does give you: record in the capture document's frontmatter the capture
   datetime (`get_metadata`/`get_design_context` run time) and, when the operator has
   named a meaningful stop in Figma's version history, that operator-named version
   label. A capture without a recorded datetime cannot be compared later — it's a
   photo with no timestamp.

2. **Stable paths, updated in place.** A capture for a given file/system lives at ONE
   vault path forever; recaptures overwrite it. Git is the diff engine — the vault
   commit history IS the change log. Never write `capture-v2.md` side-by-side files;
   that forks the log instead of extending it.

3. **Scope before recapturing.** Ask the operator (or check the observation log) what
   changed since the last capture, and recapture only the affected layers (variables/
   styles/components/blocks) — not blindly everything. Named versions from the
   operator are the strongest signal; encourage the operator to name versions at
   meaningful stops so scoping has something reliable to key off.

4. **Diff on names, not node ids.** Node-id stability across restructures is unverified;
   the 1:1 naming contract (see above) makes names the reliable diff key. Normalize
   captures so ordering is deterministic — sort token lists, variant matrices
   alphabetically — otherwise reorder churn drowns the real deltas in noise. This
   deterministic ordering is authoring discipline: write the capture document sorted,
   every time, so `git diff` output stays clean.

5. **The delta report.** After a recapture, run `git diff` on the capture path — that
   IS the diff engine here — and write the human summary of what changed (added/
   removed/renamed tokens, changed values with old→new, new variants) into the
   capture's changelog section or the commit message — downstream build tasks are cut
   from that delta, not from re-reading the whole file.

**Caveats:**
- Dev Mode "Compare changes" and branch review are UI-only — human review aids, not
  pipeline inputs.
- Starter-plan files have 30-day version retention in Figma's own history — a
  comparison window there can silently expire; the vault's git history does not.

**Supplementary mechanics:** when the discipline plugin's `scripts/figma-capture.mjs`
and a `FIGMA_TOKEN` are available — the REST lane per "Lane choice" above — use it for
true REST version pinning: `versions` to list real version ids, `snapshot --version <id>`
to pin a capture to one, `delta` to structurally diff two normalized snapshots. When the
active exporter's live sync is running instead, `scripts/capture-poll.mjs` and the
capture listener's `GET /changes?n=` serve the equivalent recapture-delta role — poll
`/changes` rather than re-running a full snapshot. The MCP-only recapture discipline
above is the portability floor: it never depends on either script, so the steps are
complete and self-sufficient on any file with no token and no listener running — but when
a faster lane is available, prefer it here too.