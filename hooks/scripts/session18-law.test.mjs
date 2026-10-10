// 1.128.0 (backlog 161): session start and wrap efficiency. Run: node --test hooks/scripts/session18-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const flat = (p) => readFileSync(join(root, p), "utf8").replace(/\s+/g, " ");

test("1.128.0 CHANGED entry names the script, the once-only queue, and the 1.127.0 ceiling reasons", () => {
  const top = flat("CHANGED.txt").split(" 1.127.0 — ")[0];
  assert.match(top, /^1\.128\.0 — /);
  assert.match(top, /session-resume\.mjs/);
  for (const r of ["routing 1560 -> 1620", "wrap 980 -> 995", "agents/reviewer.md 1600 -> 1630"]) assert.ok(top.includes(r), `missing ceiling reason: ${r}`);
});

test("the queue is written once: cockpit verbatim, handovers link and count (wrap, pause-resume, SECTIONS)", () => {
  assert.match(flat("skills/wrap/SKILL.md"), /cockpit wrap block carries every open [^;]*row verbatim; a handover carries a link and the open-row count, never the rows/);
  assert.match(flat("skills/pause-resume/SKILL.md"), /a handover carries a link\s+and the open-row count only/);
  assert.match(flat("skills/wrap/references/SECTIONS.md"), /a handover carries a link and the open-row count, never the rows/);
});

test("the output style still reprints every open row in full in chat", () => {
  assert.match(flat("output-styles/discipline.md"), /Every status reply ends with "Needed from you" — the operator queue, in full\./);
});

test("wrap writes a Next block and runs the digest; resume paths run it too; no SessionStart hook for it", () => {
  assert.match(flat("skills/wrap/SKILL.md"), /`## Next` block/);
  assert.match(flat("skills/wrap/SKILL.md"), /`session-resume\.mjs` prints every lane/);
  assert.match(flat("skills/pause-resume/SKILL.md"), /Run `node <plugin>\/hooks\/scripts\/session-resume\.mjs <vault-root>`/);
  assert.match(flat("skills/routing/SKILL.md"), /session-resume\.mjs <vault-root>/);
  assert.ok(!readFileSync(join(root, "hooks", "hooks.json"), "utf8").includes("session-resume"));
});

test("the garbled review-rounds sentence is gone from wrap and REPORT-AND-LEARN", () => {
  for (const f of ["skills/wrap/SKILL.md", "skills/wrap/references/REPORT-AND-LEARN.md"]) {
    const t = flat(f);
    assert.doesNotMatch(t, /Round cap, \(every|Round cap — \(every/);
    assert.match(t, /Every change has at least one round; a `0` is a missed reviewer, /);
  }
});
