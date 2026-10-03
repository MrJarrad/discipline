// The 1.106.0 queue: `2026-10-03-codify` — operator (queue 340): "do all this now".
// Discipline items 6-10 of fleet/lessons/codify-candidates-2026-10-03.md:
// (6) motion is proven on painted frames, never computed style; (7) proof names
// the deployed preview or states the gap; (8) the painted script asserts on-screen
// order; (9) operator-queue row numbers are unique per table (named grandfather
// allowlist for the historic double-numbered struck rows); (10) phone-layout check,
// banked-ruling grep before an operator ask, one confirming question for a
// likely-typo word.
//
// Run: node --test hooks/scripts/queue-1970-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { duplicateRowNumbers, GRANDFATHERED } from "./queue-write-check.mjs";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(repo, p), "utf8");

const table = (section, ...nums) =>
  `## ${section}\n\n| # | Needed |\n| --- | --- |\n` + nums.map((n) => `| ${n} | row ${n} |`).join("\n") + "\n\n";

// Item 9 — queue lint
test("duplicateRowNumbers: a repeated number in one table is named", () => {
  const dups = duplicateRowNumbers(table("Portfolio", 5, 6, 6, 7));
  assert.deepEqual(dups, [{ section: "Portfolio", number: "6" }]);
});

test("duplicateRowNumbers: the same number in two different tables is not a duplicate", () => {
  assert.deepEqual(duplicateRowNumbers(table("A", 1, 2) + table("B", 1, 2)), []);
});

test("duplicateRowNumbers: a grandfathered historic duplicate passes, any other fails", () => {
  const [section, nums] = Object.entries(GRANDFATHERED)[0];
  const n = nums[0];
  assert.deepEqual(duplicateRowNumbers(table(section, n, n)), [], "allowlisted duplicate must pass");
  const fresh = Math.max(...Object.values(GRANDFATHERED).flat().map(Number)) + 1000;
  assert.deepEqual(duplicateRowNumbers(table(section, fresh, fresh)), [{ section, number: String(fresh) }]);
});

test("queue-write-check --lint: exit 0 clean, exit 1 naming the duplicate", () => {
  const script = join(repo, "hooks", "scripts", "queue-write-check.mjs");
  const dir = mkdtempSync(join(tmpdir(), "queue-lint-"));
  const ok = join(dir, "ok.md"), bad = join(dir, "bad.md");
  writeFileSync(ok, table("P", 1, 2));
  writeFileSync(bad, table("P", 1, 1));
  assert.equal(spawnSync("node", [script, "--lint", ok]).status, 0);
  const r = spawnSync("node", [script, "--lint", bad], { encoding: "utf8" });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /duplicate row number 1 in "P"/);
});

test("lane-end runs the queue lint after the row write; vault-write names it", () => {
  assert.match(read("hooks/scripts/lane-end.mjs"), /--lint/);
  assert.match(read("skills/vault-write/SKILL.md"), /queue-write-check\.mjs --lint/);
});

// Items 6-8 — motion proof
test("motion: computed style is never proof; painted frames across the whole transition", () => {
  const m = read("skills/motion/SKILL.md");
  assert.match(m, /Computed-not-painted/);
  assert.match(m, /painted frames/);
  assert.match(read("skills/motion/references/REVIEW.md"), /Computed-not-painted/);
  assert.match(read("skills/webapp-testing/SKILL.md"), /painted frames/);
});

test("motion done-when: deployed preview named or gap stated; on-screen order asserted", () => {
  const b = read("skills/motion/references/BUILD.md");
  assert.match(b, /deployed preview/);
  assert.match(b, /on-screen order/);
  assert.match(read("skills/motion/references/REVIEW.md"), /on-screen order/);
});

// Item 10
test("phone layout: check for the surface's own phone layout before a phone question", () => {
  assert.match(read("doer-rules.md"), /own phone layout/);
  assert.match(read("skills/vault-recall/SKILL.md"), /own phone layout/);
});

test("banked ruling grep before any operator ask for a Figma change", () => {
  assert.match(read("skills/vault-recall/SKILL.md"), /Before any queue row asks the operator[^]*grep `fleet\/rulings`/);
  assert.match(read("skills/dispatch-brief/references/BRIEF-CRAFT.md"), /greps `fleet\/rulings`/);
});

test("grilling: a likely-typo word gets one confirming question, not a written-down reading", () => {
  const g = read("skills/grilling/SKILL.md");
  assert.match(g, /likely typo/);
  assert.match(g, /Writing the reading down is not confirming it/);
});
