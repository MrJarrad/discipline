// The 1.109.0 lessons (session 10, 2026-10-05): one verbatim assertion per rule,
// each at the file that owns the behaviour. Rule 8 is tested in hooks/bin/commit-gate.test.mjs.
// Run: node --test hooks/scripts/session10-lessons-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(repo, p), "utf8");

test("rules 1, 7: resolve the remote, commit with git -C; rule 2: fetch+rebase before push; rule 4: evidence from the final sha", () => {
  const d = read("doer-rules.md");
  assert.match(d, /Resolve the remote; never reason from a stale local ref/);
  assert.match(d, /git ls-remote origin <branch>/);
  assert.match(d, /Commit and push with\s+`git -C <worktree-path>`, never a `cd … && git add -A && git commit` chain/);
  assert.match(d, /fetch and rebase\s+immediately before every push/);
  assert.match(d, /captured after the final commit, from that build, and name its sha/);
});

test("rule 2: a brief names every other lane on a shared branch", () => {
  assert.match(read("skills/dispatch-brief/references/BRIEF-CRAFT.md"), /names every other lane on it\*\* and requires fetch \+ rebase/);
});

test("rule 3: queuing a Mac job merges the vault branch to main in the same action", () => {
  assert.match(read("skills/routing/references/HARD-RULES.md"), /Queuing a Mac job merges the vault branch to main in the same action/);
});

test("rule 5: an entrance/feel story is read back before the first build", () => {
  assert.match(read("skills/grilling/SKILL.md"), /An entrance or feel ask with a story gets a confirmed one-paragraph read-back before the first\s+build/);
});

test("rule 6: reference before physics", () => {
  assert.match(read("skills/motion/references/BUILD.md"), /\*\*Reference before physics\.\*\* Ask for, or measure, a reference the operator likes before modelling/);
});

test("rule 9: reviewer checks attribution wording in law/ruling docs", () => {
  assert.match(read("agents/reviewer.md"), /Attribution in law\/ruling docs/);
});
