// Tests for the pure schema-v2 payload-assembly functions — the part of
// capture-figma's export that has no figma.* dependency (see code.js's
// "SCHEMA V2 TRANSFORM" block, which duplicates this file's functions
// verbatim; the sync-check test at the bottom of this file guards drift).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildComponentSets,
  buildExampleStructure,
  buildTemplateFrames,
  buildLatentCapabilities,
  buildWarnings,
  resolveComponentSetName,
  isOrphanedComponent,
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
  buildModeTable,
  buildModePins,
  buildCopyEntries,
} from "./schema-v2-transform.mjs";

// Extracts the text strictly between the "=== SCHEMA V2 TRANSFORM ..." and
// "=== END SCHEMA V2 TRANSFORM ===" marker comments. The marker lines
// themselves are allowed to differ (each file names the other as the
// duplication source); only the enclosed function/const bodies must match.
function extractSchemaV2Block(source) {
  const match = /=== SCHEMA V2 TRANSFORM[^\n]*===\n([\s\S]*?)\n\/\/ === END SCHEMA V2 TRANSFORM ===/.exec(source);
  if (!match) throw new Error("SCHEMA V2 TRANSFORM markers not found");
  return match[1];
}

test("buildComponentSets: maps a component-set snapshot to key/id/name/description/properties/variantCount", () => {
  const sets = [
    {
      key: "set-hero",
      id: "1:1",
      name: "HeroText",
      description: "Marketing hero block.",
      variantCount: 3,
      componentPropertyDefinitions: {
        device: { type: "VARIANT", defaultValue: "desktop", variantOptions: ["mobile", "desktop"] },
      },
    },
  ];

  const result = buildComponentSets(sets);

  assert.deepEqual(result, [
    {
      key: "set-hero",
      id: "1:1",
      name: "HeroText",
      description: "Marketing hero block.",
      properties: {
        device: { type: "VARIANT", defaultValue: "desktop", variantOptions: ["mobile", "desktop"] },
      },
      variantCount: 3,
    },
  ]);
});

test("buildExampleStructure: maps section snapshots to {name, frames:[{id,name}]}, dropping unrelated fields", () => {
  const sections = [
    {
      name: "M-Example",
      unrelatedField: "ignored",
      frames: [
        { id: "frame-1", name: "Default", unrelatedField: "ignored" },
        { id: "frame-2", name: "Hover" },
      ],
    },
  ];

  const result = buildExampleStructure(sections);

  assert.deepEqual(result, [
    {
      name: "M-Example",
      frames: [
        { id: "frame-1", name: "Default" },
        { id: "frame-2", name: "Hover" },
      ],
    },
  ]);
});

test("buildExampleStructure + buildTemplateFrames: a nested SECTION-in-SECTION and a bare page-level frame each get their own entry", () => {
  // Shape code.js's buildExampleData produces for an Example page with:
  //   SECTION "M-Example" (frame "Default")
  //     SECTION "M-Example/Nested" (frame "Inner")   <- SECTION-in-SECTION
  //   FRAME "Orphan"                                 <- bare page-level frame
  const sections = [
    { name: "M-Example", frames: [{ id: "frame-1", name: "Default" }] },
    { name: "M-Example/Nested", frames: [{ id: "frame-2", name: "Inner" }] },
    { name: "", frames: [{ id: "frame-3", name: "Orphan" }] },
  ];
  const frames = [
    { id: "frame-1", name: "Default", instances: [] },
    { id: "frame-2", name: "Inner", instances: [] },
    { id: "frame-3", name: "Orphan", instances: [] },
  ];

  const structure = buildExampleStructure(sections);
  const templateFrames = buildTemplateFrames(frames);

  assert.deepEqual(structure, [
    { name: "M-Example", frames: [{ id: "frame-1", name: "Default" }] },
    { name: "M-Example/Nested", frames: [{ id: "frame-2", name: "Inner" }] },
    { name: "", frames: [{ id: "frame-3", name: "Orphan" }] },
  ]);
  assert.deepEqual(
    templateFrames.map((f) => f.id),
    ["frame-1", "frame-2", "frame-3"]
  );
});

test("buildTemplateFrames: splits an instance's componentProperties into variantProps (type VARIANT) vs properties (everything else)", () => {
  const frames = [
    {
      id: "tf-1",
      name: "Homepage",
      width: 1440,
      height: 3120,
      instances: [
        {
          id: "inst-1",
          name: "Hero",
          component: "HeroText",
          componentProperties: {
            device: { value: "desktop", type: "VARIANT" },
            height: { value: "L", type: "VARIANT" },
            title: { value: "Welcome", type: "TEXT" },
          },
          overrides: [],
        },
      ],
    },
  ];

  const result = buildTemplateFrames(frames);

  assert.deepEqual(result, [
    {
      id: "tf-1",
      name: "Homepage",
      width: 1440,
      height: 3120,
      devStatus: null,
      instances: [
        {
          id: "inst-1",
          name: "Hero",
          component: "HeroText",
          variantProps: { device: "desktop", height: "L" },
          properties: { title: "Welcome" },
          overrides: [],
        },
      ],
    },
  ]);
});

test("buildTemplateFrames: passes overrides through verbatim (id/property/value already resolved by the caller)", () => {
  const frames = [
    {
      id: "tf-1",
      name: "Homepage",
      instances: [
        {
          id: "inst-1",
          name: "Hero",
          component: "HeroText",
          componentProperties: {},
          overrides: [
            { id: "inst-1/Hero/SpacerTop", property: "visible", value: true, unrelatedField: "ignored" },
          ],
        },
      ],
    },
  ];

  const result = buildTemplateFrames(frames);

  assert.deepEqual(result[0].instances[0].overrides, [{ id: "inst-1/Hero/SpacerTop", property: "visible", value: true }]);
});

test("buildTemplateFrames: carries the frame's width/height through (Math.round'd by the caller), answering frame-geometry questions from the artifact", () => {
  const frames = [
    { id: "tf-1", name: "Homepage", width: 1440, height: 3120, instances: [] },
  ];

  const result = buildTemplateFrames(frames);

  assert.equal(result[0].width, 1440);
  assert.equal(result[0].height, 3120);
});

test("buildTemplateFrames: carries the frame's devStatus through verbatim (page-template conformance lane's scope signal — READY_FOR_DEV templates are the checkable set)", () => {
  const frames = [
    { id: "tf-1", name: "D - Projects", width: 1280, height: 720, devStatus: { type: "READY_FOR_DEV" }, instances: [] },
    { id: "tf-2", name: "D - Draft", width: 1280, height: 720, devStatus: null, instances: [] },
  ];

  const result = buildTemplateFrames(frames);

  assert.deepEqual(result[0].devStatus, { type: "READY_FOR_DEV" });
  assert.equal(result[1].devStatus, null);
});

test("buildTemplateFrames: a frame snapshot with no devStatus field at all still produces devStatus: null (null-is-unknown — no field is never treated as ready)", () => {
  const frames = [{ id: "tf-1", name: "D - Legacy", width: 1280, height: 720, instances: [] }];

  const result = buildTemplateFrames(frames);

  assert.equal(result[0].devStatus, null);
});

test("buildLatentCapabilities: maps a capability-node snapshot to id/name/visible/binding, dropping unrelated fields", () => {
  const caps = [
    { id: "cap-1", name: "has-background", visible: false, binding: "color/surface/raised", nodeType: "RECTANGLE" },
  ];

  const result = buildLatentCapabilities(caps);

  assert.deepEqual(result, [{ id: "cap-1", name: "has-background", visible: false, binding: "color/surface/raised" }]);
});

test("buildWarnings: flags a block-internal spacer instance left un-renamed (still SpaceVertical/SpaceHorizontal), as a typed record", () => {
  const result = buildWarnings({
    spacerInstances: [{ id: "n1", path: "Homepage/Hero/SpaceVertical", name: "SpaceVertical" }],
  });

  assert.deepEqual(result, [
    {
      type: "malformed_spacer_name",
      nodeId: "n1",
      nodeName: "SpaceVertical",
      context: "Homepage/Hero/SpaceVertical",
      message: 'Homepage/Hero/SpaceVertical is an un-renamed SpaceVertical spacer instance — rename to SpacerTop/SpacerBottom/SpacerHorizontal/SpacerVertical.',
    },
  ]);
});

test("buildWarnings: flags a malformed spacer rename (typo, kebab-case) distinctly from an un-renamed instance, as typed records", () => {
  const result = buildWarnings({
    spacerInstances: [
      { id: "n1", path: "Homepage/Hero/SpaceBottom", name: "SpaceBottom" },
      { id: "n2", path: "Homepage/Hero/Spacer-top", name: "Spacer-top" },
      { id: "n3", path: "Homepage/Hero/SpacerTop", name: "SpacerTop" },
    ],
  });

  assert.deepEqual(result, [
    {
      type: "malformed_spacer_name",
      nodeId: "n1",
      nodeName: "SpaceBottom",
      context: "Homepage/Hero/SpaceBottom",
      message: 'Homepage/Hero/SpaceBottom has a malformed spacer name "SpaceBottom" — expected one of SpacerTop/SpacerBottom/SpacerHorizontal/SpacerVertical.',
    },
    {
      type: "malformed_spacer_name",
      nodeId: "n2",
      nodeName: "Spacer-top",
      context: "Homepage/Hero/Spacer-top",
      message: 'Homepage/Hero/Spacer-top has a malformed spacer name "Spacer-top" — expected one of SpacerTop/SpacerBottom/SpacerHorizontal/SpacerVertical.',
    },
  ]);
});

test("buildWarnings: flags two siblings sharing a name under the same parent, as a typed record", () => {
  const result = buildWarnings({
    nodeSnapshots: [
      { id: "n1", name: "Icon", parentId: "frame-1", parentPath: "Homepage/Hero" },
      { id: "n2", name: "Icon", parentId: "frame-1", parentPath: "Homepage/Hero" },
      { id: "n3", name: "Title", parentId: "frame-1", parentPath: "Homepage/Hero" },
    ],
  });

  assert.deepEqual(result, [
    {
      type: "duplicate_sibling_name",
      nodeId: "n2",
      nodeName: "Icon",
      context: "Homepage/Hero",
      message: 'Duplicate sibling name "Icon" under Homepage/Hero — layer names must be unique among siblings for stable id/name-fallback matching.',
      resolution: { mainComponentId: null, componentSetId: null, mainComponentSetName: null },
    },
  ]);
});

test("buildWarnings: N same-named INSTANCE siblings of the SAME main component are interchangeable repeats — no warning (operator ruling 2026-08-01, Addendum 8)", () => {
  const result = buildWarnings({
    nodeSnapshots: [
      { id: "n1", name: "Row", type: "INSTANCE", mainComponentId: "comp-row", parentId: "frame-1", parentPath: "Homepage/List" },
      { id: "n2", name: "Row", type: "INSTANCE", mainComponentId: "comp-row", parentId: "frame-1", parentPath: "Homepage/List" },
      { id: "n3", name: "Row", type: "INSTANCE", mainComponentId: "comp-row", parentId: "frame-1", parentPath: "Homepage/List" },
    ],
  });

  assert.deepEqual(result, []);
});

test("buildWarnings: same-named INSTANCE siblings that are DIFFERENT VARIANTS of the SAME component set are interchangeable — no warning", () => {
  const result = buildWarnings({
    nodeSnapshots: [
      { id: "n1", name: "ActionButton", type: "INSTANCE", mainComponentId: "comp-variant-a", componentSetId: "set-actionbutton", parentId: "frame-1", parentPath: "HeaderSection/actions" },
      { id: "n2", name: "ActionButton", type: "INSTANCE", mainComponentId: "comp-variant-b", componentSetId: "set-actionbutton", parentId: "frame-1", parentPath: "HeaderSection/actions" },
    ],
  });

  assert.deepEqual(result, []);
});

test("buildWarnings: same-named INSTANCE siblings that are variants of DIFFERENT component sets are genuine ambiguity — still flagged", () => {
  const result = buildWarnings({
    nodeSnapshots: [
      { id: "n1", name: "ControlSlider", type: "INSTANCE", mainComponentId: "comp-variant-a", componentSetId: "set-slider", parentId: "frame-1", parentPath: "HeaderSection/actions" },
      { id: "n2", name: "ControlSlider", type: "INSTANCE", mainComponentId: "comp-variant-b", componentSetId: "set-toggle", parentId: "frame-1", parentPath: "HeaderSection/actions" },
    ],
  });

  assert.deepEqual(result, [
    {
      type: "duplicate_sibling_name",
      nodeId: "n2",
      nodeName: "ControlSlider",
      context: "HeaderSection/actions",
      message: 'Duplicate sibling name "ControlSlider" under HeaderSection/actions — layer names must be unique among siblings for stable id/name-fallback matching.',
      resolution: { mainComponentId: "comp-variant-b", componentSetId: "set-toggle", mainComponentSetName: null },
    },
  ]);
});

test("buildWarnings: same-named INSTANCE siblings of DIFFERENT main components are genuine ambiguity — still flagged", () => {
  const result = buildWarnings({
    nodeSnapshots: [
      { id: "n1", name: "Row", type: "INSTANCE", mainComponentId: "comp-row", parentId: "frame-1", parentPath: "Homepage/List" },
      { id: "n2", name: "Row", type: "INSTANCE", mainComponentId: "comp-row-variant", parentId: "frame-1", parentPath: "Homepage/List" },
    ],
  });

  assert.deepEqual(result, [
    {
      type: "duplicate_sibling_name",
      nodeId: "n2",
      nodeName: "Row",
      context: "Homepage/List",
      message: 'Duplicate sibling name "Row" under Homepage/List — layer names must be unique among siblings for stable id/name-fallback matching.',
      resolution: { mainComponentId: "comp-row-variant", componentSetId: null, mainComponentSetName: null },
    },
  ]);
});

// GROUND TRUTH (operator's v1.26.2 sync, diagnostic artifact
// ~/JHD/captures/live/jhd-spec-designsystem-variables-styles.json,
// warnings[] entries verbatim — see this file's siblingsAreInterchangeable
// doc comment for the full derivation):
//
// ActionButtonIcon x40: the flagged node resolves mainComponentId
// "919:6993", componentSetId NULL, mainComponentSetName
// "ActionButtonIconEllipse/tertiary/100/default/right" (39x — 1x carries
// ".../disabled/right" instead). ActionButtonIconEllipse is NOT a component
// SET — it's a slash-named STANDALONE component family (no componentSets[]
// entry for it at all); the colliding sibling is its /left twin. Full
// names legitimately differ; only the family (first slash segment) agrees.
//
// SpacerVertical x8: the flagged node resolves BOTH ids — componentSetId
// "30:159", which IS a real componentSets[] entry (name "SpacerVertical",
// 13 variants). The previous "either side truthy -> veto" gate
// (`a.componentSetId || b.componentSetId`) treated the flagged node's
// resolved id and the sibling's unresolved (null) id as a DECIDED
// difference, when a null is really UNKNOWN — it should have deferred to
// the name instead of flagging.
test("buildWarnings (GROUND TRUTH a — ActionButtonIcon live case): same-named INSTANCE siblings from a slash-named STANDALONE family (no component set — componentSetId null on both, mainComponentId legitimately differs) suppress via FAMILY match (equal first slash-segment), full names differing — no warning", () => {
  const result = buildWarnings({
    nodeSnapshots: [
      { id: "n1", name: "ActionButtonIcon", type: "INSTANCE", mainComponentId: "919:6993", componentSetId: null, mainComponentSetName: "ActionButtonIconEllipse/tertiary/100/default/right", parentId: "i-slider", parentPath: "HeaderSection/.ControlSlider" },
      { id: "n2", name: "ActionButtonIcon", type: "INSTANCE", mainComponentId: "919:7100", componentSetId: null, mainComponentSetName: "ActionButtonIconEllipse/tertiary/100/default/left", parentId: "i-slider", parentPath: "HeaderSection/.ControlSlider" },
    ],
  });

  assert.deepEqual(result, []);
});

test("buildWarnings (GROUND TRUTH b — SpacerVertical live case): a componentSetId resolved on ONE side and null on the other is UNKNOWN, not a decided difference — falls to name, which matches (same real SpacerVertical component set, 30:159) — no warning", () => {
  const result = buildWarnings({
    nodeSnapshots: [
      { id: "n1", name: "SpacerVertical", type: "INSTANCE", mainComponentId: "651:6025", componentSetId: "30:159", mainComponentSetName: "SpacerVertical", parentId: "i-cardmedia", parentPath: "SplitAsymmetric/feed/.CardMedia/content" },
      { id: "n2", name: "SpacerVertical", type: "INSTANCE", mainComponentId: "999:1111", componentSetId: null, mainComponentSetName: "SpacerVertical", parentId: "i-cardmedia", parentPath: "SplitAsymmetric/feed/.CardMedia/content" },
    ],
  });

  assert.deepEqual(result, []);
});

test("buildWarnings (GROUND TRUTH e): same-named INSTANCE siblings with null componentSetId on both AND null mainComponentSetName on both cannot establish interchangeability — conservatively still flagged", () => {
  const result = buildWarnings({
    nodeSnapshots: [
      { id: "n1", name: "Row", type: "INSTANCE", mainComponentId: "comp-a", componentSetId: null, mainComponentSetName: null, parentId: "frame-1", parentPath: "Homepage/List" },
      { id: "n2", name: "Row", type: "INSTANCE", mainComponentId: "comp-b", componentSetId: null, mainComponentSetName: null, parentId: "frame-1", parentPath: "Homepage/List" },
    ],
  });

  assert.deepEqual(result, [
    {
      type: "duplicate_sibling_name",
      nodeId: "n2",
      nodeName: "Row",
      context: "Homepage/List",
      message: 'Duplicate sibling name "Row" under Homepage/List — layer names must be unique among siblings for stable id/name-fallback matching.',
      resolution: { mainComponentId: "comp-b", componentSetId: null, mainComponentSetName: null },
    },
  ]);
});

test("buildWarnings (GROUND TRUTH d): same-named INSTANCE siblings with null componentSetId on both but DIFFERENT families (different first slash-segment) are genuine ambiguity — still flagged", () => {
  const result = buildWarnings({
    nodeSnapshots: [
      { id: "n1", name: "SpacerVertical", type: "INSTANCE", mainComponentId: "comp-a", componentSetId: null, mainComponentSetName: "CardMedia/size=100", parentId: "frame-1", parentPath: "SplitAsymmetric/feed" },
      { id: "n2", name: "SpacerVertical", type: "INSTANCE", mainComponentId: "comp-b", componentSetId: null, mainComponentSetName: "ActionButton/size=200", parentId: "frame-1", parentPath: "SplitAsymmetric/feed" },
    ],
  });

  assert.deepEqual(result, [
    {
      type: "duplicate_sibling_name",
      nodeId: "n2",
      nodeName: "SpacerVertical",
      context: "SplitAsymmetric/feed",
      message: 'Duplicate sibling name "SpacerVertical" under SplitAsymmetric/feed — layer names must be unique among siblings for stable id/name-fallback matching.',
      resolution: { mainComponentId: "comp-b", componentSetId: null, mainComponentSetName: "ActionButton/size=200" },
    },
  ]);
});

test("buildWarnings (GROUND TRUTH c): same-named INSTANCE siblings with non-null, DIFFERENT componentSetIds are genuine ambiguity — still flagged even if their resolved set names happen to be identical (both present -> decided by id, name never gets a turn)", () => {
  const result = buildWarnings({
    nodeSnapshots: [
      { id: "n1", name: "ControlSlider", type: "INSTANCE", mainComponentId: "comp-a", componentSetId: "set-1", mainComponentSetName: "ControlSlider", parentId: "frame-1", parentPath: "HeaderSection/actions" },
      { id: "n2", name: "ControlSlider", type: "INSTANCE", mainComponentId: "comp-b", componentSetId: "set-2", mainComponentSetName: "ControlSlider", parentId: "frame-1", parentPath: "HeaderSection/actions" },
    ],
  });

  assert.deepEqual(result, [
    {
      type: "duplicate_sibling_name",
      nodeId: "n2",
      nodeName: "ControlSlider",
      context: "HeaderSection/actions",
      message: 'Duplicate sibling name "ControlSlider" under HeaderSection/actions — layer names must be unique among siblings for stable id/name-fallback matching.',
      resolution: { mainComponentId: "comp-b", componentSetId: "set-2", mainComponentSetName: "ControlSlider" },
    },
  ]);
});

test("buildWarnings: same-named INSTANCE siblings with unresolved componentSetId (null) but DIFFERENT resolved component-set names are genuine ambiguity — still flagged", () => {
  const result = buildWarnings({
    nodeSnapshots: [
      { id: "n1", name: "ControlSlider", type: "INSTANCE", mainComponentId: "comp-a", componentSetId: null, mainComponentSetName: "ControlSlider", parentId: "frame-1", parentPath: "HeaderSection/actions" },
      { id: "n2", name: "ControlSlider", type: "INSTANCE", mainComponentId: "comp-b", componentSetId: null, mainComponentSetName: "ToggleSlider", parentId: "frame-1", parentPath: "HeaderSection/actions" },
    ],
  });

  assert.deepEqual(result, [
    {
      type: "duplicate_sibling_name",
      nodeId: "n2",
      nodeName: "ControlSlider",
      context: "HeaderSection/actions",
      message: 'Duplicate sibling name "ControlSlider" under HeaderSection/actions — layer names must be unique among siblings for stable id/name-fallback matching.',
      resolution: { mainComponentId: "comp-b", componentSetId: null, mainComponentSetName: "ToggleSlider" },
    },
  ]);
});

test("buildWarnings: a same-named INSTANCE + FRAME pair is a node-type mismatch — still flagged", () => {
  const result = buildWarnings({
    nodeSnapshots: [
      { id: "n1", name: "Row", type: "INSTANCE", mainComponentId: "comp-row", parentId: "frame-1", parentPath: "Homepage/List" },
      { id: "n2", name: "Row", type: "FRAME", mainComponentId: null, parentId: "frame-1", parentPath: "Homepage/List" },
    ],
  });

  assert.deepEqual(result, [
    {
      type: "duplicate_sibling_name",
      nodeId: "n2",
      nodeName: "Row",
      context: "Homepage/List",
      message: 'Duplicate sibling name "Row" under Homepage/List — layer names must be unique among siblings for stable id/name-fallback matching.',
      resolution: { mainComponentId: null, componentSetId: null, mainComponentSetName: null },
    },
  ]);
});

test("buildWarnings: two same-named FRAME (non-instance) siblings keep the unchanged behavior — flagged", () => {
  const result = buildWarnings({
    nodeSnapshots: [
      { id: "n1", name: "Section", type: "FRAME", mainComponentId: null, parentId: "frame-1", parentPath: "Homepage" },
      { id: "n2", name: "Section", type: "FRAME", mainComponentId: null, parentId: "frame-1", parentPath: "Homepage" },
    ],
  });

  assert.deepEqual(result, [
    {
      type: "duplicate_sibling_name",
      nodeId: "n2",
      nodeName: "Section",
      context: "Homepage",
      message: 'Duplicate sibling name "Section" under Homepage — layer names must be unique among siblings for stable id/name-fallback matching.',
      resolution: { mainComponentId: null, componentSetId: null, mainComponentSetName: null },
    },
  ]);
});

// HOMOGENEOUS REPEATING RUNS (operator ruling 2026-08-13, fleet/rulings/
// 2026-08-13-repeating-grid-names.md): live case — LayoutGrid's "feed"
// wrapper (rootLevel: false — two boundary hops from whatever walk root
// carries it, same shape as ~/JHD/captures/live/latest-warnings.json's real
// "header" under "LayoutGrid/feed" survivors) contains two same-name,
// same-type FRAME siblings with no component identity to interchange on.
// Demoted to an ordinally-keyed INFO record instead of a WARNING.
test("buildWarnings: same-named, same-type FRAME siblings OUTSIDE any boundary's own top-level surface (rootLevel: false) are a homogeneous repeating run — demoted to an ordinally-keyed INFO record, not a WARNING", () => {
  const result = buildWarnings({
    nodeSnapshots: [
      { id: "n1", name: "header", type: "FRAME", mainComponentId: null, rootLevel: false, parentId: "feed-1", parentPath: "LayoutGrid/feed" },
      { id: "n2", name: "header", type: "FRAME", mainComponentId: null, rootLevel: false, parentId: "feed-1", parentPath: "LayoutGrid/feed" },
    ],
  });

  assert.deepEqual(result, [
    {
      type: "homogeneous_sibling_sequence",
      nodeId: "n2",
      nodeName: "header",
      context: "LayoutGrid/feed",
      message: 'Sibling name "header" repeats 2× under LayoutGrid/feed as a regular structural run — keyed header#1, header#2 (informational, not a naming defect).',
      sequence: ["header#1", "header#2"],
    },
  ]);
});

// The SAME name/type collision, but at a boundary's own top-level surface
// (rootLevel: true — a component's own addressable layers, or an Example
// frame's own top-level instances) stays a WARNING: "unknown/root-level" is
// never treated as safe to demote, per the ruling's "keep WARNING inside
// component subtrees" half.
test("buildWarnings: the SAME same-named, same-type FRAME collision AT a boundary's own top-level surface (rootLevel: true) stays a WARNING — not eligible for the homogeneous-run demotion", () => {
  const result = buildWarnings({
    nodeSnapshots: [
      { id: "n1", name: "content", type: "FRAME", mainComponentId: null, rootLevel: true, parentId: "navheader-1", parentPath: "NavigationHeader" },
      { id: "n2", name: "content", type: "FRAME", mainComponentId: null, rootLevel: true, parentId: "navheader-1", parentPath: "NavigationHeader" },
    ],
  });

  assert.deepEqual(result, [
    {
      type: "duplicate_sibling_name",
      nodeId: "n2",
      nodeName: "content",
      context: "NavigationHeader",
      message: 'Duplicate sibling name "content" under NavigationHeader — layer names must be unique among siblings for stable id/name-fallback matching.',
      resolution: { mainComponentId: null, componentSetId: null, mainComponentSetName: null },
    },
  ]);
});

// A group with mixed node types (heterogeneous) never counts as a
// homogeneous run, no matter how deep it sits — "same name + node type" is
// an AND, not an OR.
test("buildWarnings: same-named siblings OUTSIDE a boundary's top-level surface but with DIFFERENT node types are heterogeneous — still a WARNING, never demoted", () => {
  const result = buildWarnings({
    nodeSnapshots: [
      { id: "n1", name: "title", type: "TEXT", mainComponentId: null, rootLevel: false, parentId: "primary-1", parentPath: "NavigationHeader/content/primary" },
      { id: "n2", name: "title", type: "GROUP", mainComponentId: null, rootLevel: false, parentId: "primary-1", parentPath: "NavigationHeader/content/primary" },
    ],
  });

  assert.deepEqual(result, [
    {
      type: "duplicate_sibling_name",
      nodeId: "n2",
      nodeName: "title",
      context: "NavigationHeader/content/primary",
      message: 'Duplicate sibling name "title" under NavigationHeader/content/primary — layer names must be unique among siblings for stable id/name-fallback matching.',
      resolution: { mainComponentId: null, componentSetId: null, mainComponentSetName: null },
    },
  ]);
});

// RATIFIED SIBLING-NAME EXCEPTION (operator ruling 2026-08-01, vault
// memories/token-rulings.md "NavigationHeader M/D split composition is
// INTENDED" — folded into duplicate_sibling_name per the 2026-08-13 ruling):
// live case — a mobile Example frame's two top-level "NavigationHeader"
// instances (title-only + actions-only, a heterogeneous pair — different
// main components, so never interchangeable and never a homogeneous run
// either) downgrade to the SAME ratified_axis_exception type the axis-
// ownership checker already emits for this exact composition decision — no
// second exceptions table.
test("buildWarnings: the mobile NavigationHeader two-instance split (root-level, heterogeneous instances) folds into the SAME ratified-axis-exception registry the axis-ownership checker uses — ratified_axis_exception, not a WARNING", () => {
  const result = buildWarnings({
    nodeSnapshots: [
      { id: "n1", name: "NavigationHeader", type: "INSTANCE", mainComponentId: "comp-title-only", componentSetId: "set-navheader-title", mainComponentSetName: "NavigationHeader/title", rootLevel: true, parentId: "frame-1", parentPath: "M - Home - Gallery – Landing" },
      { id: "n2", name: "NavigationHeader", type: "INSTANCE", mainComponentId: "comp-actions-only", componentSetId: "set-navheader-actions", mainComponentSetName: "NavigationHeader/actions", rootLevel: true, parentId: "frame-1", parentPath: "M - Home - Gallery – Landing" },
    ],
  });

  assert.deepEqual(result, [
    {
      type: "ratified_axis_exception",
      nodeId: "n2",
      nodeName: "NavigationHeader",
      context: "M - Home - Gallery – Landing",
      message: 'Duplicate sibling name "NavigationHeader" under M - Home - Gallery – Landing — ratified exception (operator ruling 2026-08-01, vault memories/token-rulings.md), not a violation.',
    },
  ]);
});

// SYNTHETIC HETEROGENEOUS FIXTURE (the ratified-exception mechanism must
// stay a NAMED, cited allowlist — never generalize to "any root-level
// heterogeneous duplicate is fine"): a two-instance split under an
// UNRATIFIED component name is a real WARNING, exactly like NavigationHeader
// would be without its citation.
test("buildWarnings: a root-level heterogeneous instance split under an UNRATIFIED component name is still a genuine WARNING — the exception never generalizes past its cited registry", () => {
  const result = buildWarnings({
    nodeSnapshots: [
      { id: "n1", name: "PromoBanner", type: "INSTANCE", mainComponentId: "comp-a", componentSetId: "set-promo", mainComponentSetName: "PromoBanner", rootLevel: true, parentId: "frame-1", parentPath: "M - Home - Gallery – Landing" },
      { id: "n2", name: "PromoBanner", type: "INSTANCE", mainComponentId: "comp-b", componentSetId: "set-other", mainComponentSetName: "OtherSet", rootLevel: true, parentId: "frame-1", parentPath: "M - Home - Gallery – Landing" },
    ],
  });

  assert.deepEqual(result, [
    {
      type: "duplicate_sibling_name",
      nodeId: "n2",
      nodeName: "PromoBanner",
      context: "M - Home - Gallery – Landing",
      message: 'Duplicate sibling name "PromoBanner" under M - Home - Gallery – Landing — layer names must be unique among siblings for stable id/name-fallback matching.',
      resolution: { mainComponentId: "comp-b", componentSetId: "set-other", mainComponentSetName: "OtherSet" },
    },
  ]);
});

// DIAGNOSTIC FIELDS (operator's v1.26.1 syncs — the 48 duplicate_sibling_name
// survivors are still flagging after the setId-only gate; instrumenting the
// actual resolved values rather than hypothesizing further). Additive,
// duplicate_sibling_name-only: `resolution` carries the flagged node's own
// mainComponentId/componentSetId/mainComponentSetName exactly as the walk
// resolved them — null preserved as null on every field, not coerced away.
// SPACER SIBLING EXEMPTION (operator ruling 2026-08-02, vault
// decisions/capture-ui-feel-verdict-2026-08-01.md Addenda 13-14): the
// spacer-naming rule forces every spacer instance to carry one of the four
// canonical names, so duplicate canonical-named spacer siblings are
// intended, not the id/name-fallback ambiguity this check exists to catch.
test("buildWarnings: a stack of canonical-named spacer siblings with UNRESOLVABLE members (the live SplitAsymmetric/feed/.CardMedia/content false positive — same-set stacked spacers, not a legacy-component issue) is silent — unresolved members don't break the exemption", () => {
  const result = buildWarnings({
    nodeSnapshots: [
      { id: "n1", name: "SpacerVertical", type: "INSTANCE", mainComponentId: "651:6025", componentSetId: "30:159", mainComponentSetName: "SpacerVertical", parentId: "i-cardmedia", parentPath: "SplitAsymmetric/feed/.CardMedia/content" },
      { id: "n2", name: "SpacerVertical", type: "INSTANCE", mainComponentId: null, componentSetId: null, mainComponentSetName: null, parentId: "i-cardmedia", parentPath: "SplitAsymmetric/feed/.CardMedia/content" },
      { id: "n3", name: "SpacerVertical", type: "INSTANCE", mainComponentId: null, componentSetId: null, mainComponentSetName: null, parentId: "i-cardmedia", parentPath: "SplitAsymmetric/feed/.CardMedia/content" },
    ],
  });

  assert.deepEqual(result, []);
});

test("buildWarnings: an all-resolvable stack of canonical-named spacer siblings (every member a real spacer-set instance) is silent", () => {
  const result = buildWarnings({
    nodeSnapshots: [
      { id: "n1", name: "SpacerTop", type: "INSTANCE", mainComponentId: "651:6025", componentSetId: "30:159", mainComponentSetName: "SpacerVertical", parentId: "frame-1", parentPath: "Homepage/List" },
      { id: "n2", name: "SpacerTop", type: "INSTANCE", mainComponentId: "651:9999", componentSetId: "30:159", mainComponentSetName: "SpacerVertical", parentId: "frame-1", parentPath: "Homepage/List" },
    ],
  });

  assert.deepEqual(result, []);
});

test("buildWarnings: a canonical-named spacer stack with a RESOLVED, NON-SPACER intruder still flags (exemption doesn't cover a different thing wearing the spacer name)", () => {
  const result = buildWarnings({
    nodeSnapshots: [
      { id: "n1", name: "SpacerVertical", type: "INSTANCE", mainComponentId: "651:6025", componentSetId: "30:159", mainComponentSetName: "SpacerVertical", parentId: "i-cardmedia", parentPath: "SplitAsymmetric/feed/.CardMedia/content" },
      { id: "n2", name: "SpacerVertical", type: "INSTANCE", mainComponentId: "comp-icon", componentSetId: "set-icon", mainComponentSetName: "IconWrapper", parentId: "i-cardmedia", parentPath: "SplitAsymmetric/feed/.CardMedia/content" },
    ],
  });

  assert.deepEqual(result, [
    {
      type: "duplicate_sibling_name",
      nodeId: "n2",
      nodeName: "SpacerVertical",
      context: "SplitAsymmetric/feed/.CardMedia/content",
      message: 'Duplicate sibling name "SpacerVertical" under SplitAsymmetric/feed/.CardMedia/content — layer names must be unique among siblings for stable id/name-fallback matching.',
      resolution: { mainComponentId: "comp-icon", componentSetId: "set-icon", mainComponentSetName: "IconWrapper" },
    },
  ]);
});

test("buildWarnings: a duplicate_sibling_name record carries the flagged node's resolved mainComponentId/componentSetId/mainComponentSetName under `resolution`, values exactly as resolved (nulls preserved, not coerced)", () => {
  const result = buildWarnings({
    nodeSnapshots: [
      { id: "n1", name: "ActionButtonIcon", type: "INSTANCE", mainComponentId: "comp-left", componentSetId: null, mainComponentSetName: null, parentId: "i-slider", parentPath: "HeaderSection/.ControlSlider" },
      { id: "n2", name: "ActionButtonIcon", type: "INSTANCE", mainComponentId: "comp-right", componentSetId: "set-icon-resolved", mainComponentSetName: "ActionButtonIcon", parentId: "i-slider", parentPath: "HeaderSection/.ControlSlider" },
    ],
  });

  assert.equal(result.length, 1);
  assert.deepEqual(result[0].resolution, {
    mainComponentId: "comp-right",
    componentSetId: "set-icon-resolved",
    mainComponentSetName: "ActionButtonIcon",
  });
});

// ORPHANED COMPONENT INSTANCE (operator ruling 2026-08-02, vault
// decisions/capture-ui-feel-verdict-2026-08-01.md Addenda 13-14): code.js's
// live walk decides orphaned-ness (parent null/undefined AND not remote)
// and only pushes a confirmed record into orphanedInstances — this pure
// function just shapes whatever it's given, so these tests exercise the
// shaping, not the live parent/remote decision (that lives in code.js and
// is exercised by conformance-lane.test.mjs / the plugin harness).
test("buildWarnings: flags an INSTANCE whose orphaned main component was already identified by the walk, as a typed record", () => {
  const result = buildWarnings({
    orphanedInstances: [
      { id: "n1", name: "Spacer-top", path: "FeatureText/Spacer-top", mainComponentName: "SpaceVertical/space-xl", mainComponentSetName: "SpaceVertical" },
    ],
  });

  assert.deepEqual(result, [
    {
      type: "orphaned_component_instance",
      nodeId: "n1",
      nodeName: "Spacer-top",
      context: "FeatureText/Spacer-top",
      mainComponentName: "SpaceVertical/space-xl",
      mainComponentSetName: "SpaceVertical",
      message: 'FeatureText/Spacer-top is an instance of "SpaceVertical/space-xl", a component that no longer exists in this file — swap it for a current component.',
    },
  ]);
});

test("buildWarnings: no orphanedInstances (or undefined) produces no orphaned_component_instance warnings", () => {
  assert.deepEqual(buildWarnings({ orphanedInstances: [] }), []);
  assert.deepEqual(buildWarnings({}), []);
});

test("buildWarnings: flags every distinct orphaned instance separately, carrying its own path/name", () => {
  const result = buildWarnings({
    orphanedInstances: [
      { id: "n1", name: "Spacer-top", path: "FeatureText/1/Spacer-top", mainComponentName: "RichText/legacy" },
      { id: "n2", name: "Spacer-bottom", path: "FeatureText/2/Spacer-bottom", mainComponentName: "RichText/legacy" },
    ],
  });
  assert.equal(result.length, 2);
  assert.deepEqual(result.map((w) => w.context), ["FeatureText/1/Spacer-top", "FeatureText/2/Spacer-bottom"]);
});

test("buildWarnings: flags a non-device axis that diverges between an M-/D-Example frame pair (axis-ownership violation), as a typed record", () => {
  const result = buildWarnings({
    templateFrames: [
      {
        id: "tf-m",
        name: "M-Homepage",
        instances: [{ id: "inst-m", name: "Hero", component: "HeroText", variantProps: { device: "mobile", height: "L" }, properties: {}, overrides: [] }],
      },
      {
        id: "tf-d",
        name: "D-Homepage",
        instances: [{ id: "inst-d", name: "Hero", component: "HeroText", variantProps: { device: "desktop", height: "M" }, properties: {}, overrides: [] }],
      },
    ],
  });

  assert.deepEqual(result, [
    {
      type: "axis_ownership_violation",
      nodeId: "inst-m",
      nodeName: "Hero",
      context: "Homepage/height",
      message: 'Homepage: instance "Hero" has divergent height between M-Homepage ("L") and D-Homepage ("M") — a layout holds one opinion per non-device axis.',
    },
  ]);
});

test("buildWarnings: a NavigationHeader layout divergence between M-/D- is a ratified_axis_exception, not an axis_ownership_violation (operator ruling 2026-08-01)", () => {
  const result = buildWarnings({
    templateFrames: [
      {
        id: "tf-m",
        name: "M - Home",
        instances: [
          { id: "inst-m-title", name: "NavigationHeader", component: "NavigationHeader", variantProps: { device: "sm", layout: "title" }, properties: {}, overrides: [] },
          { id: "inst-m-actions", name: "NavigationHeader", component: "NavigationHeader", variantProps: { device: "sm", layout: "actions" }, properties: {}, overrides: [] },
        ],
      },
      {
        id: "tf-d",
        name: "D - Home",
        instances: [
          { id: "inst-d", name: "NavigationHeader", component: "NavigationHeader", variantProps: { device: "md+", layout: "title+actions" }, properties: {}, overrides: [] },
        ],
      },
    ],
  });

  assert.deepEqual(
    result.filter((w) => w.type === "axis_ownership_violation"),
    [],
    "no axis_ownership_violation for the ratified NavigationHeader split"
  );
  const exceptions = result.filter((w) => w.type === "ratified_axis_exception");
  assert.equal(exceptions.length, 2, "one exception per M-side instance compared against the single D-side opinion");
  for (const w of exceptions) {
    assert.equal(w.nodeName, "NavigationHeader");
    assert.equal(w.context, "Home/layout");
    assert.match(w.message, /ratified/i);
    assert.match(w.message, /operator ruling 2026-08-01/);
  }
});

test("buildWarnings: LayoutGrid's `columns` axis diverging between M-/D- is silent — neither an axis_ownership_violation nor a ratified_axis_exception (operator ruling 2026-08-01, DEVICE_OWNED_AXES)", () => {
  const result = buildWarnings({
    templateFrames: [
      {
        id: "tf-m",
        name: "M - Projects",
        instances: [{ id: "inst-m", name: "LayoutGrid", component: "LayoutGrid", variantProps: { device: "sm", columns: "1" }, properties: {}, overrides: [] }],
      },
      {
        id: "tf-d",
        name: "D - Projects",
        instances: [{ id: "inst-d", name: "LayoutGrid", component: "LayoutGrid", variantProps: { device: "md+", columns: "3" }, properties: {}, overrides: [] }],
      },
    ],
  });

  assert.deepEqual(result, [], "LayoutGrid.columns divergence produces NO warning of any type");
});

test("buildWarnings: a NON-columns axis on LayoutGrid still flags a genuine axis-ownership violation", () => {
  const result = buildWarnings({
    templateFrames: [
      {
        id: "tf-m",
        name: "M - Projects",
        instances: [{ id: "inst-m", name: "LayoutGrid", component: "LayoutGrid", variantProps: { device: "sm", gap: "8" }, properties: {}, overrides: [] }],
      },
      {
        id: "tf-d",
        name: "D - Projects",
        instances: [{ id: "inst-d", name: "LayoutGrid", component: "LayoutGrid", variantProps: { device: "md+", gap: "16" }, properties: {}, overrides: [] }],
      },
    ],
  });

  assert.deepEqual(result, [
    {
      type: "axis_ownership_violation",
      nodeId: "inst-m",
      nodeName: "LayoutGrid",
      context: "Projects/gap",
      message: 'Projects: instance "LayoutGrid" has divergent gap between M-Projects ("8") and D-Projects ("16") — a layout holds one opinion per non-device axis.',
    },
  ]);
});

test("buildWarnings: a DIFFERENT component's `columns` axis is NOT device-owned — still flags", () => {
  const result = buildWarnings({
    templateFrames: [
      {
        id: "tf-m",
        name: "M - Table",
        instances: [{ id: "inst-m", name: "DataTable", component: "DataTable", variantProps: { device: "sm", columns: "1" }, properties: {}, overrides: [] }],
      },
      {
        id: "tf-d",
        name: "D - Table",
        instances: [{ id: "inst-d", name: "DataTable", component: "DataTable", variantProps: { device: "md+", columns: "3" }, properties: {}, overrides: [] }],
      },
    ],
  });

  assert.deepEqual(result, [
    {
      type: "axis_ownership_violation",
      nodeId: "inst-m",
      nodeName: "DataTable",
      context: "Table/columns",
      message: 'Table: instance "DataTable" has divergent columns between M-Table ("1") and D-Table ("3") — a layout holds one opinion per non-device axis.',
    },
  ]);
});

test("buildWarnings + computeWarningsByType: a ratified NavigationHeader exception and a genuine Hero violation in the same run count separately, never merged", () => {
  const result = buildWarnings({
    templateFrames: [
      {
        id: "tf-m",
        name: "M - Home",
        instances: [
          { id: "inst-m-nav", name: "NavigationHeader", component: "NavigationHeader", variantProps: { device: "sm", layout: "title" }, properties: {}, overrides: [] },
          { id: "inst-m-hero", name: "Hero", component: "HeroText", variantProps: { device: "mobile", height: "L" }, properties: {}, overrides: [] },
        ],
      },
      {
        id: "tf-d",
        name: "D - Home",
        instances: [
          { id: "inst-d-nav", name: "NavigationHeader", component: "NavigationHeader", variantProps: { device: "md+", layout: "title+actions" }, properties: {}, overrides: [] },
          { id: "inst-d-hero", name: "Hero", component: "HeroText", variantProps: { device: "desktop", height: "M" }, properties: {}, overrides: [] },
        ],
      },
    ],
  });

  const byType = computeWarningsByType(result);
  assert.deepEqual(byType, { ratified_axis_exception: 1, axis_ownership_violation: 1 });
});

test("buildWarnings: does not flag the device axis itself diverging between an M-/D-Example frame pair", () => {
  const result = buildWarnings({
    templateFrames: [
      {
        id: "tf-m",
        name: "M-Homepage",
        instances: [{ id: "inst-m", name: "Hero", component: "HeroText", variantProps: { device: "mobile", height: "L" }, properties: {}, overrides: [] }],
      },
      {
        id: "tf-d",
        name: "D-Homepage",
        instances: [{ id: "inst-d", name: "Hero", component: "HeroText", variantProps: { device: "desktop", height: "L" }, properties: {}, overrides: [] }],
      },
    ],
  });

  assert.deepEqual(result, []);
});

test("buildWarnings: flags an axis-ownership violation when M-/D- frame names carry the real ' - ' spaced separator (not just a bare hyphen)", () => {
  const result = buildWarnings({
    templateFrames: [
      {
        id: "tf-m",
        name: "M - Home",
        instances: [{ id: "inst-m", name: "Hero", component: "HeroText", variantProps: { device: "mobile", height: "L" }, properties: {}, overrides: [] }],
      },
      {
        id: "tf-d",
        name: "D - Home",
        instances: [{ id: "inst-d", name: "Hero", component: "HeroText", variantProps: { device: "desktop", height: "M" }, properties: {}, overrides: [] }],
      },
    ],
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].type, "axis_ownership_violation");
  assert.equal(result[0].nodeName, "Hero");
});

test("buildWarnings: an M/D pair with unequal SplitContent instance counts (8 vs 9, all sharing the same instance name) compares the shared prefix positionally instead of collapsing every M instance onto the last D instance", () => {
  const sharedVariant = (v) => ({ split: v, device: "shared" });
  const positions = ["full", "split-media", "half-reversed", "half", "full", "split-media", "half-reversed", "half"];
  const mInstances = positions.map((v, i) => ({
    id: `m-${i}`,
    name: "SplitContent",
    component: "SplitContent",
    variantProps: sharedVariant(v),
    properties: {},
    overrides: [],
  }));
  const dInstances = [
    ...positions.map((v, i) => ({
      id: `d-${i}`,
      name: "SplitContent",
      component: "SplitContent",
      variantProps: sharedVariant(v),
      properties: {},
      overrides: [],
    })),
    {
      id: "d-8",
      name: "SplitContent",
      component: "SplitContent",
      variantProps: sharedVariant("split-media-text-reversed"),
      properties: {},
      overrides: [],
    },
  ];

  const result = buildWarnings({
    templateFrames: [
      { id: "tf-m", name: "M - Project", instances: mInstances },
      { id: "tf-d", name: "D - Project", instances: dInstances },
    ],
  });

  assert.deepEqual(
    result.filter((w) => w.type === "axis_ownership_violation"),
    [],
    "the 8 shared positions agree M<->D — no false value-divergence warnings"
  );
  const unpaired = result.filter((w) => w.type === "unpaired_template_instance");
  assert.equal(unpaired.length, 1, "exactly one warning for D's 9th, uncounterparted instance");
  assert.equal(unpaired[0].nodeId, "d-8");
});

test("buildWarnings: an M/D pair with equal instance counts still compares positionally and flags a genuine divergence", () => {
  const result = buildWarnings({
    templateFrames: [
      {
        id: "tf-m",
        name: "M - Project",
        instances: [
          { id: "m-0", name: "SplitContent", component: "SplitContent", variantProps: { split: "full" }, properties: {}, overrides: [] },
          { id: "m-1", name: "SplitContent", component: "SplitContent", variantProps: { split: "half" }, properties: {}, overrides: [] },
        ],
      },
      {
        id: "tf-d",
        name: "D - Project",
        instances: [
          { id: "d-0", name: "SplitContent", component: "SplitContent", variantProps: { split: "full" }, properties: {}, overrides: [] },
          { id: "d-1", name: "SplitContent", component: "SplitContent", variantProps: { split: "half-reversed" }, properties: {}, overrides: [] },
        ],
      },
    ],
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].type, "axis_ownership_violation");
  assert.equal(result[0].nodeId, "m-1");
});

test("buildWarnings: an M/D pair where both sides have zero instances produces no warnings", () => {
  const result = buildWarnings({
    templateFrames: [
      { id: "tf-m", name: "M - Empty", instances: [] },
      { id: "tf-d", name: "D - Empty", instances: [] },
    ],
  });

  assert.deepEqual(result, []);
});

test("resolveComponentSetName: a variant component resolves to its COMPONENT_SET's name, not its own per-variant property string", () => {
  const variant = { name: "size=8", parent: { type: "COMPONENT_SET", name: "SpaceVertical" } };
  assert.equal(resolveComponentSetName(variant), "SpaceVertical");
});

test("resolveComponentSetName: a standalone (non-variant) component resolves to its own name", () => {
  const standalone = { name: "Icon", parent: { type: "FRAME", name: "Icons" } };
  assert.equal(resolveComponentSetName(standalone), "Icon");
});

test("resolveComponentSetName: null component resolves to null", () => {
  assert.equal(resolveComponentSetName(null), null);
});

// isOrphanedComponent TRUTH TABLE (operator ruling 2026-08-02, reviewer gap:
// "isOrphanedComponent has zero direct tests of its own branches"). Verified
// against @figma/plugin-typings' plugin-api.d.ts:5423 (BaseNode.parent — "do
// not always have a parent. They could be remote components or soft-deleted
// components") and :8224 (ComponentNode.remote).
test("isOrphanedComponent: parent null/undefined + remote false -> orphaned (a real SpaceVertical/space-xl-shaped deleted master)", () => {
  const deletedMaster = { name: "SpaceVertical/space-xl", parent: null, remote: false };
  assert.equal(isOrphanedComponent(deletedMaster), true);
});

test("isOrphanedComponent: parent undefined (never even set) + remote false -> orphaned", () => {
  assert.equal(isOrphanedComponent({ name: "SpaceVertical/space-xl", remote: false }), true);
});

test("isOrphanedComponent: parent null + remote true -> silent (a legitimate remote library component)", () => {
  const libraryComponent = { name: "SpaceVertical/space-xl", parent: null, remote: true };
  assert.equal(isOrphanedComponent(libraryComponent), false);
});

test("isOrphanedComponent: parent present -> silent, regardless of remote", () => {
  const onPage = { name: "SpaceVertical/space-xl", parent: { type: "COMPONENT_SET", name: "SpaceVertical" }, remote: false };
  assert.equal(isOrphanedComponent(onPage), false);
});

test("isOrphanedComponent: an unresolvable (null) main component is never orphaned — unknown is not orphaned", () => {
  assert.equal(isOrphanedComponent(null), false);
  assert.equal(isOrphanedComponent(undefined), false);
});

test("nextRecordState: a COMPONENT's children are in the override interface surface", () => {
  assert.equal(nextRecordState({ type: "COMPONENT", name: "HeroText" }, false), true);
});

test("nextRecordState: a FRAME's children (template top-level instances) are in the override interface surface", () => {
  assert.equal(nextRecordState({ type: "FRAME", name: "D - Home" }, false), true);
});

test("nextRecordState: a dot-prefixed sub-component's children extend the surface one level, but only when the parent itself was recorded", () => {
  assert.equal(nextRecordState({ type: "INSTANCE", name: ".icon" }, true), true);
  assert.equal(nextRecordState({ type: "INSTANCE", name: ".icon" }, false), false);
});

test("nextRecordState: a plain (non-boundary, non-dot-prefixed) node does not extend the surface", () => {
  assert.equal(nextRecordState({ type: "GROUP", name: "base" }, true), false);
});

test("isBoundButHiddenPaint: a bound paint with visible:false is a latent capability", () => {
  assert.equal(isBoundButHiddenPaint({ visible: false }, { visible: true }), true);
});

test("isBoundButHiddenPaint: a bound paint whose node is invisible is a latent capability, even if the paint itself is visible:true", () => {
  assert.equal(isBoundButHiddenPaint({ visible: true }, { visible: false }), true);
});

test("isBoundButHiddenPaint: a bound, visible, rendering paint is not latent", () => {
  assert.equal(isBoundButHiddenPaint({ visible: true }, { visible: true }), false);
});

test("isBoundButHiddenPaint: no paint at all is never latent", () => {
  assert.equal(isBoundButHiddenPaint(null, { visible: true }), false);
});

test("collectNodeLatentCapabilities: flags every bound-but-hidden paint across a node's fills+strokes, not just the first (adopt-list #5 bug fix)", () => {
  const node = { id: "n1", name: "NavigationHeader", visible: true };
  const resolvedPaints = [
    { paint: { visible: true }, binding: "color/surface/base" }, // fills[0]: bound + visible, not latent
    { paint: { visible: false }, binding: "color/surface/raised" }, // fills[1]: bound + hidden, LATENT — missed by a fills[0]-only scan
    { paint: { visible: false }, binding: "color/border/accent" }, // strokes[0]: bound + hidden, LATENT
  ];

  const result = collectNodeLatentCapabilities(node, resolvedPaints);

  assert.deepEqual(result, [
    { id: "n1", name: "NavigationHeader", visible: true, binding: "color/surface/raised" },
    { id: "n1", name: "NavigationHeader", visible: true, binding: "color/border/accent" },
  ]);
});

test("collectNodeLatentCapabilities: an unbound paint (no binding) never contributes a capability", () => {
  const node = { id: "n1", name: "Icon", visible: true };
  const result = collectNodeLatentCapabilities(node, [{ paint: { visible: false }, binding: null }]);
  assert.deepEqual(result, []);
});

test("buildComponentProperties: maps Figma's raw componentPropertyDefinitions to {defaultValue, options} per the listener's diffComponents.diffProps contract", () => {
  const defs = {
    device: { type: "VARIANT", defaultValue: "desktop", variantOptions: ["mobile", "desktop"] },
    label: { type: "TEXT", defaultValue: "Click me" },
  };

  const result = buildComponentProperties(defs);

  assert.deepEqual(result, {
    device: { defaultValue: "desktop", options: ["mobile", "desktop"] },
    label: { defaultValue: "Click me" },
  });
});

test("buildComponentProperties: no definitions maps to an empty object", () => {
  assert.deepEqual(buildComponentProperties(undefined), {});
});

test("buildComponents: reshapes standalone + set snapshots into the listener's components:{standalone,sets} contract (adopt-list #1)", () => {
  const snapshot = {
    standalone: [
      {
        key: "comp-icon",
        name: "Icon",
        componentPropertyDefinitions: { name: { type: "INSTANCE_SWAP", defaultValue: "check" } },
      },
    ],
    sets: [
      {
        key: "set-hero",
        name: "HeroText",
        componentPropertyDefinitions: {
          height: { type: "VARIANT", defaultValue: "M", variantOptions: ["S", "M", "L"] },
        },
        variants: [
          {
            key: "variant-m",
            name: "height=M",
            bindings: [{ layer: "Title", property: "textStyle", value: "Heading/L" }],
          },
          { key: "variant-l", name: "height=L", bindings: [] },
        ],
      },
    ],
  };

  const result = buildComponents(snapshot);

  assert.deepEqual(result, {
    standalone: [
      { name: "Icon", key: "comp-icon", properties: { name: { defaultValue: "check" } } },
    ],
    sets: [
      {
        name: "HeroText",
        key: "set-hero",
        properties: { height: { defaultValue: "M", options: ["S", "M", "L"] } },
        variants: [
          { name: "height=M", key: "variant-m", bindings: [{ layer: "Title", property: "textStyle", value: "Heading/L" }] },
          { name: "height=L", key: "variant-l", bindings: [] },
        ],
      },
    ],
  });
});

test("buildComponents: no snapshot maps to empty standalone/sets arrays", () => {
  assert.deepEqual(buildComponents(undefined), { standalone: [], sets: [] });
});

test("serializeColor: a fully-opaque RGB color serializes to hex", () => {
  assert.equal(serializeColor({ r: 1, g: 0, b: 0 }), "#ff0000");
});

test("serializeColor: an RGBA color with alpha 1 still serializes to hex (opaque, no rgba() needed)", () => {
  assert.equal(serializeColor({ r: 0, g: 0.5019607843137255, b: 1, a: 1 }), "#0080ff");
});

test("serializeColor: an RGBA color with alpha < 1 serializes to rgba() with alpha rounded to 4 decimals", () => {
  assert.equal(serializeColor({ r: 0, g: 0, b: 0, a: 0.3333333333 }), "rgba(0, 0, 0, 0.3333)");
});

test("buildHeaderPropskitField: reports propskitAvailable true when the probe found fig-button registered", () => {
  assert.deepEqual(buildHeaderPropskitField(true), { propskitAvailable: true });
});

test("buildHeaderPropskitField: reports propskitAvailable false when the probe found it unregistered", () => {
  assert.deepEqual(buildHeaderPropskitField(false), { propskitAvailable: false });
});

test("buildHeaderPropskitField: an undetermined probe (undefined — ui.html hasn't reported in yet) coerces to false, never omitted", () => {
  assert.deepEqual(buildHeaderPropskitField(undefined), { propskitAvailable: false });
});

test("computeWarningsByType: groups warnings[] into a {type: count} map", () => {
  const warnings = [
    { type: "malformed-spacer-name" },
    { type: "malformed-spacer-name" },
    { type: "duplicate-sibling-name" },
  ];
  assert.deepEqual(computeWarningsByType(warnings), {
    "malformed-spacer-name": 2,
    "duplicate-sibling-name": 1,
  });
});

test("computeWarningsByType: a warning with no type falls into 'unknown'", () => {
  assert.deepEqual(computeWarningsByType([{ message: "no type field" }]), { unknown: 1 });
});

test("computeWarningsByType: no warnings maps to an empty object", () => {
  assert.deepEqual(computeWarningsByType(undefined), {});
  assert.deepEqual(computeWarningsByType([]), {});
});

test("buildSyncStoragePayload: shapes a sync result into the clientStorage round-trip contract", () => {
  const header = {
    counts: { "Color/Brand": 12 },
    styleCounts: { text: 3, paint: 5, effect: 0, grid: 1 },
    componentCounts: { standalone: 4, sets: 2 },
    fileName: "Design System",
  };
  const warnings = [{ type: "malformed-spacer-name" }, { type: "malformed-spacer-name" }];

  const payload = buildSyncStoragePayload(1234, 6, { added: 3 }, 2, header, warnings);

  assert.deepEqual(payload, {
    lastSyncAt: 1234,
    lastSyncCount: 6,
    summary: { added: 3 },
    warningCount: 2,
    header: {
      counts: { "Color/Brand": 12 },
      styleCounts: { text: 3, paint: 5, effect: 0, grid: 1 },
      componentCounts: { standalone: 4, sets: 2 },
    },
    warningsByType: { "malformed-spacer-name": 2 },
  });
});

test("buildSyncStoragePayload: strips header down to counts/styleCounts/componentCounts only, dropping fields like fileName", () => {
  const header = { counts: {}, styleCounts: {}, componentCounts: {}, fileName: "Design System", pluginVersion: "1.16.0" };
  const payload = buildSyncStoragePayload(1, 0, null, 0, header, []);
  assert.deepEqual(Object.keys(payload.header).sort(), ["componentCounts", "counts", "styleCounts"]);
});

test("buildSyncStoragePayload: a null header and no summary/warningCount default to null/0, never omitted", () => {
  const payload = buildSyncStoragePayload(1, 0, null, undefined, null, []);
  assert.deepEqual(payload, {
    lastSyncAt: 1,
    lastSyncCount: 0,
    summary: null,
    warningCount: 0,
    header: null,
    warningsByType: {},
  });
});

test("buildRestoredSyncMessage: shapes a clientStorage record into the 'sync-status'/'restored' postMessage ui.html expects", () => {
  const stored = {
    lastSyncAt: 1234,
    lastSyncCount: 6,
    summary: { added: 3 },
    warningCount: 2,
    header: { counts: { "Color/Brand": 12 } },
    warningsByType: { "malformed-spacer-name": 2 },
  };

  assert.deepEqual(buildRestoredSyncMessage(stored), {
    type: "sync-status",
    state: "restored",
    lastSyncAt: 1234,
    lastSyncCount: 6,
    summary: { added: 3 },
    warningCount: 2,
    header: { counts: { "Color/Brand": 12 } },
    warningsByType: { "malformed-spacer-name": 2 },
  });
});

test("buildRestoredSyncMessage: a pre-persistence-fix stored record (no summary/header/warningsByType) still coerces safe defaults, never throws", () => {
  const legacyStored = { lastSyncAt: 999, lastSyncCount: 4 };

  assert.deepEqual(buildRestoredSyncMessage(legacyStored), {
    type: "sync-status",
    state: "restored",
    lastSyncAt: 999,
    lastSyncCount: 4,
    summary: null,
    warningCount: 0,
    header: null,
    warningsByType: {},
  });
});

test("buildModeTable: maps a collection's modes[] to a {modeId: name} lookup, in no particular key order requirement", () => {
  const modes = [
    { modeId: "1:0", name: "Light" },
    { modeId: "26:1", name: "Dark" },
  ];

  assert.deepEqual(buildModeTable(modes), { "1:0": "Light", "26:1": "Dark" });
});

test("buildModeTable: an empty/missing modes list produces an empty table, never throws", () => {
  assert.deepEqual(buildModeTable([]), {});
  assert.deepEqual(buildModeTable(undefined), {});
});

test("buildModePins: a pin whose collection IS in this export's collections[] resolves to the human mode name, keyed by the lowercased collection name", () => {
  const collections = [{ id: "VariableCollectionId:8:496", name: "Color", modeTable: { "26:1": "Dark", "26:2": "Light" } }];
  const pins = [{ path: "Landing/Hero", explicitVariableModes: { "VariableCollectionId:8:496": "26:1" } }];

  assert.deepEqual(buildModePins(pins, collections), [{ path: "Landing/Hero", modes: { color: "Dark" } }]);
});

test("buildModePins: a pin whose collection is NOT in this export's collections[] falls back to the raw collectionId/modeId pair, never dropped", () => {
  const collections = [{ id: "VariableCollectionId:1:1", name: "Layout", modeTable: { "1:0": "lg" } }];
  const pins = [{ path: "Landing/Hero", explicitVariableModes: { "VariableCollectionId:8:496": "26:1" } }];

  assert.deepEqual(buildModePins(pins, collections), [
    { path: "Landing/Hero", modes: { "VariableCollectionId:8:496": "26:1" } },
  ]);
});

test("buildModePins: multiple axes on one pin are ordered deterministically by resolved axis name, not object insertion/Figma map order", () => {
  const collections = [
    { id: "coll-color", name: "Color", modeTable: { m1: "Dark" } },
    { id: "coll-layout", name: "Layout", modeTable: { m2: "lg" } },
  ];
  // Insertion order deliberately reversed (layout before color) to prove the
  // output isn't just echoing whatever order explicitVariableModes iterates.
  const pins = [{ path: "Landing/Hero", explicitVariableModes: { "coll-layout": "m2", "coll-color": "m1" } }];

  const result = buildModePins(pins, collections);
  assert.deepEqual(Object.keys(result[0].modes), ["color", "layout"]);
});

test("buildCopyEntries: a raw text node (no componentContext snapshot field) omits the componentContext key entirely, never emits it null/undefined", () => {
  const snapshots = [{ path: "Landing/Hero/Title", text: "Welcome", id: "1:23" }];

  assert.deepEqual(buildCopyEntries(snapshots), [{ path: "Landing/Hero/Title", text: "Welcome", id: "1:23" }]);
});

test("buildCopyEntries: a snapshot carrying componentContext passes it through verbatim", () => {
  const snapshots = [
    {
      path: "Landing/NavigationHeader/Info",
      text: "About",
      id: "1:24",
      componentContext: { component: "NavigationHeader", prop: "Label" },
    },
  ];

  assert.deepEqual(buildCopyEntries(snapshots), [
    {
      path: "Landing/NavigationHeader/Info",
      text: "About",
      id: "1:24",
      componentContext: { component: "NavigationHeader", prop: "Label" },
    },
  ]);
});

test("sync-check: code.js's duplicated SCHEMA V2 TRANSFORM block is byte-identical to this file's", () => {
  const thisFile = readFileSync(join(import.meta.dirname, "schema-v2-transform.mjs"), "utf8");
  const codeJs = readFileSync(join(import.meta.dirname, "code.js"), "utf8");

  assert.equal(extractSchemaV2Block(codeJs), extractSchemaV2Block(thisFile));
});
