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
// Output shape (v1.1.0):
//   {
//     header: {
//       fileName, pluginVersion, exportedAt,
//       counts: { <collection name>: <variable count>, ... ,
//                 "styles/text": n, "styles/paint": n,
//                 "styles/effect": n, "styles/grid": n },
//       styleCounts: { text, paint, effect, grid, total,
//                       emptyDescriptions: { text, paint, effect, grid, total } }
//     },
//     collections: [ { name, modes: [...], variables: [...] }, ... ],
//     styles: {
//       text:   [ { name, type: "TEXT",   description, properties: {...} }, ... ],
//       paint:  [ { name, type: "PAINT",  description, properties: {...} }, ... ],
//       effect: [ { name, type: "EFFECT", description, properties: {...} }, ... ],
//       grid:   [ { name, type: "GRID",   description, properties: {...} }, ... ],
//     }
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

const PLUGIN_VERSION = "1.1.0";

figma.showUI(__html__, { width: 480, height: 640 });

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
    out.color = await resolveFieldValue(paint, "color", paint.color, variableById);
  }
  if (Array.isArray(paint.gradientStops)) {
    out.gradientTransform = paint.gradientTransform;
    out.gradientStops = [];
    for (let i = 0; i < paint.gradientStops.length; i++) {
      const stop = paint.gradientStops[i];
      out.gradientStops.push({
        position: stop.position,
        color: await resolveFieldValue(stop, "color", stop.color, variableById),
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
    out.color = await resolveFieldValue(effect, "color", effect.color, variableById);
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
    color: await resolveFieldValue(grid, "color", grid.color, variableById),
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
      out.push({
        name: style.name,
        type: builder.figmaType,
        description: description,
        properties: await builder.buildProperties(style, variableById),
      });
    }

    styles[key] = out;
    styleCounts[key] = out.length;
    styleCounts.total += out.length;
    emptyDescriptions.total += emptyDescriptions[key];
  }

  return { styles, styleCounts, emptyDescriptions };
}

async function buildExport() {
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
      variablesOut.push(variableOut);
    }

    counts[collection.name] = variablesOut.length;

    collectionsOut.push({
      name: collection.name,
      modes: modes.map((m) => m.name),
      variables: variablesOut,
    });
  }

  const stylesExport = await buildStylesExport(variableById);
  for (const key of ["text", "paint", "effect", "grid"]) {
    counts["styles/" + key] = stylesExport.styleCounts[key];
  }

  const output = {
    header: {
      fileName: figma.root.name,
      pluginVersion: PLUGIN_VERSION,
      exportedAt: Date.now(),
      counts: counts,
      styleCounts: Object.assign({}, stylesExport.styleCounts, {
        emptyDescriptions: stylesExport.emptyDescriptions,
      }),
    },
    collections: collectionsOut,
    styles: stylesExport.styles,
  };

  return output;
}

figma.ui.onmessage = async (msg) => {
  if (msg && msg.type === "export") {
    try {
      const data = await buildExport();
      figma.ui.postMessage({ type: "export-result", data: data });
    } catch (err) {
      figma.ui.postMessage({
        type: "export-error",
        message: err && err.message ? err.message : String(err),
      });
    }
  }
};
