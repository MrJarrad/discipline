// DISC-336: autonomous backlog throughput (HARD-RULES, the eight-doers paragraph), proven through its mechanisms:
// next-row-stop.mjs holds a wake turn that never ran next-row.mjs or left its rows unstarted; row-add.mjs refuses an
// unlabelled open backlog row. Edge cases live in hooks/bin/next-row-stop.test.mjs and row-add.test.mjs.
// Run: node --test hooks/scripts/disc336-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { rowAdd } from "./row-add.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const hook = join(root, "hooks/bin/next-row-stop.mjs");
const WAKE = '<wake reason="external-event"><event source="github">CI green</event></wake>';
const user = (content) => ({ type: "user", message: { content } });
const said = (text) => ({ type: "assistant", message: { content: [{ type: "text", text }] } });
const called = (name, input, id) => ({ type: "assistant", message: { content: [{ type: "tool_use", id, name, input }] } });
const result = (content, id) => ({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: id, content }] } });
const NEXT = { command: "node $P/hooks/scripts/next-row.mjs --vault /v --projects PF --lanes /tmp/l.json" };
const UNDER = "Doers: 6 working of target 8\nUNDER TARGET by 2: start next\n  - PF-3 first\nUNDER TARGET: start the rows above, or rerun with --reason";

function stop(entries, stopActive = false) {
  const dir = mkdtempSync(join(tmpdir(), "disc336-"));
  const transcript = join(dir, "t.jsonl");
  writeFileSync(transcript, entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
  mkdirSync(join(dir, "vault", "projects"), { recursive: true });
  const env = { ...process.env, HOME: join(dir, "home"), CLAUDE_CODE_REMOTE: "true", DISCIPLINE_VAULT_ROOT: join(dir, "vault") };
  const r = spawnSync(process.execPath, [hook], { input: JSON.stringify({ transcript_path: transcript, session_id: "s", stop_hook_active: stopActive }), env, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout ? JSON.parse(r.stdout) : null;
}

test("both hooks are wired, and the rule names the script it runs", () => {
  const hooks = JSON.parse(readFileSync(join(root, "hooks/hooks.json"), "utf8")).hooks;
  const cmds = (ev) => hooks[ev].flatMap((g) => g.hooks.map((h) => h.command));
  assert.ok(cmds("Stop").some((c) => c.includes("next-row-stop.mjs")));
  assert.ok(hooks.PostToolUse.some((g) => /get_session/.test(g.matcher) && g.hooks.some((h) => h.command.includes("lane-landed-nudge.mjs"))));
  assert.match(readFileSync(join(root, "skills/routing/references/HARD-RULES.md"), "utf8"), /\*\*A parent keeps eight doers working, from a ranked list\*\*[^\n]*next-row\.mjs/);
});

test("a wake turn that never ran next-row.mjs is held once, and told the command; the second stop is not checked", () => {
  const out = stop([user(WAKE), said("PR merged.")]);
  assert.equal(out?.decision, "block");
  assert.match(out.reason, /next-row\.mjs/);
  assert.equal(stop([user(WAKE), said("PR merged.")], true), null);
});

test("a run under target is held until a doer is started; starting one lets the turn end", () => {
  const ran = [user(WAKE), called("Bash", NEXT, "a"), result(UNDER, "a")];
  assert.equal(stop([...ran, said("noted")])?.decision, "block");
  assert.equal(stop([...ran, called("mcp__claude-code-remote__create_session", {}, "c"), result("ok", "c"), said("started PF-3")]), null);
});

test("the doer target is 8 and portfolio's cap does not bind below it", async () => {
  const { DEFAULT_TARGET } = await import("./lib/backlog-rank.mjs");
  const { CAPACITY } = await import("./lane-capacity.mjs");
  assert.equal(DEFAULT_TARGET, 8);
  assert.ok(CAPACITY.PF >= DEFAULT_TARGET);
});

test("row-add refuses an open backlog row with no owner label; --owner writes it", () => {
  process.env.DISCIPLINE_MARKER_DIR ??= mkdtempSync(join(tmpdir(), "disc336-mk-"));
  const v = mkdtempSync(join(tmpdir(), "disc336-v-"));
  mkdirSync(join(v, "projects/zz"), { recursive: true });
  writeFileSync(join(v, "projects/zz/zz-queue.md"), "---\nkind: queue\nprefix: ZZ\n---\n| # | Needed | Where | Why | Recommended |\n| - | - | - | - | - |\n");
  writeFileSync(join(v, "projects/zz/zz-backlog.md"), "---\nkind: backlog\nprefix: ZZ\n---\n## Open\n\n| # | Item | Raised | Status |\n| - | --- | --- | --- |\n\n## Done\n\n| # | Item | Raised | Status |\n| - | --- | --- | --- |\n");
  const refused = rowAdd({ vault: v, prefix: "ZZ", to: "backlog", text: "an unlabelled thing", offline: true });
  assert.equal(refused.ok, false);
  assert.match(refused.reason, /--owner/);
  const ok = rowAdd({ vault: v, prefix: "ZZ", to: "backlog", owner: "Mac", text: "check it in WebKit", offline: true });
  assert.match(readFileSync(join(v, "projects/zz/zz-backlog.md"), "utf8"), new RegExp(`\\| ${ok.id} \\| check it in WebKit\\. Mac\\. \\|`));
});
