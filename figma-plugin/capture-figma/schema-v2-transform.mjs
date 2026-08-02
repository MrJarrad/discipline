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

export {
  buildComponentSets,
  buildExampleStructure,
  buildTemplateFrames,
  buildLatentCapabilities,
  buildWarnings,
  resolveComponentSetName,
  nextRecordState,
  isBoundButHiddenPaint,
  collectNodeLatentCapabilities,
  buildComponentProperties,
  buildComponents,
  serializeColor,
  buildHeaderPropskitField,
  computeWarningsByType,
  buildSyncStoragePayload,
  buildRestoredSyncMessage,
};
