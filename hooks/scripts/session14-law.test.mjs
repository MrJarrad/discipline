// The 1.114.0 items: one assertion per encoded rule at the file that owns it.
// Lessons: session-13-shared-tree-and-falsifiers, session-13b-push-target-and-job-watch,
// session-14-operator-calls-and-vault-main, decision 2026-10-08-proactive-wrap-at-90.
// Run: node --test hooks/scripts/session14-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(repo, p), "utf8");
const style = read("output-styles/discipline.md");

test("s14 item 1: how an interaction behaves is the operator's call", () => {
  assert.match(style, /\*\*How an interaction behaves is his call\*\*/);
  assert.match(style, /you should only be able to click something from a hover state/);
});

test("s14 item 2: a look or behaviour change is sitewide by default; a carve-out is a scope call", () => {
  assert.match(style, /\*\*A look or behaviour change is sitewide by default\*\*/);
  assert.match(style, /an invariant to measure, never a reason to exclude/);
  assert.match(style, /I sort of expect this sort of thing to be global/);
});

test("s14 item 3: an operator's new-idea question gets a blue-sky brief before any fit-check", () => {
  const p = read("skills/prompt-craft/SKILL.md");
  assert.match(p, /\*\*An operator's new-idea question is strategy altitude, blue-sky first\.\*\*/);
  assert.match(p, /the goal is not see how it would fit into our existing process/);
});

test("s13b item 1 + s14 item 4: banked means on vault main; cloud merges the session branch, local pushes HEAD:main", () => {
  const v = read("skills/vault-write/SKILL.md");
  assert.match(v, /## Banked means on vault main/);
  assert.match(v, /git merge-base --is-ancestor <sha> origin\/main/);
  assert.match(v, /the harness requires the session branch/);
  assert.match(v, /merge it to main by PR before anything else reads it/);
  assert.match(v, /push `HEAD:main` explicitly/);
  const h = read("skills/routing/references/HARD-RULES.md");
  assert.match(h, /the job's first step names the vault sha it expects/);
});

test("s13b item 5: GitHub 500s on push are retried with backoff and never claimed banked", () => {
  assert.match(read("skills/vault-write/SKILL.md"), /back off 2\/4\/8\/16 s/);
});

test("s13 item 2: a lease-guarded history rewrite freezes every pusher, the runner included", () => {
  assert.match(read("skills/vault-write/SKILL.md"), /\*\*A lease-guarded history rewrite needs a total push freeze\*\*/);
});

test("s14 item 5: a Mac job cannot open an Access-gated preview", () => {
  const h = read("skills/routing/references/HARD-RULES.md");
  assert.match(h, /\*\*A Mac job cannot open an Access-gated preview\*\*/);
  assert.match(h, /ask the operator for the one-line device check/);
});

test("s14 item 6: wrap at about 90% context, unprompted, on the context-fill signal", () => {
  const w = read("skills/wrap/SKILL.md");
  assert.match(w, /## When to wrap/);
  assert.match(w, /ideally we want to wrap\s+sessions at about 90% usage/);
  assert.match(w, /`hooks\/bin\/context-fill\.mjs`/);
  assert.match(style, /unprompted at the 90% context line \(`wrap` § When to wrap\)/);
  const hooks = JSON.parse(read("hooks/hooks.json")).hooks;
  for (const event of ["UserPromptSubmit", "PostToolUse", "SessionStart"]) {
    assert.ok(JSON.stringify(hooks[event]).includes("context-fill.mjs"), `${event} runs context-fill`);
  }
});

test("s13b item 2: every wake checks a pending Mac job's done/ first", () => {
  assert.match(style, /\*\*While any Mac job is pending or running, every wake/);
});

test("s13 item 1: vault doers get their own worktree; the parent stages named paths only", () => {
  assert.match(style, /\*\*A doer whose target is the vault gets its own worktree/);
  assert.match(style, /stage named paths only, never `git add -A`/);
});

test("s13 item 4: a doer's safety-check refusal is never laundered", () => {
  assert.match(style, /\*\*A doer's safety-check refusal is never laundered/);
});

test("s13 item 3 + s13b item 3: falsifiers pin the variable at load; one-host defects get a cross-host comparison", () => {
  const d = read("skills/diagnosing-bugs/SKILL.md");
  assert.match(d, /\*\*A falsifier controls its variable from load\*\*/);
  assert.match(d, /\*\*A defect seen on one host gets a cross-host byte\/URL comparison/);
});

test("s13b item 4: a bake re-stamp keeps the shipped file's encoder", () => {
  assert.match(read("doer-rules.md"), /\*\*A re-stamp keeps the shipped file's encoder\.\*\*/);
});
