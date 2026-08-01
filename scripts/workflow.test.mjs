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
