// Tests for the pure schema-v2 payload-assembly functions — the part of
// capture-figma's export that has no figma.* dependency (see code.js's
// "SCHEMA V2 TRANSFORM" block, which duplicates this file's functions
// verbatim; the sync-check test at the bottom of this file guards drift).
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildComponentSets, buildExampleStructure } from "./schema-v2-transform.mjs";

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
