// 1.151.1: the residual A1 amber on #111 (mixed perPage values on get_files pages leave a gap); the tests
// themselves are in session35-law.test.mjs (A1 residual). Run: node --test hooks/scripts/session36-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const flat = (p) => readFileSync(join(root, p), "utf8").replace(/\s+/g, " ");
const has = (p, s) => assert.ok(flat(p).includes(s), `${p} is missing: ${s}`);

test("the gate states the same-size rule for get_files pages", () => {
  has("hooks/bin/merge-review-gate.mjs", "every page read at the same size");
  has("hooks/bin/merge-review-gate.mjs", "every page at the same perPage");
});

test("release: 1.151.1 in both manifests and CHANGED.txt, with the encoded line", () => {
  for (const p of [".claude-plugin/plugin.json", ".claude-plugin/marketplace.json"]) has(p, '"version": "1.151.1"');
  const top = readFileSync(join(root, "CHANGED.txt"), "utf8");
  assert.ok(top.startsWith("1.151.1 — "));
  assert.match(top.split("\n\n")[0], /\nencoded: 1\.151\.1 — /);
});
