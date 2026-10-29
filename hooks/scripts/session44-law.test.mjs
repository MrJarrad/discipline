// 1.155.0: DISC-216 — a helper session's return reaches its parent.
// Run: node --test hooks/scripts/session44-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const flat = (p) => read(p).replace(/\s+/g, " ");
const HR = "skills/routing/references/HARD-RULES.md";

test("every create_session prompt opens with the run-it-now line and closes with the send to @parent", () => {
  const OPEN = 'opens "This message is your task — run it now."';
  const CLOSE = 'closes "Send the full return to the parent with send_message (session_id "@parent")."';
  assert.ok(flat("skills/dispatch-brief/SKILL.md").includes(`**A \`create_session\` brief** ${OPEN.replace(/"$/, '",')} has the helper write \`~/.claude/helper-session\` first, and ${CLOSE}`));
  const r = flat(HR);
  assert.ok(r.includes('Every `create_session` prompt opens with "This message is your task — run it now."'));
  assert.ok(r.includes('Every `create_session` brief closes with "Send the full return to the parent with send_message (session_id "@parent")."'));
});

test("the Stop hook is registered and named where helpers are dispatched", () => {
  assert.match(read("hooks/hooks.json"), /"Stop"[\s\S]*parent-return-stop\.mjs/);
  assert.ok(flat(HR).includes('then the step "First run: mkdir -p ~/.claude && echo <parent id> > ~/.claude/helper-session"'));
  assert.ok(flat(HR).includes("The Stop hook `parent-return-stop.mjs` holds a helper (marked by `~/.claude/helper-session`; no env var marks one, `CLAUDE_CODE_CHILD_SESSION=1` is set in the orchestrator too) once when its turn ends with a return and no `send_message`."));
  assert.ok(flat("skills/cloud-dispatch/references/HELPER-SESSIONS.md").includes("the Stop hook `parent-return-stop.mjs` holds it once and asks for the send"));
});

test("the parent arms one send_later sweep per helper dispatch as the backstop", () => {
  assert.ok(flat(HR).includes("The parent arms one `send_later` sweep about 50 minutes out per `create_session` dispatch as the backstop, and deletes it when the return arrives."));
  assert.ok(flat("skills/cloud-dispatch/references/HELPER-SESSIONS.md").includes("Arm one `send_later` about 50 minutes out per dispatch"));
});

test("release: 1.155.0 has its CHANGED.txt entry with the encoded line", () => {
  const entry = read("CHANGED.txt").split("\n\n").find((e) => e.startsWith("1.155.0 — "));
  assert.ok(entry);
  assert.match(entry, /\nencoded: 1\.155\.0 — /);
});
