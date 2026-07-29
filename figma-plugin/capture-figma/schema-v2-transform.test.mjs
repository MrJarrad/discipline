// Tests for the pure schema-v2 payload-assembly functions — the part of
// capture-figma's export that has no figma.* dependency (see code.js's
// "SCHEMA V2 TRANSFORM" block, which duplicates this file's functions
// verbatim; the sync-check test at the bottom of this file guards drift).
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildComponentSets, buildExampleStructure, buildTemplateFrames, buildLatentCapabilities } from "./schema-v2-transform.mjs";

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
