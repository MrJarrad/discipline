// Verifies the SUBTREE WALK (code.js) actually populates the
// mainComponentSetName fallback signal siblingsAreInterchangeable needs
// (schema-v2-transform.mjs) — an end-to-end check that same-set repeats
// nested deep inside instance internals (a .ControlSlider instance nested
// inside a HeaderSection instance, two ActionButtonIcon variant arrows as
// its children) get suppressed even when componentSetId doesn't resolve.
// See schema-v2-transform.mjs's siblingsAreInterchangeable doc comment and
// vault decisions/capture-ui-feel-verdict-2026-08-01.md.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildWarnings } from "./schema-v2-transform.mjs";

function readCode() {
  return readFileSync(join(import.meta.dirname, "code.js"), "utf8");
}

function extract(marker, returns) {
  const re = new RegExp(`=== ${marker}[\\s\\S]*?===\\n([\\s\\S]*?)\\n\\/\\/ === END ${marker} ===`);
  const match = re.exec(readCode());
  if (!match) throw new Error(`${marker} markers not found in code.js`);
  return new Function(`${match[1]}\nreturn ${returns};`)();
}

const { createSubtreeWalk } = extract("SUBTREE WALK", "{ createSubtreeWalk }");

function node(id, type, name, children, extra) {
  const n = Object.assign({ id, type, name, children: children || [] }, extra || {});
  for (const c of n.children) c.parent = n;
  return n;
}

function mockApi() {
  return {
    getInstanceMainComponent: async (n) => n.mainComponent || null,
    resolveComponentSetName: (c) => (c && c.parent && c.parent.type === "COMPONENT_SET" ? c.parent.name : c ? c.name : null),
    isSpacerSetName: () => false,
    isOrphanedComponent: () => false,
    nodeNamePath: (n) => n.name,
    nextRecordState: (n, recorded) => {
      const isBoundary = !!n && (n.type === "COMPONENT" || n.type === "FRAME");
      if (isBoundary) return true;
      return !!recorded && typeof n.name === "string" && n.name.startsWith(".");
    },
    resolveCapabilityBinding: async () => null,
    collectNodeLatentCapabilities: () => [],
    collectLayerBindingEntries: async () => {},
  };
}

test("nested-instance interchangeability: two same-set ActionButtonIcon variant arrows inside a .ControlSlider inside a HeaderSection instance — no duplicate_sibling_name warning even though componentSetId is unresolved (null) on the main-component lookup", async () => {
  const setActionButtonIcon = node(undefined, "COMPONENT_SET", "ActionButtonIcon", []);
  // Deliberately WITHOUT an id, so instanceComponentSetId (the .parent.id
  // lookup) resolves to undefined/falsy — reproducing the "id chain came
  // back empty" case the mainComponentSetName fallback is for.
  const compLeft = node(undefined, "COMPONENT", "direction=left");
  compLeft.parent = setActionButtonIcon;
  const compRight = node(undefined, "COMPONENT", "direction=right");
  compRight.parent = setActionButtonIcon;

  const arrowLeft = node("i-arrow-l", "INSTANCE", "ActionButtonIcon", [], { mainComponent: compLeft });
  const arrowRight = node("i-arrow-r", "INSTANCE", "ActionButtonIcon", [], { mainComponent: compRight });
  const controlSlider = node("i-slider", "INSTANCE", ".ControlSlider", [arrowLeft, arrowRight], {
    mainComponent: node("comp-slider", "COMPONENT", "ControlSlider"),
  });
  const headerCompDef = node("comp-header", "COMPONENT", "HeaderSection", [controlSlider]);

  const walk = createSubtreeWalk(mockApi());
  const out = { nodeSnapshots: [], spacerInstances: [], orphanedInstances: [], latentCapabilities: [], variantBindings: new Map() };
  await walk(headerCompDef, new Map(), out, false);

  const arrows = out.nodeSnapshots.filter((n) => n.name === "ActionButtonIcon");
  assert.equal(arrows.length, 2, "both nested arrows must reach nodeSnapshots");
  assert.equal(arrows[0].componentSetId, undefined, "componentSetId is unresolved, per the scenario this test targets");
  assert.equal(arrows[0].mainComponentSetName, "ActionButtonIcon", "the fallback signal must be populated from the walk");

  const warnings = buildWarnings({ nodeSnapshots: out.nodeSnapshots });
  assert.deepEqual(warnings, []);
});

// LIVE CASE (operator's v1.26.0 sync, screenshot evidence: ActionButtonIcon
// x36 + SpacerVertical x8 still flagged after the 1b2a04e "both ids null"
// gate). Distinct from the test above: here mainComponentId RESOLVES and
// legitimately DIFFERS between the two arrows (each variant is its own real
// component node, with its own real id) — only componentSetId (the
// COMPONENT_SET's own id, one .parent hop further) fails to resolve. This
// is the actual, normal shape of "two variants of one set" in a real
// document, and is what falsified the prior gate: mainComponentId presence/
// difference must never veto the name fallback.
test("nested-instance interchangeability (LIVE CASE): two ActionButtonIcon variant arrows with RESOLVED, DIFFERENT mainComponentIds (each variant its own component node) and unresolved componentSetId — no duplicate_sibling_name warning", async () => {
  const setActionButtonIcon = node(undefined, "COMPONENT_SET", "ActionButtonIcon", []);
  // The variants themselves DO resolve to real, distinct ids — that's the
  // normal, expected shape of "two variants". Only the SET's own id (one
  // .parent hop further) is missing, reproducing the live componentSetId
  // resolution gap without also erasing mainComponentId.
  const compLeft = node("comp-left", "COMPONENT", "direction=left");
  compLeft.parent = setActionButtonIcon;
  const compRight = node("comp-right", "COMPONENT", "direction=right");
  compRight.parent = setActionButtonIcon;

  const arrowLeft = node("i-arrow-l", "INSTANCE", "ActionButtonIcon", [], { mainComponent: compLeft });
  const arrowRight = node("i-arrow-r", "INSTANCE", "ActionButtonIcon", [], { mainComponent: compRight });
  const controlSlider = node("i-slider", "INSTANCE", ".ControlSlider", [arrowLeft, arrowRight], {
    mainComponent: node("comp-slider", "COMPONENT", "ControlSlider"),
  });
  const headerCompDef = node("comp-header", "COMPONENT", "HeaderSection", [controlSlider]);

  const walk = createSubtreeWalk(mockApi());
  const out = { nodeSnapshots: [], spacerInstances: [], orphanedInstances: [], latentCapabilities: [], variantBindings: new Map() };
  await walk(headerCompDef, new Map(), out, false);

  const arrows = out.nodeSnapshots.filter((n) => n.name === "ActionButtonIcon");
  assert.equal(arrows.length, 2, "both nested arrows must reach nodeSnapshots");
  assert.equal(arrows[0].mainComponentId, "comp-left");
  assert.equal(arrows[1].mainComponentId, "comp-right");
  assert.notEqual(arrows[0].mainComponentId, arrows[1].mainComponentId, "mainComponentId legitimately differs between variants — this is the live case");
  assert.equal(arrows[0].componentSetId, undefined, "componentSetId is the one that's unresolved");
  assert.equal(arrows[0].mainComponentSetName, "ActionButtonIcon", "the fallback signal must be populated from the walk");

  const warnings = buildWarnings({ nodeSnapshots: out.nodeSnapshots });
  assert.deepEqual(warnings, [], "the live case must be suppressed — mainComponentId differing must never veto the name fallback");
});
