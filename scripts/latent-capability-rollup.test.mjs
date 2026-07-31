// Tests for latent-capability-rollup.mjs — vertical slices, one behavior per test.
// Run: node --test scripts/latent-capability-rollup.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLatentCapabilityRollup } from "./latent-capability-rollup.mjs";

test("buildLatentCapabilityRollup: groups same name+binding into one component/capability entry with a summed count", () => {
  const latentCapabilities = [
    { id: "n1", name: "NavigationHeader", visible: false, binding: "color/background/default/primary" },
    { id: "n2", name: "NavigationHeader", visible: false, binding: "color/background/default/primary" },
    { id: "n3", name: "NavigationHeader", visible: true, binding: "color/background/default/primary" },
  ];

  const result = buildLatentCapabilityRollup(latentCapabilities);

  assert.equal(result.length, 1);
  assert.equal(result[0].component, "NavigationHeader");
  assert.equal(result[0].capability, "color/background/default/primary");
  assert.equal(result[0].count, 3);
});

test("buildLatentCapabilityRollup: nests every grouped instance's id and visible flag under the rollup entry, so a specific node stays locatable", () => {
  const latentCapabilities = [
    { id: "n1", name: "NavigationHeader", visible: false, binding: "color/background/default/primary" },
    { id: "n2", name: "NavigationHeader", visible: true, binding: "color/background/default/primary" },
  ];

  const result = buildLatentCapabilityRollup(latentCapabilities);

  assert.deepEqual(result[0].instances, [
    { id: "n1", visible: false },
    { id: "n2", visible: true },
  ]);
});

test("buildLatentCapabilityRollup: an entry with no name falls back to an explicit unknown-component label rather than dropping", () => {
  const latentCapabilities = [{ id: "n1", name: "", visible: false, binding: "color/background/default/primary" }];

  const result = buildLatentCapabilityRollup(latentCapabilities);

  assert.equal(result.length, 1);
  assert.equal(result[0].component, "(unknown component)");
  assert.equal(result[0].count, 1);
});

test("buildLatentCapabilityRollup: empty input yields an empty rollup", () => {
  assert.deepEqual(buildLatentCapabilityRollup([]), []);
  assert.deepEqual(buildLatentCapabilityRollup(undefined), []);
});

test("buildLatentCapabilityRollup: distinct name+binding pairs stay separate entries, and every entry's count sums back to the raw input length", () => {
  const latentCapabilities = [
    { id: "a1", name: "ActionButton", visible: false, binding: "color/border/action/primary" },
    { id: "a2", name: "ActionButton", visible: false, binding: "color/border/action/primary" },
    { id: "a3", name: "ActionButton", visible: false, binding: "color/background/action/primary" },
    { id: "n1", name: "NavigationHeader", visible: false, binding: "color/background/default/primary" },
  ];

  const result = buildLatentCapabilityRollup(latentCapabilities);

  assert.equal(result.length, 3);
  assert.equal(
    result.reduce((sum, g) => sum + g.count, 0),
    latentCapabilities.length
  );
});
