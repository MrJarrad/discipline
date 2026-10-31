// 1.159.0: DISC-211 — helper and wrapped-parent sessions are archived by a sweep at session
// start and at wrap, not only by the parent that dispatched them.
// Run: node --test hooks/scripts/session48-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const flat = (p) => read(p).replace(/\s+/g, " ");

test("HARD-RULES 19 owns the sweep: when it runs, the script, and what happens to each list", () => {
  const r = flat("skills/routing/references/HARD-RULES.md");
  for (const s of [
    "archive it when it's task is complete or if another session takes over",
    "aren't being archived when completed or possibly worse aren't being completed",
    "**The helper sweep runs at session start and at wrap**",
    "hooks/scripts/helper-sweep.mjs",
    "it's important the we don't archive the parent sessions though, i'm a bit nervous about that",
    "**A parent session is never archived**",
    "a helper is a session with a parent and a title starting \"Helper ·\"",
    "the surface list is taken over or reported in the status",
    "a refused archive is one line in the status, never dropped",
  ]) assert.ok(r.includes(s), s);
});

test("session start, wrap and the helper recipe point at rule 19's sweep without restating it", () => {
  assert.ok(flat("skills/vault-recall/SKILL.md").includes("run the helper sweep (`routing` HARD-RULES 19)"));
  assert.ok(flat("skills/wrap/references/CLOSING-CHECKS.md").includes("run the helper sweep (routing HARD-RULES 19), which never archives a parent session, this one or any earlier one"));
  assert.ok(flat("skills/cloud-dispatch/references/HELPER-SESSIONS.md").includes("The helper sweep (HARD-RULES 19) catches any helper a parent missed"));
});

test("release: 1.159.0 has its CHANGED.txt entry with the encoded line", () => {
  const entry = read("CHANGED.txt").split("\n\n").find((e) => e.startsWith("1.159.0 — "));
  assert.ok(entry);
  assert.ok(entry.includes("encoded: 1.159.0 — backlog DISC-211"));
});

test("no rule text tells a session to archive a wrapped parent", () => {
  for (const p of ["skills/routing/references/HARD-RULES.md", "skills/wrap/references/CLOSING-CHECKS.md", "CHANGED.txt"]) {
    const top = p === "CHANGED.txt" ? read(p).split("\n\n")[0] : flat(p);
    assert.ok(!/archives? earlier days' wrapped parent|a wrapped parent from an earlier day;? never/.test(top), p);
  }
});
