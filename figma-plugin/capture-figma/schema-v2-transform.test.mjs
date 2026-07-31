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
    },
  ]);
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

test("sync-check: code.js's duplicated SCHEMA V2 TRANSFORM block is byte-identical to this file's", () => {
  const thisFile = readFileSync(join(import.meta.dirname, "schema-v2-transform.mjs"), "utf8");
  const codeJs = readFileSync(join(import.meta.dirname, "code.js"), "utf8");

  assert.equal(extractSchemaV2Block(codeJs), extractSchemaV2Block(thisFile));
});
