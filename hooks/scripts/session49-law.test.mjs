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
  const s = flat("skills/handoff-to-code/SKILL.md");
  assert.ok(s.includes("`handoff-css vendor <export>.json [<export>.md] --into design/handoff`"));
  assert.ok(s.includes("never copied into `latest/`, which writes through the link into the version it points at"));
});

test("0.12.1: references/export-set.md carries the vendoring section and the stale .md rule", () => {
  const r = flat("skills/handoff-to-code/references/export-set.md");
  assert.ok(r.includes("**Vendoring a new export**"));
  assert.ok(r.includes("Given no `.md`, the old one is left behind, not carried beside the new JSON."));
});

test("the mirror pins the handoff-css commit that carries this copy", () => {
  assert.match(read("hooks/scripts/handoff-to-code-mirror.test.mjs"), /process\.env\.HANDOFF_CSS_REF \|\| "103db037721ffaf06191a1b7dceabdc7783db8aa"/);
});

test("release: 1.160.0 in both manifests and CHANGED.txt, with the encoded line", () => {
  for (const p of [".claude-plugin/plugin.json", ".claude-plugin/marketplace.json"]) assert.ok(read(p).includes('"version": "1.160.0"'), p);
  const top = read("CHANGED.txt");
  assert.ok(top.startsWith("1.160.0 — "));
  assert.ok(top.split("\n\n")[0].includes("encoded: 1.160.0 — backlog DISC-219."));
});
