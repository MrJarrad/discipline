// The first files an agent reads must not drift from the tree (audit 2026-10-05, finding 9).
// Run: node --test hooks/scripts/entry-docs.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(repo, p), "utf8");

test("README skill count equals the skills/ directories that carry a SKILL.md", () => {
  const actual = readdirSync(join(repo, "skills"), { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(repo, "skills", d.name, "SKILL.md"))).length;
  const claimed = /\*\*(\d+) skills\*\*/.exec(read("README.md"));
  assert.ok(claimed, "README states a bold skill count");
  assert.equal(Number(claimed[1]), actual);
});

test("AGENTS.md describes the Claude plugin, not the Cursor-era marketplace", () => {
  const text = read("AGENTS.md");
  assert.doesNotMatch(text, /Team Marketplace/);
  assert.match(text, /\.claude-plugin\/plugin\.json/);
});

test("every path AGENTS.md names in its layout table exists", () => {
  const rows = [...read("AGENTS.md").matchAll(/^\| `([^`<]+?)(?:<[^`]*)?` /gm)].map((m) => m[1]);
  assert.ok(rows.length >= 6);
  for (const p of rows) assert.ok(existsSync(join(repo, p.replace(/ .*/, ""))), `${p} exists`);
});
