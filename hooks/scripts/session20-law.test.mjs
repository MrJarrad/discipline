// 1.130.0 (backlog 154): "Needed from you" is scoped to the session's projects.
// Run: node --test hooks/scripts/session20-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const flat = (p) => readFileSync(join(root, p), "utf8").replace(/\s+/g, " ");

test("output style scopes Needed from you to the session's projects, with a fallback that never prints all", () => {
  const s = flat("output-styles/discipline.md");
  assert.match(s, /the open rows of the projects this session is working on/);
  assert.match(s, /rows of other projects are not printed and stay in the queue untouched/);
  assert.match(s, /lanes in flight or handovers being worked/);
  assert.match(s, /ask once/);
  assert.match(s, /never print every project's rows/);
  assert.ok(!/reprints \*\*every open row's complete text\*\*/.test(s), "old print-every-row wording must be gone");
});

test("present-for-review and wrap SECTIONS agree with the output style", () => {
  assert.match(flat("skills/present-for-review/SKILL.md"), /session's projects' open rows/);
  assert.ok(!/every open `orchestrator\/operator-queue\.md` row/.test(flat("skills/present-for-review/SKILL.md")));
  assert.match(flat("skills/wrap/references/SECTIONS.md"), /Chat reprints the session's projects' rows only/);
  assert.ok(!/Chat still reprints every row/.test(flat("skills/wrap/references/SECTIONS.md")));
});

test("1.130.0 CHANGED entry", () => {
  assert.match(flat("CHANGED.txt"), /1\.130\.0 — `2026-10-11-1130-queue-scope`: backlog 154.*encoded:/);
});
