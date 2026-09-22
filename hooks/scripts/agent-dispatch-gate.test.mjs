// Tests for the Agent dispatch gate. Five dispatch laws that were
// prompt-trusted until now — surface-prefixed description, explicit model,
// brief under 600 words, skills named, and (1.92.0) Source-contract lock-row
// shape — are asserted here against the fixtures the dispatch brief named:
// malformed and well-formed, plus 1.92.0 fixtures for the two new checks. The
// fixtures are exported so the runtime dry-run in the evidence return drives
// the same objects the unit tests do, rather than a hand-typed approximation.
// Run: node --test hooks/scripts/agent-dispatch-gate.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  checkAgentDispatch,
  checkSkillsNamed,
  checkSourceContractLockRows,
  promptWords,
  PROMPT_WORD_CAP,
  EXEMPT_SUBAGENTS,
  SOURCE_CONTRACT_CELLS,
} from "../bin/agent-dispatch-gate.mjs";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const gate = join(repo, "hooks", "bin", "agent-dispatch-gate.mjs");

// --- Fixtures -------------------------------------------------------------

export const WELL_FORMED = {
  description: "cloud — engineer (sonnet): rebind the nav tokens",
  model: "sonnet",
  subagent_type: "engineer",
  prompt: [
    "You are the Engineer.",
    "",
    "**Goal.** The nav row binds every dimension through the export's token names.",
    "**Context.** Contract: the design-handoff pair at the path below; repo ~/JHD/portfolio/main, branch chore/foundations.",
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

// --- Wiring ---------------------------------------------------------------

test("hooks.json fires the gate on Agent dispatches", () => {
  const hooks = JSON.parse(readFileSync(join(repo, "hooks", "hooks.json"), "utf8"));
  const pre = hooks.hooks.PreToolUse;
  const entry = pre.find((h) => /Agent/.test(h.matcher));
  assert.ok(entry, "no PreToolUse entry matching Agent");
  assert.match(entry.hooks[0].command, /agent-dispatch-gate\.mjs/);
  assert.match(entry.hooks[0].command, /\$\{CLAUDE_PLUGIN_ROOT\}/);
});
