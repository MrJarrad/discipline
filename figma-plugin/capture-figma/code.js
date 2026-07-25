// Capture Figma — full local variable graph export
//
// Exports every local variable collection, every variable (bound or not),
// and every mode's value as normalized JSON. Closes two gaps left by other
// lanes: the MCP lane only sees variables actually bound to a node (and only
// the active mode), and the REST /variables endpoint is Enterprise-gated.
// This plugin reads figma.variables directly, so it works on any plan.
//
// API surface note: this file was written without live access to the current
// Figma Plugin API docs (no WebFetch/context7 lane available in this run).
// It therefore calls the async variants first (getLocalVariableCollectionsAsync,
// getLocalVariablesAsync, getVariableByIdAsync) since those are the documented
// direction the API has moved, and falls back to the older synchronous
// variants (getLocalVariableCollections, getLocalVariables, getVariableById)
// if the async method is missing on this Figma version. Verify against
// https://www.figma.com/plugin-docs/api/figma-variables/ before relying on
// this in a version where both fail.

const PLUGIN_VERSION = "1.0.0";

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

  const output = {
    header: {
      fileName: figma.root.name,
      pluginVersion: PLUGIN_VERSION,
      exportedAt: Date.now(),
      counts: counts,
    },
    collections: collectionsOut,
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
