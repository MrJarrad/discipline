// s79 parent lessons 2-3 and 4-5, backlog DISC-293, DISC-294, DISC-295, one assertion per encoded rule.
// Run: node --test hooks/scripts/session79-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const flat = (p) => readFileSync(join(root, p), "utf8").replace(/\s+/g, " ");
const has = (p, s) => assert.ok(flat(p).includes(s), `${p} lacks: ${s}`);
const HARD = "skills/routing/references/HARD-RULES.md";

test("DISC-293: the verdict's first line is a markdown heading, never bold text, naming Review and the head sha", () => {
  has("agents/reviewer.md", "The heading is markdown `##`, never bold text. DON'T: `**Reviewer — round 1 …** head 773a711` (the gate refused it, s79)");
  has("skills/dispatch-brief/SKILL.md", "Its first line is a `##` Review heading, never bold (s79)");
});
test("DISC-294: a wake-event turn that changed nothing sends the parent nothing", () => {
  has(HARD, "A wake-event turn (a GitHub bot edit, a green check suite) is a return only when it made an edit, a push, a commit or a GitHub write, or says `next: parent`");
  has(HARD, "DON'T: send the parent \"no change\" per event while waiting on the operator");
});
test("DISC-295: a parent keeps each project at lane capacity from the backlog, by tool", () => {
  has(HARD, "**A parent keeps its projects at lane capacity** (DISC-295");
  has(HARD, "`lane-capacity.mjs` reads the lanes against portfolio 5, discipline 1, handoff-toolkit 1");
  has(HARD, "A lane waiting on the operator's look does not count");
  has(HARD, "`lane-capacity-stop.mjs` holds a status reply or wrap once");
  has(HARD, "DON'T: list the next wave at wrap");
});
test("DISC-295: wrap refuses 'wrapped' while a project is under capacity unless each gap names a reason", () => {
  has("skills/wrap/references/CLOSING-CHECKS.md", "Run `lane-capacity.mjs` before the wrap report; a project under capacity with open agent rows is dispatched, or each gap is named with `--reason");
  has("skills/wrap/SKILL.md", "**Lane capacity**");
});
test("DISC-295: the Stop hook is wired", () => {
  const hooks = JSON.parse(readFileSync(join(root, "hooks/hooks.json"), "utf8"));
  const cmds = hooks.hooks.Stop.flatMap((g) => g.hooks.map((h) => h.command));
  assert.ok(cmds.some((c) => c.includes("lane-capacity-stop.mjs")));
});
test("s79: status in the Status doc is enforced by tool, and a stale plugin is loud", () => {
  has(HARD, "`needed-from-you-stop.mjs` refuses a status reply that reprints the queue inline instead of the `Full list:` link, and one that follows no write to the Status doc this turn");
  has(HARD, "`plugin-freshness.mjs` warns at session start when the loaded plugin is older than the newest release and holds a status reply while it is");
  has(HARD, "the vault's `.claude/settings.json` runs a copy of `plugin-freshness.mjs`");
  const hooks = JSON.parse(readFileSync(join(root, "hooks/hooks.json"), "utf8"));
  const on = (ev) => hooks.hooks[ev].flatMap((g) => g.hooks.map((h) => h.command));
  assert.ok(on("SessionStart").some((c) => c.includes("plugin-freshness.mjs\" start")));
  assert.ok(on("Stop").some((c) => c.includes("plugin-freshness.mjs\" stop")));
});
test("DISC-296: the merge gate also trusts the authenticated gh user, not only the repo owner and get_me", () => {
  has("hooks/bin/merge-review-gate.mjs", "const me = reads.me.length ? reads.me : ghLogin();");
  has("hooks/bin/merge-review-gate.mjs", "gh unavailable -> the owner alone");
});
