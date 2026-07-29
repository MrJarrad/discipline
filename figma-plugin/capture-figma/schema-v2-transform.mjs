// capture-figma schema v2 — pure payload-assembly functions.
//
// Everything in this file takes a plain, already-read snapshot (no figma.*
// calls, no live node references) and returns the corresponding v2 payload
// fields. code.js's traversal code reads the live Figma tree into snapshots
// of this exact shape, then calls these same functions — duplicated
// verbatim into code.js (see its "SCHEMA V2 TRANSFORM" block), since the
// plugin sandbox has no bundler/import support. The sync-check test in
// schema-v2-transform.test.mjs asserts the two copies stay identical.
//
// === SCHEMA V2 TRANSFORM (duplicated in code.js — keep in sync) ===

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

// === END SCHEMA V2 TRANSFORM ===

export { buildComponentSets, buildExampleStructure };
