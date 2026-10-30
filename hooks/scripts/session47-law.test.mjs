// 1.158.0: handoff-to-code follows handoff-css v0.12.0 (brownfield path, the agent
// repairs a stale export set). The skill stays a byte copy; the mirror test proves it.
// Run: node --test hooks/scripts/session47-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const flat = (p) => read(p).replace(/\s+/g, " ");
const SKILL = "skills/handoff-to-code/SKILL.md";

test("v0.12.0: the brownfield section and its reference ship together", () => {
  const s = flat(SKILL);
  assert.ok(s.includes("## Brownfield — existing code, no Design System Handoff export"));
  assert.ok(s.includes("**A proposal is a question, never a binding.**"));
  assert.ok(s.includes("`references/brownfield.md`"));
  assert.ok(existsSync(join(root, "skills/handoff-to-code/references/brownfield.md")));
  assert.ok(read("skills/handoff-to-code/references/brownfield.md").includes("RULING_STALE"));
});

test("v0.12.0: a stale set is brought up to date, not handed back as a re-export ask", () => {
  const s = flat(SKILL);
  assert.ok(s.includes("bring the set up to date yourself"));
  assert.ok(!s.includes("stop and ask for a re-export"));
  assert.ok(s.includes("**The one thing to ask a person for is a Design System Handoff plugin run, named by file.**"));
});

test("the mirror pins the handoff-css release that carries this copy", () => {
  assert.match(read("hooks/scripts/handoff-to-code-mirror.test.mjs"), /process\.env\.HANDOFF_CSS_REF \|\| "v0\.12\.0"/);
});

test("release: 1.158.0 in both manifests and CHANGED.txt, with the encoded line", () => {
  for (const p of [".claude-plugin/plugin.json", ".claude-plugin/marketplace.json"]) assert.ok(read(p).includes('"version": "1.158.0"'), p);
  const top = read("CHANGED.txt");
  assert.ok(top.startsWith("1.158.0 — "));
  assert.ok(top.split("\n\n")[0].includes("encoded: 1.158.0 — handoff-css v0.12.0 mirror"));
});
