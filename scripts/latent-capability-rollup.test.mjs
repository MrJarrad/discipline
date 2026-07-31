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
