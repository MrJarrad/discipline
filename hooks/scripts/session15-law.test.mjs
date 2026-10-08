// The 1.115.0 items. Run: node --test hooks/scripts/session15-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(repo, p), "utf8");

test("s15 item 2: operator-rules checkpoint stages named paths, never git add -A", () => {
  const t = read("operator-rules.md");
  assert.doesNotMatch(t, /git add -A/);
  assert.match(t, /git add <named paths>/);
});

test("s15: version 1.116.0 in both manifests and CHANGED entries (1.115.0 and 1.116.0)", () => {
  assert.match(read(".claude-plugin/plugin.json"), /"version": "1.116.0"/);
  assert.match(read(".claude-plugin/marketplace.json"), /"version": "1.116.0"/);
  assert.match(read("CHANGED.txt"), /^1\.116\.0 — /m);
  assert.match(read("CHANGED.txt"), /^1\.115\.0 — /m);
});
