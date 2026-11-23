// 1.160.0: DISC-219 — handoff-to-code follows handoff-css 0.12.1 (main 103db03): a new
// export is vendored into a new version folder, never copied into `latest/`. The skill
// stays a byte copy; the mirror test proves it.
// Run: node --test hooks/scripts/session49-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const flat = (p) => read(p).replace(/\s+/g, " ");

test("0.12.1: the export-set step names the vendor command, never a copy into latest/", () => {
  // Step 1 in full lives in references/steps.md since the DISC-351 s8 split (handoff-css #92).
  const s = flat("skills/handoff-to-code/references/steps.md");
  assert.ok(s.includes("`handoff-css vendor <export>.json [<export>.md] --into design/handoff`"));
  assert.ok(s.includes("never copied into `latest/`, which writes through the link into the version it points at"));
});

test("0.12.1: references/export-set.md carries the vendoring section and the stale .md rule", () => {
  const r = flat("skills/handoff-to-code/references/export-set.md");
  assert.ok(r.includes("**Vendoring a new export**"));
  assert.ok(r.includes("Given no `.md`, the old one is left behind, not carried beside the new JSON."));
});

test("the mirror pins a full handoff-css commit, never a branch or a short sha", () => {
  // Which commit is the mirror test's own business (it byte-compares at that ref); this pins only its shape.
  assert.match(read("hooks/scripts/handoff-to-code-mirror.test.mjs"), /process\.env\.HANDOFF_CSS_REF \|\| "[0-9a-f]{40}"/);
});

test("release: 1.160.0 has its CHANGED.txt entry with the encoded line", () => {
  const entry = read("CHANGED.txt").split("\n\n").find((e) => e.startsWith("1.160.0 — "));
  assert.ok(entry);
  assert.ok(entry.includes("encoded: 1.160.0 — backlog DISC-219."));
});
