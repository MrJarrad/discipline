# capture-figma — lanes, the tool ladder and REST mechanics

Which lane and which rung answers a question, the `figma-node.mjs` command surface, the known live limits, the Code Connect ruling, and the Cloud/Mac plugin sync. SKILL.md names the three lanes and the four rungs; this is how each one is actually driven. Nothing here was rewritten — it is the 1.78.0 SKILL.md body, moved.

## Cloud vs Mac (plugin sync)

- **Mac** runs the Figma Capture plugin + `capture-listener` → writes
  `~/JHD/figma-plugins/main/capture-figma/captures/live/`.
- After each sync (or when Cloud must see the tip), run
  `~/JHD/vault/main/estate/publish-captures.sh` (or flat `~/JHD/vault/estate/…`)
  which banks + pushes `estate/captures`.
- **Cloud** fleet install symlinks the captures ground → `vault/estate/captures` (`~/JHD/captures`
  no longer exists as a standalone path since the 2026-08-25 estate split). Pull vault
  before reading if a mid-session publish just landed. Taxonomy: vault `estate/capture-tools.md`.
- Live Figma without local JSON needs Environment secret **`FIGMA_TOKEN`** (REST lane).

## Lane choice — three lanes, one hierarchy

MCP, REST, and the live listener are correct at different layers — pick by what's
available and what you're reading, not by habit:

1. **Portability floor — MCP (this skill's steps below).** Works for any file, no
   dependencies beyond the Figma desktop MCP bridge (operator ruling). Every stage in
   Steps 1-4, "The order," and Recapture is written against MCP tool calls
   (`get_variable_defs`, `get_metadata`, `get_screenshot`) precisely so the skill is
   self-sufficient with nothing else installed or configured. Use this lane whenever
   `FIGMA_TOKEN` isn't available, or the target file needs a one-off, human-in-loop read.
2. **REST lane, when `FIGMA_TOKEN` exists — pinned tree/versions.** For tree/structure
   (pages, frames, components, variant matrices) and real version pinning,
   `~/JHD/figma-plugins/main/capture-figma/listener/figma-capture.mjs` (snapshot/delta)
   plus `figma-node.mjs` against the plain REST API (`depth`/`ids` omitted) is
   best-in-class: no active-tab constraint, no lazy-page gaps, real `?version=` pinning
   (research decision — the original research note did not survive the vault's
   2026-07-31 legacy purge; a fresh decision record, if this needs re-grounding, belongs
   at `projects/capture-figma/decisions/`). Use this lane for anything that needs to be
   pinned to a specific version id and diffed structurally later (`figma-capture.mjs
   versions` / `snapshot --version <id>` / `delta`). This listener family moved out of
   the discipline plugin to `~/JHD/figma-plugins/main/capture-figma/listener/` in the
   2026-08-25 estate split — the discipline plugin no longer carries its own copy.
3. **Active variables/styles/components lane — Capture Figma sync plugin.** For variables,
   styles, and component/layer-binding exports with full mode coverage, the ACTIVE exporter
   lives in **`~/JHD/figma-plugins/main/capture-figma`** at `figma-sync/` (import
   `~/JHD/figma-plugins/main/capture-figma/figma-sync/manifest.json` in Figma
   Development). Contract: `references/figma-agent-plugin-brief.md`. Each **Sync** POSTs
   the same payload to **both** the **capture-ingest** Worker
   (`~/JHD/figma-plugins/main/capture-figma/ingest-worker` → R2 + `jhd-vault`
   `estate/captures/live/`) when a Bearer is saved, and the local **capture listener**
   (`~/JHD/figma-plugins/main/capture-figma/listener/capture-listener.mjs`, `POST /capture`
   on `localhost:4411`) when it is up. Optional `CAPTURE_AUTO_PUBLISH=1` →
   `publish-captures.sh`. No Local/Remote toggle.

Ad-hoc/live-lookup: even when the REST or listener lane is the default for a file, MCP
remains the right tool for a quick live check against whatever's on screen right now —
confirming a single value, sanity-checking a pull, walking a file nobody has piped a
token for yet.

## The tool ladder — pick by what you're reading, not by habit

This replaces improvising a tool per task. Read down the ladder; stop at the first rung
that answers the question:

0. **A Design Handoff export (Layer Brief), when one exists for the target — primary anatomy
   source, and the contract itself.**
   An operator-provided or banked per-layer anatomy brief (format reference:
   `projects/capture-figma/artifacts/layer-brief-plugin/` in the vault — a Figma plugin
   that walks a frame and emits, per layer, its name/type, placed instance props, sizing
   chain, layout direction and gap/pad expressed as bound-variable NAMES inline, with
   unbound literals self-flagged, per-instance component deep links, and TEXT/effect
   nodes carrying their style names (`textStyle(name)`/`effectStyle(name)`) rather than
   left to be spotted or re-derived by eye) answers the anatomy/structure question
   directly — no tool-walking needed to reconstruct it. When one exists for the target
   frame or component, read-sequence Step 2 (the glance) and
   Step 4 (the descent) become **interpretation of the brief**, not a sequence of MCP/REST
   calls to assemble the same picture by hand. This rung sits above MCP for
   anatomy/structure specifically — it does not replace MCP/REST for what a brief doesn't
   carry: screenshots, interaction/prototype data, copy classification, and binding
   PROOFS (a ⚠-flagged literal in the brief is a pre-surfaced finding, ready to report as
   read; an unflagged binding may still be spot-verified via REST `boundVariables` when
   the claim is load-bearing enough to need [proven] rather than [inferred] — see the
   values-pass arbitration rule in Step 5). No banked or operator-supplied brief for the
   target → drop to rung 1.
1. **Figma MCP first — design context, text content, variables.** `get_design_context`
   for composition/intent, `get_variable_defs` for the token graph, `get_metadata` for
   structure and variant matrices. This is the portability floor (no token, no listener,
   works on any file the desktop app has open) and the only lane that reaches live text
   content and variables without an Enterprise plan.
2. **REST scripts second — tree walks and PNG export.** `scripts/figma-node.mjs` (`node`
   for a pruned subtree, `image` for a rendered PNG) against a known node id, no
   active-tab dependency. Use this for exhaustive tree walks (every frame under a page,
   every variant in a set) that would burn many MCP round-trips, and for every export
   render — **`get_screenshot` on Claude Code returns text descriptions of the image,
   not pixels**, so a PNG export always goes through the REST images endpoint or the
   desktop MCP bridge on Mac, never through `get_screenshot` on Claude Code.
3. **The sync bank JSON third — offline and mode-resolution work.** The active exporter's
   banked export (`~/JHD/figma-plugins/main/capture-figma/captures/live/*.json`, or the
   vault mirror at `estate/captures/live/`) carries full mode coverage and the `copy`
   array (below) already extracted — reach for it when working offline, resolving a
   value across every mode at once (no live session needed to walk each mode by hand),
   or diffing against a prior capture via `changes.jsonl`.

**Known live limits, name them rather than rediscovering them:**

- **MCP page listing can miss canvases.** `get_metadata`/`get_design_context` walking a
  file's page list has been observed to omit pages that exist on the canvas. When a page
  count looks short, fall back to the REST depth-walk (`figma-node.mjs node <fileKey>
  <rootId>` with children expanded) to confirm the true page set before concluding a page
  doesn't exist.
- **REST `variables/local` is Enterprise-gated.** `figma-node.mjs vars` hits `GET
  /v1/files/:key/variables/local`, which 403s on non-Enterprise plans (the script detects
  this and exits 2 rather than fabricating a result). The live path for variables on a
  non-Enterprise file is the MCP `get_variable_defs` lane, not REST.

**Code Connect is explicitly OUT** (operator ruling, 2026-08-25: Enterprise-only,
"quite expensive" — would replace the capture plugin if it were available, it isn't).
Do not reach for `get_code_connect_map`/`add_code_connect_map`. Instead, each consuming
repo maintains an explicit **Figma-name → code-name mapping table** (in-repo, e.g. a
`figma-code-map.md` or equivalent next to the design-system source) — an audit diffs
the capture's names against that table, it never re-derives naming conventions from
scratch. The capture-figma plugin (`~/JHD/figma-plugins/main/capture-figma`) stays the
house name-mapping truth; this table is downstream of it, not a replacement for it.

The steps below (Steps 1-4, the layer model, "The order," recapture) are written as the
MCP-only procedure — the portability floor. When a REST or listener lane is available, run
the same conceptual stages (architecture → styles/variables → components → blocks) through
that lane's output instead of MCP tool calls; the sequence and the operator rulings don't
change, only which tool produces each layer's data.

## REST node lane — no active tab needed

For a single already-known node id, `scripts/figma-node.mjs` (same `FIGMA_TOKEN`
convention as `figma-capture.mjs`) reads it straight from the REST API — no desktop app,
no active-tab dependency, no risk of reading whatever tab happens to be focused.

- **`node <fileKey> <nodeId> [--raw] [--out path]`** — `GET /v1/files/:key/nodes?ids=`.
  Prints pruned JSON (vector geometry — `vectorNetwork`/`vectorPaths`/`fillGeometry`/
  `strokeGeometry` — stripped; structure, names, `boundVariables`, styles, layout props,
  and `absoluteBoundingBox` all kept) to stdout, or to `--out` if given. `--raw` skips
  pruning. `nodeId` accepts `572:46329`, `572-46329`, or a full figma.com URL's
  `?node-id=` — pass the URL as the sole argument and both the file key and node id are
  extracted from it.
- **`image <fileKey> <nodeId> [--scale 2] [--out path]`** — `GET /v1/images/:key` at
  `format=png`, downloads the rendered PNG. Default `--out`:
  `~/JHD/figma-plugins/main/capture-figma/captures/renders/<key>-<id>.png` (dir created if missing).
- **`vars <fileKey>`** — `GET /v1/files/:key/variables/local`. Enterprise-plan gated: on
  403 it prints the documented explanation and exits 2 rather than fabricating a result —
  fall back to the MCP `get_variable_defs` lane below.
- Errors are specific: 403/404/429 each get a distinct message, and 429 respects a
  `Retry-After` response header (single retry) before falling back to a fixed 2s wait.

**When to prefer this over the desktop MCP lane:** always, whenever the node id is
already known (from a prior capture, a pasted figma.com link, a delta report) — it has
no active-tab constraint, so it can't accidentally read the wrong tab, and it doesn't
require the desktop app to be open at all. Reach for the desktop MCP lane instead only
for **live selection** — a human-in-loop walk where nothing is yet pinned to a node id,
or the operator is actively clicking around the canvas to find the right node.