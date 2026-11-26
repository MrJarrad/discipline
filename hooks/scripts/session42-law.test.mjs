// 1.153.2: DISC-205 release entry.
// Run: node --test hooks/scripts/session42-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(root, p), "utf8");

test("release: 1.153.2 has its CHANGED.txt entry with the encoded line", () => {
  const top = read("CHANGED.txt").split("\n\n").find((e) => e.startsWith("1.153.2 — "));
  assert.ok(top);
  assert.match(top, /\nencoded: 1\.153\.2 — /);
});
