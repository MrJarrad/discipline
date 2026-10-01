// Tests for the Agent dispatch gate. Seven dispatch laws that were
// prompt-trusted until now — surface-prefixed description, explicit model,
// brief under 600 words, skills named, (1.92.0) Source-contract lock-row
// shape, (1.93.0) line briefs never ask for a read-back, and (1.95.0)
// component/system briefs name a progress path — are asserted here against
// the fixtures the dispatch brief named: malformed and well-formed, plus
// per-check fixtures for the newer checks. The fixtures are exported so the
// runtime dry-run in the evidence return drives the same objects the unit
// tests do, rather than a hand-typed approximation.
// Run: node --test hooks/scripts/agent-dispatch-gate.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync, execFileSync } from "node:child_process";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  checkAgentDispatch,
  checkSkillsNamed,
  checkSourceContractLockRows,
  checkComponentSystemProgress,
  registerLaneFromPrompt,
  promptWords,
  PROMPT_WORD_CAP,
  EXEMPT_SUBAGENTS,
  SOURCE_CONTRACT_CELLS,
  findRepoContext,
  otherSessionsOnRepo,
  activeSiblingWorktrees,
  buildActiveWorkWarning,
  activeWorkWarning,
  checkBashAgentLabel,
  launchesAgent,
} from "../bin/agent-dispatch-gate.mjs";
import { loadRegistry, saveRegistry, withRegistryLock } from "../bin/progress-registry.mjs";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const gate = join(repo, "hooks", "bin", "agent-dispatch-gate.mjs");

function tempRegistryPath() {
  return join(mkdtempSync(join(tmpdir(), "dispatch-gate-registry-")), "registry.json");
}

// --- Fixtures -------------------------------------------------------------

export const WELL_FORMED = {
  description: "cloud — engineer (sonnet): rebind the nav tokens",
  model: "sonnet",
  subagent_type: "engineer",
  prompt: [
    "You are the Engineer.",
    "",
    "**Goal.** The nav row binds every dimension through the export's token names.",
    // A path with no real repo behind it — the active-work check (below)
    // fails closed to nothing-to-warn-about for a repo it can't `git` against,
    // which keeps this fixture's "prints nothing" test meaningful without
    // depending on any real machine's actual worktree state.
    "**Context.** Contract: the design-handoff pair at the path below; repo ~/JHD/no-such-fixture-repo/main, branch chore/foundations.",
    "**Constraints.** Standing rules: doer-rules.md. Skills: quality, test-first, handoff-to-code.",
    "**Done-when.** unbound-custom-props and the checksum test are green.",
    "",
    "## Locked decisions",
    "| # | Operator said (verbatim) | Means technically |",
    "| - | --- | --- |",
    '| 1 | "on the grid" | display:grid container, children placed by grid-column |',
  ].join("\n"),
};

export const MALFORMED = {
  // No surface prefix, no parenthesised model, and `model` unset.
  description: "Fix the nav",
  subagent_type: "engineer",
  prompt: "Have a look at the nav and sort out whatever looks off.",
};

// --- Description shape ----------------------------------------------------

test("the well-formed fixture passes every check", () => {
  assert.deepEqual(checkAgentDispatch(WELL_FORMED), { ok: true });
});

test("the malformed fixture is blocked, and the message names the failing item", () => {
  const verdict = checkAgentDispatch(MALFORMED);
  assert.equal(verdict.ok, false);
  assert.equal(verdict.item, "description");
  assert.match(verdict.reason, /description:/);
  assert.match(verdict.reason, /cloud — persona \(model\): task/);
});

test("local is a valid surface; anything else is not", () => {
  assert.ok(checkAgentDispatch({ ...WELL_FORMED, description: "local — reviewer (opus): check the build", model: "opus" }).ok);
  for (const bad of [
    "remote — engineer (opus): x",
    "engineer (opus): x",
    "cloud engineer (opus): x",
    "cloud - engineer (opus): x", // hyphen, not the em dash the law files use
  ]) {
    assert.equal(checkAgentDispatch({ ...WELL_FORMED, description: bad }).item, "description", bad);
  }
});

test("the description must carry a persona AND a parenthesised model", () => {
  assert.equal(checkAgentDispatch({ ...WELL_FORMED, description: "cloud — engineer: x" }).item, "description");
  assert.equal(checkAgentDispatch({ ...WELL_FORMED, description: "cloud — (opus): x" }).item, "description");
  assert.equal(checkAgentDispatch({ ...WELL_FORMED, description: "cloud — engineer (): x" }).item, "description");
  assert.equal(checkAgentDispatch({ ...WELL_FORMED, description: "cloud — engineer (opus):" }).item, "description");
});

// --- Model ----------------------------------------------------------------

test("an unset or blank model is blocked and the message names the model", () => {
  for (const model of [undefined, "", "   "]) {
    const verdict = checkAgentDispatch({ ...WELL_FORMED, model });
    assert.equal(verdict.item, "model", `model=${JSON.stringify(model)}`);
    assert.match(verdict.reason, /model:/);
    assert.match(verdict.reason, /inherits the parent's/);
  }
});

// --- Prompt cap -----------------------------------------------------------

test("a prompt at or over the cap is blocked, with the count named", () => {
  const verdict = checkAgentDispatch({ ...WELL_FORMED, prompt: "word ".repeat(PROMPT_WORD_CAP) });
  assert.equal(verdict.item, "prompt");
  assert.match(verdict.reason, new RegExp(`${PROMPT_WORD_CAP} words`));
  assert.match(verdict.reason, /cap is 600/);
});

test("a prompt just under the cap passes", () => {
  const prompt = "Skills: quality. " + "word ".repeat(PROMPT_WORD_CAP - 4);
  assert.ok(checkAgentDispatch({ ...WELL_FORMED, prompt }).ok);
});

// The locked table is the spec and the brief copies it whole
// (`review-the-lock-not-the-slice`), so counting its rows would push the parent
// to slice the lock to fit the cap — the exact malformed brief rule 10 forbids.
test("markdown table rows do not count against the cap", () => {
  const rows = Array.from({ length: 200 }, (_, i) => `| ${i} | "operator said something long here" | means this technically |`);
  const prompt = ["Short brief. Skills: quality.", ...rows].join("\n");
  assert.equal(promptWords(prompt), 4, "only the prose line counts");
  assert.ok(checkAgentDispatch({ ...WELL_FORMED, prompt }).ok);
});

test("indented table rows are excluded too", () => {
  assert.equal(promptWords("one two\n   | a | b |\n| c | d |"), 2);
});

// --- Exemptions -----------------------------------------------------------

test("Explore and Plan are exempt — parent reconnaissance, not a dispatch", () => {
  for (const subagent_type of EXEMPT_SUBAGENTS) {
    const verdict = checkAgentDispatch({ ...MALFORMED, subagent_type });
    assert.equal(verdict.ok, true, subagent_type);
    assert.equal(verdict.exempt, subagent_type);
  }
});

test("the exemption is exactly two subagents, not every unnamed one", () => {
  assert.deepEqual([...EXEMPT_SUBAGENTS].sort(), ["Explore", "Plan"]);
  assert.equal(checkAgentDispatch({ ...MALFORMED, subagent_type: "general-purpose" }).ok, false);
});

// --- The hook process itself ---------------------------------------------

const run = (payload) =>
  spawnSync(process.execPath, [gate], { input: JSON.stringify(payload), encoding: "utf8" });

test("the hook process denies the malformed dispatch with a PreToolUse deny", () => {
  const result = run({ tool_name: "Agent", tool_input: MALFORMED });
  assert.equal(result.status, 0, "a hook always exits 0; the verdict rides in stdout");
  const out = JSON.parse(result.stdout);
  assert.equal(out.hookSpecificOutput.hookEventName, "PreToolUse");
  assert.equal(out.hookSpecificOutput.permissionDecision, "deny");
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /description:/);
});

test("the hook process passes the well-formed dispatch silently", () => {
  const result = run({ tool_name: "Agent", tool_input: WELL_FORMED });
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), "", "an allowed dispatch prints nothing");
});

test("input the gate cannot read is allowed, never denied on its own confusion", () => {
  for (const input of ["", "not json", "{}", '{"tool_name":"Agent"}']) {
    const result = spawnSync(process.execPath, [gate], { input, encoding: "utf8" });
    assert.equal(result.status, 0);
    assert.equal(result.stdout.trim(), "", JSON.stringify(input));
  }
});

// --- Skills named (1.92.0, every persona) ----------------------------------

test("a prompt with no Skills: line is blocked for every persona, not just build verbs", () => {
  for (const persona of ["engineer", "ux-designer", "reviewer", "researcher", "releaseops"]) {
    const verdict = checkAgentDispatch({
      ...WELL_FORMED,
      subagent_type: persona,
      prompt: WELL_FORMED.prompt.replace(/Skills:.*handoff-to-code\./, ""),
    });
    assert.equal(verdict.item, "skills", persona);
    assert.match(verdict.reason, /a brief naming none is malformed/);
  }
});

test("checkSkillsNamed passes on any non-empty Skills: line", () => {
  assert.equal(checkSkillsNamed("Constraints. Skills: quality."), null);
  assert.equal(checkSkillsNamed("Constraints. skill: motion, capture-figma."), null);
  assert.notEqual(checkSkillsNamed("Constraints. Skills: ."), null);
  assert.notEqual(checkSkillsNamed("No skills line at all."), null);
});

// --- Source-contract lock rows (1.92.0, Change 1) --------------------------

const SOURCE_CONTRACT_WELL_FORMED = {
  ...WELL_FORMED,
  prompt: [
    "You are the Engineer.",
    "## Source contract",
    "- Export: /abs/design-handoff-nav.md · nodes: #12, #14",
    "**Constraints.** Skills: quality, handoff-to-code.",
    "",
    "## Locked decisions",
    "| # | Operator said (verbatim) | Source |",
    "| - | --- | --- |",
    '| 1 | "the custom cursor stays" | operator-round |',
    '| 2 | "export is silent on hover blur" | export-silent |',
  ].join("\n"),
};

test("a well-formed Source-contract brief passes", () => {
  assert.equal(checkSourceContractLockRows(SOURCE_CONTRACT_WELL_FORMED.prompt), null);
  assert.ok(checkAgentDispatch(SOURCE_CONTRACT_WELL_FORMED).ok);
});

test("a Source-contract brief using 'Means technically' instead of Source is blocked", () => {
  const prompt = SOURCE_CONTRACT_WELL_FORMED.prompt.replace("Source |", "Means technically |");
  const verdict = checkSourceContractLockRows(prompt);
  assert.equal(verdict.item, "lock-rows");
  assert.match(verdict.reason, /Means technically/);
});

test("a Source-contract lock row with a free-text source cell is blocked", () => {
  const prompt = SOURCE_CONTRACT_WELL_FORMED.prompt.replace(
    '"the custom cursor stays" | operator-round |',
    '"the custom cursor stays" | recommended |',
  );
  const verdict = checkSourceContractLockRows(prompt);
  assert.equal(verdict.item, "lock-rows");
  assert.match(verdict.reason, /export-silent \| export-vs-ruling \| operator-round/);
});

test("a Source-contract lock row whose quote carries a backticked token is blocked", () => {
  const prompt = SOURCE_CONTRACT_WELL_FORMED.prompt.replace(
    '"the custom cursor stays" | operator-round |',
    '"use `--cursor-size-md` for the cursor" | operator-round |',
  );
  const verdict = checkSourceContractLockRows(prompt);
  assert.equal(verdict.item, "lock-rows");
  assert.match(verdict.reason, /backticked/);
});

test("a Source-contract lock row whose quote carries a function call is blocked", () => {
  const prompt = SOURCE_CONTRACT_WELL_FORMED.prompt.replace(
    '"the custom cursor stays" | operator-round |',
    '"wire it through `riseOrder()`" | operator-round |',
  );
  assert.equal(checkSourceContractLockRows(prompt).item, "lock-rows");
});

test("a Source-contract lock row whose quote carries an easing curve is blocked", () => {
  const prompt = SOURCE_CONTRACT_WELL_FORMED.prompt.replace(
    '"the custom cursor stays" | operator-round |',
    '"use `cubic-bezier(0.23,1,0.32,1)`" | operator-round |',
  );
  assert.equal(checkSourceContractLockRows(prompt).item, "lock-rows");
});

test("a prompt with no ## Source contract heading skips the lock-row check entirely", () => {
  assert.equal(checkSourceContractLockRows(WELL_FORMED.prompt), null);
});

test("the three legal Source cells are exactly export-silent | export-vs-ruling | operator-round", () => {
  assert.deepEqual([...SOURCE_CONTRACT_CELLS].sort(), ["export-silent", "export-vs-ruling", "operator-round"]);
});

// --- Component/system briefs name a progress path (1.95.0) ----------------

const COMPONENT_WITH_PROGRESS = {
  ...WELL_FORMED,
  prompt: WELL_FORMED.prompt.replace(
    "**Done-when.**",
    "Size: component.\n\n## Progress\n`/Users/x/vault/main/projects/p/evidence/2026-09-25/progress.md`\n\n**Done-when.**",
  ),
};

test("a component brief with a ## Progress path passes", () => {
  assert.equal(checkComponentSystemProgress(COMPONENT_WITH_PROGRESS.prompt), null);
  assert.ok(checkAgentDispatch(COMPONENT_WITH_PROGRESS).ok);
});

test("a component brief with no ## Progress heading is blocked", () => {
  const prompt = WELL_FORMED.prompt.replace("**Done-when.**", "Size: component.\n\n**Done-when.**");
  const verdict = checkComponentSystemProgress(prompt);
  assert.equal(verdict.item, "progress-path");
  assert.match(verdict.reason, /progress-path:/);
  assert.equal(checkAgentDispatch({ ...WELL_FORMED, prompt }).item, "progress-path");
});

test("a system brief with no ## Progress heading is blocked too", () => {
  const prompt = WELL_FORMED.prompt.replace("**Done-when.**", "Size: system.\n\n**Done-when.**");
  assert.equal(checkComponentSystemProgress(prompt).item, "progress-path");
});

test("a component brief with a ## Progress heading but no path is blocked", () => {
  const prompt = WELL_FORMED.prompt.replace(
    "**Done-when.**",
    "Size: component.\n\n## Progress\n\n## Interrogated\ninline, clear.\n\n**Done-when.**",
  );
  assert.equal(checkComponentSystemProgress(prompt).item, "progress-path");
});

test("a line brief carries no progress-path requirement — stays exempt", () => {
  const prompt = WELL_FORMED.prompt.replace("**Done-when.**", "Size: line.\n\n**Done-when.**");
  assert.equal(checkComponentSystemProgress(prompt), null);
  assert.ok(checkAgentDispatch({ ...WELL_FORMED, prompt }).ok);
});

test("a prompt naming no Size: class at all is not scoped by this check", () => {
  assert.equal(checkComponentSystemProgress(WELL_FORMED.prompt), null);
});

// A red finding on this check: any non-heading text after `## Progress` was
// accepted as "a path" — `## Progress\nAppend one line per milestone as you
// go, per doer-rules.md.` passed even though it names no path. The check must
// require the Progress section to actually carry a path (absolute, `~/`, or
// backticked, ending in a file name), not merely non-empty prose.
test("prose-only — a Progress section naming a filename in a sentence, not a path, is refused", () => {
  const prompt = WELL_FORMED.prompt.replace(
    "**Done-when.**",
    "Size: component.\n\n## Progress\nAppend one line per milestone as you go, per doer-rules.md.\n\n**Done-when.**",
  );
  const verdict = checkComponentSystemProgress(prompt);
  assert.equal(verdict.item, "progress-path");
  assert.match(verdict.reason, /progress-path:/);
  assert.match(verdict.reason, /naming a progress-file path/);
});

test("absolute path — an unbacktick'd absolute path under the heading passes", () => {
  const prompt = WELL_FORMED.prompt.replace(
    "**Done-when.**",
    "Size: component.\n\n## Progress\nAppend one line per milestone at /Users/x/vault/main/projects/p/evidence/progress.md as you go.\n\n**Done-when.**",
  );
  assert.equal(checkComponentSystemProgress(prompt), null);
});

test("backticked path — a `~/…` path in backticks under the heading passes", () => {
  const prompt = WELL_FORMED.prompt.replace(
    "**Done-when.**",
    "Size: system.\n\n## Progress\nAppend a line per milestone to `~/JHD/vault/main/projects/p/evidence/progress.md`.\n\n**Done-when.**",
  );
  assert.equal(checkComponentSystemProgress(prompt), null);
});

test("path on the heading line — the path can sit on the `## Progress` line itself", () => {
  const prompt = WELL_FORMED.prompt.replace(
    "**Done-when.**",
    "Size: component.\n\n## Progress: /Users/x/vault/main/projects/p/evidence/progress.md\n\n**Done-when.**",
  );
  assert.equal(checkComponentSystemProgress(prompt), null);
});

// Re-run every real brief shape already exercised above, so the tightened
// path rule does not regress a passing/blocked fixture it was not meant to
// touch.
test("re-run: every existing progress-path fixture still resolves the same way under the tightened rule", () => {
  assert.equal(checkComponentSystemProgress(COMPONENT_WITH_PROGRESS.prompt), null, "backticked absolute path fixture");
  assert.ok(checkAgentDispatch(COMPONENT_WITH_PROGRESS).ok, "backticked absolute path fixture, full dispatch");

  const noHeading = WELL_FORMED.prompt.replace("**Done-when.**", "Size: component.\n\n**Done-when.**");
  assert.equal(checkComponentSystemProgress(noHeading).item, "progress-path", "no heading at all");

  const systemNoHeading = WELL_FORMED.prompt.replace("**Done-when.**", "Size: system.\n\n**Done-when.**");
  assert.equal(checkComponentSystemProgress(systemNoHeading).item, "progress-path", "system, no heading");

  const headingNoPath = WELL_FORMED.prompt.replace(
    "**Done-when.**",
    "Size: component.\n\n## Progress\n\n## Interrogated\ninline, clear.\n\n**Done-when.**",
  );
  assert.equal(checkComponentSystemProgress(headingNoPath).item, "progress-path", "heading present, no path, no prose");

  const line = WELL_FORMED.prompt.replace("**Done-when.**", "Size: line.\n\n**Done-when.**");
  assert.equal(checkComponentSystemProgress(line), null, "line stays exempt");

  assert.equal(checkComponentSystemProgress(WELL_FORMED.prompt), null, "no Size: class at all — unscoped");
});

// A red finding on this check: any real path was accepted as "the" progress
// path, even a path to an unrelated file the brief points at for some other
// reason (e.g. a style guide read for tone). The path's own file name must
// contain "progress" — a real, well-formed, backticked path to a file that
// is not a progress file is refused the same as prose naming no path at all.
test("unrelated path — a real backticked path to a non-progress file is refused", () => {
  const prompt = WELL_FORMED.prompt.replace(
    "**Done-when.**",
    "Size: component.\n\n## Progress\nSee `/Users/x/vault/main/references/style-guide.md` for tone before you begin.\n\n**Done-when.**",
  );
  const verdict = checkComponentSystemProgress(prompt);
  assert.equal(verdict.item, "progress-path");
  assert.match(verdict.reason, /progress-path:/);
});

test("progress path — absolute, unbacktick'd, passes", () => {
  const prompt = WELL_FORMED.prompt.replace(
    "**Done-when.**",
    "Size: component.\n\n## Progress\nAppend one line per milestone at /Users/x/vault/main/projects/p/evidence/progress.md as you go.\n\n**Done-when.**",
  );
  assert.equal(checkComponentSystemProgress(prompt), null);
});

test("progress path — `~/…`, backticked, passes", () => {
  const prompt = WELL_FORMED.prompt.replace(
    "**Done-when.**",
    "Size: system.\n\n## Progress\nAppend a line per milestone to `~/JHD/vault/main/projects/p/evidence/progress.md`.\n\n**Done-when.**",
  );
  assert.equal(checkComponentSystemProgress(prompt), null);
});

test("progress path — backticked absolute path, passes", () => {
  assert.equal(checkComponentSystemProgress(COMPONENT_WITH_PROGRESS.prompt), null);
});

test("progress path — on the `## Progress` heading's own line, passes", () => {
  const prompt = WELL_FORMED.prompt.replace(
    "**Done-when.**",
    "Size: component.\n\n## Progress: /Users/x/vault/main/projects/p/evidence/progress.md\n\n**Done-when.**",
  );
  assert.equal(checkComponentSystemProgress(prompt), null);
});

test("prose still refused — a Progress section naming no path at all", () => {
  const prompt = WELL_FORMED.prompt.replace(
    "**Done-when.**",
    "Size: component.\n\n## Progress\nAppend one line per milestone as you go, per doer-rules.md.\n\n**Done-when.**",
  );
  const verdict = checkComponentSystemProgress(prompt);
  assert.equal(verdict.item, "progress-path");
  assert.match(verdict.reason, /progress-path:/);
});

// A red finding: the gate refused a brief whose Context bullet quoted the
// progress heading in backticks before the real heading — `.search()` with
// no line anchor matched the first mention of "## Progress" anywhere in the
// prompt, backticked or not, so the quoted mention (with no path after it)
// was taken for the section and the real heading below it, path and all,
// was never read. Only a heading at the true start of a line counts.
test("a Context bullet quoting `## Progress` in backticks before the real heading still passes", () => {
  const prompt = WELL_FORMED.prompt.replace(
    "**Done-when.**",
    "Size: component.\n\n" +
      "**Context.** Write to `## Progress` every 10 minutes per doer-rules.md.\n\n" +
      "## Progress\n`/Users/x/vault/main/projects/p/evidence/progress.md`\n\n**Done-when.**",
  );
  assert.equal(checkComponentSystemProgress(prompt), null);
  assert.ok(checkAgentDispatch({ ...WELL_FORMED, prompt }).ok);
});

// --- Lane registry (progress-hooks fix round, 2026-09-27: "make it need no
// memory") --------------------------------------------------------------

test("registerLaneFromPrompt writes a lane entry for a real ## Progress path, stamped with the session id", () => {
  const registryPath = tempRegistryPath();
  process.env.DISCIPLINE_PROGRESS_REGISTRY = registryPath;
  try {
    registerLaneFromPrompt(COMPONENT_WITH_PROGRESS.prompt, "parent-session-abc", 1000);
    const entries = loadRegistry(registryPath);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].path, "/Users/x/vault/main/projects/p/evidence/2026-09-25/progress.md");
    assert.equal(entries[0].sessionId, "parent-session-abc");
    assert.equal(entries[0].dispatchedAt, 1000);
    assert.deepEqual(entries[0].fired, []);
    assert.equal(entries[0].repo, `${process.env.HOME}/JHD/no-such-fixture-repo/main`, "the Repo line off the brief must be recorded on the row too");
  } finally {
    delete process.env.DISCIPLINE_PROGRESS_REGISTRY;
  }
});

test("registerLaneFromPrompt stamps null when no session id is on the hook input", () => {
  const registryPath = tempRegistryPath();
  process.env.DISCIPLINE_PROGRESS_REGISTRY = registryPath;
  try {
    registerLaneFromPrompt(COMPONENT_WITH_PROGRESS.prompt, undefined, 1000);
    assert.equal(loadRegistry(registryPath)[0].sessionId, null);
  } finally {
    delete process.env.DISCIPLINE_PROGRESS_REGISTRY;
  }
});

test("registerLaneFromPrompt registers nothing for a line lane (no ## Progress)", () => {
  const registryPath = tempRegistryPath();
  process.env.DISCIPLINE_PROGRESS_REGISTRY = registryPath;
  try {
    registerLaneFromPrompt(WELL_FORMED.prompt, "parent-session-abc");
    assert.deepEqual(loadRegistry(registryPath), []);
  } finally {
    delete process.env.DISCIPLINE_PROGRESS_REGISTRY;
  }
});

test("the hook process registers a lane for a well-formed component dispatch, stamped with session_id off the hook input", () => {
  const registryPath = tempRegistryPath();
  const result = spawnSync(process.execPath, [gate], {
    input: JSON.stringify({ tool_name: "Agent", tool_input: COMPONENT_WITH_PROGRESS, session_id: "parent-session-xyz" }),
    encoding: "utf8",
    env: { ...process.env, DISCIPLINE_PROGRESS_REGISTRY: registryPath },
  });
  assert.equal(result.status, 0);
  const entries = loadRegistry(registryPath);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].path, "/Users/x/vault/main/projects/p/evidence/2026-09-25/progress.md");
  assert.equal(entries[0].sessionId, "parent-session-xyz");
});

test("the hook process registers nothing for an Explore/Plan exemption", () => {
  const registryPath = tempRegistryPath();
  const result = spawnSync(process.execPath, [gate], {
    input: JSON.stringify({ tool_name: "Agent", tool_input: { ...MALFORMED, subagent_type: "Explore" } }),
    encoding: "utf8",
    env: { ...process.env, DISCIPLINE_PROGRESS_REGISTRY: registryPath },
  });
  assert.equal(result.status, 0);
  assert.deepEqual(loadRegistry(registryPath), []);
});

test("the hook process registers nothing for a denied (malformed) dispatch", () => {
  const registryPath = tempRegistryPath();
  const result = spawnSync(process.execPath, [gate], {
    input: JSON.stringify({ tool_name: "Agent", tool_input: MALFORMED }),
    encoding: "utf8",
    env: { ...process.env, DISCIPLINE_PROGRESS_REGISTRY: registryPath },
  });
  assert.equal(result.status, 0);
  assert.deepEqual(loadRegistry(registryPath), []);
});

// --- Wiring ---------------------------------------------------------------

test("hooks.json fires the gate on Agent dispatches", () => {
  const hooks = JSON.parse(readFileSync(join(repo, "hooks", "hooks.json"), "utf8"));
  const pre = hooks.hooks.PreToolUse;
  const entry = pre.find((h) => /Agent/.test(h.matcher));
  assert.ok(entry, "no PreToolUse entry matching Agent");
  assert.match(entry.hooks[0].command, /agent-dispatch-gate\.mjs/);
  assert.match(entry.hooks[0].command, /\$\{CLAUDE_PLUGIN_ROOT\}/);
});

// --- Active-work warning (operator-approved scope add, 2026-09-28 — warn
// before dispatching into a repo that may already have work in flight;
// never a deny) ------------------------------------------------------------

test("findRepoContext reads a backticked Repo path and a relative worktree path, joined against it", () => {
  const prompt = "## Context\n- Repo `~/JHD/portfolio`, worktree `worktrees/fix-1f8b8b4-nav`.\n";
  assert.deepEqual(findRepoContext(prompt), {
    repoPath: `${process.env.HOME}/JHD/portfolio`,
    worktreePath: `${process.env.HOME}/JHD/portfolio/worktrees/fix-1f8b8b4-nav`,
  });
});

test("findRepoContext reads a bare (non-backticked) Repo path with no worktree named", () => {
  const prompt = "Context: repo ~/JHD/portfolio/main, branch chore/foundations.";
  assert.deepEqual(findRepoContext(prompt), { repoPath: `${process.env.HOME}/JHD/portfolio/main`, worktreePath: null });
});

test("findRepoContext accepts an absolute worktree path as-is, not joined against repo", () => {
  const prompt = "Repo `/Users/x/repo`, worktree `/Users/x/repo/../elsewhere-lane`.";
  assert.deepEqual(findRepoContext(prompt), { repoPath: "/Users/x/repo", worktreePath: "/Users/x/repo/../elsewhere-lane" });
});

test("findRepoContext returns null for a brief naming no repo at all", () => {
  assert.equal(findRepoContext("Fix the thing, no path mentioned."), null);
});

test("otherSessionsOnRepo: a different session's row on the same repo is returned; this session's own row and other repos are not", () => {
  const entries = [
    { path: "/a/progress.md", sessionId: "other-session", repo: "/repo/x" },
    { path: "/b/progress.md", sessionId: "this-session", repo: "/repo/x" },
    { path: "/c/progress.md", sessionId: "other-session", repo: "/repo/y" },
    { path: "/d/progress.md", sessionId: null, repo: "/repo/x" }, // unresolved — never reported
  ];
  const result = otherSessionsOnRepo(entries, "/repo/x", "this-session");
  assert.equal(result.length, 1);
  assert.equal(result[0].path, "/a/progress.md");
});

test("otherSessionsOnRepo returns [] when repoPath is null (brief named no repo)", () => {
  assert.deepEqual(otherSessionsOnRepo([{ path: "/a", sessionId: "s", repo: "/repo/x" }], null, "this-session"), []);
});

test("activeSiblingWorktrees: dirty or recently-changed worktrees are flagged; this lane's own is excluded even if dirty", () => {
  const now = Date.now();
  const statuses = [
    { path: "/repo/own-worktree", dirty: true, changedAt: now },
    { path: "/repo/other-dirty", dirty: true, changedAt: null },
    { path: "/repo/other-recent", dirty: false, changedAt: now - 5 * 60 * 1000 },
    { path: "/repo/other-stale", dirty: false, changedAt: now - 45 * 60 * 1000 },
    { path: "/repo/other-clean-no-commits", dirty: false, changedAt: null },
  ];
  const result = activeSiblingWorktrees(statuses, "/repo/own-worktree", now);
  assert.deepEqual(
    result.map((r) => r.path).sort(),
    ["/repo/other-dirty", "/repo/other-recent"],
  );
});

test("activeSiblingWorktrees with no own worktree named excludes nothing by path", () => {
  const now = Date.now();
  const statuses = [{ path: "/repo/a", dirty: true, changedAt: null }];
  assert.equal(activeSiblingWorktrees(statuses, null, now).length, 1);
});

test("buildActiveWorkWarning returns null when both signals are empty", () => {
  assert.equal(buildActiveWorkWarning({ otherSessions: [], activeWorktrees: [], repoPath: "/repo/x" }), null);
});

test("buildActiveWorkWarning names the other session and its progress file", () => {
  const msg = buildActiveWorkWarning({
    otherSessions: [{ path: "/other/progress.md", sessionId: "sess-2" }],
    activeWorktrees: [],
    repoPath: "/repo/x",
  });
  assert.match(msg, /sess-2/);
  assert.match(msg, /\/other\/progress\.md/);
  assert.match(msg, /warning, not a block/);
});

test("buildActiveWorkWarning names a dirty worktree and a recently-changed one distinctly", () => {
  const msg = buildActiveWorkWarning({
    otherSessions: [],
    activeWorktrees: [
      { path: "/repo/dirty-one", dirty: true, changedAt: null },
      { path: "/repo/recent-one", dirty: false, changedAt: Date.now() },
    ],
    repoPath: "/repo/x",
  });
  assert.match(msg, /\/repo\/dirty-one has uncommitted changes/);
  assert.match(msg, /\/repo\/recent-one changed in the last 30 minutes/);
});

// --- activeWorkWarning end-to-end: real registry + real scratch git repos --

function tempDir(prefix) {
  return mkdtempSync(join(tmpdir(), prefix));
}

function makeScratchRepo() {
  const dir = tempDir("dispatch-gate-activework-repo-");
  execFileSync("git", ["init", "-q", dir]);
  execFileSync("git", ["-C", dir, "config", "user.email", "test@example.com"]);
  execFileSync("git", ["-C", dir, "config", "user.name", "test"]);
  writeFileSync(join(dir, "f.txt"), "1\n");
  execFileSync("git", ["-C", dir, "add", "."]);
  execFileSync("git", ["-C", dir, "commit", "-q", "-m", "init"]);
  return dir;
}

test("activeWorkWarning: another session's registry row on the same repo produces a warning", () => {
  const registryPath = join(tempDir("dispatch-gate-registry-"), "registry.json");
  const repoDir = makeScratchRepo();
  process.env.DISCIPLINE_PROGRESS_REGISTRY = registryPath;
  try {
    saveRegistry([{ path: "/other/progress.md", sessionId: "other-session", dispatchedAt: 1, lastMtime: null, fired: [], repo: repoDir }], registryPath);
    const prompt = `## Context\n- Repo \`${repoDir}\`, worktree \`nonexistent-lane\`.\n`;
    const warning = activeWorkWarning(prompt, "this-session");
    assert.match(warning, /other-session/);
    assert.match(warning, /\/other\/progress\.md/);
  } finally {
    delete process.env.DISCIPLINE_PROGRESS_REGISTRY;
    rmSync(repoDir, { recursive: true, force: true });
  }
});

test("activeWorkWarning: a dirty sibling worktree in the target repo produces a warning", () => {
  const registryPath = join(tempDir("dispatch-gate-registry-"), "registry.json");
  const repoDir = makeScratchRepo();
  const siblingWorktree = join(tempDir("dispatch-gate-sibling-"), "sibling");
  execFileSync("git", ["-C", repoDir, "worktree", "add", siblingWorktree, "-b", "sibling-branch"]);
  writeFileSync(join(siblingWorktree, "f.txt"), "dirty\n"); // uncommitted change
  process.env.DISCIPLINE_PROGRESS_REGISTRY = registryPath;
  try {
    const prompt = `## Context\n- Repo \`${repoDir}\`, worktree \`this-lane-worktree\`.\n`;
    const warning = activeWorkWarning(prompt, "this-session");
    assert.match(warning, new RegExp(siblingWorktree.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(warning, /uncommitted changes/);
  } finally {
    delete process.env.DISCIPLINE_PROGRESS_REGISTRY;
    execFileSync("git", ["-C", repoDir, "worktree", "remove", "--force", siblingWorktree]).toString();
    rmSync(repoDir, { recursive: true, force: true });
  }
});

test("activeWorkWarning: no-warning case — clean repo, no other sessions, dispatch's own worktree excluded even though it's the one that exists", () => {
  const registryPath = join(tempDir("dispatch-gate-registry-"), "registry.json");
  const repoDir = makeScratchRepo(); // repoDir itself is the only worktree, clean, just committed
  process.env.DISCIPLINE_PROGRESS_REGISTRY = registryPath;
  try {
    const prompt = `## Context\n- Repo \`${repoDir}\`, worktree \`${repoDir}\`.\n`;
    const warning = activeWorkWarning(prompt, "this-session");
    assert.equal(warning, null, "the only worktree is this dispatch's own (named explicitly) — nothing to warn about");
  } finally {
    delete process.env.DISCIPLINE_PROGRESS_REGISTRY;
    rmSync(repoDir, { recursive: true, force: true });
  }
});

test("activeWorkWarning returns null for a brief naming no repo, and never throws for an unreadable repo path", () => {
  assert.equal(activeWorkWarning("Fix the thing.", "this-session"), null);
  assert.doesNotThrow(() => activeWorkWarning("Repo `/does/not/exist`.", "this-session"));
});

test("the hook process's PreToolUse allow carries the active-work warning as additionalContext, never denies", () => {
  const registryPath = join(tempDir("dispatch-gate-registry-"), "registry.json");
  const repoDir = makeScratchRepo();
  saveRegistry([{ path: "/other/progress.md", sessionId: "other-session-live", dispatchedAt: 1, lastMtime: null, fired: [], repo: repoDir }], registryPath);
  const prompt = COMPONENT_WITH_PROGRESS.prompt.replace(
    /repo [^\n]+?, branch chore\/foundations\./,
    `repo ${repoDir}, branch chore/foundations.`,
  );
  const result = spawnSync(process.execPath, [gate], {
    input: JSON.stringify({ tool_name: "Agent", tool_input: { ...COMPONENT_WITH_PROGRESS, prompt }, session_id: "this-session-live" }),
    encoding: "utf8",
    env: { ...process.env, DISCIPLINE_PROGRESS_REGISTRY: registryPath },
  });
  try {
    assert.equal(result.status, 0, "a warning must never deny the dispatch");
    const out = JSON.parse(result.stdout);
    assert.equal(out.hookSpecificOutput.permissionDecision, "allow");
    assert.match(out.hookSpecificOutput.additionalContext, /other-session-live/);
  } finally {
    rmSync(repoDir, { recursive: true, force: true });
  }
});

// --- Local agents launched from Bash carry the dispatch label (1.102.0) -----
// Operator, 2026-10-01: "Ideally, the local agent bash uses the same naming
// conventions as other agents, e.g (local) sonnet etc." The background-task
// list shows a Bash call's `description`, so an agent launched through Bash is
// labelled in the same shape as an Agent dispatch — and only agent launches are
// gated: a dev server or a watcher is not an agent.

const LABELLED = "local — Engineer (sonnet): lesson rollout";

test("commands that launch an agent are recognised; plain commands are not", () => {
  for (const command of [
    "claude -p 'do the job' --permission-mode auto",
    "cd ~/x && claude --print < brief.md",
    "claude --cloud 'task'",
    "node hooks/scripts/workflow.mjs spec.json",
    "~/p/hooks/scripts/workflow.mjs spec.json",
    "bash estate/mac-queue/run.sh",
    "git add queue/mac/pending/job.md && git commit -m job",
  ]) {
    assert.equal(launchesAgent(command), true, command);
  }
  for (const command of [
    "npm run dev",
    "node --test hooks",
    "git commit -m 'document claude -p labels'",
    "cat hooks/scripts/workflow.mjs",
    "grep -n claude --cloud notes.md",
    "claude --version",
  ]) {
    assert.equal(launchesAgent(command), false, command);
  }
});

test("a Bash agent launch without the label is blocked, naming the shape", () => {
  for (const description of ["", "run the job", "Run claude", "local - Engineer (sonnet): x", "cloud — Engineer: x"]) {
    const verdict = checkBashAgentLabel({ command: "claude -p 'x'", run_in_background: true, description });
    assert.equal(verdict.ok, false, JSON.stringify(description));
    assert.equal(verdict.item, "bash-description");
    assert.match(verdict.reason, /local — persona \(model\): task/);
  }
});

test("a labelled Bash agent launch passes, background or not", () => {
  for (const run_in_background of [true, false]) {
    assert.equal(checkBashAgentLabel({ command: "claude -p 'x'", run_in_background, description: LABELLED }).ok, true);
  }
  assert.equal(checkBashAgentLabel({ command: "node hooks/scripts/workflow.mjs s.json", description: "cloud — Reviewer (opus): sweep" }).ok, true);
});

test("plain Bash — a dev server, a watcher, anything not an agent — is never gated", () => {
  for (const input of [
    { command: "npm run dev", run_in_background: true },
    { command: "git ls-remote --exit-code origin b", run_in_background: true, description: "watch" },
    { command: "ls" },
  ]) {
    assert.equal(checkBashAgentLabel(input).ok, true, JSON.stringify(input));
  }
});

test("the hook process denies an unlabelled Bash agent launch and passes the labelled one", () => {
  const denied = JSON.parse(run({ tool_name: "Bash", tool_input: { command: "claude -p 'x'", run_in_background: true } }).stdout);
  assert.equal(denied.hookSpecificOutput.permissionDecision, "deny");
  assert.match(denied.hookSpecificOutput.permissionDecisionReason, /bash-description/);
  const ok = run({ tool_name: "Bash", tool_input: { command: "claude -p 'x'", description: LABELLED } });
  assert.equal(ok.stdout.trim(), "");
  assert.equal(run({ tool_name: "Bash", tool_input: { command: "npm run dev", run_in_background: true } }).stdout.trim(), "");
});

test("hooks.json routes Bash through the dispatch gate as well as the commit gate", () => {
  const hooks = JSON.parse(readFileSync(join(repo, "hooks", "hooks.json"), "utf8")).hooks.PreToolUse;
  const matching = hooks.filter((h) => /\bBash\b/.test(h.matcher)).flatMap((h) => h.hooks.map((x) => x.command));
  assert.ok(matching.some((c) => c.includes("agent-dispatch-gate.mjs")), "Bash must reach agent-dispatch-gate.mjs");
  assert.ok(matching.some((c) => c.includes("commit-gate.mjs")), "commit-gate keeps its Bash matcher");
});

// --- Round 2 (reviewer R1): prose that merely mentions a launch is never gated ---

test("heredoc bodies, quoted spans and quoted git-add text never count as an agent launch", () => {
  const negatives = {
    "commit heredoc body line starts claude -p": "git commit -F - <<'EOF'\nfix the gate\nclaude -p 'x' is now labelled\nEOF",
    "README heredoc with a claude -p code line": "cat > README.md <<'EOF'\n## Usage\nclaude -p 'task'\nEOF",
    "notes heredoc line running workflow.mjs": "cat >> notes.md <<EOF\nnode hooks/scripts/workflow.mjs spec.json\nEOF",
    "commit -m with an embedded newline then claude --print": 'git commit -m "gate\nclaude --print is covered"',
    "gh pr create --body with an embedded newline then claude -p": 'gh pr create --title t --body "summary\nclaude -p x"',
    "commit message mentioning git add queue/mac/pending/": 'git commit -m "chore: git add queue/mac/pending/ job"',
    "grep for the git-add text": 'grep "git add queue/mac/pending/" CHANGED.txt',
    "python heredoc editing the gate test": "python3 - <<'E'\ns = \"claude -p 'x'\"\nopen(p,'w').write(s)\nnode workflow.mjs\nE",
    "single-quoted newline span": "echo 'a\nclaude --cloud b'",
  };
  for (const [name, command] of Object.entries(negatives)) {
    assert.equal(launchesAgent(command), false, name);
    assert.equal(checkBashAgentLabel({ command }).ok, true, name);
  }
});

test("true positives still deny after stripping: real newline segments, launch after a heredoc, quoted task text", () => {
  for (const command of [
    "cd x\nclaude -p 'do it'",
    "cat <<'EOF' > brief.md\nbody\nEOF\nclaude --print < brief.md",
    "claude -p \"quoted task\" --permission-mode auto",
    "echo job > queue/mac/pending/job.md",
    "git add queue/mac/pending/job.md",
    "cd repo && git add queue/mac/pending/job.md",
    "cat x | tee queue/mac/pending/job.md",
  ]) {
    assert.equal(launchesAgent(command), true, command);
  }
});
