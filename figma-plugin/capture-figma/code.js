// Capture Figma — full local variable graph + local styles export
//
// Exports every local variable collection, every variable (bound or not),
// and every mode's value as normalized JSON. Closes two gaps left by other
// lanes: the MCP lane only sees variables actually bound to a node (and only
// the active mode), and the REST /variables endpoint is Enterprise-gated.
// This plugin reads figma.variables directly, so it works on any plan.
//
// Also exports every local style (text/paint/effect/grid) with per-property
// binding status — per skills/capture-figma/SKILL.md step 2 rulings 3-7:
// styles are "partially-bound recipes" (some properties bind a variable,
// others hold a raw value — the raw ones are drift/defect territory), and
// styles hold composite data (multi-stop gradients, stacked effects, grid
// definitions) that variables structurally cannot. Empty descriptions are
// preserved verbatim (not omitted) because a description gap is itself
// countable capture signal (ruling 7).
//
// Output shape (v1.16.0, schema v2 — see the "SCHEMA V2 TRANSFORM" and
// "schema v2: live document traversal" sections below for the five
// additive buckets' derivation):
//   {
//     header: {
//       fileName, fileKey (figma.fileKey — omitted when undefined; Figma
//       leaves this unset in some contexts, e.g. a file that has never been
//       saved/published, so callers must not assume presence),
//       pluginVersion (tracks .claude-plugin/plugin.json's version — the
//       repo's single real version marker),
//       exportedAt (ISO-8601 string), schemaVersion: 2,
//       counts: { <collection name>: <variable count>, ... ,
//                 "styles/text": n, "styles/paint": n,
//                 "styles/effect": n, "styles/grid": n },
//       styleCounts: { text, paint, effect, grid, total,
//                       emptyDescriptions: { text, paint, effect, grid, total } },
//       componentCounts: { standalone: n, sets: n }, warningCount: n
//     },
//     collections: [ { name, id, modeTable: { modeId: name }, modes: [...],
//       variables: [...] }, ... ],
//     styles: {
//       text:   [ { name, type: "TEXT",   description, properties: {...} }, ... ],
//       paint:  [ { name, type: "PAINT",  description, properties: {...} }, ... ],
//       effect: [ { name, type: "EFFECT", description, properties: {...} }, ... ],
//       grid:   [ { name, type: "GRID",   description, properties: {...} }, ... ],
//     },
//     components: { standalone: [ { name, key, properties } ], sets: [
//       { name, key, properties, variants: [ { name, key, bindings: [
//         { layer, property, value } ] } ] } ] } — the listener's own
//       diffComponents/diffSetBindings contract (scripts/capture-listener.mjs),
//       restored after the v2 rewrite dropped it (capture plugin A/B
//       comparison 2026-07-30, adopt-list #1).
//     componentSets: [ { key, id, name, description, properties, variantCount }, ... ],
//     exampleStructure: [ { name, frames: [ { id, name }, ... ] }, ... ],
//     templateFrames: [ { id, name, instances: [ { id, name, component,
//       variantProps, properties, overrides: [ { id, property, value } ] }, ... ] }, ... ],
//     latentCapabilities: [ { id, name, visible, binding }, ... ],
//     warnings: [ { type, nodeId, nodeName, context, message }, ... ],
//     copy: [ { path, text, id, componentContext?: { component, prop } }, ... ] —
//       every visible TextNode's verbatim characters on the "Example" page
//       (this plugin's DELIVERABLE surface — see findExamplePage), path
//       composed of FRAME/INSTANCE ancestor names down to the node's own
//       name (brief pack "COPY CAPTURE").
//     modePins: [ { path, modes: { axis: modeName } }, ... ] — every visible
//       FrameNode on the "Example" page with a non-empty
//       explicitVariableModes, resolved against this SAME export's
//       collections[].id/modeTable (raw collectionId/modeId fallback when
//       unresolvable — brief pack "MODE-PIN CAPTURE").
//   }
// Each style list is sorted by name (type is fixed per list, so sort order
// is effectively type-then-name across the whole `styles` block). Every
// bindable property is emitted as either the raw value or, when
// boundVariables carries an alias for that field, "→ {collection}/{name}"
// notation (same alias resolution as the variables section, via
// resolveAliasNotation/getVariableById). Paint styles carry full gradient
// stop data; effect styles carry the full ordered effect stack; grid styles
// carry the full grid definition — none of these can be reconstructed from
// variables alone (SKILL.md step 2, ruling 6).
//
// API surface note: this file was written without live access to the current
// Figma Plugin API docs (no WebFetch/context7 lane available in this run).
// It therefore calls the async variants first (getLocalVariableCollectionsAsync,
// getLocalVariablesAsync, getVariableByIdAsync, getLocalTextStylesAsync,
// getLocalPaintStylesAsync, getLocalEffectStylesAsync, getLocalGridStylesAsync)
// since those are the documented direction the API has moved, and falls back
// to the older synchronous variants (getLocalVariableCollections,
// getLocalVariables, getVariableById, getLocalTextStyles, getLocalPaintStyles,
// getLocalEffectStyles, getLocalGridStyles) if the async method is missing on
// this Figma version. Verify against
// https://www.figma.com/plugin-docs/api/figma-variables/ and
// https://www.figma.com/plugin-docs/api/figma/#getlocaltextstylesasync
// before relying on this in a version where both fail. First live in-Figma
// run of the styles export is the outstanding verification — see the
// engineering note at the bottom of this file.

// Tracks .claude-plugin/plugin.json's "version" — the repo's single real
// version marker — not an independently-incrementing counter of its own.
// header.pluginVersion previously drifted from that marker (this constant
// carried its own private history, e.g. "1.3.0" while the repo was already
// at 1.13.0, then again "1.14.0" while the repo had moved to 1.15.0), which
// made a capture's pluginVersion useless for correlating it back to the
// commit/release that produced it.
//
// MECHANISM: there is no build/bundle step for this plugin (manifest.json's
// "main" points straight at this file — no compiler reads plugin.json at
// build time), so this stays a hand-maintained constant. Bump it in the
// SAME commit as every plugin.json version bump, and never separately.
// version-sync.test.mjs is the mechanical guard: it fails `node --test` the
// moment this constant and plugin.json's "version" disagree, so drift is
// caught before it ships instead of being rediscovered in a stale export.
const PLUGIN_VERSION = "1.34.0";

// manifest.json's networkAccess.allowedDomains is scoped to
// http://localhost:4411 ONLY — never a public internet host. Live sync mode
// POSTs the export JSON to a local listener (scripts/capture-listener.mjs,
// which binds 127.0.0.1 server-side) that a human runs on this same machine;
// the plugin never talks to anything off-box.
//
// The POST itself happens in ui.html, not here. Per Figma's plugin docs
// (figma.com/plugin-docs/how-plugins-run/, "Plugin environment"): the main
// thread this file runs on is a sandbox with no browser APIs — fetch,
// XMLHttpRequest, setTimeout-via-DOM, etc. all simply don't exist on it.
// Only the <iframe> shown via figma.showUI() (ui.html) has fetch. This file
// used to call fetch() directly here; that made every sync attempt fail
// with "fetch is not defined" inside runSyncExport()'s catch block, which
// reported the generic "listener not reachable" state even when the
// listener was healthy — see runSyncExport()/postSyncExportToUI() below for
// the fix: post the export payload to ui.html and let it perform the fetch,
// reporting the result back over the same postMessage channel.

// header.propskitAvailable's live value — see buildHeaderPropskitField's
// comment above for why this is reported by ui.html rather than detected
// here. Defaults false until the UI's boot-time probe message arrives
// (posted right after ui.html's script starts, ahead of any user action, so
// in practice this resolves before the earliest possible export — but a
// buildExport() run that somehow races ahead of it still reports the
// non-optimistic default rather than an assumed true).
let propskitAvailable = false;

// Content-hugging panel (operator ruling, 2026-07-31): the Figma-authored
// mockup's window ends right below the Raw JSON row, no reserved empty
// space — unlike a fixed 480x640 shell. PANEL_WIDTH is the mockup's idle
// render (figma-capture-figma.png, 684px) at its real 2x-screenshot scale
// halved (684 / 2 = 342); the window never changes width, only height.
// PANEL_HEIGHT_IDLE is a same-math starting guess (420 / 2 = 210) for the
// one showUI() call that must happen before ui.html's DOM exists to measure
// anything — ui.html corrects it within a frame via the boot-time "resize"
// message (see ui.html's scheduleResize()).
//
// PANEL_HEIGHT_MAX (raised from 394 to 640 in the first pass, operator
// verdict 2026-08-01 Addendum 2 item 3: "window must GROW with content
// instead of internal scrolling — warnings get cut off today"; raised again
// from 640 to 900, Addendum 6 item 2: 640 was still insufficient for real
// content — 873 warnings across 3 groups, plus the drift section and Raw
// JSON, all expandable at once). The API itself imposes no maximum —
// @figma/plugin-typings 1.128.0 documents only a minimum ("The minimum size
// is 70x0", plugin-api.d.ts:2668 on UIAPI.resize; showUI's options note the
// same 70/0 floors, :353-354) — the real ceiling is the host: Figma clamps
// the plugin iframe to the user's viewport, so a value taller than the
// shortest realistic viewport is silently truncated by Figma and reproduces
// the same cut-off symptom. 900 is the practical ceiling: a 13" MacBook's
// default logical viewport is ~900px tall and a 1080p external display's
// working area (minus OS chrome) is comfortably taller than that, so 900
// clears the common case with only the smallest 1366x768-class laptop
// screens (a minority for design work) still needing the internal scroll
// this cap exists to fall back to. Content beyond it scrolls inside the
// iframe rather than growing the window further; expanding/collapsing a
// warning or drift group re-measures and re-grows toward this cap via each
// <details>'s "toggle" listener (see ui.html's scheduleResize() callers).
const PANEL_WIDTH = 342;
const PANEL_HEIGHT_IDLE = 210;
const PANEL_HEIGHT_MAX = 900;

// === RESIZE DEDUP (pure — tested via resize-dedup.test.mjs, which extracts
// this block by its markers) ===
// Pure clamp: mirrors the previous inline expression in the "resize" message
// handler below, unchanged — the fix here is not the clamp math, it's that
// the handler now skips the actual figma.ui.resize() IPC call when the
// clamped result equals the last height it applied.
function clampResizeHeight(measured, idleHeight, maxHeight) {
  const rounded = Math.round(measured);
  const safe = Number.isFinite(rounded) ? rounded : idleHeight;
  return Math.min(Math.max(safe, 1), maxHeight);
}
// === END RESIZE DEDUP ===

// One Sync click drives ~8 "resize" postMessages from ui.html (boot +
// per-state-transition scheduleResize() calls — see ui.html's comment on
// scheduleResize) but most report the same clamped height as the previous
// one (e.g. every "Exporting…" phase change re-measures the same row
// height). figma.ui.resize() is a real cross-process IPC call even when the
// size is unchanged, so this cache lives on the code.js side of the bridge
// — the side that actually owns the figma.ui.resize() call and is the only
// place that can dedupe every caller (ui.html-side deduping would only
// cover ui.html's own postMessage calls, not guarantee the IPC call itself
// never fires redundantly). null until the first resize message applies.
let lastAppliedResizeHeight = null;

figma.showUI(__html__, { width: PANEL_WIDTH, height: PANEL_HEIGHT_IDLE });
loadLastSyncFromStorage();
postSnapshotAvailability();

// Lets a user right-click the page/canvas → Plugins → Relaunch buttons →
// jump straight back into this plugin without the full Plugins menu each
// time. The "export" id here must match manifest.json's relaunchButtons
// entry exactly — Figma keys the two together by id.
figma.root.setRelaunchData({ export: "Export variables + styles" });

// === CALL GATE (tested via buildexport-perf.test.mjs) ===
// A ceiling on how many plugin-API round trips are outstanding at once.
//
// REGRESSION FIXED (operator sync of v1.24.0, Addendum 9c): round 2's four
// fan-out points — the sibling walk, the Example section tree, a layer's
// batched binding lookups, and collectInParallel — each went out with no
// ceiling, so on a real document tens of thousands of round trips were queued
// against the plugin main thread simultaneously. Total went 11.6s → 16.9s and
// componentsScan, which that batch never touched, TRIPLED to 1956ms: the tell
// that the shared resource, not any one phase, was saturated.
//
// The cure is a ceiling, not a rollback. Every one of these calls is serviced
// by the SAME single main thread, so concurrency here buys pipelining (never
// leaving the thread idle between round trips), never parallel execution. A
// handful of outstanding calls is enough to keep the thread's queue non-empty;
// past that, extra in-flight calls add only queue depth — scheduler bookkeeping
// and retained closures the thread must step over to reach useful work, which
// is precisely what taxed the untouched scan phase. 12 sits deliberately above
// the "queue never empties" point (single digits) and well below where that
// bookkeeping dominates.
const MAX_CONCURRENT_PLUGIN_CALLS = 12;

// The gate wraps RAW plugin calls only — never a function that itself awaits a
// gated one. That invariant is what makes it deadlock-free: no permit holder is
// ever waiting on a permit. It is also why the fan-out points themselves are
// left alone: they still hand out every branch at once (so the ordering proofs
// they carry are untouched — order of results stays positional, decided by the
// tree, never by completion), but the actual round trips those branches make
// queue behind one shared ceiling.
function createCallGate(limit) {
  let active = 0;
  const waiting = [];
  function pump() {
    while (active < limit && waiting.length > 0) {
      const job = waiting.shift();
      active++;
      Promise.resolve()
        .then(job.run)
        .then(job.resolve, job.reject)
        .then(function () {
          active--;
          pump();
        });
    }
  }
  return function gate(fn) {
    return function () {
      const self = this;
      const args = arguments;
      return new Promise(function (resolve, reject) {
        waiting.push({
          run: function () { return fn.apply(self, args); },
          resolve: resolve,
          reject: reject,
        });
        pump();
      });
    };
  };
}
// === END CALL GATE ===

const gatePluginCall = createCallGate(MAX_CONCURRENT_PLUGIN_CALLS);

async function getCollections() {
  if (typeof figma.variables.getLocalVariableCollectionsAsync === "function") {
    return figma.variables.getLocalVariableCollectionsAsync();
  }
  if (typeof figma.variables.getLocalVariableCollections === "function") {
    return figma.variables.getLocalVariableCollections();
  }
  throw new Error("No local variable collection accessor found on figma.variables");
}

async function getVariables() {
  if (typeof figma.variables.getLocalVariablesAsync === "function") {
    return figma.variables.getLocalVariablesAsync();
  }
  if (typeof figma.variables.getLocalVariables === "function") {
    return figma.variables.getLocalVariables();
  }
  throw new Error("No local variable accessor found on figma.variables");
}

const getVariableById = gatePluginCall(async function getVariableById(id) {
  if (typeof figma.variables.getVariableByIdAsync === "function") {
    return figma.variables.getVariableByIdAsync(id);
  }
  if (typeof figma.variables.getVariableById === "function") {
    return figma.variables.getVariableById(id);
  }
  return null;
});

const fetchStyleById = gatePluginCall(async function fetchStyleById(id) {
  if (typeof figma.getStyleByIdAsync === "function") {
    return figma.getStyleByIdAsync(id);
  }
  if (typeof figma.getStyleById === "function") {
    return figma.getStyleById(id);
  }
  return null;
});

// === ID CACHE (fetch injected — tested via buildexport-perf.test.mjs,
// which extracts this block by its markers and diffs it against the previous
// uncached implementation) ===
// Memoizes style-by-id lookups for the duration of one export.
//
// OPTIMIZATION (lag verdict 2026-08-01, Addendum 6): collectLayerBindingEntries
// looks up textStyleId/fillStyleId/strokeStyleId/effectStyleId on EVERY layer of
// EVERY variant of EVERY component set, and each lookup was its own plugin-API
// round trip. In a design system the same handful of style ids recur across
// thousands of layers, so the overwhelming majority of those round trips asked
// the same question again. The PROMISE is cached, not just the resolved value,
// so the now-overlapping set walks share one in-flight request per id instead
// of each issuing its own.
//
// Output is provably unchanged: a style's name cannot change mid-export (the
// plugin holds the main thread across buildExport), and the cache is recreated
// per export, so a cached answer is the same answer (proven differentially in
// buildexport-perf.test.mjs against the uncached implementation, with a fake
// API that answers out of call order).
function createIdCache(fetchById) {
  const cache = new Map();
  return function get(id) {
    if (cache.has(id)) return cache.get(id);
    const pending = Promise.resolve(fetchById(id));
    cache.set(id, pending);
    return pending;
  };
}
// === END ID CACHE ===

let getStyleById = createIdCache(fetchStyleById);

// Same primitive, same reason, one step further along: variableById is
// prewarmed with every LOCAL variable in buildExport, so a miss means a
// LIBRARY variable — and now that the whole component tree is walked at once,
// every layer bound to that library variable misses simultaneously. Caching
// the in-flight promise keeps that one round trip, not one per layer.
let getVariableByIdCached = createIdCache(getVariableById);

async function getLocalTextStyles() {
  if (typeof figma.getLocalTextStylesAsync === "function") {
    return figma.getLocalTextStylesAsync();
  }
  if (typeof figma.getLocalTextStyles === "function") {
    return figma.getLocalTextStyles();
  }
  throw new Error("No local text style accessor found on figma");
}

async function getLocalPaintStyles() {
  if (typeof figma.getLocalPaintStylesAsync === "function") {
    return figma.getLocalPaintStylesAsync();
  }
  if (typeof figma.getLocalPaintStyles === "function") {
    return figma.getLocalPaintStyles();
  }
  throw new Error("No local paint style accessor found on figma");
}

async function getLocalEffectStyles() {
  if (typeof figma.getLocalEffectStylesAsync === "function") {
    return figma.getLocalEffectStylesAsync();
  }
  if (typeof figma.getLocalEffectStyles === "function") {
    return figma.getLocalEffectStyles();
  }
  throw new Error("No local effect style accessor found on figma");
}

// documentAccess is "dynamic-page" (manifest.json), so pages are lazily
// loaded by default. buildExport() needs every page loaded via
// figma.loadAllPagesAsync(): schema v2's componentSets/exampleStructure/
// templateFrames/latentCapabilities/warnings buckets traverse every page
// plus the page literally named "Example", both page-scoped reads that
// throw on an unloaded page — see buildExport()'s own call to this
// function, awaited before any page.children/findAll call.
async function ensureAllPagesLoaded() {
  if (typeof figma.loadAllPagesAsync === "function") {
    await figma.loadAllPagesAsync();
    return true;
  }
  // Older API surface without loadAllPagesAsync: fall back gracefully
  // (matches this file's established pattern of trying the async accessor
  // first, then falling back rather than throwing), just without the
  // pre-load guarantee.
  return false;
}

async function getLocalGridStyles() {
  if (typeof figma.getLocalGridStylesAsync === "function") {
    return figma.getLocalGridStylesAsync();
  }
  if (typeof figma.getLocalGridStyles === "function") {
    return figma.getLocalGridStyles();
  }
  throw new Error("No local grid style accessor found on figma");
}

function isAlias(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    value.type === "VARIABLE_ALIAS" &&
    typeof value.id === "string"
  );
}

// Resolves an alias to "→ {collection}/{variable path}" notation instead of
// its resolved value — the alias itself is the semantic structure we want
// to preserve in the ledger, not what it happens to evaluate to today.
async function resolveAliasNotation(value, variableById) {
  if (!isAlias(value)) return value;
  let target = variableById.get(value.id);
  if (!target) {
    target = await getVariableByIdCached(value.id);
    if (target) variableById.set(value.id, target);
  }
  if (!target) {
    return "→ [unresolved alias: " + value.id + "]";
  }
  const targetCollection = target.variableCollectionId;
  const collectionName = collectionNameById.get(targetCollection) || "[unknown collection]";
  return "→ " + collectionName + "/" + target.name;
}

let collectionNameById = new Map();

// Resolves a single bindable field on a style/paint/effect/grid object:
// if boundVariables carries an alias for this field name, return the same
// "→ {collection}/{name}" notation the variables section uses; otherwise
// return the raw value as authored. This is the per-property binding-status
// record the training model requires (styles are "partially-bound recipes").
async function resolveFieldValue(container, fieldName, rawValue, variableById) {
  const alias =
    container && container.boundVariables ? container.boundVariables[fieldName] : undefined;
  if (isAlias(alias)) {
    return resolveAliasNotation(alias, variableById);
  }
  return rawValue;
}

// Same alias-vs-raw resolution as resolveFieldValue, but serializes an
// unbound raw color (paint/effect/grid/gradient-stop) to hex/rgba (adopt-
// list #2) instead of emitting the {r,g,b,a} object verbatim. An aliased
// color is untouched — resolveFieldValue already returned the "→ " notation
// string, distinguishable from the raw object by reference (resolveFieldValue
// returns the SAME rawValue reference when unbound, never a copy).
async function resolveColorFieldValue(container, fieldName, rawColor, variableById) {
  const resolved = await resolveFieldValue(container, fieldName, rawColor, variableById);
  return resolved === rawColor ? serializeColor(rawColor) : resolved;
}

// Text style properties: family/style are read together as fontName since
// Figma doesn't expose fontFamily/fontStyle as separate scalar fields, but
// boundVariables can still bind "fontFamily" independently of "fontStyle".
async function buildTextStyleProperties(style, variableById) {
  return {
    fontFamily: await resolveFieldValue(style, "fontFamily", style.fontName.family, variableById),
    fontStyle: await resolveFieldValue(style, "fontStyle", style.fontName.style, variableById),
    fontSize: await resolveFieldValue(style, "fontSize", style.fontSize, variableById),
    fontWeight: await resolveFieldValue(style, "fontWeight", null, variableById),
    lineHeight: await resolveFieldValue(style, "lineHeight", style.lineHeight, variableById),
    letterSpacing: await resolveFieldValue(
      style,
      "letterSpacing",
      style.letterSpacing,
      variableById
    ),
    paragraphSpacing: await resolveFieldValue(
      style,
      "paragraphSpacing",
      style.paragraphSpacing,
      variableById
    ),
    paragraphIndent: await resolveFieldValue(
      style,
      "paragraphIndent",
      style.paragraphIndent,
      variableById
    ),
    textCase: style.textCase,
    textDecoration: style.textDecoration,
  };
}

// Paint styles hold what variables structurally cannot — multi-stop
// gradients — so every paint's full stop data is emitted, not just a
// resolved scalar. Per-property binding (e.g. a SOLID paint's color) is
// read off each paint entry's own boundVariables, not the style's.
async function buildPaintEntry(paint, variableById) {
  const out = {
    type: paint.type,
    visible: paint.visible !== undefined ? paint.visible : true,
    opacity: paint.opacity !== undefined ? paint.opacity : 1,
    blendMode: paint.blendMode,
  };
  if (paint.type === "SOLID") {
    out.color = await resolveColorFieldValue(paint, "color", paint.color, variableById);
  }
  if (Array.isArray(paint.gradientStops)) {
    out.gradientTransform = paint.gradientTransform;
    out.gradientStops = [];
    for (let i = 0; i < paint.gradientStops.length; i++) {
      const stop = paint.gradientStops[i];
      out.gradientStops.push({
        position: parseFloat(stop.position.toFixed(4)),
        color: await resolveColorFieldValue(stop, "color", stop.color, variableById),
      });
    }
  }
  if (paint.type === "IMAGE") {
    out.scaleMode = paint.scaleMode;
    out.imageHash = paint.imageHash;
  }
  return out;
}

async function buildPaintStyleProperties(style, variableById) {
  const paints = [];
  for (const paint of style.paints || []) {
    paints.push(await buildPaintEntry(paint, variableById));
  }
  return { paints };
}

// Effect styles hold the full ordered effect stack (a "5-layer stack" per
// the training model) — order is semantic and preserved.
async function buildEffectEntry(effect, variableById) {
  const out = {
    type: effect.type,
    visible: effect.visible !== undefined ? effect.visible : true,
  };
  if (effect.color !== undefined) {
    out.color = await resolveColorFieldValue(effect, "color", effect.color, variableById);
  }
  if (effect.offset !== undefined) {
    out.offset = await resolveFieldValue(effect, "offset", effect.offset, variableById);
  }
  if (effect.radius !== undefined) {
    out.radius = await resolveFieldValue(effect, "radius", effect.radius, variableById);
  }
  if (effect.spread !== undefined) {
    out.spread = await resolveFieldValue(effect, "spread", effect.spread, variableById);
  }
  if (effect.blendMode !== undefined) {
    out.blendMode = effect.blendMode;
  }
  return out;
}

async function buildEffectStyleProperties(style, variableById) {
  const effects = [];
  for (const effect of style.effects || []) {
    effects.push(await buildEffectEntry(effect, variableById));
  }
  return { effects };
}

// Grid styles hold the full grid definition (pattern, count/size, gutter,
// offset, alignment, color) — the whole recipe, not one scalar.
async function buildGridEntry(grid, variableById) {
  return {
    pattern: grid.pattern,
    alignment: grid.alignment,
    gutterSize: await resolveFieldValue(grid, "gutterSize", grid.gutterSize, variableById),
    count: await resolveFieldValue(grid, "count", grid.count, variableById),
    sectionSize: await resolveFieldValue(grid, "sectionSize", grid.sectionSize, variableById),
    offset: await resolveFieldValue(grid, "offset", grid.offset, variableById),
    color: await resolveColorFieldValue(grid, "color", grid.color, variableById),
    visible: grid.visible !== undefined ? grid.visible : true,
  };
}

async function buildGridStyleProperties(style, variableById) {
  const layoutGrids = [];
  for (const grid of style.layoutGrids || []) {
    layoutGrids.push(await buildGridEntry(grid, variableById));
  }
  return { layoutGrids };
}

const STYLE_TYPE_BUILDERS = {
  text: { fetch: getLocalTextStyles, figmaType: "TEXT", buildProperties: buildTextStyleProperties },
  paint: {
    fetch: getLocalPaintStyles,
    figmaType: "PAINT",
    buildProperties: buildPaintStyleProperties,
  },
  effect: {
    fetch: getLocalEffectStyles,
    figmaType: "EFFECT",
    buildProperties: buildEffectStyleProperties,
  },
  grid: { fetch: getLocalGridStyles, figmaType: "GRID", buildProperties: buildGridStyleProperties },
};

// Builds the full styles export: one sorted-by-name array per style type,
// plus per-type counts and per-type empty-description counts (ruling 7 —
// description gaps are countable signal, never individually judged here).
async function buildStylesExport(variableById) {
  const styles = {};
  const styleCounts = { text: 0, paint: 0, effect: 0, grid: 0, total: 0 };
  const emptyDescriptions = { text: 0, paint: 0, effect: 0, grid: 0, total: 0 };

  for (const key of ["text", "paint", "effect", "grid"]) {
    const builder = STYLE_TYPE_BUILDERS[key];
    const rawStyles = (await builder.fetch())
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));

    const out = [];
    for (const style of rawStyles) {
      const description = style.description || "";
      if (description === "") emptyDescriptions[key] += 1;
      const styleOut = {
        name: style.name,
        type: builder.figmaType,
        description: description,
        properties: await builder.buildProperties(style, variableById),
      };
      // hiddenFromPublishing on styles: unlike Variable, BaseStyleMixin does
      // not document this field as of the plugin-docs pages checked when
      // this was written (figma.com/plugin-docs/api/PaintStyle/ and
      // siblings) — styles publish/unpublish as a whole, no per-style hide
      // flag exposed to plugins. Kept defensive (typeof check, never
      // defaulted) rather than omitted outright, in case a future API
      // version adds it; verify against current plugin-docs before relying
      // on this ever actually populating.
      if (typeof style.hiddenFromPublishing === "boolean") {
        styleOut.hiddenFromPublishing = style.hiddenFromPublishing;
      }
      out.push(styleOut);
    }

    styles[key] = out;
    styleCounts[key] = out.length;
    styleCounts.total += out.length;
    emptyDescriptions.total += emptyDescriptions[key];
  }

  return { styles, styleCounts, emptyDescriptions };
}

// === SCHEMA V2 TRANSFORM (duplicated from schema-v2-transform.mjs — keep in sync) ===

// componentSets[]: verbatim field selection off each component-set
// snapshot — {key, id, name, description, properties, variantCount}.
// description is passed through as authored, including "" (an empty
// description is itself countable capture signal, same ruling as v1's
// style descriptions — never omitted).
function buildComponentSets(setSnapshots) {
  return (setSnapshots || []).map((set) => ({
    key: set.key,
    id: set.id,
    name: set.name,
    description: set.description || "",
    properties: Object.assign({}, set.componentPropertyDefinitions || {}),
    variantCount: set.variantCount,
  }));
}

// collections[].modeTable: a {modeId: name} lookup built from a collection's
// own modes[] (collection.modes, {modeId, name} pairs) — pairs with
// collections[].id so a raw modePins pin recorded elsewhere in this export
// resolves back to the human mode name without a second Figma read (brief
// pack "MODE-PIN CAPTURE").
function buildModeTable(modes) {
  const table = {};
  for (const mode of modes || []) {
    table[mode.modeId] = mode.name;
  }
  return table;
}

// modePins[]: resolves each raw {collectionId: modeId} pin snapshot (brief
// pack "MODE-PIN CAPTURE") against THIS export's own collections[] (id +
// modeTable, see buildModeTable above). A collection this export's
// collections[] doesn't carry — a cross-file library collection, or an
// older exporter that omitted ids/modeTables — still gets recorded, keyed
// and valued by the raw collectionId/modeId; never dropped for being
// unresolvable. Axes are sorted by resolved axis name (not Figma's own map
// iteration order or explicitVariableModes insertion order) so the same
// file state always produces the same key order.
function resolveModePinAxis(collectionId, modeId, collections) {
  const collection = (collections || []).find((c) => c.id === collectionId);
  if (!collection) {
    return { axis: collectionId, mode: modeId };
  }
  const modeTable = collection.modeTable || {};
  const mode = Object.prototype.hasOwnProperty.call(modeTable, modeId) ? modeTable[modeId] : modeId;
  return { axis: collection.name.toLowerCase(), mode: mode };
}

function buildModePins(pinSnapshots, collections) {
  return (pinSnapshots || []).map((pin) => {
    const explicitVariableModes = pin.explicitVariableModes || {};
    const axisEntries = Object.keys(explicitVariableModes)
      .map((collectionId) => resolveModePinAxis(collectionId, explicitVariableModes[collectionId], collections))
      .sort((a, b) => a.axis.localeCompare(b.axis));
    const modes = {};
    for (const entry of axisEntries) modes[entry.axis] = entry.mode;
    return { path: pin.path, modes: modes };
  });
}

// copy[]: verbatim field selection off each text-node snapshot (brief pack
// "COPY CAPTURE") — {path, text, id, componentContext?}. componentContext is
// omitted entirely for a raw (directly-authored) text node — its presence,
// not a null/undefined placeholder, is what marks a node's characters as
// driven by an enclosing instance's TEXT component property.
function buildCopyEntries(copySnapshots) {
  return (copySnapshots || []).map((entry) => {
    const out = { path: entry.path, text: entry.text, id: entry.id };
    if (entry.componentContext) out.componentContext = entry.componentContext;
    return out;
  });
}

// exampleStructure[]: the Example page's section hierarchy, verbatim field
// selection — {name, frames:[{id,name}]}. Sections are Figma SECTION nodes
// on the page named "Example"; frames are their direct FRAME children, in
// authored order (no re-sorting — order on the page is itself information).
function buildExampleStructure(sectionSnapshots) {
  return (sectionSnapshots || []).map((section) => ({
    name: section.name,
    frames: (section.frames || []).map((frame) => ({ id: frame.id, name: frame.name })),
  }));
}

// AXIS OWNERSHIP global rule (operator-ratified, 2026-07-29 — see the
// vault's design-system-opinion-gradient.md "Axis ownership rule"): `device`
// is always the BLOCK's own adaptation machinery; every other variant axis
// belongs to the LAYOUT, which holds exactly ONE opinion per axis — never a
// per-device pair. This constant mirrors scripts/capture-listener.mjs's
// identical constant of the same name (same global rule, applied here to
// flag an M/D-Example divergence the device axis can't explain — "free
// extra check" per the ruling — while the listener uses it to filter
// device-axis noise out of template_variant_changed). Do not fork the
// definition; if the rule ever changes, update both.
const AXIS_OWNERSHIP_DEFAULT_BLOCK_OWNED_AXIS = "device";

// templateFrames[]: the resolved instance state of the layout's Example
// frames — {id, name, width, height, instances:[{id,name,component,
// variantProps,properties,overrides}]}. width/height are the frame's own
// sync properties at snapshot time (Math.round'd by the caller) — additive
// field (operator-approved, vault decisions/capture-ui-feel-verdict-
// 2026-08-01.md Addendum 9), so frame-geometry questions (content-hug vs
// device-height template pairs) are answerable from the artifact without
// reopening Figma. Each instance's raw componentProperties (Figma's merged
// variant+non-variant property map, {name:{value,type}}) is split by type:
// VARIANT entries become variantProps (the instance's resolved variant
// selection per axis), everything else becomes properties (text/boolean/
// instance-swap values). overrides are passed through verbatim — resolving
// a live node's overridden value and building its {instance-id}/
// {node-name-path} id requires walking the actual instance tree, which only
// code.js's traversal (not this pure function) can do.
function buildTemplateFrames(frameSnapshots) {
  return (frameSnapshots || []).map((frame) => ({
    id: frame.id,
    name: frame.name,
    width: frame.width,
    height: frame.height,
    // devStatus: Figma's DevStatusMixin field (@figma/plugin-typings
    // plugin-api.d.ts:5172 DevStatus type, :5670-5679 DevStatusMixin,
    // mixed into BaseFrameMixin at :8268 — a FRAME node carries this
    // directly). `null` when unset OR when the source snapshot never
    // reported the field at all (null-is-unknown principle,
    // capture-figma-primer.md §3 — no devStatus is never treated as
    // "ready"). page-template-check.mjs's scope rule reads this: only
    // frames with devStatus.type === "READY_FOR_DEV" are checkable.
    devStatus: frame.devStatus || null,
    instances: (frame.instances || []).map((inst) => {
      const variantProps = {};
      const properties = {};
      const componentProperties = inst.componentProperties || {};
      for (const propName of Object.keys(componentProperties)) {
        const prop = componentProperties[propName];
        if (prop.type === "VARIANT") variantProps[propName] = prop.value;
        else properties[propName] = prop.value;
      }
      return {
        id: inst.id,
        name: inst.name,
        component: inst.component,
        variantProps: variantProps,
        properties: properties,
        overrides: (inst.overrides || []).map((o) => ({ id: o.id, property: o.property, value: o.value })),
      };
    }),
  }));
}

// latentCapabilities[]: verbatim field selection off each capability-node
// snapshot — {id, name, visible, binding}. A capability node is a
// component-tree layer whose bound-but-possibly-invisible fill/stroke is
// intentional DS headroom (vault ruling: "NavigationHeader bound-but-
// invisible fill = capability seed" — capability-present-unused, never
// drift). `visible` is captured as authored (true or false, never omitted)
// so the diff can track a capability flipping on later.
function buildLatentCapabilities(capSnapshots) {
  return (capSnapshots || []).map((cap) => ({
    id: cap.id,
    name: cap.name,
    visible: cap.visible,
    binding: cap.binding,
  }));
}

// SPACER NAMING (vault ruling, token-rulings.md "Spacer instance renaming IS
// the interface convention"): the DS spacer COMPONENT is SpaceVertical/
// SpaceHorizontal; block-internal instances of it MUST be renamed to their
// function. Flag both violations: (a) an instance left un-renamed (still
// bearing the raw component name), (b) a malformed rename (typo, wrong
// case, kebab-case, etc).
const CANONICAL_SPACER_INSTANCE_NAMES = new Set(["SpacerTop", "SpacerBottom", "SpacerHorizontal", "SpacerVertical"]);
const RAW_SPACER_COMPONENT_NAMES = new Set(["SpaceVertical", "SpaceHorizontal"]);

// A variant's own .name is a per-variant property string (e.g. "size=8"),
// never the addressable identity — that's the COMPONENT_SET's name (e.g.
// "SpaceVertical"). Every caller matching a main component against a known
// DS component name (spacer detection here; buildTemplateInstanceSnapshot's
// `component` field in code.js) must resolve through the set, or every
// variant member of a set silently fails the match. Falls back to the
// component's own name for a standalone (non-variant) component.
function resolveComponentSetName(component) {
  if (!component) return null;
  if (component.parent && component.parent.type === "COMPONENT_SET") {
    return component.parent.name;
  }
  return component.name;
}

// ORPHANED COMPONENT (operator ruling 2026-08-02, vault decisions/capture-
// ui-feel-verdict-2026-08-01.md Addenda 13-14): true only for a resolved
// main component (already-fetched live node, never called on `null` —
// unresolvable is unknown, not orphaned) that is BOTH detached from any
// page (parent null/undefined, the "deleted master" signal
// @figma/plugin-typings documents on BaseNode.parent) AND not a remote
// library component (ComponentNode.remote === true is a legitimate,
// published-elsewhere component and must never warn).
function isOrphanedComponent(component) {
  return !!component && !component.parent && component.remote !== true;
}

function buildMalformedSpacerNameWarnings(spacerInstances) {
  const warnings = [];
  for (const inst of spacerInstances || []) {
    if (CANONICAL_SPACER_INSTANCE_NAMES.has(inst.name)) continue;
    const label = inst.path || inst.name;
    if (RAW_SPACER_COMPONENT_NAMES.has(inst.name)) {
      warnings.push({
        type: "malformed_spacer_name",
        nodeId: inst.id || null,
        nodeName: inst.name,
        context: label,
        message: `${label} is an un-renamed ${inst.name} spacer instance — rename to SpacerTop/SpacerBottom/SpacerHorizontal/SpacerVertical.`,
      });
    } else {
      warnings.push({
        type: "malformed_spacer_name",
        nodeId: inst.id || null,
        nodeName: inst.name,
        context: label,
        message: `${label} has a malformed spacer name "${inst.name}" — expected one of SpacerTop/SpacerBottom/SpacerHorizontal/SpacerVertical.`,
      });
    }
  }
  return warnings;
}

// OVERRIDE INTERFACE SURFACE: duplicate_sibling_name only matters where a
// name collision actually breaks the id-first/name-fallback correlation an
// operator or diff depends on — a block's own addressable layers, never the
// deep implementation nodes beneath them (icon vector internals routinely
// reuse names like "base"/"Vector" by the dozen; they're never targeted by
// name and were flooding this check tree-wide). In scope: the direct
// children of a COMPONENT (a block's own top-level layers) or a FRAME (an
// Example template's top-level instances) — a "boundary" node — plus one
// more level for a dot-prefixed sub-component (the documented private-prefix
// override surface). Nothing deeper than that.
function isOverrideSurfaceBoundary(node) {
  return !!node && (node.type === "COMPONENT" || node.type === "FRAME");
}

function nextRecordState(node, nodeWasRecorded) {
  if (isOverrideSurfaceBoundary(node)) return true;
  return !!nodeWasRecorded && typeof node.name === "string" && node.name.startsWith(".");
}

// DUPLICATE SIBLING NAMES: the id-first/name-fallback correlation every v2
// diff function uses (diffComponentSets, diffExampleStructure,
// diffTemplateFrames, diffLatentCapabilities in capture-listener.mjs) falls
// back to matching by name among siblings when an id isn't stable. A name
// collision only actually threatens that fallback when the colliding
// siblings are DIFFERENT THINGS sharing a name — different node types, or
// (for instances) different main components AND different component sets.
// Same-named siblings that are all instances of the SAME main component are
// interchangeable repeats (the DS-intended "I have a row, not specifically 6
// rows" case — vault decisions/capture-ui-feel-verdict-2026-08-01.md
// Addendum 8). So are same-named siblings that are instances of DIFFERENT
// variants of the SAME component set (e.g. ActionButton instances each set
// to a different variant of the ActionButton component set) — a variant of
// one set is still DS-interchangeable with its siblings; the set, not the
// individual variant node, is the addressable identity. Either way the
// name-fallback lands on an equivalent node, so the collision is harmless
// and is not flagged. `nodeSnapshots` is expected to already be scoped to
// the override interface surface (see isOverrideSurfaceBoundary/
// nextRecordState above) by the caller's traversal — this function itself
// has no opinion on scope, only on collision.
//
// NAME FALLBACK (nested-instance gap, vault decisions/capture-ui-feel-
// verdict-2026-08-01.md + memories/token-rulings.md LayoutGrid entry's
// sibling ruling): mainComponentId/componentSetId come from one
// getMainComponentAsync() round trip per node (see code.js's
// createSubtreeWalk visit(), the instanceMainComponent/
// instanceComponentSetId block feeding the nodeSnapshot push at ~1451-1462)
// and can legitimately resolve to null for a node reached only through
// nested-instance internals — same-set repeats that far down (e.g. two
// ActionButtonIcon slider-arrow variants inside a .ControlSlider instance
// nested inside a HeaderSection instance) still need the interchangeability
// check to fire even when the id chain came back empty. The resolved
// component-SET NAME (mainComponentSetName — the same string
// resolveComponentSetName already produces for every instance in the walk)
// is a second, independent identity signal computed off the SAME lookup:
// when the id-based check can't decide (both sides null), a matching name
// is still proof the two nodes are variants of the one interchangeable set.
//
// GROUND TRUTH (operator's v1.26.2 sync, diagnostic artifact — see
// buildDuplicateSiblingNameWarnings' `resolution` field below, and vault
// decisions/capture-ui-feel-verdict-2026-08-01.md): the previous
// "componentSetId alone gates, either side truthy vetoes" rule was ALSO
// wrong, in the opposite direction from the mainComponentId bug it fixed —
// it treated a componentSetId resolved on ONE side and null on the OTHER
// as a decided difference, when null is UNKNOWN, not "different". Real
// data proved two distinct failure shapes:
//   - ActionButtonIcon (x40 survivors): mainComponentId "919:6993",
//     componentSetId NULL. ActionButtonIconEllipse is a slash-named
//     STANDALONE component family, not a component SET at all (no
//     componentSets[] entry exists for it) — its variants are separate
//     component nodes named "Family/axis/axis/.../slot" (e.g.
//     ".../default/right" vs ".../default/left"), so there is no set id to
//     ever resolve, on EITHER sibling, and mainComponentId legitimately
//     differs (two different named components). The full name legitimately
//     differs too (".../right" vs ".../left") — only the FAMILY (the
//     string before the first "/") is the shared identity.
//   - SpacerVertical (x8 survivors): componentSetId "30:159" resolved
//     (SpacerVertical IS a real 13-variant set) on the flagged node, but
//     the OLD gate (`a.componentSetId || b.componentSetId`) flagged it
//     anyway — meaning the colliding sibling's componentSetId came back
//     null. One side resolved, one side didn't: that is NOT two distinct,
//     confirmed component sets — it's a missing data point, and the name
//     (both sides agree: "SpacerVertical") is the only usable signal.
//
// mainComponentId is checked FIRST and stays a pure equality decision — a
// match here is always an exact same-component repeat, never ambiguous.
// componentSetId only DECIDES when BOTH sides resolved it (present on a
// AND b): equal -> interchangeable, unequal -> two confirmed, distinct
// sets, always flagged, name never gets a turn. The moment EITHER side's
// componentSetId is null, id resolution has nothing decided to say, and
// control falls to the name — compared by FAMILY (exact string equality,
// or an equal first "/"-segment when the full strings differ), computed
// only when BOTH names are non-null; two null names can't establish
// anything and stay flagged (rule 5 — conservative by default, since a
// false "these are the same" is worse than a false "still ambiguous").
function sameComponentFamily(nameA, nameB) {
  if (nameA === null || nameB === null) return false;
  if (nameA === nameB) return true;
  return nameA.split("/")[0] === nameB.split("/")[0];
}

function siblingsAreInterchangeable(a, b) {
  if (a.type !== b.type) return false;
  if (a.type !== "INSTANCE") return false;
  if (!!a.mainComponentId && a.mainComponentId === b.mainComponentId) return true;
  const bothSetIdsResolved = !!a.componentSetId && !!b.componentSetId;
  if (bothSetIdsResolved) return a.componentSetId === b.componentSetId;
  return sameComponentFamily(a.mainComponentSetName || null, b.mainComponentSetName || null);
}

// SPACER SIBLING EXEMPTION (operator ruling 2026-08-02, vault
// decisions/capture-ui-feel-verdict-2026-08-01.md Addenda 13-14): the spacer-
// naming rule above (CANONICAL_SPACER_INSTANCE_NAMES) forces every spacer
// instance in a stack to carry one of four function names, so duplicate
// canonical-named spacer siblings are inevitable and intended — not the
// id/name-fallback ambiguity duplicate_sibling_name exists to catch. A
// "spacer-set instance" reuses the malformed-spacer checker's identification
// (RAW_SPACER_COMPONENT_NAMES — the pre-rename component names), extended to
// also accept a resolved set name that already IS one of the canonical
// function names: the live SplitAsymmetric/feed/.CardMedia/content stack's
// real SpacerVertical component set (id 30:159, see the GROUND TRUTH b test
// above) resolves its mainComponentSetName to the string "SpacerVertical"
// itself, not "SpaceVertical" — these are FALSE POSITIVES of same-set
// stacked spacers, not related to any legacy component.
function isSpacerSetInstance(node) {
  if (!node || node.type !== "INSTANCE" || !node.mainComponentSetName) return false;
  return RAW_SPACER_COMPONENT_NAMES.has(node.mainComponentSetName) || CANONICAL_SPACER_INSTANCE_NAMES.has(node.mainComponentSetName);
}

// An INSTANCE with no resolved main-component identity yet — unresolvable,
// not disqualifying. Per the ruling: "unresolvable members do NOT break the
// exemption — null is unknown."
function isUnresolvedSpacerCandidate(node) {
  return !!node && node.type === "INSTANCE" && !node.mainComponentSetName;
}

// Exempt a sibling group only when its shared name IS one of the four
// canonical spacer names AND every member either resolved to a spacer-set
// instance or didn't resolve at all. A member that resolved to something
// else (a real different component, or a non-instance node) still breaks
// the exemption and falls through to the normal interchangeability check.
function spacerSiblingGroupExempt(name, group) {
  if (!CANONICAL_SPACER_INSTANCE_NAMES.has(name)) return false;
  return group.every(function (node) {
    return isUnresolvedSpacerCandidate(node) || isSpacerSetInstance(node);
  });
}

function buildDuplicateSiblingNameWarnings(nodeSnapshots) {
  const byParent = new Map();
  for (const node of nodeSnapshots || []) {
    const key = node.parentId || "";
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(node);
  }
  const warnings = [];
  for (const siblings of byParent.values()) {
    const byName = new Map();
    for (const node of siblings) {
      const key = node.name;
      if (!byName.has(key)) byName.set(key, []);
      byName.get(key).push(node);
    }
    for (const group of byName.values()) {
      if (group.length < 2) continue;
      if (spacerSiblingGroupExempt(group[0].name, group)) continue;
      const first = group[0];
      const allInterchangeable = group.every(function (node) {
        return siblingsAreInterchangeable(first, node);
      });
      if (allInterchangeable) continue;
      const node = group[1];
      const context = node.parentPath || siblings[0].parentId || null;
      warnings.push({
        type: "duplicate_sibling_name",
        nodeId: node.id || null,
        nodeName: node.name,
        context: context,
        message: `Duplicate sibling name "${node.name}" under ${context} — layer names must be unique among siblings for stable id/name-fallback matching.`,
        // DIAGNOSTIC (operator's v1.26.1 syncs, still 48 duplicate_sibling_name
        // survivors after the setId-only gate — our resolution inferences are
        // wrong somewhere and hypothesizing further isn't finding it).
        // Additive, duplicate_sibling_name-only field: the flagged node's own
        // resolved identity, exactly as the walk populated it on the
        // nodeSnapshot (see code.js's createSubtreeWalk visit()) — null
        // preserved as null, never coerced away, so the next artifact shows
        // which of the three actually failed to resolve instead of us
        // guessing again. No predicate change this round.
        resolution: {
          mainComponentId: node.mainComponentId || null,
          componentSetId: node.componentSetId || null,
          mainComponentSetName: node.mainComponentSetName || null,
        },
      });
    }
  }
  return warnings;
}

// AXIS OWNERSHIP VIOLATION: an M-/D-Example frame pair is one layout
// opinion rendered through each block's device axis (vault ruling — "M/D
// divergence the device axis can't explain = machine-detectable
// inconsistency"). Frames pair by name (M-<base> / D-<base>); instances
// within a pair correlate by NAME GROUP first (all instances sharing one
// instance name, e.g. every "SplitContent" in the frame), since a frame
// interleaves several block roles in an order that differs freely between
// M and D (found live against the 2026-07-31 capture: M-Project opens with
// its 2 NavigationHeader instances, D-Project's single NavigationHeader
// sits at the very end) — comparing by raw array position across the WHOLE
// instances[] list, ignoring role, misaligns every block after the first
// count difference. Within one name group:
//   - if either side has exactly ONE instance of that name, every instance
//     on the other (possibly repeating) side is a genuine layout opinion
//     compared against that lone shared opinion (e.g. NavigationHeader's
//     mobile split into title/actions instances vs desktop's one combined
//     instance — both mobile instances legitimately diverge from the one
//     desktop opinion; real Group-A-style divergence, never downgraded);
//   - if BOTH sides repeat the name (content-driven blocks like
//     SplitContent), instances correlate POSITIONALLY within the group (the
//     Example frame's own authoring order for that repeat) over the shared
//     prefix; a position past the shorter side's count is a distinct
//     unpaired_template_instance warning, never a value-divergence false
//     positive. (The previous implementation instead built ONE Map keyed by
//     instance name across the whole D-side list — last-write-wins on the
//     repeated "SplitContent" key — then compared every M "SplitContent"
//     instance against that single collapsed last-D-instance value: 8 of
//     M-Project's 9 SplitContent instances differed from it, producing 8
//     false warnings, even though the two sides' SplitContent sequences
//     actually agreed position-for-position.)
// The separator is matched loosely (`\s*-\s*`) because the real Example
// frame naming convention is "M - Home" / "D - Home" (spaced en-dash-style
// hyphen), not the bare "M-Home" the original regex required — the bare
// form still matches too.
function groupInstancesByName(instances) {
  const groups = new Map();
  for (const inst of instances || []) {
    if (!groups.has(inst.name)) groups.set(inst.name, []);
    groups.get(inst.name).push(inst);
  }
  return groups;
}

// RATIFIED AXIS EXCEPTIONS (operator ruling 2026-08-01, vault
// memories/token-rulings.md "NavigationHeader M/D split composition is
// INTENDED"): a documented, cited exception to the axis-ownership rule —
// NavigationHeader's mobile split into title/actions instances vs desktop's
// single title+actions instance is a ratified multi-instance composition,
// not divergence. Keyed by the instance/component name (mInst.name — the
// same identity groupInstancesByName groups on), with an optional `axis`
// restriction so a future exception can scope to one axis without opening
// every axis on that component. A match downgrades the would-be violation
// to the distinct `ratified_axis_exception` informational type instead of
// silently dropping it — the suppression stays visible and auditable.
const RATIFIED_AXIS_EXCEPTIONS = {
  NavigationHeader: {
    axis: "layout",
    citation: "operator ruling 2026-08-01, vault memories/token-rulings.md",
  },
};

function findRatifiedAxisException(name, axis) {
  const exception = RATIFIED_AXIS_EXCEPTIONS[name];
  if (!exception) return null;
  if (exception.axis && exception.axis !== axis) return null;
  return exception;
}

// DEVICE-OWNED AXES (operator ruling 2026-08-01, vault memories/token-
// rulings.md "LayoutGrid `columns` is a device-owned axis"): distinct from a
// RATIFIED_AXIS_EXCEPTION — an exception downgrades a genuine divergence to
// a visible, auditable informational record; a device-owned axis is proper
// axis ownership (like the built-in `device` axis itself,
// AXIS_OWNERSHIP_DEFAULT_BLOCK_OWNED_AXIS) and produces NO warning of
// either type, silently, exactly like `device`. Keyed by COMPONENT (the
// instance/component name — same identity RATIFIED_AXIS_EXCEPTIONS keys
// on) to a list of its device-owned axis names, so a future ruling is a
// one-line addition here, never a new special case in the loop below.
const DEVICE_OWNED_AXES = {
  LayoutGrid: ["columns"],
};

function isDeviceOwnedAxis(name, axis) {
  const axes = DEVICE_OWNED_AXES[name];
  return !!axes && axes.includes(axis);
}

function compareInstancePair(base, mInst, dInst) {
  const warnings = [];
  const mVariant = mInst.variantProps || {};
  const dVariant = dInst.variantProps || {};
  const axes = new Set([...Object.keys(mVariant), ...Object.keys(dVariant)]);
  for (const axis of axes) {
    if (axis === AXIS_OWNERSHIP_DEFAULT_BLOCK_OWNED_AXIS) continue;
    if (isDeviceOwnedAxis(mInst.name, axis)) continue;
    if (JSON.stringify(mVariant[axis]) === JSON.stringify(dVariant[axis])) continue;
    const exception = findRatifiedAxisException(mInst.name, axis);
    if (exception) {
      warnings.push({
        type: "ratified_axis_exception",
        nodeId: mInst.id || null,
        nodeName: mInst.name,
        context: `${base}/${axis}`,
        message: `${base}: instance "${mInst.name}" has divergent ${axis} between M-${base} (${JSON.stringify(mVariant[axis])}) and D-${base} (${JSON.stringify(dVariant[axis])}) — ratified exception (${exception.citation}), not a violation.`,
      });
      continue;
    }
    warnings.push({
      type: "axis_ownership_violation",
      nodeId: mInst.id || null,
      nodeName: mInst.name,
      context: `${base}/${axis}`,
      message: `${base}: instance "${mInst.name}" has divergent ${axis} between M-${base} (${JSON.stringify(mVariant[axis])}) and D-${base} (${JSON.stringify(dVariant[axis])}) — a layout holds one opinion per non-device axis.`,
    });
  }
  return warnings;
}

function buildAxisOwnershipViolationWarnings(templateFrames) {
  const pairsByBase = new Map();
  for (const frame of templateFrames || []) {
    const match = /^([MD])\s*-\s*(.+)$/.exec(frame.name);
    if (!match) continue;
    const [, prefix, base] = match;
    if (!pairsByBase.has(base)) pairsByBase.set(base, {});
    pairsByBase.get(base)[prefix] = frame;
  }

  const warnings = [];
  for (const [base, pair] of pairsByBase) {
    if (!pair.M || !pair.D) continue;
    const mGroups = groupInstancesByName(pair.M.instances);
    const dGroups = groupInstancesByName(pair.D.instances);

    for (const name of new Set([...mGroups.keys(), ...dGroups.keys()])) {
      const mList = mGroups.get(name) || [];
      const dList = dGroups.get(name) || [];
      if (!mList.length || !dList.length) continue; // no counterpart on one side at all — a different check's job

      if (mList.length === 1 || dList.length === 1) {
        for (const mInst of mList) {
          for (const dInst of dList) {
            warnings.push(...compareInstancePair(base, mInst, dInst));
          }
        }
        continue;
      }

      const sharedCount = Math.min(mList.length, dList.length);
      for (let i = 0; i < sharedCount; i++) {
        warnings.push(...compareInstancePair(base, mList[i], dList[i]));
      }

      const mCount = mList.length;
      const dCount = dList.length;
      const extraSide = mCount > dCount ? "M" : "D";
      const extraList = extraSide === "M" ? mList : dList;
      for (let i = sharedCount; i < extraList.length; i++) {
        const inst = extraList[i];
        const otherSide = extraSide === "M" ? "D" : "M";
        warnings.push({
          type: "unpaired_template_instance",
          nodeId: inst.id || null,
          nodeName: inst.name,
          context: `${base}/${extraSide}`,
          message: `${base}: ${extraSide}-${base} instance "${inst.name}" at position ${i} has no ${otherSide}-${base} counterpart (M has ${mCount}, D has ${dCount} instance(s) named "${name}").`,
        });
      }
    }
  }
  return warnings;
}

// LATENT CAPABILITY: bound-but-hidden, not name-pattern-matched. The
// canonical case — NavigationHeader's bound-but-invisible fill — has no
// naming convention to key off: the operator explicitly vetoed adding one
// (vault ruling "NavigationHeader has-background prop VETOED... No
// boolean."). The only real signal left is structural: a paint carries a
// bound variable and isn't currently rendering — either the paint's own
// `visible` is false, or the node carrying it is invisible.
function isBoundButHiddenPaint(paint, node) {
  if (!paint) return false;
  const paintVisible = paint.visible !== false;
  const nodeVisible = !node || node.visible !== false;
  return !(paintVisible && nodeVisible);
}

// One latentCapabilities entry per bound-but-hidden paint across a node's
// FULL fills+strokes arrays — a prior version only ever checked fills[0]/
// strokes[0], silently missing every other bound-but-hidden paint on a node
// with more than one (adopt-list #5, a real bug, not a design choice).
// `resolvedPaints` is [{paint, binding}] — the async alias-to-name
// resolution happens in code.js's live traversal (needs variableById +
// figma.getVariableByIdAsync); this function is the pure per-paint filter/map
// so the "check every paint, not just the first" fix is unit-testable
// without a figma.* dependency.
function collectNodeLatentCapabilities(node, resolvedPaints) {
  const out = [];
  for (const entry of resolvedPaints || []) {
    if (entry.binding && isBoundButHiddenPaint(entry.paint, node)) {
      out.push({ id: node.id, name: node.name, visible: node.visible !== false, binding: entry.binding });
    }
  }
  return out;
}

// serializeColor: an unbound RGB/RGBA color -> "#rrggbb" hex, or, when alpha
// is present and not fully opaque, "rgba(r, g, b, a)" with alpha rounded to
// 4 decimals — matches reference implementation A's serializeColor (adopt-
// list #2), replacing the raw {r,g,b,a} object every unbound color field
// (paint/effect/grid/gradient-stop colors) previously emitted verbatim.
// NOTE: this changes what stableStringify hashes those fields to, so the
// FIRST sync after this ships will show every unbound color field as
// "modified" once, even with no real edit — see this change's commit
// message.
function serializeColor(color) {
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  const hex =
    "#" +
    [r, g, b]
      .map((c) => c.toString(16).padStart(2, "0"))
      .join("");
  if (typeof color.a === "number" && color.a !== 1) {
    return "rgba(" + r + ", " + g + ", " + b + ", " + parseFloat(color.a.toFixed(4)) + ")";
  }
  return hex;
}

// components{}: the v1 standalone+sets+variants+layer-bindings export the v2
// rewrite dropped, leaving the listener's diffComponents/diffSetBindings
// component-diff lane permanently dead (capture plugin A/B comparison
// 2026-07-30, adopt-list #1 — CONFIRMED lost functionality, not a deliberate
// removal). Reshaped from reference implementation A's collectComponents/
// collectComponentBindings to the listener's OWN existing contract
// (scripts/capture-listener.mjs's validateExportShape + diffComponents):
// components: { standalone: [{name, key, properties}], sets: [{name, key,
// properties, variants: [{name, key, bindings: [{layer, property,
// value}]}]}] } — NOT A's flat components[]+componentSets[] split with
// name-split variant-property parsing (vetoed; the listener already derives
// variant identity from componentSets[]/componentPropertyDefinitions
// elsewhere, and componentSetKey/variantProperties fields don't exist on
// this contract).
//
// Property definitions are reshaped to {defaultValue, options} — the exact
// shape diffComponents' diffProps reads (`oldProp.defaultValue`,
// `oldProp.options`) — never Figma's own componentPropertyDefinitions shape
// ({type, defaultValue, variantOptions, preferredValues}), which stays
// verbatim in the separate componentSets[] v2 bucket (buildComponentSets
// above) since that bucket's own diff (diffComponentSets) never reads
// component-diff's `properties` field at all.
function buildComponentProperties(componentPropertyDefinitions) {
  const out = {};
  for (const key of Object.keys(componentPropertyDefinitions || {})) {
    const def = componentPropertyDefinitions[key];
    const propOut = { defaultValue: def.defaultValue };
    if (Array.isArray(def.variantOptions)) propOut.options = def.variantOptions.slice();
    out[key] = propOut;
  }
  return out;
}

// snapshot: { standalone: [{key,name,componentPropertyDefinitions}], sets:
// [{key,name,componentPropertyDefinitions,variants:[{key,name,bindings}]}] }
// — code.js's traversal reads live nodes into this shape (no figma.* calls
// in this function); variants[].bindings are already-resolved
// {layer,property,value} entries collected during the SAME walkV2Subtree
// pass that gathers nodeSnapshots/spacerInstances/latentCapabilities (never
// a second per-component tree walk, never a getNodeByIdAsync refetch of a
// node the traversal already holds a reference to — reference implementation
// A's per-component refetch-after-the-fact is exactly what this avoids).
function buildComponents(snapshot) {
  const input = snapshot || {};
  const standalone = (input.standalone || []).map((c) => ({
    name: c.name,
    key: c.key,
    properties: buildComponentProperties(c.componentPropertyDefinitions),
  }));
  const sets = (input.sets || []).map((set) => ({
    name: set.name,
    key: set.key,
    properties: buildComponentProperties(set.componentPropertyDefinitions),
    variants: (set.variants || []).map((variant) => ({
      name: variant.name,
      key: variant.key,
      bindings: variant.bindings || [],
    })),
  }));
  return { standalone, sets };
}

// header.propskitAvailable: whether Figma's fig-* web components (see
// ~/JHD/design-tools/shared/figma-props-kit/'s README — availability inside
// a plugin iframe is documented there as UNVERIFIED) turned out to be
// registered in THIS session's UI iframe. Only ui.html can answer this — the
// main-thread sandbox this file runs in has no DOM/customElements at all —
// so the boolean arrives over the same postMessage round-trip as every other
// UI-owned fact this file consumes. Coerced to a real boolean and defaulted
// false (never omitted) so a payload built before the UI's probe message
// arrives still reports a definite, non-optimistic answer.
function buildHeaderPropskitField(propskitAvailable) {
  return { propskitAvailable: !!propskitAvailable };
}

// ORPHANED COMPONENT INSTANCE (operator ruling 2026-08-02, vault decisions/
// capture-ui-feel-verdict-2026-08-01.md Addenda 13-14): an INSTANCE whose
// resolved main component still EXISTS as a node (getMainComponentAsync/
// mainComponent returned something) but is detached from any page — parent
// null/undefined, per @figma/plugin-typings' own note on BaseNode.parent
// ("Components accessed via instance.getMainComponentAsync()/
// instance.mainComponent do not always have a parent. They could be remote
// components or soft-deleted components") — and is NOT remote
// (ComponentNode.remote === true means a legitimate library component,
// published from elsewhere; never a warning). code.js's walk does the live
// parent/remote check (isOrphanedComponent — a live-node-only predicate,
// see its own comment there) and only pushes a node into
// `orphanedInstances` once that's already decided true; an unresolvable
// main component (null) never reaches this list at all — unknown is never
// orphaned, only a confirmed deleted master is. This function only shapes
// the already-collected records into typed warnings, exactly like
// buildMalformedSpacerNameWarnings does for spacerInstances.
function buildOrphanedComponentInstanceWarnings(orphanedInstances) {
  const warnings = [];
  for (const inst of orphanedInstances || []) {
    const label = inst.path || inst.name;
    warnings.push({
      type: "orphaned_component_instance",
      nodeId: inst.id || null,
      nodeName: inst.name,
      context: label,
      mainComponentName: inst.mainComponentName || null,
      mainComponentSetName: inst.mainComponentSetName || null,
      message: `${label} is an instance of ${JSON.stringify(inst.mainComponentName || "an unknown component")}, a component that no longer exists in this file — swap it for a current component.`,
    });
  }
  return warnings;
}

// warnings[]: the plugin's structural-lint bucket — combines every lint
// type into one flat array of typed records {type, nodeId, nodeName,
// context, message} (per the published contract and its listener/test
// consumers — a prior version emitted plain strings here, which broke any
// consumer keying on `.type`).
function buildWarnings(input) {
  const snapshot = input || {};
  return [
    ...buildMalformedSpacerNameWarnings(snapshot.spacerInstances),
    ...buildDuplicateSiblingNameWarnings(snapshot.nodeSnapshots),
    ...buildAxisOwnershipViolationWarnings(snapshot.templateFrames),
    ...buildOrphanedComponentInstanceWarnings(snapshot.orphanedInstances),
  ];
}

// warningsByType: warnings[] (see buildWarnings above) grouped into a
// {type: count} map — the compact shape clientStorage persists (see
// code.js's LAST_SYNC_STORAGE_KEY comment) and ui.html's renderCounts()
// consumes for the restored-on-reload WARNINGS section, since the raw
// warnings[] array itself is deliberately not persisted.
function computeWarningsByType(warnings) {
  const byType = {};
  for (const w of warnings || []) {
    const key = w && w.type ? w.type : "unknown";
    byType[key] = (byType[key] || 0) + 1;
  }
  return byType;
}

// The clientStorage payload shape written by code.js's saveLastSyncToStorage
// and read back by loadLastSyncFromStorage — see LAST_SYNC_STORAGE_KEY's
// comment for the persisted-shape contract and what's deliberately excluded.
function buildSyncStoragePayload(atMs, count, summary, warningCount, header, warnings) {
  return {
    lastSyncAt: atMs,
    lastSyncCount: count,
    summary: summary || null,
    warningCount: warningCount || 0,
    header: header
      ? { counts: header.counts, styleCounts: header.styleCounts, componentCounts: header.componentCounts }
      : null,
    warningsByType: computeWarningsByType(warnings),
  };
}

// The "sync-status"/"restored" postMessage code.js sends ui.html at boot
// when a prior session's sync was found in clientStorage — coerces every
// field defensively since `stored` is whatever a past version of this
// plugin wrote (a reload might be reading a payload from before a field
// existed).
function buildRestoredSyncMessage(stored) {
  return {
    type: "sync-status",
    state: "restored",
    lastSyncAt: stored.lastSyncAt,
    lastSyncCount: typeof stored.lastSyncCount === "number" ? stored.lastSyncCount : 0,
    summary: stored.summary || null,
    warningCount: typeof stored.warningCount === "number" ? stored.warningCount : 0,
    header: stored.header || null,
    warningsByType: stored.warningsByType || {},
  };
}

// === END SCHEMA V2 TRANSFORM ===

// --- schema v2: live document traversal -------------------------------------
//
// Feeds the pure SCHEMA V2 TRANSFORM functions above with already-read
// snapshots off the live document. Two traversal roots:
//   - every page's COMPONENT_SET nodes (except "Example") -> componentSets[]
//     + the latent-capability/spacer/duplicate-sibling scan of each set's
//     variant tree.
//   - the page literally named "Example" -> exampleStructure[] (its SECTION
//     children) + templateFrames[] (each section frame's direct INSTANCE
//     children, resolved) + the same spacer/duplicate-sibling scan.
//
// figma.skipInvisibleInstanceChildren defaults to false, but is set
// explicitly in buildExport() below — latentCapabilities and the spacer/
// duplicate-sibling warnings both depend on walking into invisible nodes (a
// capability is latent precisely because it's hidden today), so this must
// never be true during a v2 export.

// === JUMP TO NODE (pure ancestor/page resolution — tested via jump-to-
// node.test.mjs, which extracts this block by its markers and evals it
// standalone, same technique as RESIZE DEDUP) ===
//
// JUMP TO NODE (operator request 2026-08-02): every FIGMA HYGIENE "where it
// shows up" entry is clickable — selects + scrolls the flagged node into
// view. getNodeByIdAsync resolves a live node reference (including nested-
// instance ids, "I…;…;…" — supported directly, no special-casing needed),
// but two live-node facts still need resolving before figma.currentPage.
// selection/figma.viewport.scrollAndZoomIntoView can be called: (a) is the
// node itself directly selectable (a PAGE/DOCUMENT node isn't — walk up to
// the nearest ancestor that is), and (b) which PAGE actually owns it (this
// manifest is documentAccess:"dynamic-page" — figma.currentPage is READ-ONLY,
// figma.setCurrentPageAsync(page) is required before selecting a node on a
// different page; verified against @figma/plugin-typings' plugin-api.d.ts
// currentPage/setCurrentPageAsync doc comments). Both walks only read
// .type/.parent — no figma.* call — so this is pure and testable with plain
// mock node objects, same shape as the SUBTREE WALK tests' node() helper.
function isSelectableNodeType(type) {
  return typeof type === "string" && type !== "PAGE" && type !== "DOCUMENT";
}

function findSelectableAncestor(node) {
  let cur = node;
  while (cur && !isSelectableNodeType(cur.type)) {
    cur = cur.parent;
  }
  return cur || null;
}

function findOwningPage(node) {
  let cur = node;
  while (cur && cur.type !== "PAGE") {
    cur = cur.parent;
  }
  return cur || null;
}

// Nearest INSTANCE ancestor STRICTLY above `node` (never `node` itself) —
// used by the COPY AND MODE-PIN WALK to resolve a text node's
// componentContext back to the instance whose TEXT component property
// drives its characters. Same walk-up-.parent idiom as
// findSelectableAncestor/findOwningPage above; pure and testable with plain
// mock node objects.
function findEnclosingInstance(node) {
  let cur = node.parent;
  while (cur) {
    if (cur.type === "INSTANCE") return cur;
    cur = cur.parent;
  }
  return null;
}

// Resolves a live node (already fetched via getNodeByIdAsync) into what
// selecting/scrolling to it actually needs: {selectableNode, page,
// usedAncestor}. Returns null for a stale/removed node, or one with no
// selectable ancestor / no owning page at all (both defensive — never seen
// on a real document, but the null-is-unknown principle applies here too:
// an unresolvable target is never guessed at). `node.removed` (true once a
// node is deleted from the document — see BaseNodeMixin) catches the "stale
// capture, node no longer exists" case the caller reports in the approved
// voice.
function resolveJumpTarget(node) {
  if (!node || node.removed) return null;
  const selectableNode = findSelectableAncestor(node);
  if (!selectableNode) return null;
  const page = findOwningPage(selectableNode);
  if (!page) return null;
  return { selectableNode: selectableNode, page: page, usedAncestor: selectableNode !== node };
}
// === END JUMP TO NODE ===

const getNodeById = gatePluginCall(async function getNodeById(id) {
  if (typeof figma.getNodeByIdAsync === "function") {
    return figma.getNodeByIdAsync(id);
  }
  if (typeof figma.getNodeById === "function") {
    return figma.getNodeById(id);
  }
  return null;
});

const getInstanceMainComponent = gatePluginCall(async function getInstanceMainComponent(instance) {
  if (typeof instance.getMainComponentAsync === "function") {
    return instance.getMainComponentAsync();
  }
  return instance.mainComponent;
});

// Relative "{node-name-path}" from `root` down to `node`, joined by "/" —
// the human-legible half of the {instance-id}/{node-name-path} override id.
// `root` itself resolves to its own name (a node found via getNodeById that
// turns out to be the instance root itself still needs a legible label).
function nodeNamePath(node, root) {
  if (node === root) return node.name;
  const names = [];
  let cur = node;
  while (cur && cur !== root) {
    names.unshift(cur.name);
    cur = cur.parent;
  }
  return names.join("/");
}

// Resolves a paint's bound variable (boundVariables.color) to
// "collection/name" — the same alias target resolveAliasNotation reaches,
// minus its "→ " diff-arrow prefix (latentCapabilities.binding is a path,
// not a diff notation).
async function resolveCapabilityBinding(paint, variableById) {
  const alias = paint && paint.boundVariables ? paint.boundVariables.color : undefined;
  if (!isAlias(alias)) return null;
  const notation = await resolveAliasNotation(alias, variableById);
  return typeof notation === "string" ? notation.replace(/^→ /, "") : null;
}

// COMPONENT-INTERNALS BINDING CHAIN (adopt-list #1): which variable/style/
// nested-instance a variant's own layer is bound to — the listener's
// diffSetBindings input (components.sets[].variants[].bindings). Values are
// the plain "{collection}/{name}" or style/instance name (never the "→ "
// alias-arrow prefix the variables/styles sections use) — a binding here is
// a fact about what a layer currently resolves to, not an alias-vs-raw
// distinction, so a value changing IS the changelog-worthy event
// (layer_binding_changed, e.g. a nested instance's variant swap or a text
// style rename resolving to a different name).
// === LAYER BINDINGS (lookups injected — tested via buildexport-perf.test.mjs,
// which extracts this block by its markers and diffs it against the round-2
// batched implementation it replaced) ===
// REVERTED (perf round 2 revert, operator verdict 2026-08-01: net loss in
// the plugin sandbox — see the SUBTREE WALK comment above for the full
// finding). Restored to the round-1 shape: each lookup is awaited and
// pushed in place, one at a time, in exactly the order the sequential
// version pushed them. The id cache (93f8924, getStyleById/
// getVariableByIdCached) and the call gate on the underlying leaf accessors
// are untouched — this is purely the batching/enumeration shape, not the
// cached round trips underneath it.
function createLayerBindingCollector(api) {
  return async function collectLayerBindingEntries(node, layer, variableById, bindingsOut, seen) {
    function push(property, value) {
      if (value === null || value === undefined) return;
      // Keyed by layer too, not just property+value: `seen` is one Set
      // shared across an entire variant's binding chain (every non-instance
      // child reuses bindingCtx.seen by reference -- see SUBTREE WALK), so a
      // property+value-only key silently drops a real binding fact whenever
      // two DIFFERENT sibling layers happen to resolve to the same token
      // (e.g. two "Subtitle" text layers sharing one typography style -- a
      // normal, expected pattern, not a duplicate to collapse). See
      // binding-cross-layer-dedup.test.mjs and the live-verified
      // subtitle-secondary blind spot it reproduces.
      const key = layer + "\u0000" + property + "\u0000" + value;
      if (seen.has(key)) return;
      seen.add(key);
      bindingsOut.push({ layer: layer, property: property, value: value });
    }

    if (node.boundVariables) {
      for (const prop of Object.keys(node.boundVariables)) {
        const alias = node.boundVariables[prop];
        if (!alias) continue;
        const aliases = Array.isArray(alias) ? alias : [alias];
        for (const a of aliases) {
          if (a && typeof a.id === "string") push(prop, await api.resolveVariableName(a.id, variableById));
        }
      }
    }
    for (const bucket of [
      { paints: node.fills, prefix: "fill" },
      { paints: node.strokes, prefix: "stroke" },
    ]) {
      if (!Array.isArray(bucket.paints)) continue;
      for (const paint of bucket.paints) {
        if (!paint || !paint.boundVariables) continue;
        for (const field of Object.keys(paint.boundVariables)) {
          const alias = paint.boundVariables[field];
          if (alias && typeof alias.id === "string") {
            push(bucket.prefix + "." + field, await api.resolveVariableName(alias.id, variableById));
          }
        }
      }
    }
    for (const field of ["textStyleId", "fillStyleId", "strokeStyleId", "effectStyleId"]) {
      const styleId = node[field];
      if (typeof styleId !== "string" || !styleId) continue;
      const style = await api.getStyleById(styleId);
      push(field.replace(/Id$/, ""), style ? style.name : styleId);
    }
  };
}
// === END LAYER BINDINGS ===

async function resolveBoundVariableName(id, variableById) {
  let target = variableById.get(id);
  if (!target) {
    target = await getVariableByIdCached(id);
    if (target) variableById.set(id, target);
  }
  if (!target) return "[unresolved alias: " + id + "]";
  const collectionName = collectionNameById.get(target.variableCollectionId) || "[unknown collection]";
  return collectionName + "/" + target.name;
}

const collectLayerBindingEntries = createLayerBindingCollector({
  resolveVariableName: function (id, variableById) { return resolveBoundVariableName(id, variableById); },
  // Read through a wrapper: buildExport rebinds getStyleById to a fresh
  // per-export cache each run.
  getStyleById: function (id) { return getStyleById(id); },
});

// Walks `root`'s full subtree (including invisible nodes and instance
// children — see the skipInvisibleInstanceChildren note above), collecting
// the raw snapshots the transform functions need into `out`:
// nodeSnapshots (duplicate_sibling_name — scoped to the override interface
// surface via nextRecordState, not every node visited; spacer/capability
// detection stay full-depth since a spacer or a bound-hidden fill can be
// nested arbitrarily deep inside a block), spacerInstances
// (malformed_spacer_name), latentCapabilities (any bound-but-hidden
// fill/stroke — see isBoundButHiddenPaint).
//
// `collectBindings`: when true (only the componentSetNodes traversal passes
// this — see buildExport), each variant COMPONENT directly under `root` (a
// COMPONENT_SET) gets its own bindings array registered in
// out.variantBindings (keyed by the variant's node id), populated by
// collectLayerBindingEntries as this SAME recursive walk descends through
// the variant's subtree — no second tree walk, no getNodeByIdAsync refetch
// of a node this walk already holds a live reference to (the inefficiency
// reference implementation A's per-component refetch introduced). An
// INSTANCE child gets one "instance" binding entry (its main component's
// name) but the binding chain does not descend further into the instance's
// own internals — they belong to a different component, not this variant.
// === SUBTREE WALK (plugin API injected — tested via
// buildexport-perf.test.mjs, which extracts this block by its markers and
// diffs it against the round-2 parallel implementation it replaced) ===
// REVERTED (perf round 2 revert, operator verdict 2026-08-01: three live
// operator syncs on the same document showed round 2's intra-set sibling
// fan-out was a NET LOSS in the plugin sandbox — every round trip is
// serviced by ONE shared main thread, so the fan-out bought only extra
// queue depth/scheduler bookkeeping, never real parallel execution; see the
// CALL GATE comment for the same finding from the other direction).
// Restored to the round-1 shape (1884562): strictly sequential within a
// set/frame, walking `bindingCtx`'s shared `bindings` array and `seen` set
// directly as the recursion descends, so first-occurrence-wins dedupe is
// simply document order — no result tree, no merge pass. Round 1's
// ACROSS-set parallelism (collectInParallel, below) is untouched; only
// walking siblings INSIDE one set/frame is sequential again.
//
// Proven output-identical differentially in buildexport-perf.test.mjs
// against the round-2 parallel implementation it replaces (reimplemented
// verbatim from git history at b2b85a1), on a fixture whose async
// dependencies all complete in the REVERSE of call order and whose siblings
// deliberately collide on (property, value) — matching output there proves
// the revert changes nothing observable.
function createSubtreeWalk(api) {
  return async function walkV2Subtree(root, variableById, out, collectBindings) {
    async function visit(node, parent, recordHere, bindingCtx) {
      // Resolved once, up front, so both the nodeSnapshot (duplicate-sibling
      // same-main-component/same-component-set check) and the spacer-instance
      // detection below share the same lookup — no second getMainComponentAsync
      // round trip. componentSetId resolves the main component's own parent
      // when that parent is a COMPONENT_SET (a variant's parent) — null for a
      // standalone (non-variant) component, exactly like resolveComponentSetName
      // above but returning the set's id rather than its name.
      const instanceMainComponent = node.type === "INSTANCE" ? await api.getInstanceMainComponent(node) : null;
      const instanceComponentSetId =
        instanceMainComponent && instanceMainComponent.parent && instanceMainComponent.parent.type === "COMPONENT_SET"
          ? instanceMainComponent.parent.id
          : null;

      if (recordHere) {
        out.nodeSnapshots.push({
          id: node.id,
          name: node.name,
          type: node.type,
          mainComponentId: instanceMainComponent ? instanceMainComponent.id : null,
          componentSetId: instanceComponentSetId,
          // siblingsAreInterchangeable's fallback signal (schema-v2-
          // transform.mjs) — same lookup as mainComponentId/componentSetId,
          // no extra round trip.
          mainComponentSetName: instanceMainComponent ? api.resolveComponentSetName(instanceMainComponent) : null,
          parentId: parent ? parent.id : null,
          parentPath: parent ? api.nodeNamePath(parent, root) : null,
        });
      }

      if (node.type === "INSTANCE") {
        const mainComponent = instanceMainComponent;
        const mainComponentSetName = api.resolveComponentSetName(mainComponent);
        if (mainComponentSetName && api.isSpacerSetName(mainComponentSetName)) {
          out.spacerInstances.push({ id: node.id, name: node.name, path: api.nodeNamePath(node, root) });
        }
        if (api.isOrphanedComponent(mainComponent)) {
          out.orphanedInstances.push({
            id: node.id,
            name: node.name,
            path: api.nodeNamePath(node, root),
            mainComponentName: mainComponent.name,
            mainComponentSetName: mainComponentSetName,
          });
        }
        if (bindingCtx) {
          const boundName = mainComponent ? api.resolveComponentSetName(mainComponent) || mainComponent.name : null;
          if (boundName) {
            const key = "instance\u0000" + boundName;
            if (!bindingCtx.seen.has(key)) {
              bindingCtx.seen.add(key);
              bindingCtx.bindings.push({ layer: bindingCtx.layer, property: "instance", value: boundName });
            }
          }
        }
      }

      if (Array.isArray(node.fills) || Array.isArray(node.strokes)) {
        const resolvedPaints = [];
        for (const paint of node.fills || []) {
          resolvedPaints.push({ paint: paint, binding: await api.resolveCapabilityBinding(paint, variableById) });
        }
        for (const paint of node.strokes || []) {
          resolvedPaints.push({ paint: paint, binding: await api.resolveCapabilityBinding(paint, variableById) });
        }
        out.latentCapabilities.push.apply(out.latentCapabilities, api.collectNodeLatentCapabilities(node, resolvedPaints));
      }

      // bindingCtx.layer === "" marks the variant's own root (see the
      // COMPONENT-boundary branch below) — A's collectComponentBindings only
      // ever walks a component's CHILDREN, never binding-checks the component
      // root itself, so this call is skipped there and fires from the first
      // real child onward.
      if (bindingCtx && node.type !== "INSTANCE" && bindingCtx.layer !== "") {
        await api.collectLayerBindingEntries(node, bindingCtx.layer, variableById, bindingCtx.bindings, bindingCtx.seen);
      }

      if (Array.isArray(node.children)) {
        const childRecordHere = api.nextRecordState(node, recordHere);
        for (const child of node.children) {
          let childBindingCtx = null;
          if (collectBindings && node === root && child.type === "COMPONENT") {
            // `child` is a variant: a fresh binding chain starts at its own
            // children (the variant node itself is never bound-checked here —
            // matches reference implementation A's collectComponentBindings,
            // which only walks a component's CHILDREN, never the component
            // root itself).
            const arr = [];
            out.variantBindings.set(child.id, arr);
            childBindingCtx = { layer: "", bindings: arr, seen: new Set() };
          } else if (bindingCtx && node.type !== "INSTANCE") {
            childBindingCtx = {
              layer: bindingCtx.layer ? bindingCtx.layer + "/" + child.name : child.name,
              bindings: bindingCtx.bindings,
              seen: bindingCtx.seen,
            };
          }
          await visit(child, node, childRecordHere, childBindingCtx);
        }
      }
    }
    await visit(root, null, false, null);
  };
}
// === END SUBTREE WALK ===

const walkV2Subtree = createSubtreeWalk({
  getInstanceMainComponent: function (node) { return getInstanceMainComponent(node); },
  resolveComponentSetName: function (component) { return resolveComponentSetName(component); },
  isSpacerSetName: function (name) { return RAW_SPACER_COMPONENT_NAMES.has(name); },
  isOrphanedComponent: function (component) { return isOrphanedComponent(component); },
  nodeNamePath: function (node, root) { return nodeNamePath(node, root); },
  nextRecordState: function (node, recorded) { return nextRecordState(node, recorded); },
  resolveCapabilityBinding: function (paint, variableById) { return resolveCapabilityBinding(paint, variableById); },
  collectNodeLatentCapabilities: function (node, paints) { return collectNodeLatentCapabilities(node, paints); },
  // Wrapped rather than passed by reference: collectLayerBindingEntries reads
  // `getStyleById`, which buildExport rebinds to a fresh per-export cache.
  collectLayerBindingEntries: function (node, layer, variableById, bindingsOut, seen) {
    return collectLayerBindingEntries(node, layer, variableById, bindingsOut, seen);
  },
});

// === COPY AND MODE-PIN WALK (plugin API injected — tested via
// copy-modepin-walk.test.mjs, which extracts this block by its markers) ===
// Brief pack references/figma-agent-plugin-brief.md "COPY CAPTURE"/
// "MODE-PIN CAPTURE": one recursive pass per Example-page top-level frame,
// collecting both buckets together (same DELIVERABLE-page scope, same
// canvas-order walk, no reason to traverse the subtree twice). A hidden node
// (`visible === false`) is skipped along with everything beneath it — "skip
// anything inside a hidden layer" applies transitively, not node-by-node.
//
// PATH: "the ancestor chain of frame/instance names down to the node's own
// name" (brief pack, both sections) — only FRAME and INSTANCE ancestors
// contribute a path segment as the walk descends; a GROUP/SECTION/BOOLEAN_
// OPERATION etc. in between is structurally transparent. The node's own name
// is always the last segment, regardless of its own type.
//
// MODE PINS: captured for every visible FrameNode with non-empty
// explicitVariableModes — including the top-level Example frame itself, not
// only frames nested inside it — since inferring a frame's own pin from
// instance-override side effects elsewhere under-captures (the gap the
// brief pack's MODE-PIN CAPTURE section closes). Resolution against this
// export's collections[].id/modeTable happens later, in buildModePins
// (schema-v2-transform.mjs) — this walk only collects the raw
// {collectionId: modeId} pairs, which is all a live tree walk can see.
function createCopyModePinWalk(api) {
  return async function walkCopyAndModePins(root, out) {
    async function visit(node, ancestorPath) {
      if (node.visible === false) return;

      if (node.type === "TEXT") {
        if (node.characters !== "") {
          const entry = {
            path: ancestorPath.concat(node.name).join("/"),
            text: node.characters,
            id: node.id,
          };
          // componentContext: present ONLY when this node's characters are
          // driven by an enclosing instance's TEXT component property, not
          // authored directly on the layer (brief pack "COPY CAPTURE").
          const propRef = node.componentPropertyReferences && node.componentPropertyReferences.characters;
          if (propRef) {
            const instance = api.findEnclosingInstance(node);
            if (instance) {
              const mainComponent = await api.getInstanceMainComponent(instance);
              entry.componentContext = {
                component: api.resolveComponentSetName(mainComponent) || instance.name,
                prop: propRef,
              };
            }
          }
          out.copy.push(entry);
        }
      } else if (node.type === "FRAME") {
        const modes = node.explicitVariableModes;
        if (modes && Object.keys(modes).length > 0) {
          out.modePins.push({
            path: ancestorPath.concat(node.name).join("/"),
            explicitVariableModes: modes,
          });
        }
      }

      if (Array.isArray(node.children)) {
        const childPath = node.type === "FRAME" || node.type === "INSTANCE" ? ancestorPath.concat(node.name) : ancestorPath;
        for (const child of node.children) {
          await visit(child, childPath);
        }
      }
    }
    await visit(root, []);
  };
}
// === END COPY AND MODE-PIN WALK ===

const walkCopyAndModePins = createCopyModePinWalk({
  findEnclosingInstance: function (node) { return findEnclosingInstance(node); },
  getInstanceMainComponent: function (node) { return getInstanceMainComponent(node); },
  resolveComponentSetName: function (component) { return resolveComponentSetName(component); },
});

// === PARALLEL COLLECT (walk injected — tested via buildexport-perf.test.mjs,
// which extracts this block by its markers and diffs it against the previous
// sequential implementation) ===
// Runs `walk(item, out)` for every item at once, merges what each walk
// collected into the shared warnings collector `out`, and returns each walk's
// own return value in ITEM order.
//
// OPTIMIZATION (lag verdict 2026-08-01, Addendum 6 — components 10.5s and
// templates 4.3s of a 15.3s export): component sets, and the Example page's
// frames, used to be walked strictly one at a time, each walk itself a chain
// of awaited plugin-API calls (getStyleByIdAsync, getMainComponentAsync,
// getVariableByIdAsync, getNodeByIdAsync — one round trip per layer, per
// bound field). Nothing about item N's walk depends on item N-1's, so the
// walks now go out together and their round trips overlap.
//
// Output is provably unchanged: each walk collects into its OWN bucket, and
// the buckets are merged in ITEM order once all have settled — so completion
// order cannot leak into the collected arrays the way it would if every walk
// appended into the shared collector as it went (proven differentially in
// buildexport-perf.test.mjs against a walk that deliberately completes in
// reverse call order).
function newWarningsCollector() {
  return {
    nodeSnapshots: [],
    spacerInstances: [],
    orphanedInstances: [],
    latentCapabilities: [],
    variantBindings: new Map(),
    copy: [],
    modePins: [],
  };
}

// Appends `bucket` onto `target` wholesale. Every merge in this file goes
// through here, so "collected in a bucket, folded back in a deterministic
// order" is one rule with one implementation.
function mergeWarningsCollector(target, bucket) {
  for (const entry of bucket.nodeSnapshots) target.nodeSnapshots.push(entry);
  for (const entry of bucket.spacerInstances) target.spacerInstances.push(entry);
  for (const entry of bucket.orphanedInstances) target.orphanedInstances.push(entry);
  for (const entry of bucket.latentCapabilities) target.latentCapabilities.push(entry);
  for (const entry of bucket.variantBindings) target.variantBindings.set(entry[0], entry[1]);
  for (const entry of bucket.copy) target.copy.push(entry);
  for (const entry of bucket.modePins) target.modePins.push(entry);
}

async function collectInParallel(items, out, walk) {
  const buckets = items.map(newWarningsCollector);
  const results = await Promise.all(
    items.map(function (item, i) {
      return walk(item, buckets[i]);
    })
  );
  for (const bucket of buckets) mergeWarningsCollector(out, bucket);
  return results;
}
// === END PARALLEL COLLECT ===

// Reads one overridden field's current value off the live node. Common
// scalar fields resolve directly; anything else falls back to a JSON-safe
// snapshot of the raw property (Figma node fields are plain data, so
// round-tripping through JSON strips only functions/symbols, never loses
// real content) — or is skipped if that round-trip fails.
function readOverrideValue(node, field) {
  switch (field) {
    case "characters":
      return typeof node.characters === "string" ? node.characters : undefined;
    case "visible":
      return node.visible;
    case "opacity":
      return node.opacity;
    case "width":
      return node.width;
    case "height":
      return node.height;
    case "rotation":
      return node.rotation;
    default: {
      const raw = node[field];
      if (raw === undefined) return undefined;
      try {
        return JSON.parse(JSON.stringify(raw));
      } catch (err) {
        return undefined;
      }
    }
  }
}

// === COMPONENT SCAN (pages injected — tested via buildexport-perf.test.mjs,
// which extracts this block by its markers and diffs it against the previous
// two-pass implementation) ===
// Component sets and standalone components, off every page except "Example"
// (component pages only; the Example page's own instances are templateFrames'
// concern). Standalone means a COMPONENT NOT inside a COMPONENT_SET — a set's
// own variant members are collected separately, per-set, below.
//
// OPTIMIZATION (lag verdict 2026-08-01): this used to be two functions doing
// two independent page.findAll() passes over the very same pages — and
// findAll walks the entire page tree including every instance subtree, with
// skipInvisibleInstanceChildren pinned false, so the second pass was a full
// redundant traversal of the largest thing in the document. One pass now
// collects both, partitioning by the two original predicates in traversal
// order. Output is provably unchanged: findAll returns document order, and
// both buckets are appended in that same order, per page, in the same page
// order as before (proven differentially against the old implementation in
// buildexport-perf.test.mjs, not asserted here).
async function findAllComponentNodes(pages) {
  const sets = [];
  const standalone = [];
  for (const page of pages) {
    if (page.name === "Example") continue;
    const found = page.findAll(function (n) {
      return n.type === "COMPONENT_SET" || n.type === "COMPONENT";
    });
    for (const n of found) {
      if (n.type === "COMPONENT_SET") sets.push(n);
      else if (!n.parent || n.parent.type !== "COMPONENT_SET") standalone.push(n);
    }
  }
  return { sets: sets, standalone: standalone };
}
// === END COMPONENT SCAN ===

function findExamplePage() {
  return figma.root.children.find(function (p) { return p.name === "Example"; }) || null;
}

function buildComponentSetSnapshots(componentSetNodes) {
  return componentSetNodes.map((set) => ({
    key: set.key,
    id: set.id,
    name: set.name,
    description: set.description,
    componentPropertyDefinitions: set.componentPropertyDefinitions,
    variantCount: Array.isArray(set.children) ? set.children.length : 0,
  }));
}

// Feeds buildComponents (the pure listener-contract reshape) with the raw
// snapshot it expects — variants[].bindings come straight out of
// variantBindings (populated by walkV2Subtree's SAME pass over each set's
// subtree, keyed by variant node id; see the "COMPONENT-INTERNALS BINDING
// CHAIN" comment above walkV2Subtree).
function buildComponentSnapshots(componentSetNodes, standaloneComponentNodes, variantBindings) {
  return {
    standalone: standaloneComponentNodes.map((c) => ({
      key: c.key,
      name: c.name,
      componentPropertyDefinitions: c.componentPropertyDefinitions,
    })),
    sets: componentSetNodes.map((set) => ({
      key: set.key,
      name: set.name,
      componentPropertyDefinitions: set.componentPropertyDefinitions,
      variants: (Array.isArray(set.children) ? set.children : [])
        .filter(function (c) { return c.type === "COMPONENT"; })
        .map((variant) => ({
          key: variant.key,
          name: variant.name,
          bindings: variantBindings.get(variant.id) || [],
        })),
    })),
  };
}

// Builds one Example-frame instance snapshot: componentProperties verbatim
// (buildTemplateFrames splits it into variantProps/properties) plus every
// overridden field on the instance's own subtree, resolved to a value and
// keyed "{instance-id}/{node-name-path}".
// === TEMPLATE OVERRIDES (node lookup injected — tested via
// buildexport-perf.test.mjs, which extracts this block by its markers and
// diffs it against the previous sequential implementation) ===
// Every node an instance's overrides point at, in override order.
//
// OPTIMIZATION (lag verdict 2026-08-01, Addendum 6 — templates 4.3s): these
// lookups used to happen one at a time inside the override loop, each a real
// plugin-API round trip, and a template instance can carry hundreds of
// overrides. They're independent, so they go out together.
//
// Output is provably unchanged: results are collected by INDEX, so completion
// order can't reorder the overrides (proven differentially in
// buildexport-perf.test.mjs against a lookup that completes in reverse call
// order). The instance's own node is still never looked up.
async function resolveOverrideNodes(inst, getNode) {
  return Promise.all(
    (inst.overrides || []).map(function (ov) {
      return ov.id === inst.id ? inst : getNode(ov.id);
    })
  );
}
// === END TEMPLATE OVERRIDES ===

async function buildTemplateInstanceSnapshot(inst, variableById) {
  const mainComponent = await getInstanceMainComponent(inst);
  const component = resolveComponentSetName(mainComponent) || inst.name;

  const overriddenNodes = await resolveOverrideNodes(inst, getNodeById);
  const overrides = [];
  const rawOverrides = inst.overrides || [];
  for (let i = 0; i < rawOverrides.length; i++) {
    const ov = rawOverrides[i];
    const overriddenNode = overriddenNodes[i];
    if (!overriddenNode) continue;
    for (const field of ov.overriddenFields || []) {
      const value = readOverrideValue(overriddenNode, field);
      if (value === undefined) continue;
      overrides.push({ id: inst.id + "/" + nodeNamePath(overriddenNode, inst), property: field, value: value });
    }
  }

  return {
    id: inst.id,
    name: inst.name,
    component: component,
    componentProperties: inst.componentProperties || {},
    overrides: overrides,
  };
}

// Runs one Example frame through the same processing regardless of what it's
// nested under (a section at any depth, or the bare page) — the spacer/
// duplicate-sibling scan of its subtree, plus its own templateFrames
// snapshot. `parentId`/`parentPath` feed warningsCollector.nodeSnapshots
// exactly as before (a real SECTION's id/name, or the page itself for a
// bare frame with no enclosing section).
async function processExampleFrame(frame, parentId, parentPath, variableById, warningsCollector) {
  warningsCollector.nodeSnapshots.push({
    id: frame.id,
    name: frame.name,
    type: frame.type,
    mainComponentId: null,
    componentSetId: null,
    parentId: parentId,
    parentPath: parentPath,
  });
  await walkV2Subtree(frame, variableById, warningsCollector);
  // COPY CAPTURE / MODE-PIN CAPTURE (brief pack): a second pass over the
  // same frame's subtree — walkV2Subtree above doesn't visit TEXT
  // characters or a FRAME's explicitVariableModes, and folding this into it
  // would touch the perf-tuned SUBTREE WALK block (see its own header
  // comment on why round-2 fan-out inside one frame was reverted as a net
  // loss). Writes into the SAME per-frame bucket, so collectInParallel's
  // fold-back-in-item-order guarantee covers these two arrays exactly as it
  // already covers nodeSnapshots/spacerInstances/latentCapabilities.
  await walkCopyAndModePins(frame, warningsCollector);

  // One snapshot per instance, resolved together rather than one at a time —
  // each snapshot is an independent chain of plugin-API round trips and
  // writes nothing shared, and Promise.all preserves index order, so the
  // instances array is the same array in the same order as before.
  const instances = frame.children.filter(function (n) { return n.type === "INSTANCE"; });
  const instanceSnapshots = await Promise.all(
    instances.map(function (inst) { return buildTemplateInstanceSnapshot(inst, variableById); })
  );
  return {
    id: frame.id,
    name: frame.name,
    width: Math.round(frame.width),
    height: Math.round(frame.height),
    // frame.devStatus is the live figma.* read (DevStatusMixin on FRAME —
    // see buildTemplateFrames's doc comment for the typings citation);
    // buildTemplateFrames (the pure, mirrored function) passes it through.
    devStatus: frame.devStatus || null,
    instances: instanceSnapshots,
  };
}

// Walks the "Example" page's sections/frames, producing exampleStructure[]
// and templateFrames[] snapshots together (both read the same frames) plus
// the spacer/duplicate-sibling scan of every frame's subtree. Frames
// themselves are also recorded as siblings under their own SECTION (real
// signal — e.g. two "D - Home" frames in the same section IS a duplicate
// worth flagging) — walkV2Subtree can't see this on its own since each
// frame is walked as an independent root.
//
// Sections nest arbitrarily deep — SECTION-in-SECTION is valid Figma
// structure — so this recurses into every SECTION found at any depth, each
// producing its own exampleStructure entry keyed by its own name and its
// own DIRECT frame children only; a nested section's frames are never
// folded into its parent's entry. A FRAME sitting directly on the page
// with no enclosing SECTION is real too (a lone example with no section
// wrapper); those are grouped into one entry with name "" — an authored
// section name is genuinely absent here, kept verbatim rather than
// synthesized or dropped, same convention as an empty description
// elsewhere in this file's SCHEMA V2 TRANSFORM block.
// === EXAMPLE SECTIONS (frame processing and collector plumbing injected —
// tested via buildexport-perf.test.mjs, which extracts this block by its
// markers and diffs it against the round-2 whole-tree implementation it
// replaced) ===
// REVERTED (perf round 2 revert, operator verdict 2026-08-01: net loss in
// the plugin sandbox — see the SUBTREE WALK comment above for the full
// finding). Restored to the round-1 shape (978c77e): sections are walked
// strictly depth-first again — a section's own frames (still overlapped
// with each other via collectInParallel, round 1's ACROSS-item
// parallelism), then its nested sections, one at a time, top sections
// before the bare page-level frames. No result tree, no fold pass — each
// walkSection call writes straight into the shared warningsCollector, same
// as collectInParallel already does for the frames inside it.
function createExampleSectionWalk(deps) {
  return async function buildExampleData(examplePage, warningsCollector) {
    if (!examplePage) return { sectionSnapshots: [], frameSnapshots: [] };

    const sectionSnapshots = [];
    const frameSnapshots = [];

    async function walkSection(section) {
      const frames = section.children.filter(function (n) { return n.type === "FRAME"; });
      const snapshots = await deps.collectInParallel(frames, warningsCollector, function (frame, out) {
        return deps.processFrame(frame, section.id, section.name, out);
      });
      for (const snapshot of snapshots) frameSnapshots.push(snapshot);
      const frameDescs = frames.map(function (frame) { return { id: frame.id, name: frame.name }; });
      sectionSnapshots.push({ name: section.name, frames: frameDescs });

      const nestedSections = section.children.filter(function (n) { return n.type === "SECTION"; });
      for (const nested of nestedSections) {
        await walkSection(nested);
      }
    }

    const topSections = examplePage.children.filter(function (n) { return n.type === "SECTION"; });
    for (const section of topSections) {
      await walkSection(section);
    }

    const bareFrames = examplePage.children.filter(function (n) { return n.type === "FRAME"; });
    if (bareFrames.length > 0) {
      const snapshots = await deps.collectInParallel(bareFrames, warningsCollector, function (frame, out) {
        return deps.processFrame(frame, examplePage.id, "", out);
      });
      for (const snapshot of snapshots) frameSnapshots.push(snapshot);
      const frameDescs = bareFrames.map(function (frame) { return { id: frame.id, name: frame.name }; });
      sectionSnapshots.push({ name: "", frames: frameDescs });
    }

    return { sectionSnapshots: sectionSnapshots, frameSnapshots: frameSnapshots };
  };
}
// === END EXAMPLE SECTIONS ===

function buildExampleData(examplePage, variableById, warningsCollector) {
  return createExampleSectionWalk({
    collectInParallel: collectInParallel,
    processFrame: function (frame, parentId, parentPath, out) {
      return processExampleFrame(frame, parentId, parentPath, variableById, out);
    },
  })(examplePage, warningsCollector);
}

// Per-phase progress reporting during buildExport() — a full export on a
// large file can take several seconds with no other feedback; this is a
// one-way status line, never gated on a UI acknowledgement (matches every
// other figma.ui.postMessage call in this file). Every buildExport() call
// runs through runSyncExport() (clicking Sync runs exactly one export+POST
// cycle — see the "manual sync" section below) — ui.html renders
// "export-progress" in the sync status row's detail text while it runs.
function reportPhase(text) {
  figma.ui.postMessage({ type: "export-progress", text: text });
}

// === MODE VALUES (resolver injected — tested via buildexport-perf.test.mjs,
// which extracts this block by its markers and diffs it against the previous
// sequential implementation) ===
// One variable's valuesByMode, keyed by mode NAME in the collection's own
// mode order, with each raw value run through `resolve` (resolveAliasNotation
// in production).
//
// OPTIMIZATION (lag verdict 2026-08-01): the modes used to be awaited one at
// a time inside buildExport's per-variable loop — each await a real async
// hop (resolveAliasNotation calls figma.variables.getVariableByIdAsync for an
// alias), serialized across every mode of every variable in the file. They're
// independent, so they now go out together and are collected back in mode
// order. Output is provably unchanged: keys are written in `modes` order
// after all values settle, so completion order can't leak into the object
// (proven differentially in buildexport-perf.test.mjs against a resolver that
// deliberately completes in reverse call order).
async function resolveValuesByMode(variable, modes, resolve) {
  const raws = modes.map(function (mode) {
    return variable.valuesByMode ? variable.valuesByMode[mode.modeId] : undefined;
  });
  const resolved = await Promise.all(
    raws.map(function (raw) {
      return raw === undefined ? null : resolve(raw);
    })
  );
  const valuesByMode = {};
  for (let i = 0; i < modes.length; i++) {
    valuesByMode[modes[i].name] = resolved[i];
  }
  return valuesByMode;
}
// === END MODE VALUES ===

async function buildExport() {
  // v2's componentSets/exampleStructure/templateFrames/latentCapabilities/
  // warnings buckets traverse every page (component pages) plus the page
  // literally named "Example" — in documentAccess "dynamic-page" mode,
  // pages are lazy stubs until loaded, so this must happen before any
  // page.children/findAll call below. skipInvisibleInstanceChildren is
  // pinned false (see the "schema v2: live document traversal" comment
  // above) so invisible nodes stay traversable for the warnings/
  // latentCapabilities scan.
  await ensureAllPagesLoaded();
  figma.skipInvisibleInstanceChildren = false;

  // Style lookups are memoized per export, never across exports — a style
  // renamed between two syncs must show up in the second one.
  getStyleById = createIdCache(fetchStyleById);
  getVariableByIdCached = createIdCache(getVariableById);

  // PER-PHASE INSTRUMENTATION (operator verdict 2026-08-01, Addendum 2 item
  // 1): the sync lag's remaining suspect is this traversal, and it had never
  // been measured — only guessed at. Every phase below closes its own timing,
  // and the breakdown ships in header.timings and in the synced status line,
  // so a real sync on the real file produces numbers with no DevTools trace.
  // Date.now() (not performance.now) — the main-thread plugin sandbox has no
  // browser APIs (see this file's CAPTURE_LISTENER_URL comment); ms
  // resolution is plenty for phases measured in hundreds of ms.
  const timings = {};
  let phaseStartedAt = Date.now();
  const startedAt = phaseStartedAt;
  function phase(name) {
    const now = Date.now();
    timings[name] = now - phaseStartedAt;
    phaseStartedAt = now;
  }

  reportPhase("Collecting variables…");
  const rawCollections = await getCollections();
  const rawVariables = await getVariables();

  const variableById = new Map();
  for (const v of rawVariables) variableById.set(v.id, v);

  collectionNameById = new Map();
  for (const c of rawCollections) collectionNameById.set(c.id, c.name);

  const variablesByCollection = new Map();
  for (const c of rawCollections) variablesByCollection.set(c.id, []);
  for (const v of rawVariables) {
    const bucket = variablesByCollection.get(v.variableCollectionId);
    if (bucket) bucket.push(v);
    else {
      // Variable references a collection we didn't enumerate (shouldn't
      // happen for local variables, but don't silently drop data).
      variablesByCollection.set(v.variableCollectionId, [v]);
    }
  }

  const sortedCollections = rawCollections
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));

  const counts = {};
  const collectionsOut = [];

  for (const collection of sortedCollections) {
    const modes = collection.modes; // already in collection-defined order
    const variables = (variablesByCollection.get(collection.id) || [])
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));

    const variablesOut = [];
    for (const variable of variables) {
      const valuesByMode = await resolveValuesByMode(variable, modes, function (raw) {
        return resolveAliasNotation(raw, variableById);
      });

      const variableOut = {
        name: variable.name,
        resolvedType: variable.resolvedType,
        valuesByMode: valuesByMode,
      };
      if (Array.isArray(variable.scopes) && variable.scopes.length > 0) {
        variableOut.scopes = variable.scopes.slice();
      }
      if (variable.description) {
        variableOut.description = variable.description;
      }
      // codeSyntax: per-platform (WEB/ANDROID/iOS) name overrides an author
      // may set for dev handoff. Figma always exposes the object, but it's
      // typically empty ({}) unless set — only emit when at least one
      // platform key is present, so untouched variables don't carry noise.
      if (variable.codeSyntax && Object.keys(variable.codeSyntax).length > 0) {
        variableOut.codeSyntax = Object.assign({}, variable.codeSyntax);
      }
      // hiddenFromPublishing: library-publishing visibility flag. Only
      // meaningful (and only present) on variables that belong to a
      // publishable library; emit as authored, never defaulted.
      if (typeof variable.hiddenFromPublishing === "boolean") {
        variableOut.hiddenFromPublishing = variable.hiddenFromPublishing;
      }
      variablesOut.push(variableOut);
    }

    counts[collection.name] = variablesOut.length;

    collectionsOut.push({
      name: collection.name,
      id: collection.id,
      modeTable: buildModeTable(modes),
      modes: modes.map((m) => m.name),
      variables: variablesOut,
    });
  }

  phase("variables");

  reportPhase("Collecting styles…");
  const stylesExport = await buildStylesExport(variableById);
  for (const key of ["text", "paint", "effect", "grid"]) {
    counts["styles/" + key] = stylesExport.styleCounts[key];
  }

  // v2 traversal: componentSets/latentCapabilities/warnings off every
  // component page, exampleStructure/templateFrames off the "Example" page.
  // warningsCollector accumulates raw scan results across BOTH roots before
  // any of the pure transform functions run on them. variantBindings is
  // populated in the SAME componentSetNodes walk (collectBindings=true) —
  // see walkV2Subtree's header comment.
  const warningsCollector = newWarningsCollector();

  phase("styles");

  reportPhase("Collecting components…");
  // SUB-PHASE ATTRIBUTION (operator verdict 2026-08-01, Addendum 6): the
  // components phase measured 10.5s of a 15.3s export, but it is two very
  // different things — the page-wide findAll scan, and the per-set subtree
  // walk that resolves bindings against the plugin API. Each is timed
  // separately so the next real sync attributes the cost; `components`
  // stays as their roll-up so the operator's existing reading of the line
  // keeps meaning the same thing.
  const componentsStartedAt = Date.now();
  const componentNodes = await findAllComponentNodes(figma.root.children);
  const componentSetNodes = componentNodes.sets;
  phase("componentsScan");
  await collectInParallel(componentSetNodes, warningsCollector, function (set, out) {
    return walkV2Subtree(set, variableById, out, true);
  });
  const standaloneComponentNodes = componentNodes.standalone;

  phase("componentsWalk");
  timings.components = Date.now() - componentsStartedAt;

  reportPhase("Resolving templates…");
  const templatesStartedAt = Date.now();
  const examplePage = findExamplePage();
  const exampleData = await buildExampleData(examplePage, variableById, warningsCollector);
  phase("templatesExample");

  const componentSets = buildComponentSets(buildComponentSetSnapshots(componentSetNodes));
  const components = buildComponents(
    buildComponentSnapshots(componentSetNodes, standaloneComponentNodes, warningsCollector.variantBindings)
  );
  const exampleStructure = buildExampleStructure(exampleData.sectionSnapshots);
  const templateFrames = buildTemplateFrames(exampleData.frameSnapshots);
  // copy/modePins: raw snapshots collected by walkCopyAndModePins inside
  // processExampleFrame (same DELIVERABLE-page scope, same per-frame
  // buckets folded back in item order as every other warningsCollector
  // bucket). buildModePins resolves each raw {collectionId: modeId} pair
  // against THIS export's own collectionsOut (id + modeTable, built above)
  // — never a second Figma read.
  const copy = buildCopyEntries(warningsCollector.copy);
  const modePins = buildModePins(warningsCollector.modePins, collectionsOut);

  phase("templatesTransform");
  timings.templates = Date.now() - templatesStartedAt;

  reportPhase("Scanning capabilities…");
  const latentCapabilities = buildLatentCapabilities(warningsCollector.latentCapabilities);

  phase("capabilities");

  reportPhase("Running lint checks…");
  const warnings = buildWarnings({
    spacerInstances: warningsCollector.spacerInstances,
    nodeSnapshots: warningsCollector.nodeSnapshots,
    orphanedInstances: warningsCollector.orphanedInstances,
    templateFrames: templateFrames,
  });

  phase("lint");
  timings.totalMs = Date.now() - startedAt;

  const header = {
    fileName: figma.root.name,
    pluginVersion: PLUGIN_VERSION,
    // ISO-8601, not epoch-ms — matches the format the listener's own
    // isValidExportedAt() documents as the expected wire type (see
    // capture-listener.mjs's header comment) and is legible when the raw
    // artifact file is opened directly. The listener already accepts either
    // shape, so this is a compatible change on the read side.
    exportedAt: new Date().toISOString(),
    schemaVersion: 2,
    counts: counts,
    styleCounts: Object.assign({}, stylesExport.styleCounts, {
      emptyDescriptions: stylesExport.emptyDescriptions,
    }),
    componentCounts: { standalone: components.standalone.length, sets: components.sets.length },
    warningCount: warnings.length,
    // Per-phase export cost in ms, plus totalMs. Informational only — the
    // listener excludes it from its content hash exactly as it already
    // excludes exportedAt (see capture-listener.mjs's exportHash), so a sync
    // that differs ONLY in how long it took still counts as unchanged.
    timings: timings,
    ...buildHeaderPropskitField(propskitAvailable),
  };
  // figma.fileKey: undefined in some contexts (e.g. a file that has never
  // been saved to the cloud, or certain plugin-execution contexts per
  // figma.com/plugin-docs/api/figma-properties/#filekey) — emit only when
  // present rather than writing a null/undefined placeholder. The listener
  // and downstream routing prefer this for dedup/routing when it's there,
  // falling back to the kebab-cased fileName otherwise (see
  // scripts/capture-listener.mjs).
  if (typeof figma.fileKey === "string" && figma.fileKey) {
    header.fileKey = figma.fileKey;
  }

  const output = {
    header: header,
    collections: collectionsOut,
    styles: stylesExport.styles,
    components: components,
    componentSets: componentSets,
    exampleStructure: exampleStructure,
    templateFrames: templateFrames,
    latentCapabilities: latentCapabilities,
    warnings: warnings,
    copy: copy,
    modePins: modePins,
  };

  return output;
}

// --- manual sync ------------------------------------------------------------
//
// RULING (operator, re-confirmed 2026-08-01, vault memories/token-
// rulings.md "Sync is MANUAL-ONLY — auto sync removed"): sync is a one-shot
// manual action — click Sync -> export -> POST -> done. There is no
// continuous/watch mode: no figma.on('documentchange') re-sync registration,
// no debounce loop, no "Stop" toggle. Clicking Sync always runs exactly one
// runSyncExport() cycle (this is also the "works with no listener running"
// fallback: the export-result posted from runSyncExport() populates the
// UI's counts/Raw JSON/Copy/Download whether or not the POST below reaches
// a listener). The button never becomes "Stop"; ui.html's states are
// Ready -> Syncing -> Synced.

let lastSyncAt = null;
let lastSyncCount = 0;

// Last-successful-sync persistence key. clientStorage is per-plugin,
// per-user, and (per figma.com/plugin-docs/api/figma-clientStorage/)
// scoped to this file when documentAccess allows it — good enough to
// survive a closed/reopened panel or a fresh Figma session on this
// machine. Session memory (lastSyncAt/lastSyncCount above) stays the
// source of truth while sync is actively running; clientStorage is only
// read once at startup (to show a value before the first sync of this
// session) and written after every successful sync.
//
// PERSISTED SHAPE (operator-reported defect fix — a reload used to always
// show the pre-sync idle state, discarding the whole panel's context):
// { lastSyncAt, lastSyncCount, summary, warningCount, header: {counts,
// styleCounts, componentCounts}, warningsByType: {type: count} }.
// Deliberately NOT persisted: the full export payload (collections/styles/
// components/raw JSON) or the diff-count breakdown's source warnings array —
// clientStorage has a real per-plugin quota, and a full export can run into
// tens of MB (see ui.html's LISTENER_MAX_BYTES), so only the compact,
// already-derived summary a reload needs to redraw the status rows + count
// sections travels through this key. A reload therefore restores the counts/
// timestamp/warnings summary but NOT Raw JSON/Copy/Download — those stay
// empty until the next real export, which is the honest scope of "restore
// the last sync's summary" this fix delivers.
const LAST_SYNC_STORAGE_KEY = "capture-figma:last-sync";

async function loadLastSyncFromStorage() {
  try {
    const stored = await figma.clientStorage.getAsync(LAST_SYNC_STORAGE_KEY);
    if (stored && typeof stored.lastSyncAt === "number") {
      figma.ui.postMessage(buildRestoredSyncMessage(stored));
    }
  } catch (err) {
    // clientStorage can throw in some plugin execution contexts (e.g.
    // certain sandboxed test runners) — never let a persistence failure
    // block the plugin from opening.
  }
}

async function saveLastSyncToStorage(atMs, count, summary, warningCount, header, warnings) {
  try {
    await figma.clientStorage.setAsync(
      LAST_SYNC_STORAGE_KEY,
      buildSyncStoragePayload(atMs, count, summary, warningCount, header, warnings)
    );
  } catch (err) {
    // Best-effort — a failed write only costs the cross-session persistence,
    // not the current session's in-memory status.
  }
}

function totalExportCount(data) {
  const counts = (data && data.header && data.header.counts) || {};
  let total = 0;
  for (const key of Object.keys(counts)) total += counts[key];
  return total;
}

// Posts the export payload to ui.html and waits for its fetch result.
// ui.html is the only context in this plugin with a real fetch (see the
// CAPTURE_LISTENER_URL comment above) — this main thread only relays. At
// most one sync POST is in flight at a time (each click runs exactly one
// awaited runSyncExport() cycle before another can start — see runSync()
// and ui.html's syncBtn.disabled), so a single pending resolver is
// sufficient.
let pendingSyncResolve = null;

function postSyncExportToUI(data) {
  return new Promise((resolve) => {
    pendingSyncResolve = resolve;
    figma.ui.postMessage({ type: "sync-post", data: data });
  });
}

// Runs one export + POST cycle. Never throws out of this function — a
// listener-down network failure is reported to the UI as a status line, sync
// stays on, and the next document change (or the next manual retry) tries
// again. This is the "never crash" contract from the task.
// === PRE-SYNC VERSION (pure apart from the injected API surface — tested via
// pre-sync-version.test.mjs, which extracts this block by its markers) ===
// Saves one Figma version-history entry for the document as it stands right
// before an export runs (operator verdict 2026-08-01, Addendum 2 item 4).
// `api` is the boundary — figma in production, a fake in tests. Never throws:
// a version save that fails or isn't available must not stop the sync, so
// every path returns a describable outcome instead.
//
// API: figma.saveVersionHistoryAsync(title, description?) => Promise<
// VersionHistoryResult { id }> (@figma/plugin-typings 1.128.0,
// plugin-api.d.ts:338; title "must be a non-empty string", :301). Its
// documented caveat (:316) — changes made by the plugin immediately before
// the call may not be captured — doesn't apply here: this plugin only ever
// reads the document, so the version always reflects the authored state the
// export is about to read.
async function savePreSyncVersion(api, atIso) {
  if (!api || typeof api.saveVersionHistoryAsync !== "function") {
    return {
      ok: false,
      skipped: true,
      title: null,
      versionId: null,
      note: "version history unavailable in this Figma version/editor",
    };
  }
  const title = "capture-figma pre-sync " + atIso;
  try {
    const result = await api.saveVersionHistoryAsync(title);
    return { ok: true, skipped: false, title: title, versionId: result && result.id ? result.id : null, note: null };
  } catch (err) {
    return {
      ok: false,
      skipped: false,
      title: title,
      versionId: null,
      note: "version not saved: " + (err && err.message ? err.message : String(err)),
    };
  }
}
// === END PRE-SYNC VERSION ===

async function runSyncExport(versionNote) {
  let data;
  try {
    data = await buildExport();
  } catch (err) {
    figma.ui.postMessage({
      type: "export-error",
      message: err && err.message ? err.message : String(err),
    });
    figma.ui.postMessage({
      type: "sync-status",
      state: "error",
      message: "export failed: " + (err && err.message ? err.message : String(err)),
    });
    return;
  }

  // Posted unconditionally on every successful build — the export itself
  // succeeded whether or not the listener is reachable, so the UI's counts/
  // Raw JSON/Copy/Download should reflect it regardless of what the POST
  // below does. This is the "one-shot export still works with no listener
  // running" fallback: toggling Sync on always produces local data even if
  // every sync-status branch below reports "unreachable".
  figma.ui.postMessage({ type: "export-result", data: data });

  const result = await postSyncExportToUI(data);

  if (result.error) {
    // Listener not reachable (not running, wrong port, etc) — ui.html's
    // fetch() itself rejected. Sync stays on; this is expected/handled, not
    // a crash — retried on the next change.
    figma.ui.postMessage({
      type: "sync-status",
      state: "unreachable",
      message: "listener not reachable — export still available manually",
    });
    return;
  }

  if (!result.ok) {
    // Surface the listener's own response body — its specific validation
    // message (e.g. "invalid export shape: missing header.fileName") — not
    // just the status code, so a human can actually act on it.
    const bodyText = result.body ? " — " + result.body : "";
    figma.ui.postMessage({
      type: "sync-status",
      state: "listener-error",
      message: "listener responded " + result.status + bodyText,
    });
    return;
  }

  lastSyncAt = Date.now();
  lastSyncCount = totalExportCount(data);
  figma.ui.postMessage({
    type: "sync-status",
    state: "synced",
    lastSyncAt: lastSyncAt,
    lastSyncCount: lastSyncCount,
    warningCount: typeof result.warningCount === "number" ? result.warningCount : 0,
    summary: result.summary || null,
    // Relayed verbatim from the listener's response (ui.html performs the
    // POST, see postSyncExportToUI) — the design<->code drift lane.
    conformance: result.conformance || null,
    // Only set when the pre-sync version save didn't succeed — a successful
    // save needs no words here (the version is visible in Figma's own
    // version history, and the snapshot row reports it); a failed or
    // unavailable one has to be said out loud rather than silently dropped.
    versionNote: versionNote || null,
    // Per-phase export cost, so the operator reads real numbers off a real
    // sync instead of a DevTools trace (lag verdict item 1).
    timings: data.header.timings || null,
  });
  await saveLastSyncToStorage(
    lastSyncAt,
    lastSyncCount,
    result.summary || null,
    typeof result.warningCount === "number" ? result.warningCount : 0,
    data.header,
    data.warnings
  );
}

// One-shot manual sync: Ready -> Syncing -> Synced (or an error/unreachable
// terminal state), per the manual-only ruling above. runSyncExport() already
// loads every page (via buildExport()'s own ensureAllPagesLoaded() call),
// builds the export, and posts every terminal sync-status itself — this
// wrapper's only job is the immediate "syncing" status so the button/row
// react the instant the click is handled, before the export even starts.
async function runSync() {
  figma.ui.postMessage({ type: "sync-status", state: "syncing" });
  // Step one of the manual Sync action (operator verdict 2026-08-01,
  // Addendum 2 item 4): stamp version history with the document as authored
  // right now, BEFORE the export reads it — so every capture has a matching
  // restorable version. Awaited (not fire-and-forget) so the version is
  // written against the pre-export state, but never allowed to fail the
  // sync: the outcome is reported and the export runs regardless.
  const version = await savePreSyncVersion(figma, new Date().toISOString());
  if (version.ok) {
    figma.ui.postMessage({
      type: "snapshot-status",
      state: "saved",
      title: version.title,
      versionId: version.versionId,
      at: Date.now(),
    });
  } else if (!version.skipped) {
    figma.ui.postMessage({ type: "snapshot-status", state: "error", message: version.note });
  }
  await runSyncExport(version.ok ? null : version.note);
}

// --- manual version snapshot (adopt-list #11) -------------------------------
//
// RULING (operator, 2026-07-31): Save snapshot is MANUAL ONLY — a UI button
// click is the sole trigger. NEVER call saveSnapshot() from
// runSyncExport()/runSync(). The reference implementation this feature was
// ported from (~/Downloads/capture-figma/code.ts's onmessage handler for
// 'post-success': `saveSnapshot('Snapshot on sync.')`) auto-stamps a version
// on every successful sync POST — that pattern was explicitly rejected
// here: sync and snapshot are two independent, separately-triggered manual
// actions (same philosophy as sync itself being manual-only, see the
// "manual sync" section above) — a version stamp tied to sync would tie one
// manual action's history to another's, never something either button click
// should do on the other's behalf.
//
// SUPERSEDED IN PART (operator verdict 2026-08-01, Addendum 2 item 4 —
// vault decisions/capture-ui-feel-verdict-2026-08-01.md): the operator now
// requires a version-history entry BEFORE each sync, so every capture has a
// matching restorable version. What changed is narrow, and the 2026-07-31
// ruling's substance still holds: sync is still manual-only (the version
// save is a step inside that one manual action, not an automation of it),
// this button is still the only *manual* snapshot trigger, and runSync()
// deliberately does NOT call saveSnapshot() — it calls savePreSyncVersion()
// (see the "manual sync" section), which differs in when it runs (before the
// export, not after a successful POST — the reference implementation's
// rejected shape), in its title, and in never being able to fail the sync.
//
// DOCUMENTACCESS HONESTY: this manifest sets documentAccess: "dynamic-page".
// The current @figma/plugin-typings surface documents
// figma.saveVersionHistoryAsync() with no dynamic-page-specific restriction
// or guard — it reads as available regardless of documentAccess. That said,
// this has never been confirmed with a live run inside an actual
// dynamic-page file (no WebFetch/live-Figma verification lane was available
// when this was written — same caveat as this file's styles-export note
// above). So: feature-detect via typeof (this file's established pattern
// for every other figma.* accessor) rather than assuming presence, and let
// ANY thrown error surface to the UI verbatim rather than swallowing or
// reinterpreting it — if dynamic-page does reject this call in some Figma
// version, the real error message reaches the user instead of a guess.

function postSnapshotAvailability() {
  const available = typeof figma.saveVersionHistoryAsync === "function";
  figma.ui.postMessage({
    type: "snapshot-status",
    state: available ? "ready" : "unavailable",
    message: available
      ? null
      : "figma.saveVersionHistoryAsync is not available in this Figma version/editor.",
  });
}

async function saveSnapshot() {
  if (typeof figma.saveVersionHistoryAsync !== "function") {
    figma.ui.postMessage({
      type: "snapshot-status",
      state: "unavailable",
      message: "figma.saveVersionHistoryAsync is not available in this Figma version/editor.",
    });
    return;
  }
  const title = "capture " + new Date().toISOString();
  try {
    const result = await figma.saveVersionHistoryAsync(title);
    figma.ui.postMessage({
      type: "snapshot-status",
      state: "saved",
      title: title,
      versionId: result ? result.id : null,
      at: Date.now(),
    });
  } catch (err) {
    figma.ui.postMessage({
      type: "snapshot-status",
      state: "error",
      message: err && err.message ? err.message : String(err),
    });
  }
}

// JUMP TO NODE — the IO half (getNodeByIdAsync/setCurrentPageAsync/
// selection/scrollAndZoomIntoView all live figma.* calls; the pure ancestor/
// page resolution is resolveJumpTarget, above). Reports back over the same
// postMessage channel every other status message uses, in the approved
// voice (fact -> action, second person) — never a raw error/stack.
async function handleJumpToNode(nodeId) {
  const node = nodeId ? await getNodeById(nodeId) : null;
  const target = resolveJumpTarget(node);
  if (!target) {
    figma.ui.postMessage({
      type: "jump-to-node-result",
      ok: false,
      nodeId: nodeId,
      message: "That layer isn't in the file any more — re-sync.",
    });
    return;
  }
  if (figma.currentPage.id !== target.page.id) {
    await figma.setCurrentPageAsync(target.page);
  }
  target.page.selection = [target.selectableNode];
  figma.viewport.scrollAndZoomIntoView([target.selectableNode]);
  figma.ui.postMessage({
    type: "jump-to-node-result",
    ok: true,
    nodeId: nodeId,
    message: target.usedAncestor
      ? "That exact layer isn't selectable on its own — selected the nearest layer that is."
      : "",
  });
}

figma.ui.onmessage = async (msg) => {
  if (!msg) return;

  if (msg.type === "propskit-availability") {
    // One-shot report from ui.html's boot-time feature-detect probe (see
    // buildHeaderPropskitField's comment) — never sent again this session,
    // so every buildExport() from here on carries the real answer.
    propskitAvailable = !!msg.available;
    return;
  }

  if (msg.type === "resize") {
    // ui.html reports its own measured document.body.scrollHeight on every
    // state transition (never per-repaint — see its scheduleResize()); this
    // clamps to [1, PANEL_HEIGHT_MAX] and is the only place that actually
    // calls figma.ui.resize(), width held fixed at PANEL_WIDTH throughout.
    // Most of these reports land on the same clamped height as the last one
    // applied (six export-progress phases plus the terminal state, per
    // Sync click) — skip the IPC call entirely when nothing changed; real
    // height changes (the ratified content-hugging behavior) still resize
    // exactly as before, on the first report that differs.
    const height = clampResizeHeight(msg.height, PANEL_HEIGHT_IDLE, PANEL_HEIGHT_MAX);
    if (height === lastAppliedResizeHeight) return;
    lastAppliedResizeHeight = height;
    figma.ui.resize(PANEL_WIDTH, height);
    return;
  }

  if (msg.type === "sync-post-result") {
    // Reply to the postSyncExportToUI() request currently in flight, if any.
    if (pendingSyncResolve) {
      const resolve = pendingSyncResolve;
      pendingSyncResolve = null;
      resolve(msg);
    }
    return;
  }

  if (msg.type === "sync") {
    await runSync();
    return;
  }

  if (msg.type === "save-snapshot") {
    await saveSnapshot();
    return;
  }

  if (msg.type === "jump-to-node") {
    await handleJumpToNode(msg.nodeId);
    return;
  }
};
