// DISC-260: the shallow-clone remedy is --unshallow, never a fixed depth. The gate's behaviour (a shallow --repo is refused
// with that command) is proven in wrap-gate.test.mjs ("a shallow --repo is refused with the fetch command, never clean");
// this file keeps the doc that tells a session what to run in step with it.
// Run: node --test hooks/scripts/disc260-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const doc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "skills/wrap/references/REPORT-AND-LEARN.md"), "utf8");
test("the wrap doc names --unshallow, never a fixed depth", () => {
  assert.ok(doc.includes("git fetch --unshallow"));
  assert.ok(!doc.includes("depth=1000"));
});
