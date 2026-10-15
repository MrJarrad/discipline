// 1.135.0 (DISC-168): ideas are backlog rows, needed from the operator until picked.
// Run: node --test hooks/scripts/session23-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const flat = (p) => readFileSync(join(root, p), "utf8").replace(/\s+/g, " ");

test("doer-rules owns the rule: one row per idea, waiting on operator, cited under Idea rows", () => {
  assert.match(flat("doer-rules.md"), /An idea is a backlog row the moment it exists.*one per idea.*--status "waiting on operator".*`## Idea rows`.*`idea-unrowed`/);
});

for (const f of ["agents/engineer.md", "agents/ux-designer.md", "skills/prototype/SKILL.md"]) {
  test(`${f} points idea sheets at the rule`, () => {
    assert.match(flat(f), /Ideas on a sheet are backlog rows.*--status "waiting on operator".*## Idea rows.*DISC-168/);
  });
}

for (const f of ["output-styles/discipline.md", "skills/routing/SKILL.md"]) {
  test(`${f}: an idea given in chat is a backlog row`, () => {
    assert.match(flat(f), /idea.*waiting on operator.*DISC-168/i);
  });
}

test("wrap: an idea raised or sheet written with no row is added before the report", () => {
  assert.match(flat("skills/wrap/references/REPORT-AND-LEARN.md"), /idea the session raised or an idea sheet it wrote, one `waiting on operator` row each/);
});

test("vault-write: ideas as rows live in WRITING.md § Row numbers, pointed at from SKILL.md", () => {
  assert.match(flat("skills/vault-write/SKILL.md"), /ideas as rows, in `references\/WRITING\.md` § Row numbers/);
  assert.match(flat("skills/vault-write/references/WRITING.md"), /An idea is a backlog row in the same action\*\* \(DISC-168\).*--status "waiting on operator".*`## Idea rows`.*`idea-unrowed`/);
});
