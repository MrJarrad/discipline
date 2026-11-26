// DISC-248 (vault PF-1125): a look/listen link goes to the easiest place to review the change.
// Run: node --test hooks/scripts/session53-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

test("release: both manifests and the top CHANGED.txt entry carry the same version, with its encoded line", () => {
  const read = (p) => readFileSync(join(root, p), "utf8");
  const v = JSON.parse(read(".claude-plugin/plugin.json")).version;
  assert.equal(JSON.parse(read(".claude-plugin/marketplace.json")).plugins[0].version, v);
  const top = read("CHANGED.txt");
  assert.ok(top.startsWith(`${v} — `));
  assert.ok(top.split("\n\n")[0].includes(`encoded: ${v} — backlog DISC-`));
});
