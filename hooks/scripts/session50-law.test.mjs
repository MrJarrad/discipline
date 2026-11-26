// 1.161.0: DISC-221 — session 43 parent lessons 1, 3–7 (vault
// fleet/lessons/2026-10-31-s43-parent-lessons.md). Each rule's text is asserted
// verbatim at its one home; the checks themselves are tested beside their scripts.
// Run: node --test hooks/scripts/session50-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const flat = (p) => read(p).replace(/\s+/g, " ");

test("L1: an ask that cites rows is checked first — HARD-RULES 14 names the row-add refusal", () => {
  const s = flat("skills/routing/references/HARD-RULES.md");
  assert.ok(s.includes("**An ask that cites rows is checked first**"));
  assert.ok(s.includes("`row-add.mjs --to queue` refuses a row naming its project's IDs unless each is open and `list-drift-check.mjs` ran in the last 15 minutes."));
});

test("L3: a yes opens a lane the same turn — HARD-RULES 23, and the digest points at it", () => {
  const s = flat("skills/routing/references/HARD-RULES.md");
  assert.ok(s.includes("23. **A yes opens a lane the same turn**"));
  assert.ok(s.includes("When the operator says yes to a build row, the parent dispatches it that turn and writes the lane's branch or PR into the row's Notes."));
  assert.ok(read("hooks/scripts/session-resume.mjs").includes("(routing HARD-RULES 23)"));
});

test("L4: at session start the parent sends each Re-point row its message — HARD-RULES 19", () => {
  const s = flat("skills/routing/references/HARD-RULES.md");
  assert.ok(s.includes("**At session start the parent sends each Re-point row its message**"));
  assert.ok(s.includes("the sweep's `## Re-point` list carries one `send_message` text per helper whose parent wrapped, naming the new parent's id; send it once, that turn."));
});

test("L5: a reviewer helper's verdict block is posted by the parent with its reviewer: line", () => {
  assert.ok(flat("agents/reviewer.md").includes("Posted by the parent for you, it adds `reviewer: <your session id>` under the heading"));
});

test("L7: a Mac job's PR merges in the same turn it is filed — HARD-RULES 9, the one home", () => {
  const s = flat("skills/routing/references/HARD-RULES.md");
  assert.ok(s.includes("**Queuing a Mac job merges the vault branch to main in the same action**"));
  assert.ok(s.includes("The notes-only PR that files the job is the parent's own merge, that turn."));
  assert.ok(!read("doer-rules.md").includes("Queuing a Mac job merges"), "one home: HARD-RULES 9");
});

test("release: 1.161.0 has its CHANGED.txt entry with the encoded line", () => {
  const entry = read("CHANGED.txt").split("\n\n").find((e) => e.startsWith("1.161.0 — "));
  assert.ok(entry);
  assert.ok(entry.includes("encoded: 1.161.0 — backlog DISC-220, DISC-221."));
});
