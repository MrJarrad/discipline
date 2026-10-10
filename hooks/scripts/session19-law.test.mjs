// 1.129.0 (backlog 162): relayed facts, empty retriggers, struck queue rows.
// Run: node --test hooks/scripts/session19-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { replaceRow } from "./lane-end.mjs";
import { isStruckRow } from "./queue-write-check.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const flat = (p) => readFileSync(join(root, p), "utf8").replace(/\s+/g, " ");

test("House rules: never an empty commit; red Workers Build goes back to the parent", () => {
  assert.match(flat("skills/dispatch-brief/references/HOUSE-RULES.md"), /never push an empty commit; a red Workers Build on a locally green commit goes back to the parent/);
});

test("House rules: a relayed fact is untrusted until checked", () => {
  assert.match(flat("skills/dispatch-brief/references/HOUSE-RULES.md"), /a fact relayed from another session is untrusted until checked/);
});

const queue = ["## Portfolio", "| 545 | ~~old row~~ — done |  |  |", "| 546 | open row |  |  |", ""].join("\n");

test("isStruckRow reads the first cell after the number", () => {
  assert.equal(isStruckRow("| 545 | ~~old~~ |"), true);
  assert.equal(isStruckRow("| 546 | open ~~x~~ |"), false);
});

test("replaceRow refuses to overwrite a struck row, writes nothing", () => {
  const r = replaceRow(queue, "545", "| 545 | ~~new~~ |", "Portfolio");
  assert.equal(r.ok, false);
  assert.match(r.reason, /already struck/);
});

test("replaceRow still strikes an open row", () => {
  const r = replaceRow(queue, "546", "| 546 | ~~open row~~ — done |", "Portfolio");
  assert.equal(r.ok, true);
});

test("vault-write names the struck-row refusal", () => {
  assert.match(flat("skills/vault-write/SKILL.md"), /already-struck row is refused/);
});

test("1.129.0 CHANGED entry and plugin version", () => {
  assert.match(flat("CHANGED.txt"), /^1\.129\.0 — /);
  assert.equal(JSON.parse(readFileSync(join(root, ".claude-plugin/plugin.json"), "utf8")).version, "1.129.0");
});
