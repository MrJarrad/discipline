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

function buildMalformedSpacerNameWarnings(spacerInstances) {
  const warnings = [];
  for (const inst of spacerInstances || []) {
    if (CANONICAL_SPACER_INSTANCE_NAMES.has(inst.name)) continue;
    const label = inst.path || inst.name;
    if (RAW_SPACER_COMPONENT_NAMES.has(inst.name)) {
      warnings.push(`${label} is an un-renamed ${inst.name} spacer instance — rename to SpacerTop/SpacerBottom/SpacerHorizontal/SpacerVertical.`);
    } else {
      warnings.push(`${label} has a malformed spacer name "${inst.name}" — expected one of SpacerTop/SpacerBottom/SpacerHorizontal/SpacerVertical.`);
    }
  }
  return warnings;
}

// DUPLICATE SIBLING NAMES: the id-first/name-fallback correlation every v2
// diff function uses (diffComponentSets, diffExampleStructure,
// diffTemplateFrames, diffLatentCapabilities in capture-listener.mjs) falls
// back to matching by name among siblings when an id isn't stable — two
// siblings sharing a name breaks that fallback ambiguously, so it's flagged
// as a structural warning wherever it occurs.
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
        warnings.push(`Duplicate sibling name "${node.name}" under ${node.parentPath || siblings[0].parentId} — layer names must be unique among siblings for stable id/name-fallback matching.`);
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
function buildAxisOwnershipViolationWarnings(templateFrames) {
  const pairsByBase = new Map();
  for (const frame of templateFrames || []) {
    const match = /^([MD])-(.+)$/.exec(frame.name);
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
        warnings.push(
          `${base}: instance "${mInst.name}" has divergent ${axis} between M-${base} (${JSON.stringify(mVariant[axis])}) and D-${base} (${JSON.stringify(dVariant[axis])}) — a layout holds one opinion per non-device axis.`
        );
      }
    }
  }
  return warnings;
}

// warnings[]: the plugin's structural-lint bucket — combines every lint
// type into one flat array of human-readable strings (same convention as
// the fixture in capture-listener.test.mjs; the listener only counts
// warnings.length, no shape enforced beyond "array").
function buildWarnings(input) {
  const snapshot = input || {};
  return [
    ...buildMalformedSpacerNameWarnings(snapshot.spacerInstances),
    ...buildDuplicateSiblingNameWarnings(snapshot.nodeSnapshots),
    ...buildAxisOwnershipViolationWarnings(snapshot.templateFrames),
  ];
}

// === END SCHEMA V2 TRANSFORM ===

export { buildComponentSets, buildExampleStructure, buildTemplateFrames, buildLatentCapabilities, buildWarnings };
