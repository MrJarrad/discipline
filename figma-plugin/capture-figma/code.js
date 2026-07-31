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
// Output shape (v1.14.0, schema v2 — see the "SCHEMA V2 TRANSFORM" and
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
//     collections: [ { name, modes: [...], variables: [...] }, ... ],
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
//     warnings: [ { type, nodeId, nodeName, context, message }, ... ]
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
// at 1.13.0), which made a capture's pluginVersion useless for correlating
// it back to the commit/release that produced it. Bump this alongside every
// plugin.json version bump.
const PLUGIN_VERSION = "1.14.0";

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
const SYNC_DEBOUNCE_MS = 5000;

figma.showUI(__html__, { width: 480, height: 640 });
loadLastSyncFromStorage();

// Lets a user right-click the page/canvas → Plugins → Relaunch buttons →
// jump straight back into this plugin without the full Plugins menu each
// time. The "export" id here must match manifest.json's relaunchButtons
// entry exactly — Figma keys the two together by id.
figma.root.setRelaunchData({ export: "Export variables + styles" });

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

async function getVariableById(id) {
  if (typeof figma.variables.getVariableByIdAsync === "function") {
    return figma.variables.getVariableByIdAsync(id);
  }
  if (typeof figma.variables.getVariableById === "function") {
    return figma.variables.getVariableById(id);
  }
  return null;
}

async function getStyleById(id) {
  if (typeof figma.getStyleByIdAsync === "function") {
    return figma.getStyleByIdAsync(id);
  }
  if (typeof figma.getStyleById === "function") {
    return figma.getStyleById(id);
  }
  return null;
}

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
// loaded by default and figma.on('documentchange') cannot register in
// incremental mode until every page has been loaded via
// figma.loadAllPagesAsync(). buildExport() DOES need this now: schema v2's
// componentSets/exampleStructure/templateFrames/latentCapabilities/warnings
// buckets traverse every page plus the page literally named "Example", both
// page-scoped reads that throw on an unloaded page — see buildExport()'s own
// call to this function, awaited before any page.children/findAll call.
// startSync() awaits it too, for the same reason, before registering the
// documentchange handler (which additionally cannot register in incremental
// mode until every page is loaded, regardless of what it reads).
async function ensureAllPagesLoaded() {
  if (typeof figma.loadAllPagesAsync === "function") {
    await figma.loadAllPagesAsync();
    return true;
  }
  // Older API surface without loadAllPagesAsync: fall back gracefully —
  // the documentchange handler still gets registered (matches this file's
  // established pattern of trying the async accessor first, then falling
  // back rather than throwing), just without the pre-load guarantee.
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
    target = await getVariableById(value.id);
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
// frames — {id, name, instances:[{id,name,component,variantProps,
// properties,overrides}]}. Each instance's raw componentProperties (Figma's
// merged variant+non-variant property map, {name:{value,type}}) is split by
// type: VARIANT entries become variantProps (the instance's resolved
// variant selection per axis), everything else becomes properties
// (text/boolean/instance-swap values). overrides are passed through
// verbatim — resolving a live node's overridden value and building its
// {instance-id}/{node-name-path} id requires walking the actual instance
// tree, which only code.js's traversal (not this pure function) can do.
function buildTemplateFrames(frameSnapshots) {
  return (frameSnapshots || []).map((frame) => ({
    id: frame.id,
    name: frame.name,
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
// back to matching by name among siblings when an id isn't stable — two
// siblings sharing a name breaks that fallback ambiguously, so it's flagged
// as a structural warning wherever it occurs. `nodeSnapshots` is expected to
// already be scoped to the override interface surface (see
// isOverrideSurfaceBoundary/nextRecordState above) by the caller's traversal
// — this function itself has no opinion on scope, only on collision.
function buildDuplicateSiblingNameWarnings(nodeSnapshots) {
  const byParent = new Map();
  for (const node of nodeSnapshots || []) {
    const key = node.parentId || "";
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(node);
  }
  const warnings = [];
  for (const siblings of byParent.values()) {
    const seen = new Set();
    const flagged = new Set();
    for (const node of siblings) {
      if (seen.has(node.name) && !flagged.has(node.name)) {
        const context = node.parentPath || siblings[0].parentId || null;
        warnings.push({
          type: "duplicate_sibling_name",
          nodeId: node.id || null,
          nodeName: node.name,
          context: context,
          message: `Duplicate sibling name "${node.name}" under ${context} — layer names must be unique among siblings for stable id/name-fallback matching.`,
        });
        flagged.add(node.name);
      }
      seen.add(node.name);
    }
  }
  return warnings;
}

// AXIS OWNERSHIP VIOLATION: an M-/D-Example frame pair is one layout
// opinion rendered through each block's device axis (vault ruling — "M/D
// divergence the device axis can't explain = machine-detectable
// inconsistency"). Frames pair by name (M-<base> / D-<base>); instances
// within a pair correlate by name (same convention as everything else in
// this bucket). Any non-device-axis value that differs between the paired
// instances is flagged — the device axis itself is exempt by definition.
// The separator is matched loosely (`\s*-\s*`) because the real Example
// frame naming convention is "M - Home" / "D - Home" (spaced en-dash-style
// hyphen), not the bare "M-Home" the original regex required — the bare
// form still matches too.
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
    const dByName = new Map((pair.D.instances || []).map((inst) => [inst.name, inst]));
    for (const mInst of pair.M.instances || []) {
      const dInst = dByName.get(mInst.name);
      if (!dInst) continue;
      const mVariant = mInst.variantProps || {};
      const dVariant = dInst.variantProps || {};
      const axes = new Set([...Object.keys(mVariant), ...Object.keys(dVariant)]);
      for (const axis of axes) {
        if (axis === AXIS_OWNERSHIP_DEFAULT_BLOCK_OWNED_AXIS) continue;
        if (JSON.stringify(mVariant[axis]) === JSON.stringify(dVariant[axis])) continue;
        warnings.push({
          type: "axis_ownership_violation",
          nodeId: mInst.id || null,
          nodeName: mInst.name,
          context: `${base}/${axis}`,
          message: `${base}: instance "${mInst.name}" has divergent ${axis} between M-${base} (${JSON.stringify(mVariant[axis])}) and D-${base} (${JSON.stringify(dVariant[axis])}) — a layout holds one opinion per non-device axis.`,
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
  ];
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

async function getNodeById(id) {
  if (typeof figma.getNodeByIdAsync === "function") {
    return figma.getNodeByIdAsync(id);
  }
  if (typeof figma.getNodeById === "function") {
    return figma.getNodeById(id);
  }
  return null;
}

async function getInstanceMainComponent(instance) {
  if (typeof instance.getMainComponentAsync === "function") {
    return instance.getMainComponentAsync();
  }
  return instance.mainComponent;
}

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
async function collectLayerBindingEntries(node, layer, variableById, bindingsOut, seen) {
  function push(property, value) {
    if (value === null || value === undefined) return;
    const key = property + "\u0000" + value;
    if (seen.has(key)) return;
    seen.add(key);
    bindingsOut.push({ layer: layer, property: property, value: value });
  }

  async function resolveVariableName(id) {
    let target = variableById.get(id);
    if (!target) {
      target = await getVariableById(id);
      if (target) variableById.set(id, target);
    }
    if (!target) return "[unresolved alias: " + id + "]";
    const collectionName = collectionNameById.get(target.variableCollectionId) || "[unknown collection]";
    return collectionName + "/" + target.name;
  }

  if (node.boundVariables) {
    for (const prop of Object.keys(node.boundVariables)) {
      const alias = node.boundVariables[prop];
      if (!alias) continue;
      const aliases = Array.isArray(alias) ? alias : [alias];
      for (const a of aliases) {
        if (a && typeof a.id === "string") push(prop, await resolveVariableName(a.id));
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
          push(bucket.prefix + "." + field, await resolveVariableName(alias.id));
        }
      }
    }
  }
  for (const field of ["textStyleId", "fillStyleId", "strokeStyleId", "effectStyleId"]) {
    const styleId = node[field];
    if (typeof styleId !== "string" || !styleId) continue;
    const style = await getStyleById(styleId);
    push(field.replace(/Id$/, ""), style ? style.name : styleId);
  }
}

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
async function walkV2Subtree(root, variableById, out, collectBindings) {
  async function visit(node, parent, recordHere, bindingCtx) {
    if (recordHere) {
      out.nodeSnapshots.push({
        id: node.id,
        name: node.name,
        parentId: parent ? parent.id : null,
        parentPath: parent ? nodeNamePath(parent, root) : null,
      });
    }

    if (node.type === "INSTANCE") {
      const mainComponent = await getInstanceMainComponent(node);
      const mainComponentSetName = resolveComponentSetName(mainComponent);
      if (mainComponentSetName && RAW_SPACER_COMPONENT_NAMES.has(mainComponentSetName)) {
        out.spacerInstances.push({ id: node.id, name: node.name, path: nodeNamePath(node, root) });
      }
      if (bindingCtx) {
        const boundName = mainComponent ? resolveComponentSetName(mainComponent) || mainComponent.name : null;
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
        resolvedPaints.push({ paint: paint, binding: await resolveCapabilityBinding(paint, variableById) });
      }
      for (const paint of node.strokes || []) {
        resolvedPaints.push({ paint: paint, binding: await resolveCapabilityBinding(paint, variableById) });
      }
      out.latentCapabilities.push.apply(out.latentCapabilities, collectNodeLatentCapabilities(node, resolvedPaints));
    }

    // bindingCtx.layer === "" marks the variant's own root (see the
    // COMPONENT-boundary branch below) — A's collectComponentBindings only
    // ever walks a component's CHILDREN, never binding-checks the component
    // root itself, so this call is skipped there and fires from the first
    // real child onward.
    if (bindingCtx && node.type !== "INSTANCE" && bindingCtx.layer !== "") {
      await collectLayerBindingEntries(node, bindingCtx.layer, variableById, bindingCtx.bindings, bindingCtx.seen);
    }

    if (Array.isArray(node.children)) {
      const childRecordHere = nextRecordState(node, recordHere);
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
}

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

async function findAllComponentSets() {
  const sets = [];
  for (const page of figma.root.children) {
    if (page.name === "Example") continue;
    sets.push.apply(sets, page.findAll(function (n) { return n.type === "COMPONENT_SET"; }));
  }
  return sets;
}

// Standalone components: COMPONENT nodes NOT inside a COMPONENT_SET (a set's
// own variant members are collected separately, per-set, below) — the other
// half of the v1 components[] export the v2 rewrite dropped (adopt-list #1).
// Same "Example" page exclusion as findAllComponentSets (component pages
// only; the Example page's own instances are templateFrames' concern).
async function findAllStandaloneComponents() {
  const components = [];
  for (const page of figma.root.children) {
    if (page.name === "Example") continue;
    components.push.apply(
      components,
      page.findAll(function (n) { return n.type === "COMPONENT" && (!n.parent || n.parent.type !== "COMPONENT_SET"); })
    );
  }
  return components;
}

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
async function buildTemplateInstanceSnapshot(inst, variableById) {
  const mainComponent = await getInstanceMainComponent(inst);
  const component = resolveComponentSetName(mainComponent) || inst.name;

  const overrides = [];
  for (const ov of inst.overrides || []) {
    const overriddenNode = ov.id === inst.id ? inst : await getNodeById(ov.id);
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
    parentId: parentId,
    parentPath: parentPath,
  });
  await walkV2Subtree(frame, variableById, warningsCollector);

  const instances = frame.children.filter(function (n) { return n.type === "INSTANCE"; });
  const instanceSnapshots = [];
  for (const inst of instances) {
    instanceSnapshots.push(await buildTemplateInstanceSnapshot(inst, variableById));
  }
  return { id: frame.id, name: frame.name, instances: instanceSnapshots };
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
async function buildExampleData(examplePage, variableById, warningsCollector) {
  if (!examplePage) return { sectionSnapshots: [], frameSnapshots: [] };

  const sectionSnapshots = [];
  const frameSnapshots = [];

  async function walkSection(section) {
    const frames = section.children.filter(function (n) { return n.type === "FRAME"; });
    const frameDescs = [];
    for (const frame of frames) {
      frameSnapshots.push(await processExampleFrame(frame, section.id, section.name, variableById, warningsCollector));
      frameDescs.push({ id: frame.id, name: frame.name });
    }
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
    const frameDescs = [];
    for (const frame of bareFrames) {
      frameSnapshots.push(await processExampleFrame(frame, examplePage.id, "", variableById, warningsCollector));
      frameDescs.push({ id: frame.id, name: frame.name });
    }
    sectionSnapshots.push({ name: "", frames: frameDescs });
  }

  return { sectionSnapshots: sectionSnapshots, frameSnapshots: frameSnapshots };
}

// Per-phase progress reporting during buildExport() — a full export on a
// large file can take several seconds with no other feedback; this is a
// one-way status line, never gated on a UI acknowledgement (matches every
// other figma.ui.postMessage call in this file — buildExport() has no
// caller-specific knowledge of whether it's running for a manual export or
// a sync POST, so it just reports; both ui.html paths render the same
// "export-progress" message the same way).
function reportPhase(text) {
  figma.ui.postMessage({ type: "export-progress", text: text });
}

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
      const valuesByMode = {};
      for (const mode of modes) {
        const raw = variable.valuesByMode
          ? variable.valuesByMode[mode.modeId]
          : undefined;
        if (raw === undefined) {
          valuesByMode[mode.name] = null;
          continue;
        }
        valuesByMode[mode.name] = await resolveAliasNotation(raw, variableById);
      }

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
      modes: modes.map((m) => m.name),
      variables: variablesOut,
    });
  }

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
  const warningsCollector = { nodeSnapshots: [], spacerInstances: [], latentCapabilities: [], variantBindings: new Map() };

  reportPhase("Collecting components…");
  const componentSetNodes = await findAllComponentSets();
  for (const set of componentSetNodes) {
    await walkV2Subtree(set, variableById, warningsCollector, true);
  }
  const standaloneComponentNodes = await findAllStandaloneComponents();

  reportPhase("Resolving templates…");
  const examplePage = findExamplePage();
  const exampleData = await buildExampleData(examplePage, variableById, warningsCollector);

  const componentSets = buildComponentSets(buildComponentSetSnapshots(componentSetNodes));
  const components = buildComponents(
    buildComponentSnapshots(componentSetNodes, standaloneComponentNodes, warningsCollector.variantBindings)
  );
  const exampleStructure = buildExampleStructure(exampleData.sectionSnapshots);
  const templateFrames = buildTemplateFrames(exampleData.frameSnapshots);

  reportPhase("Scanning capabilities…");
  const latentCapabilities = buildLatentCapabilities(warningsCollector.latentCapabilities);

  reportPhase("Running lint checks…");
  const warnings = buildWarnings({
    spacerInstances: warningsCollector.spacerInstances,
    nodeSnapshots: warningsCollector.nodeSnapshots,
    templateFrames: templateFrames,
  });

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
  };

  return output;
}

// --- live sync mode ---------------------------------------------------------
//
// "Start sync" is additive to the existing one-shot export above, which
// stays as the offline fallback (works with no listener running, no
// networkAccess granted beyond localhost). While sync is on: an export runs
// immediately, then again on every figma.on('documentchange'), debounced
// SYNC_DEBOUNCE_MS trailing so a burst of edits produces one POST, not one
// per keystroke. Sandbox rule (also stated in ui.html): sync only runs while
// this plugin's UI is open in the file — Figma plugins have no background
// execution, so closing the plugin stops sync until it's reopened and
// restarted.

let syncEnabled = false;
let syncDebounceTimer = null;
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
const LAST_SYNC_STORAGE_KEY = "capture-figma:last-sync";

async function loadLastSyncFromStorage() {
  try {
    const stored = await figma.clientStorage.getAsync(LAST_SYNC_STORAGE_KEY);
    if (stored && typeof stored.lastSyncAt === "number") {
      figma.ui.postMessage({
        type: "sync-status",
        state: "restored",
        lastSyncAt: stored.lastSyncAt,
        lastSyncCount: typeof stored.lastSyncCount === "number" ? stored.lastSyncCount : 0,
      });
    }
  } catch (err) {
    // clientStorage can throw in some plugin execution contexts (e.g.
    // certain sandboxed test runners) — never let a persistence failure
    // block the plugin from opening.
  }
}

async function saveLastSyncToStorage(atMs, count) {
  try {
    await figma.clientStorage.setAsync(LAST_SYNC_STORAGE_KEY, {
      lastSyncAt: atMs,
      lastSyncCount: count,
    });
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
// most one sync POST is in flight at a time (runSyncExport is debounce-
// serialized), so a single pending resolver is sufficient.
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
async function runSyncExport() {
  let data;
  try {
    data = await buildExport();
  } catch (err) {
    figma.ui.postMessage({
      type: "sync-status",
      state: "error",
      message: "export failed: " + (err && err.message ? err.message : String(err)),
    });
    return;
  }

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
  });
  await saveLastSyncToStorage(lastSyncAt, lastSyncCount);
}

function scheduleSyncExport() {
  if (!syncEnabled) return;
  if (syncDebounceTimer !== null) {
    clearTimeout(syncDebounceTimer);
  }
  syncDebounceTimer = setTimeout(() => {
    syncDebounceTimer = null;
    runSyncExport();
  }, SYNC_DEBOUNCE_MS);
}

let documentChangeHandlerRegistered = false;

function ensureDocumentChangeHandler() {
  if (documentChangeHandlerRegistered) return;
  figma.on("documentchange", () => {
    scheduleSyncExport();
  });
  documentChangeHandlerRegistered = true;
}

async function startSync() {
  // Must load every page before registering the documentchange listener —
  // in "dynamic-page" documentAccess mode, figma.on('documentchange') throws
  // "Cannot register documentchange handler in incremental mode without
  // calling figma.loadAllPagesAsync first" otherwise. Large files take a
  // moment, so tell the UI why sync hasn't started yet.
  figma.ui.postMessage({
    type: "sync-status",
    state: "loading",
    message: "loading all pages…",
  });
  await ensureAllPagesLoaded();
  ensureDocumentChangeHandler();

  syncEnabled = true;
  figma.ui.postMessage({ type: "sync-status", state: "on" });
  await runSyncExport(); // full export once immediately, per the task
}

function stopSync() {
  syncEnabled = false;
  if (syncDebounceTimer !== null) {
    clearTimeout(syncDebounceTimer);
    syncDebounceTimer = null;
  }
  figma.ui.postMessage({ type: "sync-status", state: "off" });
}

figma.ui.onmessage = async (msg) => {
  if (!msg) return;

  if (msg.type === "sync-post-result") {
    // Reply to the postSyncExportToUI() request currently in flight, if any.
    if (pendingSyncResolve) {
      const resolve = pendingSyncResolve;
      pendingSyncResolve = null;
      resolve(msg);
    }
    return;
  }

  if (msg.type === "export") {
    try {
      const data = await buildExport();
      figma.ui.postMessage({ type: "export-result", data: data });
    } catch (err) {
      figma.ui.postMessage({
        type: "export-error",
        message: err && err.message ? err.message : String(err),
      });
    }
    return;
  }

  if (msg.type === "start-sync") {
    await startSync();
    return;
  }

  if (msg.type === "stop-sync") {
    stopSync();
    return;
  }
};
