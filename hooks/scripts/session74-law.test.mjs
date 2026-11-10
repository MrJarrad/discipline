// Parent lessons s74 (vault fleet/lessons/2026-11-10-s74-parent-lessons.md) and the #168 ambers, one assertion per encoded rule.
// Run: node --test hooks/scripts/session74-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const flat = (p) => readFileSync(join(root, p), "utf8").replace(/\s+/g, " ");
const has = (p, s) => assert.ok(flat(p).includes(s), `${p} lacks: ${s}`);

test("s74 1: parent session id is read from get_session, never retyped", () => {
  has("skills/routing/references/HARD-RULES.md", "read from `get_session` (no id) and pasted, never retyped from the Claude-Session footer");
});
test("s74 2: in-session reviewer briefs carry no reviewer line", () => {
  has("skills/dispatch-brief/SKILL.md", "in-session (Agent) briefs say \"no `reviewer:` line; `merge:` last\"");
  has("skills/dispatch-brief/SKILL.md", "`reviewer: session_<id>` verbatim. Helper sessions only");
});
test("#168 amber 1: the blend/filter/clip pixel rule lives in ACCURACY.md and qa-acceptance points at its references", () => {
  has("skills/dispatch-brief/references/ACCURACY.md", "Inside a blend, filter or clip group, sample painted pixels at the operator's crop");
  has("skills/qa-acceptance/SKILL.md", "Read `references/DOS-AND-DONTS.md`.");
});
test("#168 amber 2: the row-edit rule sits outside the numbered list", () => {
  const t = flat("skills/vault-write/references/WRITING.md");
  assert.ok(t.indexOf("never by `rstrip(' |')` plus append") > t.indexOf("3. **If a full rewrite is unavoidable**"));
});
test("s74 3: the Source contract template carries the worktree line; the doer quotes the companion it read", () => {
  has("skills/dispatch-brief/SKILL.md", "- Worktree: <branch worktree abs path, never the design-system root clone> · the doer quotes the companion it read; a mismatch with the Export line is a defect, then stop");
});
test("s74 4: another ref is compared in a throwaway worktree, never checked out over the working tree", () => {
  has("skills/routing/references/HARD-RULES.md", "compare against another ref in a throwaway `git worktree add`");
  has("skills/routing/references/HARD-RULES.md", "DON'T: check another ref's files out over the working tree (`git checkout <ref> -- .` overwrote 13 just-committed vault files)");
});
