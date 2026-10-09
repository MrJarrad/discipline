// The 1.122.0 and 1.123.0 items (link-first-look-rounds, 2026-10-09). Run: node --test hooks/scripts/session16-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(repo, p), "utf8");
const flat = (p) => read(p).replace(/\s+/g, " ");

test("link-first: doer-rules look-lane done-when is the preview opening; proof, audits, sweeps follow the yes", () => {
  const d = flat("doer-rules.md");
  assert.match(d, /A look lane's done-when is the preview built, published and opening/);
  assert.match(d, /loads hydrated with no error — then the link goes to the operator/);
  assert.match(d, /run \*\*after his yes\*\*/);
  assert.match(d, /\*\*Pixel proof follows the yes\.\*\*/);
  assert.doesNotMatch(d, /link goes out only after the doer's own repro/);
});

test("link-first: gates sized to the diff, one heavy job per cloud container", () => {
  const d = flat("doer-rules.md");
  assert.match(d, /Gates are sized to the diff/);
  assert.match(d, /docs, workflow or config-only change skips the suite/);
  assert.match(d, /One heavy job at a time per cloud container/);
  assert.match(flat("skills/quality/SKILL.md"), /Gates are sized to the diff/);
});

test("link-first: dispatch-brief done-when, present-for-review, routing baton, qa-acceptance, output style, engineer agree", () => {
  assert.match(flat("skills/dispatch-brief/SKILL.md"), /the preview built, published, opening hydrated, no error, link sent/);
  assert.match(flat("skills/dispatch-brief/references/ACCURACY.md"), /run \*\*after the operator's yes\*\*/);
  assert.match(flat("skills/routing/SKILL.md"), /link when preview opens \(`link-first-look-rounds`\); proof, merge on yes/);
  assert.match(flat("skills/qa-acceptance/SKILL.md"), /pixel proof run after the operator's yes/);
  assert.match(flat("output-styles/discipline.md"), /never waits on review or pixel proof/);
  assert.match(flat("agents/engineer.md"), /that proof runs after the operator's yes/);
  assert.match(flat("skills/routing/references/GATE-AND-HOOKS.md"), /never waits on review or proof/);
});

test("link-first: reviewer-after-yes is unchanged", () => {
  assert.match(flat("output-styles/discipline.md"), /on a look-lane, the operator's yes precedes the review/);
  assert.match(flat("doer-rules.md"), /review still trails the yes/);
});

test("link-first: 1.122.0 has a CHANGED entry", () => {
  assert.match(read("CHANGED.txt"), /^1\.122\.0 — .*link-first/m);
});

// The 1.123.0 items (wrap at 70%, wrapped sessions go quiet, 1.122 ambers, cloud-dispatch run).
test("wrap-70: every place that states the wrap line says 70%", () => {
  const hook = read("hooks/bin/context-fill.mjs");
  assert.match(hook, /wrapAt = 0\.7/);
  assert.match(hook, /DISCIPLINE_WRAP_AT \(0\.7\)/);
  assert.doesNotMatch(hook, /wrapAt = 0\.9|\|\| 0\.9/);
  const w = flat("skills/wrap/SKILL.md");
  assert.match(w, /Wrap at 70% context, unprompted — wrapped or wrapping by 90%/);
  assert.match(w, /reports the 70% line/);
  assert.match(flat("output-styles/discipline.md"), /unprompted at the 70% context line/);
  assert.doesNotMatch(flat("output-styles/discipline.md"), /unprompted at the 90% context line/);
});

test("quiet: wrap's last step stands the session down and never archives", () => {
  const w = flat("skills/wrap/SKILL.md");
  assert.match(w, /## Last step: stand down, never archive/);
  assert.match(w, /wrapped — inactive/);
  assert.match(w, /only the operator reopens it/);
  const c = flat("skills/wrap/references/CLOSING-CHECKS.md");
  assert.match(c, /## Stand down at wrap/);
  assert.match(c, /`unsubscribe_pr_activity`/);
  assert.match(c, /Never archive it\./);
  assert.match(c, /Wrapped — this session is inactive; work continues in/);
  assert.match(flat("output-styles/discipline.md"), /a wrapped session takes no further action/);
});

test("ambers: frame-first proof follows the yes; the driven-row check is an after-yes proof", () => {
  const l = flat("skills/handoff-to-code/references/coverage-ledger.md");
  assert.match(l, /## 5\. Frame-first proof, after the yes/);
  assert.doesNotMatch(l, /before any link/i);
  assert.match(l, /present-for-review` § Before the link goes out \(the proof itself follows the yes\)/);
  const p = flat("skills/present-for-review/SKILL.md");
  assert.match(p, /\*\*The driven-row check follows the yes\*\*/);
  assert.doesNotMatch(p, /never presents UI whose controls were not operated/);
});

test("cloud-dispatch: one-shot shape is create disabled, model, get, run, confirm list_runs; no run_once_at", () => {
  const c = flat("skills/cloud-dispatch/SKILL.md");
  assert.match(c, /create disabled, `update` the top-level `model`.*`get`, then `run`, and confirm `list_runs` shows a session/);
  assert.match(c, /A disabled routine's `run_once_at` never fires/);
  assert.doesNotMatch(c, /with top-level `run_once_at` \(/);
});

test("1.123.0: CHANGED entry", () => {
  assert.match(read("CHANGED.txt"), /^1\.123\.0 — .*wrap-70-quiet/m);
});

test("1.124.0: stand-down lists open PRs first, disables never deletes, records the wrap for the hook", () => {
  const c = flat("skills/wrap/references/CLOSING-CHECKS.md");
  assert.match(c, /List every open PR \(number, branch\) and every running lane \(run id\) in the handover\. This comes first, before any monitor is switched off/);
  assert.match(c, /Disable, never delete, the transient and watcher routines/);
  assert.match(c, /`enabled: false`/);
  assert.match(c, /deleting a routine also deletes its run sessions/);
  assert.match(c, /A routine the operator asked for as recurring stays enabled; name it in the handover/);
  assert.doesNotMatch(c, /`delete_trigger`/);
  assert.match(c, /context-fill\.mjs" --wrapped <session_id>/);
  assert.match(flat("skills/wrap/SKILL.md"), /disable \(never delete\) its routines/);
  assert.match(read("hooks/bin/context-fill.mjs"), /wrapped-\$\{/);
});

test("1.124.0: CHANGED entry", () => {
  assert.match(read("CHANGED.txt"), /^1\.124\.0 — .*standdown-ambers/m);
});

test("1.125.0: version and CHANGED entry", () => {
  assert.match(read(".claude-plugin/plugin.json"), /"version": "1.125.0"/);
  assert.match(read(".claude-plugin/marketplace.json"), /"version": "1.125.0"/);
  assert.match(read("CHANGED.txt"), /^1\.125\.0 — .*wrapped-stays-quiet/m);
});
