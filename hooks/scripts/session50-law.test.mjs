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

test("L5: a reviewer helper sends its verdict block to the parent verbatim — one home, two pointers", () => {
  const h = flat("skills/cloud-dispatch/references/HELPER-SESSIONS.md");
  assert.ok(h.includes("**A reviewer helper sends its verdict block to the parent verbatim**"));
  assert.ok(h.includes("adds, under it, `reviewer: <its own session id>` (from `get_session`); the parent posts the block on the PR unchanged, and the merge gates read that line."));
  assert.ok(flat("skills/dispatch-brief/SKILL.md").includes('A reviewer brief says "send the verdict block to the parent verbatim"'));
  assert.ok(flat("agents/reviewer.md").includes("Posted by the parent for you, it adds `reviewer: <your session id>` under the heading"));
});

test("L6: the helper's own vault branch is named in the brief, and the MCP write guard is registered", () => {
  const h = flat("skills/cloud-dispatch/references/HELPER-SESSIONS.md");
  assert.ok(h.includes("**A brief that lets the helper write the vault names the helper's own vault branch**"));
  assert.ok(h.includes("`vault-mcp-write-guard.mjs` refuses an update under 256 bytes or under half the size the session last read."));
  const hooks = JSON.parse(read("hooks/hooks.json")).hooks.PreToolUse;
  const g = hooks.find((x) => x.matcher === "mcp__github__create_or_update_file");
  assert.ok(g && g.hooks.some((x) => x.command.includes("hooks/bin/vault-mcp-write-guard.mjs")));
});
