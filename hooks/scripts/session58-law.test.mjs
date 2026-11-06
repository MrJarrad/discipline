// s58 backlog clearing: the rule sentences DISC-249, DISC-244 and DISC-246 add, pinned where they live.
// Run: node --test hooks/scripts/session58-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const flat = (p) => readFileSync(join(root, p), "utf8").replace(/\s+/g, " ");
const HS = "skills/cloud-dispatch/references/HELPER-SESSIONS.md";

// DISC-249 (s54, HT-57/58): "why am i needing to grant permissions all of a sudden". A helper that finds
// mid-lane it needs another repo and calls add_repo itself is refused as a self-granted permission, so the ask
// lands on the operator. The brief lists every repo with its access; the helper attaches them all first.
test("DISC-249: the brief lists every repo with its access, the helper attaches them all first, anything else is next: parent", () => {
  const h = flat(HS);
  assert.ok(h.includes("**The brief lists every repo the lane touches, each with its access level** (`read` or `push`)"));
  assert.ok(h.includes("attaches every listed repo with `add_repo` as its first step, before any work"));
  assert.ok(h.includes("A repo the brief did not list is `next: parent`, never a question to the operator"));
  assert.ok(flat("doer-rules.md").includes("A repo the brief did not list: `next: parent`, never an `add_repo` of your own and never a question to the operator (DISC-249)."));
});
