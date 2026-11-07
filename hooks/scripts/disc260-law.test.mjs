// DISC-260: the shallow remedy clears the shallow state; a fixed depth did not for repos past that depth.
// Run: node --test hooks/scripts/disc260-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(root, p), "utf8");

test("the wrap gate and the wrap docs name --unshallow, never a fixed depth", () => {
  for (const p of ["hooks/scripts/wrap-gate.mjs", "skills/wrap/references/REPORT-AND-LEARN.md"]) assert.ok(read(p).includes("git fetch --unshallow"), p);
  assert.ok(!read("skills/wrap/references/REPORT-AND-LEARN.md").includes("depth=1000"));
});
