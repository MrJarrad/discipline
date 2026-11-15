// DISC-335 law: helpers are accounted for by the ledger; a helper whose work did not land is never archived silently.
// Run: node --test hooks/scripts/disc335-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const flat = (p) => readFileSync(join(root, p), "utf8").replace(/\s+/g, " ");

test("HARD-RULES 19 names the ledger, the Not landed rule and the --accept gate; HELPER-SESSIONS points at it", () => {
  const t = flat("skills/routing/references/HARD-RULES.md");
  assert.ok(t.includes("helper-ledger.mjs") && t.includes("`## Not landed`") && t.includes("--accept"));
  assert.ok(t.includes("skips `head:` for branches `main`") && t.includes("listing of every open PR") && t.includes("--waiting") && t.includes("PR not found"));
  assert.ok(flat("skills/cloud-dispatch/references/HELPER-SESSIONS.md").includes("helper-ledger.mjs"));
});
test("the Stop hook's sweep command is the ledger", () => {
  assert.ok(flat("hooks/bin/helper-sweep-stop.mjs").includes("helper-ledger.mjs --self"));
});
