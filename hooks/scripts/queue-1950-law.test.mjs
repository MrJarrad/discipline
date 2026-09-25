// The 1.95.0 queue: `lanes-survive-interruption` (2026-09-25) — a portfolio
// lane's session ended mid-task and left ~295 uncommitted lines across six
// files, an untracked probe script, no commits, no progress file; the brief
// omitted `## Progress` though the lane was above line and nothing refused
// it. Plus the same-day `media-load-standard` ruling: media on screen is
// never blank or half-painted, made a standing skill with a mechanical probe.
//
// (1) `hooks/bin/agent-dispatch-gate.mjs` refuses a `Size: component`/
// `Size: system` dispatch whose prompt has no `## Progress` path.
// (2) `doer-rules.md` § You are the doer: a milestone is a progress line AND
// a local WIP commit (explicit paths, never `-A`/`-a`/stash) on the lane
// branch; the progress line names the WIP sha.
// (3) `routing`'s baton table + § Resume vs fresh: a stopped/interrupted
// lane is never resumed — parent reads the worktree diff + progress file,
// dispatches fresh, first step commits leftover WIP and re-verifies it.
// (4) new `media-loading` skill + `hooks/scripts/media-load-probe.mjs` (+lib)
// — every visible media element shows at least its still/poster from first
// paint through every motion; done-when is the probe's empty-visible-media
// count at 0, deployed build, Chromium+WebKit; pointers from design-craft
// (Law 11), quality, agents/reviewer.md, dispatch-brief, routing.
// (5) `output-styles/discipline.md` + `vault-write`: a `## Needed from you`
// row is only what the operator can act on right now — a step still in
// flight ("wait for my next message", "once X is in") is status prose above
// the heading, never a queue row (operator: "needed from me shouldn't
// include things that aren't actually ready").
//
// Run: node --test hooks/scripts/queue-1950-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { checkAgentDispatch, checkComponentSystemProgress } from "../bin/agent-dispatch-gate.mjs";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(repo, p), "utf8");
const flat = (text) => text.replace(/\s+/g, " ");

// --- (1) dispatch gate: component/system briefs name a progress path -------

test("gate: checkComponentSystemProgress is null when a ## Progress path is present", () => {
  assert.equal(checkComponentSystemProgress("Size: component\n\n## Progress\n/vault/evidence/progress.md\n"), null);
});

test("gate: checkComponentSystemProgress refuses a component brief with no ## Progress heading", () => {
  const verdict = checkComponentSystemProgress("Size: component\nBuild the thing.");
  assert.equal(verdict.item, "progress-path");
});

test("gate: checkComponentSystemProgress refuses a system brief with no ## Progress heading", () => {
  assert.equal(checkComponentSystemProgress("Size: system\nBuild the thing.").item, "progress-path");
});

test("gate: checkComponentSystemProgress does not fire on a line brief", () => {
  assert.equal(checkComponentSystemProgress("Size: line\nFix the guard."), null);
});

test("gate: checkAgentDispatch refuses a full component-sized Agent dispatch with no progress path", () => {
  const verdict = checkAgentDispatch({
    description: "cloud — engineer (sonnet): rebind the nav",
    model: "sonnet",
    subagent_type: "engineer",
    prompt: "Size: component\nSkills: quality\nBuild the nav row.",
  });
  assert.equal(verdict.item, "progress-path");
});

// --- (2) doer-rules: milestone = progress line + explicit-path WIP commit --

test("doer-rules: a milestone is a progress-file line AND a local WIP commit", () => {
  const doc = flat(read("doer-rules.md"));
  assert.match(doc, /A milestone is a progress line AND a local WIP commit/);
});

test("doer-rules: WIP commits stage explicit paths, never -A or -a", () => {
  const doc = flat(read("doer-rules.md"));
  assert.match(doc, /never `git add -A` \/ `commit -a`/);
});

test("doer-rules: git stash is forbidden for WIP, not just discouraged", () => {
  const doc = flat(read("doer-rules.md"));
  assert.match(doc, /\*\*Never `git stash`\*\*/);
});

// --- (3) routing: stopped/interrupted lanes are always fresh ---------------

test("routing: Resume vs fresh names the stopped/interrupted case as always-fresh", () => {
  const doc = flat(read("skills/routing/SKILL.md"));
  assert.match(doc, /A lane found stopped or interrupted[\s\S]*?is never resumed/);
});

test("routing: the baton table carries a stopped/interrupted row pointing at a fresh Agent", () => {
  const doc = flat(read("skills/routing/SKILL.md"));
  assert.match(doc, /\*\*Lane stopped\/interrupted\*\*/);
});

// --- (4) media-loading skill + probe ----------------------------------------

test("media-loading skill exists with the bar and the probe named", () => {
  assert.ok(existsSync(join(repo, "skills", "media-loading", "SKILL.md")));
  const doc = flat(read("skills/media-loading/SKILL.md"));
  assert.match(doc, /never a blank or half-painted tile/);
  assert.match(doc, /media-load-probe\.mjs/);
});

test("media-load-probe.mjs + its pure lib + both test files exist", () => {
  for (const rel of [
    "hooks/scripts/media-load-probe.mjs",
    "hooks/scripts/media-load-probe.test.mjs",
    "hooks/scripts/lib/media-load-lib.mjs",
    "hooks/scripts/lib/media-load-lib.test.mjs",
  ]) {
    assert.ok(existsSync(join(repo, rel)), `${rel} must exist`);
  }
});

test("media-load-probe.mjs drives both Chromium and WebKit", () => {
  const src = read("hooks/scripts/media-load-probe.mjs");
  assert.match(src, /chromium/);
  assert.match(src, /webkit/);
});

test("design-craft: Law 11 names the media-load-probe acceptance criterion", () => {
  const doc = flat(read("skills/design-craft/references/TECHNICAL-DESIGN.md"));
  assert.match(doc, /Law 11 — Media never loads blank or half-painted/);
  assert.match(doc, /media-load-probe\.mjs/);
});

test("quality: Standing tech checks and the checklist both gate on the media probe", () => {
  const doc = flat(read("skills/quality/SKILL.md"));
  assert.match(doc, /Media diffs — never blank or half-painted/);
  assert.match(doc, /\[ \] Media diff: media-load-probe\.mjs count = 0/);
});

test("agents/reviewer.md: re-runs the media probe rather than reading a claimed 0", () => {
  const doc = flat(read("agents/reviewer.md"));
  assert.match(doc, /A media-touching diff's done-when is re-run, not read/);
});

test("dispatch-brief: done-when names the media-load-probe count for media-touching lanes", () => {
  const doc = flat(read("skills/dispatch-brief/SKILL.md"));
  assert.match(doc, /media-load-probe\.mjs.*count.*at 0/);
});

test("routing: work-type and domain-library tables both require media-loading when media is on screen", () => {
  const skill = flat(read("skills/routing/SKILL.md"));
  assert.match(skill, /Images\/video on screen \| `media-loading`/);
  const libraries = flat(read("skills/routing/references/LIBRARIES.md"));
  assert.match(libraries, /media-loading/);
});

// --- (5) Needed-from-you rows are only what's actually ready ---------------

test("output-styles/discipline.md: a Needed-from-you row is only what's ready right now", () => {
  const doc = flat(read("output-styles/discipline.md"));
  assert.match(doc, /A `## Needed from you` row is only what he can act on right now\./);
  assert.match(doc, /never a queue row/);
});

test("vault-write: a queue row is written only once it is actually ready", () => {
  const doc = flat(read("skills/vault-write/SKILL.md"));
  assert.match(doc, /A row is only written once it is actually\s*ready/);
});
