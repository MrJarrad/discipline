// DISC-178: release-only asks are refused; a release row that also carries an operator-owned call passes.
// Run: node --test hooks/scripts/lib/release-only-ask.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { isReleaseOnlyAsk } from "./release-only-ask.mjs";

test("release-only asks are refused", () => {
  for (const t of ["Release?", "Release again for the underline and design system?", "Release X to production?", "Promote the release?", "Ship it?", "Should we release the merged fixes?", "**Release** main to jarrad.design?"]) assert.equal(isReleaseOnlyAsk(t), true, t);
});
test("a row that also carries an operator-owned call passes", () => {
  for (const t of ["Release with SITE_MODE holding -> live?", "Release the new public route /about?", "Remove the holding page and release?", "Release failed: auto-rolled back twice. Decide?"]) assert.equal(isReleaseOnlyAsk(t), false, t);
  assert.equal(isReleaseOnlyAsk("Release?", "flips SITE_MODE to live"), false, "operator-owned call in another cell");
});
test("a non-release ask, or a release plus another decision, passes", () => {
  for (const t of ["Look at the footer and say yes", "Which underline weight? Then release.", "Pick the hero image", "", "Release notes wording: A or B?"]) assert.equal(isReleaseOnlyAsk(t), false, t);
});
