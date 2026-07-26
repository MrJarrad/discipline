// Tests for workflow.mjs — vertical slices, one behavior per test.
// Run: node --test scripts/workflow.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyAgentDefaults,
  buildArgs,
  collectBurnWarnings,
  DEFAULT_MAX_TURNS,
  DEFAULT_HAIKU_EFFORT,
  HEAVY_AGENT_THRESHOLD,
} from "./workflow.mjs";

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
