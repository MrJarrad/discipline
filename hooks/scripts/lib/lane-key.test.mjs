// lane-key — DISC-335: a helper's lane key (PF1655, DISC335, HB33) from its tags and title, and whether a PR's text names it.
// Run: node --test hooks/scripts/lib/lane-key.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { laneKeys, mentions } from "./lane-key.mjs";

test("keys come from the session-prefixed tag and from the title, normalised, with the suffix after the key dropped", () => {
  assert.deepEqual(laneKeys({ tags: ["helper", "s91-PF1655"], title: "Helper · x" }), ["PF1655"]);
  assert.deepEqual(laneKeys({ tags: ["helper", "s91-review-hb33"], title: "Helper · y" }), ["HB33"]);
  assert.deepEqual(laneKeys({ tags: ["s91-PF1596-land"], title: "Helper · z (DISC-335)" }), ["PF1596", "DISC335"]);
  assert.deepEqual(laneKeys({ tags: ["helper", "lessons-s90"], title: "Helper · plain" }), []);
});
test("a PR text names a key with or without the hyphen, as a whole token, any case", () => {
  assert.equal(mentions("Fixes PF-1655 and more", ["PF1655"]), true);
  assert.equal(mentions("pf1655", ["PF1655"]), true);
  assert.equal(mentions("PF-16551", ["PF1655"]), false);
  assert.equal(mentions("xPF-1655", ["PF1655"]), false);
  assert.equal(mentions("anything", []), false);
});
