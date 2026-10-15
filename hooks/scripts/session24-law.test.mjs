// 1.136.0: look proof at the operator's framing; re-read the ask after three failed rounds.
// Run: node --test hooks/scripts/session24-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const flat = (p) => readFileSync(join(root, p), "utf8").replace(/\s+/g, " ");

test("ACCURACY: whole window, header included, parent opens one; position AND visibility", () => {
  const t = flat("skills/dispatch-brief/references/ACCURACY.md");
  assert.match(t, /operator's whole window, header included, never a crop.*the parent opens one before relaying/);
  assert.match(t, /names position AND visibility \(opacity, display, clip\)/);
});
test("diagnosing-bugs: third failed round re-reads the ask", () => {
  assert.match(flat("skills/diagnosing-bugs/SKILL.md"), /third failed round on one effect stops tuning: re-read the ask.*operator's confirmed|his confirmation/);
});
test("grilling: ask for his term when try-outs stop converging", () => {
  assert.match(flat("skills/grilling/SKILL.md"), /try-outs stop converging, ask for the operator's own term or a reference/);
});
test("BRIEF-CRAFT: Constraints names a rule the doer already broke", () => {
  assert.match(flat("skills/dispatch-brief/references/BRIEF-CRAFT.md"), /A rule the lane's doer already broke once is named in the Constraints line\*\*, not only in the House rules block/);
});
