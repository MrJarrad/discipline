// 1.157.0: HT-2 / HT-15 / HT-10 (handoff-toolkit) — handoff-to-code has one source again
// (handoff-css's claude-plugin dist, byte for byte) and carries the script's export set.
// Run: node --test hooks/scripts/session46-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const flat = (p) => read(p).replace(/\s+/g, " ");
const SKILL = "skills/handoff-to-code/SKILL.md";

test("HT-15: the script is the export path and the export is a set", () => {
  const s = flat(SKILL);
  assert.ok(s.includes("## The export is a set"));
  assert.ok(s.includes("the plugin's in-Figma export is superseded"));
  assert.ok(s.includes("**A link-run finding is a reported item, never a reason to inline a value.**"));
  assert.ok(existsSync(join(root, "skills/handoff-to-code/references/export-set.md")));
  for (const code of ["STALE_PAIR", "SET_MEMBER_MISSING", "VARIABLE_NOT_IN_DS_EXPORTS", "LIBRARY_MISSING"]) {
    assert.ok(read("skills/handoff-to-code/references/export-set.md").includes(code), code);
  }
});

test("HT-10: specs are read from the spec index; one with no entry is flagged", () => {
  const s = flat(SKILL);
  assert.ok(s.includes("**Specs are read from the spec index, never from the design tool.**"));
  assert.ok(s.includes("`SPEC_NOT_INDEXED` is a finding: name the spec and ask"));
});

test("HT-2: the house lines survived the merge into the canonical copy", () => {
  const s = flat(SKILL);
  assert.ok(s.includes("The Figma MCP does not replace the pair"));
  assert.ok(s.includes("and the live-annotation spot check"));
  assert.ok(s.includes("`defaultValue` in an export is a display convention"));
  assert.ok(s.includes("A locked `aspectRatio` builds the ratio, never the fixed height"));
});

test("release: 1.157.0 has its CHANGED.txt entry with the encoded line", () => {
  const entry = read("CHANGED.txt").split("\n\n").find((e) => e.startsWith("1.157.0 — "));
  assert.ok(entry);
  assert.ok(entry.includes("encoded: 1.157.0 — backlog HT-2, HT-15, HT-10"));
});
