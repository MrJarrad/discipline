// 1.134.0 (backlog DISC-167): row numbers come from row-add, and the plugin says so everywhere a row is added.
// Run: node --test hooks/scripts/session23-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const flat = (p) => readFileSync(join(root, p), "utf8").replace(/\s+/g, " ");

test("the allocator and CLI exist", () => {
  assert.ok(existsSync(join(root, "hooks/scripts/row-add.mjs")));
  assert.ok(existsSync(join(root, "hooks/scripts/lib/row-alloc.mjs")));
});

test("every place that tells an agent to add a row points at row-add", () => {
  for (const p of ["skills/vault-write/references/WRITING.md", "skills/wrap/references/REPORT-AND-LEARN.md", "skills/wrap/references/SECTIONS.md", "skills/routing/references/MECHANICAL-SCRIPTS.md", "output-styles/discipline.md", "doer-rules.md"]) {
    assert.match(flat(p), /row-add\.mjs/, p);
  }
  assert.match(flat("skills/vault-write/SKILL.md"), /row-add\.mjs/);
  assert.doesNotMatch(flat("skills/vault-write/SKILL.md"), /use the next free number/);
});

test("release files agree on 1.134.0 and CHANGED.txt encodes the backlog row", () => {
  assert.match(flat(".claude-plugin/plugin.json"), /"version": "1\.134\.0"/);
  assert.match(flat(".claude-plugin/marketplace.json"), /"version": "1\.134\.0"/);
  assert.match(flat("CHANGED.txt"), /^1\.134\.0 .*\bencoded: 1\.134\.0 — backlog DISC-167/);
});
