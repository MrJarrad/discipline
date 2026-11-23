// Tests for skill-eval.mjs — vertical slices, one behavior per test. No live
// dispatch: runWorkflow is always given an injected spawnImpl or the whole
// arm is driven through an injected runWorkflowImpl.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loadCases, lintCaseFixtures, assertSkillsGuard, compileSpec, slugifyCwd,
  transcriptPath, normalizeSkillName, extractFiredSkills, readTranscript,
  sampleOutcome, scoreCase, VERDICT, discriminate, DISCRIMINATION, runArms,
  parseRouteResult, helperMarkerPath,
} from "./skill-eval.mjs";

// ---- compileSpec / S1 guard ----------------------------------------------

test("compileSpec generates agents with skills: [] and no persona (S1 guard)", () => {
  const cases = [{ id: "c1", type: "trigger", prompt: "do a thing", cwd: "~/JHD/vault", expectSkills: ["foo"], samples: 1 }];
  const spec = compileSpec(cases, { armName: "candidate" });
  const agent = spec.phases[0].agents[0];
  assert.deepEqual(agent.skills, []);
  assert.equal(agent.persona, undefined);
});

test("assertSkillsGuard throws if a generated agent ever carries a non-empty skills array", () => {
  const spec = { phases: [{ agents: [{ label: "bad", skills: ["quality"] }] }] };
  assert.throws(() => assertSkillsGuard(spec), /S1 guard violated/);
});

test("assertSkillsGuard throws if a generated agent carries a persona", () => {
  const spec = { phases: [{ agents: [{ label: "bad", skills: [], persona: "engineer" }] }] };
  assert.throws(() => assertSkillsGuard(spec), /S1 guard violated/);
});

test("compileSpec expands one agent per sample and threads pluginDir into each", () => {
  const cases = [{ id: "c1", type: "trigger", prompt: "do a thing", cwd: "~/JHD/vault", samples: 3 }];
  const spec = compileSpec(cases, { armName: "baseline", pluginDir: "/tmp/alt-plugin" });
  assert.equal(spec.phases[0].agents.length, 3);
  assert.ok(spec.phases[0].agents.every((a) => a.pluginDir === "/tmp/alt-plugin"));
});

// ---- fixture lint ----------------------------------------------------------

test("lintCaseFixtures flags a prompt that names a skill verbatim", () => {
  const cases = [{ id: "c1", prompt: "use capture-figma to pull the tokens", provenance: "x" }];
  const { ok, violations } = lintCaseFixtures(cases, ["capture-figma"]);
  assert.equal(ok, false);
  assert.equal(violations[0].skill, "capture-figma");
});

test("lintCaseFixtures passes a prompt with no skill name and provenance set", () => {
  const cases = [{ id: "c1", prompt: "match the figma header block", provenance: "x" }];
  const { ok } = lintCaseFixtures(cases, ["capture-figma"]);
  assert.equal(ok, true);
});

// ---- transcript path + skill extraction ------------------------------------

test("slugifyCwd replaces every / with -, matching the T1 spike's observed formula", () => {
  assert.equal(slugifyCwd("/Users/jarradharvey/JHD/vault"), "-Users-jarradharvey-JHD-vault");
});

test("transcriptPath joins projectsRoot, slugified cwd, and sessionId.jsonl", () => {
  const p = transcriptPath("abc-123", "/Users/x/JHD/vault", { projectsRoot: "/root" });
  assert.equal(p, "/root/-Users-x-JHD-vault/abc-123.jsonl");
});

test("normalizeSkillName strips a plugin prefix", () => {
  assert.equal(normalizeSkillName("discipline:quality"), "quality");
  assert.equal(normalizeSkillName("quality"), "quality");
});

test("extractFiredSkills reads Skill tool_use blocks from transcript JSONL, normalized", () => {
  const line1 = JSON.stringify({ message: { content: [{ type: "tool_use", name: "Skill", input: { skill: "discipline:capture-website" } }] } });
  const line2 = JSON.stringify({ message: { content: [{ type: "text", text: "hi" }] } });
  const fired = extractFiredSkills(`${line1}\n${line2}\n`);
  assert.deepEqual([...fired], ["capture-website"]);
});

test("readTranscript uses an injected readFileImpl, never touching real disk", () => {
  const line = JSON.stringify({ message: { content: [{ type: "tool_use", name: "Skill", input: { skill: "define-terms" } }] } });
  const { firedSkills } = readTranscript("sess1", "~/JHD/vault", { readFileImpl: () => line, projectsRoot: "/root" });
  assert.ok(firedSkills.has("define-terms"));
});

// ---- runNonce -> sessionSalt threading ------------------------------------

test("compileSpec threads runNonce into every generated agent's sessionSalt", () => {
  const cases = [{ id: "c1", type: "trigger", prompt: "do a thing", cwd: "~/JHD/vault", samples: 2 }];
  const spec = compileSpec(cases, { armName: "candidate", runNonce: "nonce-1" });
  assert.ok(spec.phases[0].agents.every((a) => a.sessionSalt === "nonce-1"));
});

test("compileSpec omits sessionSalt entirely when no runNonce is given", () => {
  const cases = [{ id: "c1", type: "trigger", prompt: "do a thing", cwd: "~/JHD/vault", samples: 1 }];
  const spec = compileSpec(cases, { armName: "candidate" });
  assert.equal("sessionSalt" in spec.phases[0].agents[0], false);
});

// ---- structured route-result parsing ---------------------------------------

test("parseRouteResult reads persona and skills from a valid --json-schema result string", () => {
  const result = JSON.stringify({ persona: "researcher", skills: ["research-synthesis"] });
  assert.deepEqual(parseRouteResult(result), { persona: "researcher", skills: ["research-synthesis"] });
});

test("parseRouteResult returns null for malformed or missing results, never throws", () => {
  assert.equal(parseRouteResult("not json"), null);
  assert.equal(parseRouteResult(undefined), null);
  assert.equal(parseRouteResult(JSON.stringify({ skills: ["x"] })), null);
});

// ---- scoring ----------------------------------------------------------------

test("sampleOutcome passes a trigger case when every expectSkills member fired and none forbidden", () => {
  const c = { type: "trigger", expectSkills: ["define-terms"], forbidSkills: ["doc-formats"] };
  assert.equal(sampleOutcome(c, { firedSkills: new Set(["define-terms"]), outcome: "success" }), true);
  assert.equal(sampleOutcome(c, { firedSkills: new Set(["doc-formats"]), outcome: "success" }), false);
  assert.equal(sampleOutcome(c, { firedSkills: new Set(), outcome: "success" }), false);
});

test("sampleOutcome for a route case also requires persona match", () => {
  const c = { type: "route", expectSkills: [], expectPersona: "researcher" };
  assert.equal(sampleOutcome(c, { firedSkills: new Set(), persona: "researcher", outcome: "success" }), true);
  assert.equal(sampleOutcome(c, { firedSkills: new Set(), persona: "engineer", outcome: "success" }), false);
});

test("scoreCase is GREEN on a strict majority pass", () => {
  const c = { id: "c1", type: "trigger", expectSkills: ["x"] };
  const observed = [{ firedSkills: new Set(["x"]), outcome: "success" }, { firedSkills: new Set(["x"]), outcome: "success" }, { firedSkills: new Set(), outcome: "success" }];
  assert.equal(scoreCase(c, observed).verdict, VERDICT.GREEN);
});

test("scoreCase is RED on a strict majority fail", () => {
  const c = { id: "c1", type: "trigger", expectSkills: ["x"] };
  const observed = [{ firedSkills: new Set(), outcome: "success" }, { firedSkills: new Set(), outcome: "success" }, { firedSkills: new Set(["x"]), outcome: "success" }];
  assert.equal(scoreCase(c, observed).verdict, VERDICT.RED);
});

test("scoreCase is FLAKY on an exact split, never rounded to a pass or fail", () => {
  const c = { id: "c1", type: "trigger", expectSkills: ["x"] };
  const observed = [{ firedSkills: new Set(["x"]), outcome: "success" }, { firedSkills: new Set(), outcome: "success" }];
  assert.equal(scoreCase(c, observed).verdict, VERDICT.FLAKY);
});

// ---- discrimination ----------------------------------------------------------

test("discriminate reports BASELINE UNAVAILABLE when no baseline arm ran, never GREEN", () => {
  const candidate = { verdict: VERDICT.GREEN, passed: 3, of: 3 };
  assert.equal(discriminate(candidate, null), DISCRIMINATION.BASELINE_UNAVAILABLE);
});

test("discriminate reports NON-DISCRIMINATING when candidate and baseline score identically", () => {
  const candidate = { verdict: VERDICT.GREEN, passed: 3, of: 3 };
  const baseline = { verdict: VERDICT.GREEN, passed: 3, of: 3 };
  assert.equal(discriminate(candidate, baseline), DISCRIMINATION.NON_DISCRIMINATING);
});

test("discriminate reports DISCRIMINATES when the arms diverge", () => {
  const candidate = { verdict: VERDICT.GREEN, passed: 3, of: 3 };
  const baseline = { verdict: VERDICT.RED, passed: 0, of: 3 };
  assert.equal(discriminate(candidate, baseline), DISCRIMINATION.DISCRIMINATES);
});

// The meta/skill-eval/cases.json fixture file is checked by eval-cases.test.mjs;
// this file covers loadCases/lintCaseFixtures through inline fixtures.

// ---- runArms — end-to-end with an injected runWorkflowImpl (no spawn) ------

test("runArms scores a route case off the structured --json-schema result, not Skill tool_use blocks", async () => {
  const cases = [{ id: "r1", type: "route", prompt: "route me", cwd: "~/JHD/vault", expectPersona: "researcher", expectSkills: [], samples: 1 }];
  // Fake run: the agent's transcript never fires a Skill tool_use (route
  // agents carry no persona/skills mandate — see the S1 guard), but its
  // JSON-schema result correctly names the expected persona.
  const fakeRunWorkflow = async (spec, log) => {
    for (const agent of spec.phases[0].agents) {
      log({ type: "agent", label: agent.label, sessionId: `sess-${agent.label}`, outcome: "success", result: JSON.stringify({ persona: "researcher", skills: [] }) });
    }
    return { summary: [], totals: {}, exitCode: 0 };
  };
  const results = await runArms({ cases, baselinePluginDir: undefined, runWorkflowImpl: fakeRunWorkflow });
  assert.equal(results[0].candidate.verdict, VERDICT.GREEN);
});

test("runArms scores a candidate-only run (no baselinePluginDir) as BASELINE UNAVAILABLE", async () => {
  const cases = [{ id: "c1", type: "trigger", prompt: "do a thing", cwd: "~/JHD/vault", expectSkills: ["define-terms"], samples: 1 }];
  const fakeRunWorkflow = async (spec, log) => {
    for (const agent of spec.phases[0].agents) {
      log({ type: "agent", label: agent.label, sessionId: `sess-${agent.label}` });
    }
    return { summary: [], totals: {}, exitCode: 0 };
  };
  const scratch = mkdtempSync(join(tmpdir(), "skill-eval-test-"));
  try {
    const results = await runArms({
      cases, baselinePluginDir: undefined, runWorkflowImpl: fakeRunWorkflow,
    });
    assert.equal(results.length, 1);
    assert.equal(results[0].discrimination, DISCRIMINATION.BASELINE_UNAVAILABLE);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

// ---- text expectations (behaviour cases: s107 slips) -----------------------

test("sampleOutcome fails a sample whose reply text matches a forbidText pattern", () => {
  const c = { id: "t", type: "behavior", forbidText: ["switched off"] };
  assert.equal(sampleOutcome(c, { firedSkills: new Set(), text: "Hover stays, switched off.", outcome: "success" }), false);
  assert.equal(sampleOutcome(c, { firedSkills: new Set(), text: "I'll remove the other two.", outcome: "success" }), true);
});

test("sampleOutcome requires every expectText pattern to match, case-insensitively", () => {
  const c = { id: "t", type: "behavior", expectText: ["status doc", "same turn"] };
  assert.equal(sampleOutcome(c, { firedSkills: new Set(), text: "Update the STATUS DOC in the Same Turn.", outcome: "success" }), true);
  assert.equal(sampleOutcome(c, { firedSkills: new Set(), text: "Update the status doc.", outcome: "success" }), false);
});

test("a forbidText-only case passes an empty reply (no chat text on an automated wake)", () => {
  const c = { id: "t", type: "behavior", forbidText: ["nothing new"] };
  assert.equal(sampleOutcome(c, { firedSkills: new Set(), text: "", outcome: "success" }), true);
  assert.equal(sampleOutcome(c, { firedSkills: new Set(), outcome: "success" }), true);
});

test("runArms feeds each agent's result text into text scoring", async () => {
  const cases = [{ id: "b1", type: "behavior", prompt: "p", forbidText: ["nothing new"], expectSkills: [], samples: 1 }];
  const fake = (reply) => async (spec, log) => {
    for (const a of spec.phases[0].agents) log({ type: "agent", label: a.label, sessionId: `s-${a.label}`, outcome: "success", result: reply });
    return {};
  };
  const bad = await runArms({ cases, runWorkflowImpl: fake("Nothing new needed from you.") });
  assert.equal(bad[0].candidate.verdict, VERDICT.RED);
  const ok = await runArms({ cases, runWorkflowImpl: fake("") });
  assert.equal(ok[0].candidate.verdict, VERDICT.GREEN);
});

// ---- probes never touch the tree -------------------------------------------

test("compileSpec disallows every writing tool on every probe agent", () => {
  const spec = compileSpec([{ id: "a", type: "trigger", prompt: "p", samples: 2 }]);
  for (const a of spec.phases[0].agents) {
    for (const t of ["Edit", "Write", "NotebookEdit", "Bash"]) assert.match(a.disallowedTools, new RegExp(`\\b${t}\\b`));
  }
});

// ---- an unfinished probe is never a pass -----------------------------------

test("a capped or failed probe fails its sample even when nothing is forbidden", () => {
  const c = { id: "t", type: "behavior", forbidText: ["nothing new"] };
  assert.equal(sampleOutcome(c, { firedSkills: new Set(), text: "", outcome: "capped" }), false);
  assert.equal(sampleOutcome(c, { firedSkills: new Set(), text: "", outcome: "success" }), true);
});

test("runArms reads each probe's outcome and sums its cost per case", async () => {
  const cases = [{ id: "b1", type: "behavior", prompt: "p", forbidText: ["x"], expectSkills: [], samples: 2 }];
  const run = async (spec, log) => {
    spec.phases[0].agents.forEach((a, i) => log({ type: "agent", label: a.label, sessionId: `s${i}`, outcome: i ? "capped" : "success", costUsd: 0.01, result: "" }));
    return {};
  };
  const [r] = await runArms({ cases, runWorkflowImpl: run });
  assert.equal(r.candidate.passed, 1);
  assert.equal(r.candidate.costUsd, 0.02);
});

test("route, behaviour and fence probes get no reading tools; only trigger probes keep Skill and Read", () => {
  const spec = compileSpec([{ id: "r", type: "route", prompt: "p", samples: 1 }, { id: "b", type: "behavior", prompt: "p", samples: 1 }]);
  for (const a of spec.phases[0].agents) assert.match(a.disallowedTools, /\bRead\b/);
  const t = compileSpec([{ id: "t", type: "trigger", prompt: "p", samples: 1 }]).phases[0].agents[0];
  assert.doesNotMatch(t.disallowedTools, /\bRead\b/);
});

test("scoreCase counts capped and errored samples apart from real fails, so cap noise is separable (DISC-353)", () => {
  const c = { id: "x", type: "trigger", expectSkills: ["motion"] };
  const fired = { firedSkills: new Set(["motion"]), outcome: "success" };
  const missed = { firedSkills: new Set(), outcome: "success" };
  const s = scoreCase(c, [fired, missed, { firedSkills: new Set(["motion"]), outcome: "capped" }, { outcome: "failed" }, fired]);
  assert.equal(s.passed, 2);
  assert.equal(s.of, 5);
  assert.equal(s.capped, 1, "a capped probe observed nothing; it is counted apart");
  assert.equal(s.errored, 1);
  assert.equal(s.observed, 3, "samples that ran to an answer");
});

// DISC-353 ambers: fail closed, and a helper marker never reaches a probe.
test("a sample with no outcome is not a pass: only an explicit success counts", () => {
  const c = { id: "t", type: "trigger", expectSkills: ["motion"] };
  assert.equal(sampleOutcome(c, { firedSkills: new Set(["motion"]) }), false);
  assert.equal(sampleOutcome(c, { firedSkills: new Set(["motion"]), outcome: "success" }), true);
});

test("a live run is refused while a helper-session marker sits in the home folder", () => {
  const home = mkdtempSync(join(tmpdir(), "se-"));
  assert.equal(helperMarkerPath(home), null);
  mkdirSync(join(home, ".claude"));
  writeFileSync(join(home, ".claude", "helper-session"), "session_x\n");
  assert.equal(helperMarkerPath(home), join(home, ".claude", "helper-session"));
});
