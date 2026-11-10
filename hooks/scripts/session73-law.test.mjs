// Parent lessons s73 (vault fleet/lessons/2026-11-09-s73-parent-lessons.md), one assertion per encoded rule.
// Run: node --test hooks/scripts/session73-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const flat = (p) => readFileSync(join(root, p), "utf8").replace(/\s+/g, " ");
const has = (p, s) => assert.ok(flat(p).includes(s), `${p} lacks: ${s}`);

test("s73 1: fetch origin main before checkout -B and compare with the handover sha", () => {
  has("doer-rules.md", "Run `git fetch origin main` immediately before any `checkout -B <branch> origin/main`");
  has("doer-rules.md", "compare `git log -1 origin/main` with the handover's last sha");
});
test("s73 2: colour claims in blend/filter/clip groups need painted pixels", () => {
  has("skills/qa-acceptance/references/DOS-AND-DONTS.md", "painted pixels sampled at the operator's crop, never computed style alone");
});
test("s73 3: read the product release note before dispatching release-ops", () => {
  has("skills/release-deploy/references/RELEASE-PATH.md", "read the product handover's release note before dispatching release-ops");
});
test("s73 4: rows are edited by tooling or column index, never rstrip-and-append", () => {
  has("skills/vault-write/references/WRITING.md", "never by `rstrip(' |')` plus append");
});
test("s73 5: image PRs get their own PR and an immediate LIGHT reviewer", () => {
  has("skills/vault-write/references/DOS-AND-DONTS.md", "Bank operator images in their own small PR and dispatch a LIGHT reviewer with the byte-compare check at once");
});
