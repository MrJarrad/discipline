# Brief pack — Figma's in-app agent building a generative capture plugin

Purpose: everything Figma's AI agent needs to generate a plugin COMPATIBLE with our
capture pipeline. Paste the block below as the opening prompt; it encodes the contract
so whatever the agent generates plugs into the listener/ledger unchanged. Hard-won
constraints (each cost us a live failure) are marked ⚠.

---PASTE FROM HERE---

Build a Figma plugin that exports this file's complete local variables and styles as
structured JSON and streams it to a local capture listener. Exact contract:

OUTPUT JSON SHAPE (deterministic — stable key order, collections sorted by name,
variables sorted by full path, modes in collection-defined order):
{
  "header": { "fileName": figma.root.name,
              "fileKey": figma.fileKey (OPTIONAL — omit the key entirely when undefined,
              never emit null; figma.fileKey is unset in some plugin-execution contexts,
              e.g. a file never saved to the cloud), "pluginVersion",
              "exportedAt" (epoch number or ISO-8601 string — both valid),
              "counts": { per-collection variable counts },
              "styleCounts": { "text","paint","effect","grid","total","emptyDescriptions" } },
  "collections": [ { "name", "modes": [mode names in order], "variables": [
      { "name" (VERBATIM — including misspellings; names are data, never corrected),
        "id" (OPTIONAL — Figma's persistent variable id, from variable.id; when present
        it lets the listener correlate a renamed variable across syncs instead of
        reading a rename as removed+added — include it if the API surface you're
        generating from exposes it, omit rather than fake one if it doesn't),
        "resolvedType",
        "valuesByMode": { keyed by MODE NAME, not mode id },
        aliases expressed as "→ {collection}/{variable}" strings — NEVER resolved to
        values (aliases ARE the semantic structure),
        "scopes" and "description" when present ("" preserved — empty descriptions are
        countable signal, do not omit the key),
        "codeSyntax" (OPTIONAL — per-platform WEB/ANDROID/iOS dev-handoff name
        overrides, from variable.codeSyntax; omit the key when the object has no
        platform entries, never emit an empty object),
        "hiddenFromPublishing" (OPTIONAL — boolean, from variable.hiddenFromPublishing;
        only present on variables belonging to a publishable library — omit rather
        than default when the field is absent) } ] } ],
  "styles": { "text"|"paint"|"effect"|"grid": [
      { "name" (verbatim, path-composed e.g. "title/200"), "description" ("" preserved),
        "id" (OPTIONAL — Figma's persistent style id, from style.id; same rename-
        correlation purpose as the variable id above, scoped within its own style
        type — a text style is never correlated against a paint style),
        "properties": per-property — variable-bound properties as "→ {variable path}",
        raw values as raw; paint styles include FULL gradient stop data; effect styles
        the full stack in order; grid styles the full definition,
        "hiddenFromPublishing" (OPTIONAL — only emit if the plugin-docs surface for
        this style type actually exposes it; as of the reference implementation's
        last check, BaseStyleMixin does not document this field — verify against
        current figma.com/plugin-docs before relying on it populating) } ] },
  "components" (OPTIONAL — omit the whole key when the plugin doesn't support component
      export yet; the listener never requires it, older contract plugins stay valid):
    { "standalone": [ { "name", "key", "description", "properties": { propName (ID-suffixed
        when Figma disambiguates, e.g. "has-caption#492:3"): { "type": "BOOLEAN"|"TEXT"|
        "INSTANCE_SWAP"|..., "defaultValue" } } } ],
      "sets": [ { "name", "key", "description",
        "properties": { propName: { "type", "defaultValue",
            "options" (VARIANT-typed props only — the full list of variant values for
            that axis), "preferredValues" (INSTANCE_SWAP-typed props only — array of
            preferred component keys) } },
        "variants": [ { "name" (e.g. "layout=default, size=100"), "key", "description",
          "bindings" (OPTIONAL — per-variant layer bindings, the component-internals
          chain: array of { "layer" (e.g. "title/title"), "property" (e.g. "fill"),
          "value" — alias as "→ {variable path}", raw values as raw, same convention
          as everywhere else in this contract) } ]
      } ] },
  "copy" (OPTIONAL — omit the whole key when the plugin doesn't support copy capture
      yet; the listener never requires it, older contract plugins stay valid — see
      COPY CAPTURE below for the full walk procedure): [
    { "path" (page/frame path, names-are-paths — the text node's ancestor chain of
        frame/instance names down to the node's own name, joined "/", e.g.
        "Landing/NavigationHeader/Info"),
      "text" (the verbatim rendered characters — authored copy, never trimmed,
        never normalized, never corrected for spelling),
      "id" (OPTIONAL — the text node's persistent Figma id, from node.id; enables
        id-first correlation across syncs the same way variables/styles/components
        already do),
      "componentContext" (OPTIONAL — present ONLY when the node's characters are
        driven by a TEXT-typed component property on an enclosing instance, not
        directly authored on the layer itself: { "component": enclosing instance's
        component/set name, "prop": the TEXT prop name }. Omit entirely for a raw
        text node — absence of componentContext means these are authored characters
        sitting directly on the canvas, not a prop default) } ]
}

COPY CAPTURE — the text-node walk:
Walk every text node on the file's DELIVERABLE pages only (per the capture-figma
skill's archetype model: a CONSUMER file's deliverable pages, or a PRODUCER file's
published/Example surfaces — never exploration/scratch pages, never hidden layers).
This walk is scoped and cheap on purpose — it exists to catch copy DRIFT between the
design and the build, not to archive every scratch page's throwaway text:
- Visit pages in canvas order, then frames within a page in canvas order, same
  ordering convention as every other walk in this contract (order is meaning).
- For each visible TextNode (`node.visible !== false`, skip anything inside a hidden
  layer or a page not classified as a deliverable page), record `path`, `text`
  (`node.characters`, verbatim), `id` (`node.id`), and `componentContext` when the
  node sits inside an INSTANCE and its characters resolve from that instance's TEXT
  component property (check `node.componentPropertyReferences?.characters`) rather
  than a raw override — resolve back to the owning instance's component/set name and
  the referenced prop name.
- Do NOT walk hidden pages, hidden frames, or a page/frame explicitly named as
  exploration/scratch content — the same per-page-role scoping the audit lane already
  applies (a foreign binding on an exploration page is scenery; the same is true of a
  scratch page's placeholder copy — it is never a diff target).
- Skip a text node whose `characters` is the empty string (nothing to capture); do
  NOT skip a node just because its content looks like a placeholder (e.g. "Lorem
  ipsum") — placeholder copy left in a deliverable page is itself a legitimate drift
  signal, not noise to filter out.

DELIVERY:
- POST the JSON to http://localhost:4411/capture (content-type: application/json).
  The listener answers CORS preflight (OPTIONS→204) and allows any origin; bodies over
  50MB are rejected. GET /health returns "ok".
- Also keep a manual path: render the JSON in the UI with copy + download
  (no network needed) as fallback.

⚠ CONSTRAINTS LEARNED FROM LIVE FAILURES — follow exactly:
1. manifest networkAccess: allowedDomains must be ["http://localhost:4411"] ONLY —
   Figma rejects IP literals like 127.0.0.1 — and the networkAccess object MUST include
   a "reasoning" field or the manifest is rejected.
2. The plugin main thread (code) has NO fetch/browser APIs. All network calls happen in
   the UI iframe: main thread posts the JSON to the UI via postMessage; the UI fetches
   and posts the result back.
3. With documentAccess "dynamic-page", you MUST await figma.loadAllPagesAsync() before
   registering figma.on('documentchange', ...). Show a "loading all pages…" status
   while it runs.
4. Live sync: on documentchange, debounce 5 seconds trailing, then re-export and POST.
   Handle listener-down gracefully (status message, retry on next change, never crash).
   State in the UI copy that sync only runs while the panel is open (no background
   execution in Figma).
5. Use the async variable/style APIs with defensive fallbacks:
   figma.variables.getLocalVariableCollectionsAsync / getLocalVariablesAsync /
   getVariableByIdAsync; figma.getLocalTextStylesAsync / getLocalPaintStylesAsync /
   getLocalEffectStylesAsync / getLocalGridStylesAsync.
6. Determinism is the point: same file state → byte-identical export. No timestamps
   anywhere except header.exportedAt; no random ids; stable ordering throughout.

OPTIONAL FEATURE — version-stamp on sync start:
When the user taps Start sync, BEFORE the first export, call
figma.saveVersionHistoryAsync("capture-sync <ISO date>", "Auto-stamped by capture sync")
so the file gains a named version at the sync moment (a REST version poller pairs the
structure snapshot to it — the two capture lanes align on one instant). Rules: stamp on
sync START only, never per debounced change (version history would flood); await it and
surface failures in the status line without blocking the sync itself; the API returns a
VersionHistoryResult — include its id in the export header as "versionStampId" when
available (OPTIONAL field, omit on failure).

---PASTE ENDS---

## Context for the operator (not for the agent)
- ACTIVE EXPORTER (operator ruling 2026-07-26): the Figma-agent-built "Variable & style
  exporter" — it is the working plugin. Our figma-plugin/capture-figma (v1.2.0) is
  RETIRED from active use (operator: "doesn't work properly" — its sync path was never
  live-verified) and kept in the repo solely as the contract's reference source.
  Improvements continue to flow brief → Figma agent → adopted into the contract.
- The listener (scripts/capture-listener.mjs) writes to ~/JHD/captures/live/ and
  appends receipts.jsonl — anything speaking the contract lands in the same pipeline.
  When header.fileKey is present, the listener routes/dedups on it and the output
  filename becomes `<file-name-kebab>--<fileKey>-variables-styles.json`; absent
  fileKey falls back to the plain `<file-name-kebab>-variables-styles.json` path.
- The listener computes modification-level diffs the plugin's own changelog does not:
  where a contract-compliant plugin's changelog is add/remove-only, the listener's
  changes.jsonl adds per-mode variable value changes, per-property style changes, and
  (now) per-component-set variant-option added/removed and prop-default-changed
  records — richer than what any plugin emits on its own, so don't expect the plugin's
  changelog to already contain what changes.jsonl reports.
- RENAME DETECTION (listener, added alongside the id fields above): when both sides of
  a sync carry a stable id for an entry (variables/styles: `id`; components: the
  existing `key` field, which already served this purpose before the id fields
  existed), the listener correlates by id first — same id + different name lands in
  `changed.variablesRenamed` / `stylesRenamed` / `componentsRenamed` as
  `{ bucket, id, oldName, newName }`, never as a removed+added pair. Name-only diffing
  (the original behaviour) is the fallback whenever an id is missing on either side —
  older exports and plugins that predate this field stay fully valid.
- ALIAS REPOINTS (listener): a per-mode variable value change where the old value is an
  alias string and the new value is a different alias string is `alias_repointed`
  ({ path, mode, aliasFrom, aliasTo, type }) in `changed.aliasRepoints`, not a generic
  modified-value record — it's a structural rewire, not a value edit. Alias-to-raw is
  `binding_broken`; raw-to-alias is `binding_added` — both land in the same
  `aliasRepoints` array. `changed.variables` now only carries plain value-to-value
  changes where neither side is an alias transition.
- `changeRecord.summary` gained `renamed` (total across the three *Renamed arrays) and
  `repointed` (the `aliasRepoints` count) alongside the existing `added`/`modified`/
  `removed` totals. `GET /changes` needed no shape change — it already serves whatever
  `changes.jsonl` records.
- LAYER BINDINGS (listener, v1.7.0 exports and later): component sets may now carry
  `variants[].bindings` — the component-internals chain (which layer inside the
  component instance binds which property to which variable). For sets correlated
  between two exports (key-then-name, same as the outer set correlation), the
  listener diffs each matched variant's bindings keyed by `layer`+`property` and
  lands records in `changed.layerBindings` as
  `{ set, variant, layer, property, from, to, type }`: alias->alias (different
  target) is `layer_binding_repointed`; alias->raw is `layer_binding_broken`;
  raw->alias, or an entry present only on the new side, is `layer_binding_added`;
  an entry present only on the old side is `layer_binding_removed`. `summary` gained
  a `layerBindings` count (total of `changed.layerBindings`) alongside the existing
  totals — kept separate from `repointed`, since it's a different chain
  (component-internals, not variable/style aliasing). Validation stays loose:
  `bindings` is optional at every level, never required.
- COPY CAPTURE (listener, this revision): the top-level `copy` array is OPTIONAL —
  never required, and its absence from an older-plugin export is not a defect, the
  same convention as every other optional field in this contract. When both sides of
  a sync carry `copy`, entries are correlated id-first (a text node's `id`), falling
  back to `path` when an id is missing on either side — same id-first/path-fallback
  pattern as every other bucket. A matched entry whose `text` differs is
  `copy_changed` ({ path, old, new }) in `changed.copy`; a `path` present only on the
  new side is `copy_added` ({ path, text }); a `path` present only on the old side is
  `copy_removed` ({ path }). `summary` gains a `copy` count (total of `changed.copy`,
  all three record types) alongside the existing `layerBindings` count — kept
  separate for the same reason layerBindings is: it's its own signal, not folded into
  `repointed` or `modified`. This is the machinery behind the nav-label incident
  (design said "About", code said "Info", and only the operator's eye caught it) —
  copy drift is now a diffable signal like every other design-system drift.
- v1.2.0 adopted six improvements from an external contract-compliant plugin
  (operator-endorsed, 2026-07-25): header.fileKey; POST-failure UI shows the
  listener's response body, not just the status; a client-side content-length
  pre-check warns in the UI as the payload nears/exceeds the listener's 50MB limit;
  per-variable codeSyntax and hiddenFromPublishing; a last-successful-sync timestamp
  in the UI, persisted in-session and across sessions via figma.clientStorage.
- Judging the generated result: run both plugins on the same file; exports should be
  semantically identical (diff after key-sort). Differences = findings about one
  implementation or the other.
