// Tests for workflow-lint.mjs — vertical slices, one behavior/rule per test.
// Run: node --test scripts/workflow-lint.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  lintSpec,
  lintAgent,
  floorFor,
  findNonVaultPaths,
  TURN_FLOORS,
} from "./workflow-lint.mjs";

const okPersonaExists = () => true;

function baseSpec(overrides = {}) {
  return {
    name: "test-spec",
    phases: [{ title: "Build", agents: [{ label: "engineer-sonnet:x", prompt: "do it", model: "sonnet", maxTurns: 100 }] }],
    ...overrides,
  };
}

// ---- required shape -------------------------------------------------------

test("lintSpec: rejects a spec missing name", () => {
  const spec = baseSpec({ name: undefined });
  const { errors } = lintSpec(spec, { personaExists: okPersonaExists });
  assert.ok(errors.some((e) => /name/.test(e)));
});

test("lintSpec: rejects a spec with no phases", () => {
  const { errors } = lintSpec({ name: "x", phases: [] }, { personaExists: okPersonaExists });
  assert.ok(errors.some((e) => /phases/.test(e)));
});

test("lintSpec: rejects an agent missing label", () => {
  const spec = baseSpec();
  spec.phases[0].agents[0].label = "";
  const { errors } = lintSpec(spec, { personaExists: okPersonaExists });
  assert.ok(errors.some((e) => /label/.test(e)));
});

test("lintSpec: rejects an agent missing prompt", () => {
  const spec = baseSpec();
  spec.phases[0].agents[0].prompt = "";
  const { errors } = lintSpec(spec, { personaExists: okPersonaExists });
  assert.ok(errors.some((e) => /prompt/.test(e)));
});

test("lintSpec: a fully valid spec has no errors", () => {
  const { errors } = lintSpec(baseSpec(), { personaExists: okPersonaExists });
  assert.deepEqual(errors, []);
});

// ---- duplicate labels ------------------------------------------------------

test("lintSpec: duplicate label within the same phase is rejected, citing the session-ID collision", () => {
  const spec = baseSpec({
    phases: [{
      title: "Build",
      agents: [
        { label: "engineer-sonnet:x", prompt: "do it", model: "sonnet", maxTurns: 100 },
        { label: "engineer-sonnet:x", prompt: "do it again", model: "sonnet", maxTurns: 100 },
      ],
    }],
  });
  const { errors } = lintSpec(spec, { personaExists: okPersonaExists });
  assert.ok(errors.some((e) => /duplicate label/.test(e) && /deterministicSessionId/.test(e)));
});

test("lintSpec: duplicate label across two different phases is rejected", () => {
  const spec = baseSpec({
    phases: [
      { title: "Build", agents: [{ label: "engineer-sonnet:x", prompt: "do it", model: "sonnet", maxTurns: 100 }] },
      { title: "Verify", agents: [{ label: "engineer-sonnet:x", prompt: "check it", model: "sonnet", maxTurns: 100 }] },
    ],
  });
  const { errors } = lintSpec(spec, { personaExists: okPersonaExists });
  assert.ok(errors.some((e) => /duplicate label/.test(e)));
});

test("lintSpec: distinct labels across phases are fine", () => {
  const spec = baseSpec({
    phases: [
      { title: "Build", agents: [{ label: "engineer-sonnet:x", prompt: "do it", model: "sonnet", maxTurns: 100 }] },
      { title: "Verify", agents: [{ label: "engineer-sonnet:y", prompt: "check it", model: "sonnet", maxTurns: 100 }] },
    ],
  });
  const { errors } = lintSpec(spec, { personaExists: okPersonaExists });
  assert.deepEqual(errors, []);
});

// ---- model / effort / permissionMode enums --------------------------------

test("lintSpec: rejects an unknown model", () => {
  const spec = baseSpec();
  spec.phases[0].agents[0].model = "gpt-5";
  const { errors } = lintSpec(spec, { personaExists: okPersonaExists });
  assert.ok(errors.some((e) => /model/.test(e)));
});

test("lintSpec: rejects an unknown effort", () => {
  const spec = baseSpec();
  spec.phases[0].agents[0].effort = "extreme";
  const { errors } = lintSpec(spec, { personaExists: okPersonaExists });
  assert.ok(errors.some((e) => /effort/.test(e)));
});

test("lintSpec: rejects an unknown permissionMode", () => {
  const spec = baseSpec();
  spec.phases[0].agents[0].permissionMode = "godMode";
  const { errors } = lintSpec(spec, { personaExists: okPersonaExists });
  assert.ok(errors.some((e) => /permissionMode/.test(e)));
});

test("lintSpec: known model/effort/permissionMode combination passes", () => {
  const spec = baseSpec();
  Object.assign(spec.phases[0].agents[0], { model: "haiku", effort: "low", permissionMode: "acceptEdits" });
  const { errors } = lintSpec(spec, { personaExists: okPersonaExists });
  assert.deepEqual(errors, []);
});

// ---- persona existence ------------------------------------------------------

test("lintSpec: a persona reference that fails personaExists is a hard error", () => {
  const spec = baseSpec();
  spec.phases[0].agents[0].persona = "ghost";
  const { errors } = lintSpec(spec, { personaExists: () => false });
  assert.ok(errors.some((e) => /persona/.test(e) && /ghost/.test(e)));
});

test("lintSpec: a persona reference that passes personaExists is fine", () => {
  const spec = baseSpec();
  spec.phases[0].agents[0].persona = "engineer";
  const { errors } = lintSpec(spec, { personaExists: () => true });
  assert.deepEqual(errors, []);
});

// ---- skills shape -----------------------------------------------------------

test("lintSpec: skills must be an array of non-empty strings", () => {
  const spec = baseSpec();
  spec.phases[0].agents[0].skills = ["quality", ""];
  const { errors } = lintSpec(spec, { personaExists: okPersonaExists });
  assert.ok(errors.some((e) => /skills/.test(e)));
});

test("lintSpec: a valid skills array passes", () => {
  const spec = baseSpec();
  spec.phases[0].agents[0].skills = ["quality", "test-first"];
  const { errors } = lintSpec(spec, { personaExists: okPersonaExists });
  assert.deepEqual(errors, []);
});

// ---- non-vault paths --------------------------------------------------------

test("findNonVaultPaths: flags ~/Downloads", () => {
  assert.ok(findNonVaultPaths("save it to ~/Downloads/foo.txt").length > 0);
});

test("findNonVaultPaths: allows ~/JHD/vault paths", () => {
  assert.deepEqual(findNonVaultPaths("edit ~/JHD/vault/notes.md"), []);
});

test("findNonVaultPaths: flags /tmp/ paths", () => {
  assert.ok(findNonVaultPaths("write to /tmp/scratch.txt").length > 0);
});

test("lintSpec: a prompt citing ~/Downloads is rejected", () => {
  const spec = baseSpec();
  spec.phases[0].agents[0].prompt = "read the file at ~/Downloads/report.pdf";
  const { errors } = lintSpec(spec, { personaExists: okPersonaExists });
  assert.ok(errors.some((e) => /non-vault path/.test(e)));
});

test("lintSpec: a prompt citing ~/JHD/vault is accepted", () => {
  const spec = baseSpec();
  spec.phases[0].agents[0].prompt = "read ~/JHD/vault/HANDOVER.md and summarize";
  const { errors } = lintSpec(spec, { personaExists: okPersonaExists });
  assert.deepEqual(errors, []);
});

// ---- verify block ------------------------------------------------------------

test("lintSpec: verify block with non-integer votes is rejected", () => {
  const spec = baseSpec({
    phases: [{
      title: "Build",
      agents: [{ label: "a", prompt: "x", model: "sonnet", maxTurns: 100 }],
      verify: { prompt: "Refute: {{RESULT}}", votes: 1.5 },
    }],
  });
  const { errors } = lintSpec(spec, { personaExists: okPersonaExists });
  assert.ok(errors.some((e) => /votes/.test(e)));
});

test("lintSpec: verify block missing {{RESULT}} in prompt is rejected", () => {
  const spec = baseSpec({
    phases: [{
      title: "Build",
      agents: [{ label: "a", prompt: "x", model: "sonnet", maxTurns: 100 }],
      verify: { prompt: "Refute this please", votes: 2 },
    }],
  });
  const { errors } = lintSpec(spec, { personaExists: okPersonaExists });
  assert.ok(errors.some((e) => /RESULT/.test(e)));
});

test("lintSpec: a valid verify block passes", () => {
  const spec = baseSpec({
    phases: [{
      title: "Build",
      agents: [{ label: "a", prompt: "x", model: "sonnet", maxTurns: 100 }],
      verify: { prompt: "Refute: {{RESULT}}", votes: 2 },
    }],
  });
  const { errors } = lintSpec(spec, { personaExists: okPersonaExists });
  assert.deepEqual(errors, []);
});

// ---- turn floors --------------------------------------------------------------

test("floorFor: an engineer-persona agent has the engineer floor", () => {
  assert.equal(floorFor({ persona: "engineer" }), TURN_FLOORS.byPersona.engineer);
});

test("floorFor: no persona falls back to the default floor", () => {
  assert.equal(floorFor({}), TURN_FLOORS.default);
});

test("lintSpec: an engineer agent at the old default (60) now fails lint (intended break)", () => {
  const spec = baseSpec();
  spec.phases[0].agents[0].persona = "engineer";
  spec.phases[0].agents[0].maxTurns = 60;
  const { errors } = lintSpec(spec, { personaExists: okPersonaExists });
  assert.ok(errors.some((e) => /below the engineer floor of 100/.test(e)));
});

test("lintSpec: an engineer agent at 100 (the floor) passes", () => {
  const spec = baseSpec();
  spec.phases[0].agents[0].persona = "engineer";
  spec.phases[0].agents[0].maxTurns = 100;
  const { errors } = lintSpec(spec, { personaExists: okPersonaExists });
  assert.deepEqual(errors, []);
});

test("lintSpec: an engineer agent at 45 with maxTurnsOverride:true is accepted", () => {
  const spec = baseSpec();
  spec.phases[0].agents[0].persona = "engineer";
  spec.phases[0].agents[0].maxTurns = 45;
  spec.phases[0].agents[0].maxTurnsOverride = true;
  const { errors } = lintSpec(spec, { personaExists: okPersonaExists });
  assert.deepEqual(errors, []);
});

test("lintSpec: null maxTurns without override on a floored persona is rejected", () => {
  const spec = baseSpec();
  spec.phases[0].agents[0].persona = "reviewer";
  spec.phases[0].agents[0].maxTurns = null;
  const { errors } = lintSpec(spec, { personaExists: okPersonaExists });
  assert.ok(errors.some((e) => /below the reviewer floor/.test(e)));
});

test("lintSpec: null maxTurns with maxTurnsOverride:true is accepted", () => {
  const spec = baseSpec();
  spec.phases[0].agents[0].persona = "reviewer";
  spec.phases[0].agents[0].maxTurns = null;
  spec.phases[0].agents[0].maxTurnsOverride = true;
  const { errors } = lintSpec(spec, { personaExists: okPersonaExists });
  assert.deepEqual(errors, []);
});

test("lintAgent: works standalone (not just through lintSpec)", () => {
  const { errors } = lintAgent({ label: "a", prompt: "x", maxTurns: 100 }, { personaExists: okPersonaExists, locus: "test" });
  assert.deepEqual(errors, []);
});
