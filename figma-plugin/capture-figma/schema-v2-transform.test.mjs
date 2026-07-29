// Tests for the pure schema-v2 payload-assembly functions — the part of
// capture-figma's export that has no figma.* dependency (see code.js's
// "SCHEMA V2 TRANSFORM" block, which duplicates this file's functions
// verbatim; the sync-check test at the bottom of this file guards drift).
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildComponentSets, buildExampleStructure, buildTemplateFrames, buildLatentCapabilities, buildWarnings } from "./schema-v2-transform.mjs";

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

test("buildWarnings: flags a block-internal spacer instance left un-renamed (still SpaceVertical/SpaceHorizontal)", () => {
  const result = buildWarnings({
    spacerInstances: [{ path: "Homepage/Hero/SpaceVertical", name: "SpaceVertical" }],
  });

  assert.deepEqual(result, [
    'Homepage/Hero/SpaceVertical is an un-renamed SpaceVertical spacer instance — rename to SpacerTop/SpacerBottom/SpacerHorizontal/SpacerVertical.',
  ]);
});

test("buildWarnings: flags a malformed spacer rename (typo, kebab-case) distinctly from an un-renamed instance", () => {
  const result = buildWarnings({
    spacerInstances: [
      { path: "Homepage/Hero/SpaceBottom", name: "SpaceBottom" },
      { path: "Homepage/Hero/Spacer-top", name: "Spacer-top" },
      { path: "Homepage/Hero/SpacerTop", name: "SpacerTop" },
    ],
  });

  assert.deepEqual(result, [
    'Homepage/Hero/SpaceBottom has a malformed spacer name "SpaceBottom" — expected one of SpacerTop/SpacerBottom/SpacerHorizontal/SpacerVertical.',
    'Homepage/Hero/Spacer-top has a malformed spacer name "Spacer-top" — expected one of SpacerTop/SpacerBottom/SpacerHorizontal/SpacerVertical.',
  ]);
});

test("buildWarnings: flags two siblings sharing a name under the same parent", () => {
  const result = buildWarnings({
    nodeSnapshots: [
      { id: "n1", name: "Icon", parentId: "frame-1", parentPath: "Homepage/Hero" },
      { id: "n2", name: "Icon", parentId: "frame-1", parentPath: "Homepage/Hero" },
      { id: "n3", name: "Title", parentId: "frame-1", parentPath: "Homepage/Hero" },
    ],
  });

  assert.deepEqual(result, ['Duplicate sibling name "Icon" under Homepage/Hero — layer names must be unique among siblings for stable id/name-fallback matching.']);
});

test("buildWarnings: flags a non-device axis that diverges between an M-/D-Example frame pair (axis-ownership violation)", () => {
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
    'Homepage: instance "Hero" has divergent height between M-Homepage ("L") and D-Homepage ("M") — a layout holds one opinion per non-device axis.',
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
