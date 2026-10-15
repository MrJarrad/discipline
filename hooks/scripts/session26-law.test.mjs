// 1.140.0: session 25 lessons DISC-169..176. Run: node --test hooks/scripts/session26-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const flat = (p) => readFileSync(join(root, p), "utf8").replace(/\s+/g, " ");

test("DISC-169: fix rounds change only what the operator named (HARD-RULES 18, BRIEF-CRAFT 18, engineer, routing 18)", () => {
  assert.match(flat("skills/routing/references/HARD-RULES.md"), /18\. \*\*A fix round changes only what the operator named\*\*.*we went way to far in the wrong direction.*`Stays the same` list.*mechanism.*waits for the operator's yes first/);
  assert.match(flat("skills/dispatch-brief/references/BRIEF-CRAFT.md"), /18\. \*\*A fix-round brief lists what stays the same\*\*/);
  assert.match(flat("agents/engineer.md"), /fix round's read-back also lists what stays the same/);
  assert.match(flat("skills/routing/SKILL.md"), /18\. \*\*A fix round changes only what the operator named\*\*; brief and read-back list what stays the same/);
});
test("DISC-171: builds-check is a named mechanical script and a probe step", () => {
  assert.match(flat("skills/routing/references/MECHANICAL-SCRIPTS.md"), /builds-check\.mjs <repo>.*exit 0 none, 1 active.*2 refused/);
  assert.match(flat("skills/present-for-review/references/PREVIEW-PROBE.md"), /7\. Before a push, ask Cloudflare.*builds-check\.mjs/);
  assert.match(flat("skills/routing/SKILL.md"), /`builds-check\.mjs` shows running builds/);
});
test("DISC-172: release path, drafts, one gate-run tail format", () => {
  const t = flat("skills/release-deploy/references/RELEASE-PATH.md");
  assert.match(flat("skills/release-deploy/SKILL.md"), /references\/RELEASE-PATH\.md/);
  assert.match(t, /Release path.*only from `main`, by `pnpm release:promote`.*12 real-Chromium repetitions.*rolls back on its own/);
  assert.match(t, /Helper PRs open as \*\*drafts\*\*/);
  assert.match(flat("doer-rules.md"), /the only tail shape every merge script parses/);
});
test("DISC-173: never author the operator's words, in doer-rules, pointed at from routing", () => {
  assert.match(flat("doer-rules.md"), /Never author text that claims to be the operator's words.*offer the wording in chat for him to paste/);
  assert.match(flat("skills/routing/SKILL.md"), /never author the operator's words/);
});
test("DISC-174: environment facts in cloud-dispatch failure modes", () => {
  assert.match(flat("skills/cloud-dispatch/SKILL.md"), /one secret per host.*second secret for `api\.cloudflare\.com` is ignored.*build logs need a user token.*secrets load only at session start/);
});
test("DISC-175: helper sessions archived at lane end, owner HARD-RULES 19", () => {
  assert.match(flat("skills/routing/references/HARD-RULES.md"), /19\. \*\*Helper sessions are archived once their lane lands\*\*.*can we also archive helper sessions once they're complete.*`archive_session`.*superseded round's helper is archived then/);
  assert.match(flat("skills/routing/SKILL.md"), /archives its helper session \(rule 19\)/);
  assert.match(flat("skills/cloud-dispatch/SKILL.md"), /archived at lane end, `routing` HARD-RULES 19/);
});
test("DISC-176: baton row reconciled with reviewer precondition 3", () => {
  assert.match(flat("skills/routing/SKILL.md"), /Operator says yes to a try-out.*His yes first \(`reviewer\.md` precondition 3\), then \*\*Reviewer\*\* gates the merge/);
  assert.match(flat("agents/reviewer.md"), /3\. \*\*A look-lane review is solicited only with the operator's yes recorded\*\*/);
});
