// Tests for workflow.mjs — vertical slices, one behavior per test.
// Run: node --test scripts/workflow.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import {
  applyAgentDefaults,
  buildArgs,
  collectBurnWarnings,
  classifyOutcome,
  OUTCOME,
  runClaude,
  runWorkflow,
  loadPersona,
  buildSkillPreamble,
  resolveOAuthToken,
  parseVerdict,
  DEFAULT_MAX_TURNS,
  DEFAULT_HAIKU_EFFORT,
  HEAVY_AGENT_THRESHOLD,
} from "./workflow.mjs";

// ---- fake spawn helper --------------------------------------------------
// A minimal EventEmitter-based stand-in for node:child_process's ChildProcess,
// exercising the real event lifecycle (stdout/stderr data, close, error) so
// runClaude's handlers run for real rather than being mocked out.
function fakeSpawn({ stdout = "", stderr = "", code = 0, emitError = null } = {}) {
  return () => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => {};
    setImmediate(() => {
      if (emitError) {
        child.emit("error", emitError);
        return;
      }
      if (stdout) child.stdout.emit("data", Buffer.from(stdout));
      if (stderr) child.stderr.emit("data", Buffer.from(stderr));
      child.emit("close", code);
    });
    return child;
  };
}

// ---- applyAgentDefaults ------------------------------------------------

test("applyAgentDefaults: unset maxTurns gets the default", () => {
  const out = applyAgentDefaults({ label: "engineer-sonnet:x", prompt: "do it", model: "sonnet" });
  assert.equal(out.maxTurns, DEFAULT_MAX_TURNS);
});

test("applyAgentDefaults: spec-set maxTurns is left untouched (override wins)", () => {
  const out = applyAgentDefaults({ label: "engineer-sonnet:x", prompt: "do it", model: "sonnet", maxTurns: 25 });
  assert.equal(out.maxTurns, 25);
});

test("applyAgentDefaults: explicit null maxTurns (deliberate no-cap) is preserved, not defaulted", () => {
  const out = applyAgentDefaults({ label: "engineer-sonnet:x", prompt: "do it", model: "sonnet", maxTurns: null });
  assert.equal(out.maxTurns, null);
});

test("applyAgentDefaults: haiku agent with no effort defaults to low", () => {
  const out = applyAgentDefaults({ label: "engineer-haiku:x", prompt: "rename a var", model: "haiku" });
  assert.equal(out.effort, DEFAULT_HAIKU_EFFORT);
});

test("applyAgentDefaults: haiku agent with an explicit effort keeps it", () => {
  const out = applyAgentDefaults({ label: "engineer-haiku:x", prompt: "rename a var", model: "haiku", effort: "medium" });
  assert.equal(out.effort, "medium");
});

test("applyAgentDefaults: non-haiku agent gets no forced effort default", () => {
  const out = applyAgentDefaults({ label: "engineer-sonnet:x", prompt: "do it", model: "sonnet" });
  assert.equal(out.effort, undefined);
});

test("applyAgentDefaults: does not mutate the original agent object", () => {
  const agent = { label: "engineer-sonnet:x", prompt: "do it", model: "sonnet" };
  applyAgentDefaults(agent);
  assert.equal("maxTurns" in agent, false);
});

// ---- buildArgs (proves defaults actually reach the CLI argv) -----------

test("buildArgs: passes --max-turns and --effort through when set", () => {
  const args = buildArgs({ prompt: "hi", model: "haiku", maxTurns: 60, effort: "low" });
  assert.ok(args.includes("--max-turns"));
  assert.equal(args[args.indexOf("--max-turns") + 1], "60");
  assert.ok(args.includes("--effort"));
  assert.equal(args[args.indexOf("--effort") + 1], "low");
});

test("buildArgs: explicit null maxTurns omits --max-turns entirely (uncapped)", () => {
  const args = buildArgs({ prompt: "hi", model: "sonnet", maxTurns: null });
  assert.equal(args.includes("--max-turns"), false);
});

test("buildArgs: end-to-end — an unset-maxTurns agent run through applyAgentDefaults reaches argv with the default", () => {
  const agent = { label: "engineer-sonnet:x", prompt: "hi", model: "sonnet" };
  const args = buildArgs(applyAgentDefaults(agent));
  assert.equal(args[args.indexOf("--max-turns") + 1], String(DEFAULT_MAX_TURNS));
});

test("buildArgs: pluginDir passes through as --plugin-dir (T1 spike mechanism, used by skill-eval's baseline arm)", () => {
  const args = buildArgs({ prompt: "hi", model: "haiku", pluginDir: "/tmp/discipline-alt" });
  assert.equal(args[args.indexOf("--plugin-dir") + 1], "/tmp/discipline-alt");
});

test("buildArgs: omitting pluginDir never adds --plugin-dir", () => {
  const args = buildArgs({ prompt: "hi", model: "haiku" });
  assert.equal(args.includes("--plugin-dir"), false);
});

// ---- collectBurnWarnings -----------------------------------------------

function specWithAgents(agents, phaseCount = 1) {
  const perPhase = Math.ceil(agents.length / phaseCount);
  const phases = [];
  for (let i = 0; i < agents.length; i += perPhase) {
    phases.push({ title: `phase-${phases.length}`, agents: agents.slice(i, i + perPhase) });
  }
  return { name: "test-spec", phases };
}

test("collectBurnWarnings: a normal small spec (<=6 agents, no opus, no no-cap) has no warnings", () => {
  const spec = specWithAgents([
    { label: "a", model: "sonnet" },
    { label: "b", model: "sonnet" },
  ]);
  assert.deepEqual(collectBurnWarnings(spec), []);
});

test("collectBurnWarnings: more than HEAVY_AGENT_THRESHOLD agents (across all phases) warns", () => {
  const agents = Array.from({ length: HEAVY_AGENT_THRESHOLD + 1 }, (_, i) => ({ label: `a${i}`, model: "sonnet" }));
  const spec = specWithAgents(agents, 2); // split across two phases — total still counts
  const warnings = collectBurnWarnings(spec);
  assert.ok(warnings.some((w) => /heavy run/.test(w)));
});

test("collectBurnWarnings: exactly HEAVY_AGENT_THRESHOLD agents does not warn on count", () => {
  const agents = Array.from({ length: HEAVY_AGENT_THRESHOLD }, (_, i) => ({ label: `a${i}`, model: "sonnet" }));
  const spec = specWithAgents(agents);
  const warnings = collectBurnWarnings(spec);
  assert.ok(!warnings.some((w) => /heavy run/.test(w)));
});

test("collectBurnWarnings: any opus agent warns, naming its label", () => {
  const spec = specWithAgents([{ label: "reviewer-opus:pricing-audit", model: "opus" }]);
  const warnings = collectBurnWarnings(spec);
  assert.ok(warnings.some((w) => w.includes("opus") && w.includes("reviewer-opus:pricing-audit")));
});

test("collectBurnWarnings: an explicit no-cap agent (maxTurns: null) warns, naming its label", () => {
  const spec = specWithAgents([{ label: "engineer-sonnet:long-task", model: "sonnet", maxTurns: null }]);
  const warnings = collectBurnWarnings(spec);
  assert.ok(warnings.some((w) => /no-cap/.test(w) && w.includes("engineer-sonnet:long-task")));
});

test("collectBurnWarnings: an agent that simply omits maxTurns (relying on the default) does NOT warn as no-cap", () => {
  const spec = specWithAgents([{ label: "engineer-sonnet:x", model: "sonnet" }]);
  const warnings = collectBurnWarnings(spec);
  assert.ok(!warnings.some((w) => /no-cap/.test(w)));
});

// ---- regression: existing spec shapes still parse/run without throwing ---

test("regression: a pre-existing spec (explicit maxTurns/effort, verify stage, no burn fields) still shapes correctly", () => {
  const legacySpec = {
    name: "legacy-example",
    phases: [
      {
        title: "Build",
        agents: [
          { label: "engineer-sonnet:build", prompt: "build it", model: "sonnet", maxTurns: 50, cwd: "/tmp" },
        ],
        verify: { prompt: "Refute: {{RESULT}}", model: "haiku", votes: 2 },
      },
    ],
  };
  // Parses (JSON round-trip) exactly as before.
  const roundTripped = JSON.parse(JSON.stringify(legacySpec));
  assert.deepEqual(roundTripped, legacySpec);

  // Existing explicit maxTurns is untouched by the new default.
  const agent = applyAgentDefaults(legacySpec.phases[0].agents[0]);
  assert.equal(agent.maxTurns, 50);

  // No burn warnings for this small, capped, non-opus spec.
  assert.deepEqual(collectBurnWarnings(legacySpec), []);

  // buildArgs still produces the same flags this spec always produced.
  const args = buildArgs(agent);
  assert.deepEqual(
    args.slice(0, 6),
    ["-p", "build it", "--model", "sonnet", "--output-format", "json"]
  );
  assert.equal(args[args.indexOf("--max-turns") + 1], "50");
});

// ---- runClaude: latent bug fixes (spawn-error settle, stderr drain) -----

test("runClaude: a spawn error (e.g. binary not found) settles as outcome spawn-error, never hangs", async () => {
  const spawnImpl = fakeSpawn({ emitError: new Error("ENOENT") });
  const r = await runClaude({ prompt: "hi", label: "x" }, "spec", { spawnImpl });
  assert.equal(r.ok, false);
  assert.equal(r.outcome, OUTCOME.SPAWN_ERROR);
});

test("runClaude: stderr is drained (never left to fill the pipe) and its tail is captured on failure", async () => {
  const spawnImpl = fakeSpawn({ stdout: '{"is_error":true,"result":"bad"}', stderr: "boom", code: 1 });
  const r = await runClaude({ prompt: "hi", label: "x" }, "spec", { spawnImpl });
  assert.equal(r.ok, false);
  assert.equal(r.outcome, OUTCOME.FAILED);
  assert.equal(r.errTail, "boom");
});

test("runClaude: a successful run resolves ok:true with outcome success", async () => {
  const spawnImpl = fakeSpawn({ stdout: '{"is_error":false,"result":"done","num_turns":5}' });
  const r = await runClaude({ prompt: "hi", label: "x" }, "spec", { spawnImpl });
  assert.equal(r.ok, true);
  assert.equal(r.outcome, OUTCOME.SUCCESS);
  assert.equal(r.result, "done");
});

// ---- sessionSalt: additive-only fix for cross-invocation session-ID collisions ----

test("runClaude: same spec name + label produce the same deterministic sessionId when sessionSalt is omitted (unchanged behavior)", async () => {
  const spawnImpl = fakeSpawn({ stdout: '{"is_error":false,"result":"done"}' });
  const r1 = await runClaude({ prompt: "hi", label: "x" }, "spec", { spawnImpl });
  const r2 = await runClaude({ prompt: "hi", label: "x" }, "spec", { spawnImpl });
  assert.equal(r1.sessionId, r2.sessionId);
});

test("runClaude: a different sessionSalt produces a different sessionId for the same spec name + label", async () => {
  const spawnImpl = fakeSpawn({ stdout: '{"is_error":false,"result":"done"}' });
  const r1 = await runClaude({ prompt: "hi", label: "x", sessionSalt: "run-a" }, "spec", { spawnImpl });
  const r2 = await runClaude({ prompt: "hi", label: "x", sessionSalt: "run-b" }, "spec", { spawnImpl });
  assert.notEqual(r1.sessionId, r2.sessionId);
});

// ---- classifyOutcome truth table ----------------------------------------

test("classifyOutcome: truth table", () => {
  const cases = [
    { in: { code: 0, parsed: { is_error: false }, maxTurns: 60 }, out: OUTCOME.SUCCESS },
    { in: { code: 0, parsed: { is_error: true }, maxTurns: 60 }, out: OUTCOME.FAILED },
    { in: { code: 1, parsed: { is_error: false }, maxTurns: 60 }, out: OUTCOME.FAILED },
    { in: { code: null, parsed: null, maxTurns: 60 }, out: OUTCOME.SPAWN_ERROR },
    { in: { code: 0, parsed: { subtype: "error_max_turns" }, maxTurns: 60 }, out: OUTCOME.CAPPED },
    { in: { code: 1, parsed: { subtype: "error_max_turns" }, maxTurns: 60 }, out: OUTCOME.CAPPED },
    { in: { code: 0, parsed: { num_turns: 60 }, maxTurns: 60 }, out: OUTCOME.CAPPED },
    { in: { code: 0, parsed: { num_turns: 59 }, maxTurns: 60 }, out: OUTCOME.SUCCESS },
    { in: { code: 1, parsed: null, maxTurns: 60 }, out: OUTCOME.FAILED },
    { in: { code: 0, parsed: { is_error: false, num_turns: 10 }, maxTurns: null }, out: OUTCOME.SUCCESS },
  ];
  for (const c of cases) {
    assert.equal(classifyOutcome(c.in), c.out, `case ${JSON.stringify(c.in)}`);
  }
});

test("classifyOutcome: capped is never folded into failed even on nonzero exit", () => {
  const out = classifyOutcome({ code: 1, parsed: { num_turns: 60 }, maxTurns: 60 });
  assert.equal(out, OUTCOME.CAPPED);
});

// ---- runWorkflow: summary/exit-code shape --------------------------------
//
// runWorkflow() makes several synchronous console.log calls per dispatch
// (scripts/workflow.mjs:325,333-339,345,353,394,406). Under node:test's
// process-isolated reporter (Node v26.5.1), those console writes are
// captured and relayed to the parent over the same structured IPC channel
// the reporter uses for test diagnostics. Two or more of these tests in a
// row intermittently corrupted that channel — reproduced 27/30 and 24/30
// runs (two-consecutive-runWorkflow-test fixtures) vs. 0/30 for any single
// such test in isolation, and 0/30 once console.log was muted for the
// duration of the test — as `Unable to deserialize cloned data due to
// invalid or unsupported version` in the *parent* reporter process
// (node:internal/test_runner/runner:485, #processRawBuffer), i.e. an IPC
// framing race in Node's test-runner internals, not a bug in runWorkflow
// or in these assertions. Muting console.log for the duration of each test
// (auto-restored by t.mock) avoids triggering the race without weakening
// any assertion. runClaude() itself (used directly, not via runWorkflow,
// in the tests above and below) does not console.log, so those tests were
// never implicated and are left untouched.

test("runWorkflow: an all-success spec produces exitCode 0 and totals with zero failed/capped", async (t) => {
  t.mock.method(console, "log", () => {});
  const spawnImpl = fakeSpawn({ stdout: '{"is_error":false,"result":"ok","num_turns":3}' });
  const spec = { name: "t", phases: [{ title: "p", agents: [{ label: "a", prompt: "x", model: "sonnet", maxTurns: 10 }] }] };
  const logs = [];
  const { exitCode, totals } = await runWorkflow(spec, (e) => logs.push(e), { spawnImpl });
  assert.equal(exitCode, 0);
  assert.equal(totals.failed, 0);
  assert.equal(totals.capped, 0);
  assert.equal(totals.survived, 1);
});

test("runWorkflow: a failed agent yields exitCode 1", async (t) => {
  t.mock.method(console, "log", () => {});
  const spawnImpl = fakeSpawn({ stdout: '{"is_error":true,"result":"nope"}' });
  const spec = { name: "t", phases: [{ title: "p", agents: [{ label: "a", prompt: "x", model: "sonnet", maxTurns: 10 }] }] };
  const { exitCode, totals } = await runWorkflow(spec, () => {}, { spawnImpl });
  assert.equal(exitCode, 1);
  assert.equal(totals.failed, 1);
});

test("runWorkflow: a capped-only run (no failures) yields exitCode 2", async (t) => {
  t.mock.method(console, "log", () => {});
  const spawnImpl = fakeSpawn({ stdout: '{"is_error":false,"result":"partial","num_turns":10}' });
  const spec = { name: "t", phases: [{ title: "p", agents: [{ label: "a", prompt: "x", model: "sonnet", maxTurns: 10 }] }] };
  const { exitCode, totals } = await runWorkflow(spec, () => {}, { spawnImpl });
  assert.equal(exitCode, 2);
  assert.equal(totals.capped, 1);
  assert.equal(totals.failed, 0);
});

// ---- parseVerdict ---------------------------------------------------------
//
// The verify stage's refuters are told to end with a literal CONFIRMED/REFUTED
// last word, but qa-acceptance-style reviewer prompts (VERDICT REASONS
// sections) naturally end in prose instead. parseVerdict() extracts the real
// verdict in priority order so a structured PASS/BLOCK isn't miscounted as a
// refutation. Ambiguous/absent text still fails closed to REFUTED, but is
// tagged 'unparsed' so it's visible rather than silently swallowed.

// Real transcript excerpt (vault/orchestrator/specs/wild-r4-verdict.md): a
// nine-ground qa-acceptance-style PASS whose prose tail previously got
// miscounted as a refutation because it doesn't end in the literal word
// CONFIRMED.
//
// The prose tail below is deliberately padded past 1000 chars past the
// VERDICT line, and contains no PASS/BLOCK token anywhere in that padding.
// This is load-bearing: without it, branch 3 (the trailing-1000-char
// PASS/BLOCK fallback) independently catches the same word inside the
// **VERDICT: ...** line and masks a broken branch 2 (the VERDICT: line
// match) — a short fixture here would pass even with branch 2 deleted.
const WILD_R4_VERDICT_TEXT = `

---

# Wild Round 2 Verdict — Reviewer Pass (2026-08-07)

**Branch:** conform/wild · **Commit:** cb366fee28d9a591649adf49a3f54ca68fb4d387 (HEAD, matches claim) · not pushed, not merged.

**VERDICT: PASS**

## VERDICT REASONS

1. **Tree state.** Confirmed clean.
2. **Gates.** \`npx tsc --noEmit\` → exit 0. \`npm test\` → 194 passed (194).
3. **Diff shape.** Compared the change set against the base commit named in the submission. File count, insertion count, and deletion count matched exactly, with no extra files quietly riding along in the same commit.
4. **Version bump.** Every file expected to carry the new release number carried it. No stale reference to the previous number was left anywhere in the tree, including generated artifacts that are easy to forget about.
5. **Manual differential check.** Constructed several adversarial inputs by hand to probe the new logic outside of the existing fixtures. Every one of them resolved to the outcome a careful human reviewer would reach by inspection, with no silent mis-ordering observed in any of the sampled cases.
6. **Regression sweep.** Re-ran the entire suite a second time from a cold checkout after the mutation probe was reverted, to rule out any leftover state from the earlier experiment. The counts matched the first run exactly, item for item.
7. **Documentation.** Checked that the accompanying write-up described the change accurately, without overstating what was actually verified or omitting a step that was skipped.

## Net

Every re-derivable claim reproduced independently under a from-scratch environment, across two separate runs on two separate days. No fabricated evidence, no unverifiable assertions, and no gap between what was claimed and what this review actually reproduced end to end.
`;

test("parseVerdict: a qa-acceptance-style PASS report (VERDICT: line, prose tail) parses CONFIRMED", () => {
  const v = parseVerdict(WILD_R4_VERDICT_TEXT);
  assert.equal(v.confirmed, true);
  assert.equal(v.verdict, "CONFIRMED");
});

// Same padding requirement as WILD_R4_VERDICT_TEXT above: the VERDICT line
// sits early, and the >1000-char tail contains no PASS/BLOCK token, so this
// test can only pass via branch 2 (the VERDICT: line match).
const BLOCK_WITH_REASONS_TEXT = `
# Review — Block

**VERDICT: BLOCK**

## VERDICT REASONS

1. **Typecheck.** \`npx tsc --noEmit\` fails with 3 errors in src/lib/projects.ts.
2. **Tests.** \`npm test\` → 2 failing, 192 passed.
3. **Diff shape.** The change set touched two files never mentioned in the submitted summary, both unrelated to the stated goal, which raises a scope question the author needs to answer before this can move forward.
4. **Manual differential check.** Constructed a handful of adversarial inputs to probe the new logic directly. Several of them produced an answer inconsistent with the documented contract, which is a separate and more serious concern than the failing suite on its own.
5. **Regression risk.** The failing specs sit in a module three other in-flight submissions depend on, so merging as-is would ripple outward well beyond the immediate change.
6. **Documentation.** The write-up describing this submission did not mention either the scope creep or the failing specs, which on its own would be enough reason to send it back for another look.

## Net

Two independent problems compound here: a change set wider than the stated goal, and a differential check that surfaces a real behavioral inconsistency. Neither is cosmetic, and together they mean this submission needs another round before it is ready to move forward again.
`;

test("parseVerdict: a qa-acceptance-style BLOCK report (VERDICT: line, prose tail) parses REFUTED", () => {
  const v = parseVerdict(BLOCK_WITH_REASONS_TEXT);
  assert.equal(v.confirmed, false);
  assert.equal(v.verdict, "REFUTED");
});

test("parseVerdict: text with no recognizable verdict formation fails closed to REFUTED, tagged unparsed", () => {
  const v = parseVerdict("I looked into this for a while and I'm honestly not sure what to make of it.");
  assert.equal(v.confirmed, false);
  assert.equal(v.verdict, "unparsed");
});

test("parseVerdict: empty/absent text fails closed to REFUTED, tagged unparsed", () => {
  assert.equal(parseVerdict("").verdict, "unparsed");
  assert.equal(parseVerdict(undefined).verdict, "unparsed");
});

test("parseVerdict: last-word CONFIRMED/REFUTED forms (original refuter contract) still work", () => {
  assert.deepEqual(parseVerdict("Checked the claim, it holds up.\nCONFIRMED"), { confirmed: true, verdict: "CONFIRMED" });
  assert.deepEqual(parseVerdict("Checked the claim, it does not hold up.\nREFUTED"), { confirmed: false, verdict: "REFUTED" });
});

// Branch-3 proof, symmetric to the branch-2 proofs above: no VERDICT: line
// and no last-word CONFIRMED/REFUTED means branch 3 (the trailing-1000-char
// fallback) is the only branch that can resolve this text. Disabling branch 3
// alone (tailMatches forced to []) drops both cases straight to unparsed,
// so this pins branch 3 the same way the padded fixtures above pin branch 2.
test("parseVerdict: a trailing PASS/BLOCK formation within the last 1000 chars (no VERDICT: line, no last word) is used as a fallback", () => {
  const noLineOrLastWord = "After reviewing everything in detail across many paragraphs of analysis, my overall call here is PASS given the evidence.";
  assert.deepEqual(parseVerdict(noLineOrLastWord), { confirmed: true, verdict: "CONFIRMED" });
  const blockTail = "After reviewing everything in detail across many paragraphs of analysis, my overall call here is BLOCK given the evidence.";
  assert.deepEqual(parseVerdict(blockTail), { confirmed: false, verdict: "REFUTED" });
});

// Priority proof: branch 2 (VERDICT: line) must win over branch 3 (trailing
// fallback) when the two disagree. Here the VERDICT: line says BLOCK, and
// the tail — deliberately, in a closing sentence that argues the line should
// not be overridden — contains a literal PASS. If branch order were ever
// swapped (tail checked before the line), this would flip to CONFIRMED.
const PRIORITY_BLOCK_LINE_PASS_TAIL_TEXT = `
# Review — Priority Check

**VERDICT: BLOCK**

## VERDICT REASONS

1. **Typecheck.** The compiler reported a handful of diagnostics in files touched by this change, none of which were addressed before submission.
2. **Diff shape.** The change set included two files never mentioned in the submitted summary, which raises a scope question the author needs to answer.
3. **Regression risk.** The affected module has three other in-flight dependents, so shipping as-is would ripple outward well beyond the immediate change.
4. **Manual differential check.** Constructed several adversarial inputs to probe the new logic directly. A couple produced an answer inconsistent with the documented contract, which on its own is reason enough to send this back.
5. **Documentation.** The write-up describing this submission did not mention the scope creep or the compiler diagnostics, which is a separate concern from the diagnostics themselves.

## Net

An early restatement below (deliberately unrelated boilerplate a template sometimes appends) should never override the structured verdict line above it: PASS.
`;

test("parseVerdict: the VERDICT: line takes priority over a trailing PASS/BLOCK fallback — a BLOCK line with PASS in the tail still resolves REFUTED", () => {
  const v = parseVerdict(PRIORITY_BLOCK_LINE_PASS_TAIL_TEXT);
  assert.equal(v.confirmed, false);
  assert.equal(v.verdict, "REFUTED");
});

// ---- runWorkflow: verify stage uses parseVerdict + persists full result --

test("runWorkflow: a verify-stage refuter's qa-acceptance-style PASS (prose tail, no last word) survives", async (t) => {
  t.mock.method(console, "log", () => {});
  let call = 0;
  const spawnImpl = (cmd, args) => {
    call += 1;
    // First call is the doer; remaining calls are the verify-stage refuters.
    const stdout = call === 1
      ? '{"is_error":false,"result":"did the work","num_turns":3}'
      : `{"is_error":false,"result":${JSON.stringify(WILD_R4_VERDICT_TEXT)},"num_turns":2}`;
    return fakeSpawn({ stdout })();
  };
  const spec = {
    name: "t",
    phases: [{
      title: "p",
      agents: [{ label: "a", prompt: "x", model: "sonnet", maxTurns: 10 }],
      verify: { prompt: "Refute: {{RESULT}}", model: "haiku", votes: 1 },
    }],
  };
  const logs = [];
  const { totals } = await runWorkflow(spec, (e) => logs.push(e), { spawnImpl });
  assert.equal(totals.survived, 1, "a structured PASS with a prose tail must not be miscounted as a refutation");
  const verifyLog = logs.find((e) => e.type === "verify");
  assert.equal(verifyLog.confirmed, 1);
  assert.equal(verifyLog.survives, true);
});

test("runWorkflow: the verify-stage journal record persists the refuter's full output, capped at 4000 chars", async (t) => {
  t.mock.method(console, "log", () => {});
  const longResult = "REFUTED reasoning ".repeat(500) + "\nREFUTED";
  let call = 0;
  const spawnImpl = (cmd, args) => {
    call += 1;
    const stdout = call === 1
      ? '{"is_error":false,"result":"did the work","num_turns":3}'
      : `{"is_error":false,"result":${JSON.stringify(longResult)},"num_turns":2}`;
    return fakeSpawn({ stdout })();
  };
  const spec = {
    name: "t",
    phases: [{
      title: "p",
      agents: [{ label: "a", prompt: "x", model: "sonnet", maxTurns: 10 }],
      verify: { prompt: "Refute: {{RESULT}}", model: "haiku", votes: 1 },
    }],
  };
  const logs = [];
  await runWorkflow(spec, (e) => logs.push(e), { spawnImpl });
  const verifyLog = logs.find((e) => e.type === "verify");
  assert.ok(verifyLog.result, "verify journal record must persist the refuter's output");
  assert.ok(verifyLog.result.length <= 4000);
  assert.ok(verifyLog.result.includes("REFUTED"));
});

test("runWorkflow: an ambiguous refuter reply logs verdict:'unparsed' and still fails closed to refuted", async (t) => {
  t.mock.method(console, "log", () => {});
  let call = 0;
  const spawnImpl = (cmd, args) => {
    call += 1;
    const stdout = call === 1
      ? '{"is_error":false,"result":"did the work","num_turns":3}'
      : '{"is_error":false,"result":"not sure what to make of this one","num_turns":2}';
    return fakeSpawn({ stdout })();
  };
  const spec = {
    name: "t",
    phases: [{
      title: "p",
      agents: [{ label: "a", prompt: "x", model: "sonnet", maxTurns: 10 }],
      verify: { prompt: "Refute: {{RESULT}}", model: "haiku", votes: 1 },
    }],
  };
  const logs = [];
  const { totals } = await runWorkflow(spec, (e) => logs.push(e), { spawnImpl });
  assert.equal(totals.survived, 0);
  const verifyLog = logs.find((e) => e.type === "verify");
  assert.equal(verifyLog.confirmed, 0);
  assert.deepEqual(verifyLog.verdicts, ["unparsed"]);
});

// ---- buildSkillPreamble / persona ordering -------------------------------

test("buildSkillPreamble: empty/undefined skills produce an empty preamble", () => {
  assert.equal(buildSkillPreamble(undefined), "");
  assert.equal(buildSkillPreamble([]), "");
});

test("buildSkillPreamble: names each skill and mandates the Skill tool", () => {
  const p = buildSkillPreamble(["quality", "test-first"]);
  assert.match(p, /MANDATORY SKILLS/);
  assert.match(p, /quality/);
  assert.match(p, /test-first/);
});

test("runClaude: persona -> skill mandate -> task ordering in the final prompt", async () => {
  let capturedArgs;
  const spawnImpl = (cmd, args) => {
    capturedArgs = args;
    return fakeSpawn({ stdout: '{"is_error":false,"result":"ok"}' })();
  };
  await runClaude({ prompt: "do the thing", persona: "engineer", skills: ["quality"], label: "x" }, "spec", { spawnImpl });
  const prompt = capturedArgs[capturedArgs.indexOf("-p") + 1];
  const personaIdx = prompt.indexOf("engineer persona");
  const skillIdx = prompt.indexOf("MANDATORY SKILLS");
  const taskIdx = prompt.indexOf("TASK:");
  assert.ok(personaIdx >= 0 && skillIdx > personaIdx && taskIdx > skillIdx, "expected persona -> skills -> task ordering");
});

test("loadPersona: throws on a missing persona file (spec-lint backstop)", () => {
  assert.throws(() => loadPersona("does-not-exist-persona"));
});

test("loadPersona: loads and strips YAML front matter for a real persona", () => {
  const body = loadPersona("engineer");
  assert.equal(body.startsWith("---"), false);
});

// ---- resolveOAuthToken ---------------------------------------------------

test("resolveOAuthToken: returns env var directly when present", () => {
  const original = process.env.CLAUDE_CODE_OAUTH_TOKEN;
  process.env.CLAUDE_CODE_OAUTH_TOKEN = "sk-env-token";
  try {
    const token = resolveOAuthToken();
    assert.equal(token, "sk-env-token");
  } finally {
    if (original === undefined) delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
    else process.env.CLAUDE_CODE_OAUTH_TOKEN = original;
  }
});

test("resolveOAuthToken: falls back to zshrc-sourcing execFileImpl when env is absent", () => {
  const original = process.env.CLAUDE_CODE_OAUTH_TOKEN;
  delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
  try {
    const execFileImpl = () => "sk-from-zshrc";
    const token = resolveOAuthToken({ execFileImpl });
    assert.equal(token, "sk-from-zshrc");
  } finally {
    if (original !== undefined) process.env.CLAUDE_CODE_OAUTH_TOKEN = original;
  }
});

test("resolveOAuthToken: returns null when both env and zshrc fallback are empty", () => {
  const original = process.env.CLAUDE_CODE_OAUTH_TOKEN;
  delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
  try {
    const execFileImpl = () => "";
    const token = resolveOAuthToken({ execFileImpl });
    assert.equal(token, null);
  } finally {
    if (original !== undefined) process.env.CLAUDE_CODE_OAUTH_TOKEN = original;
  }
});
