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

// ---- reviewer-block regression: path-prefix guard, not bare substring -----

test("findNonVaultPaths: a vault subfolder literally named tmp/ is not flagged (prefix check, not bare substring)", () => {
  assert.deepEqual(findNonVaultPaths("edit ~/JHD/vault/scripts/tmp/output.log"), []);
});

test("findNonVaultPaths: a session-scratchpad path under /private/tmp/claude-*/ is allowlisted", () => {
  assert.deepEqual(
    findNonVaultPaths("see /private/tmp/claude-502/x/scratchpad/plan.md for the plan"),
    []
  );
});

test("findNonVaultPaths: a session-scratchpad path under /tmp/claude-*/ is allowlisted", () => {
  assert.deepEqual(findNonVaultPaths("see /tmp/claude-502/scratchpad/plan.md"), []);
});

test("findNonVaultPaths: a bare /tmp/ path outside any scratchpad convention is still flagged", () => {
  assert.deepEqual(findNonVaultPaths("write to /tmp/foo.json"), ["/tmp/foo.json"]);
});

test("findNonVaultPaths: ~/Downloads is still flagged even after the prefix-check fix", () => {
  assert.deepEqual(findNonVaultPaths("open ~/Downloads/x.png"), ["~/Downloads/x.png"]);
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

// ---- standing rulings ----------------------------------------------------
//
// Three rules, matching the operator's 2026-08-10 verdict that a named
// citation is not compliance. (b) is the only hard failure: a `rulings` entry
// that doesn't actually carry the ruling's words is worse than no field at
// all, because it looks like compliance. (a) and (c) are warnings — prose that
// mentions a ruling is legitimate, so the lint names the prompt and lets the
// author judge, exactly as the maxTurns floor lint distinguishes a real
// violation from an explicitly-overridden one.

// A fully-formed ruling entry: the verbatim quote AND the contrast pair the
// 2026-08-10 do/dont ruling requires. Tests that assert "no warnings at all"
// lean on this being complete, so a half-formed fixture would silently mask
// the pair lint.
const VALID_RULING = {
  id: "media-§6",
  source: "vault/fleet/rulings/2026-08-06-design-contract-and-media-replacement.md",
  text: "No hash/size/mtime adjudication ever decides whether to copy a delivered asset.",
  do: "the drop contains 10alt; nothing wires it; it lands in public/ anyway, noted unwired.",
  dont: "every drop file is byte-identical to what shipped, so there is nothing to do.",
};

function rulingsSpec(rulings, agentOverrides = {}) {
  return {
    name: "test-spec",
    rulings,
    phases: [{
      title: "Build",
      agents: [{ label: "engineer-sonnet:x", prompt: "do it", model: "sonnet", maxTurns: 100, ...agentOverrides }],
    }],
  };
}

// (b) placeholder / non-verbatim ruling text -> hard fail

test("lintSpec: a rulings entry with a well-formed verbatim quote passes", () => {
  const { errors } = lintSpec(rulingsSpec([VALID_RULING]), { personaExists: okPersonaExists });
  assert.deepEqual(errors, []);
});

test("lintSpec: a rulings entry with empty text is a hard failure", () => {
  const spec = rulingsSpec([{ ...VALID_RULING, text: "   " }]);
  const { errors } = lintSpec(spec, { personaExists: okPersonaExists });
  assert.ok(errors.some((e) => /rulings\[0\].*media-§6.*text/.test(e)), errors.join("\n"));
});

test("lintSpec: a rulings entry whose text is a TODO placeholder is a hard failure", () => {
  const spec = rulingsSpec([{ ...VALID_RULING, text: "TODO: paste the §6 wording in here" }]);
  const { errors } = lintSpec(spec, { personaExists: okPersonaExists });
  assert.ok(errors.some((e) => /placeholder/i.test(e)), errors.join("\n"));
});

test("lintSpec: a rulings entry whose text is an angle-bracket stub is a hard failure", () => {
  const spec = rulingsSpec([{ ...VALID_RULING, text: "<quote the ruling here>" }]);
  const { errors } = lintSpec(spec, { personaExists: okPersonaExists });
  assert.ok(errors.some((e) => /placeholder/i.test(e)), errors.join("\n"));
});

test("lintSpec: a rulings entry whose text is a bare path (a citation, not a quote) is a hard failure", () => {
  const spec = rulingsSpec([{ ...VALID_RULING, text: "vault/fleet/rulings/2026-08-06-design-contract.md#6" }]);
  const { errors } = lintSpec(spec, { personaExists: okPersonaExists });
  assert.ok(errors.some((e) => /verbatim quote/i.test(e)), errors.join("\n"));
});

test("lintSpec: a rulings entry missing id or source is a hard failure", () => {
  const { errors } = lintSpec(rulingsSpec([{ text: VALID_RULING.text }]), { personaExists: okPersonaExists });
  assert.ok(errors.some((e) => /\bid\b/.test(e)), errors.join("\n"));
  assert.ok(errors.some((e) => /\bsource\b/.test(e)), errors.join("\n"));
});

test("lintSpec: a non-array rulings field is a hard failure", () => {
  const { errors } = lintSpec(rulingsSpec("media-§6"), { personaExists: okPersonaExists });
  assert.ok(errors.some((e) => /rulings.*array/i.test(e)), errors.join("\n"));
});

// (a) a prompt that cites a ruling with no `rulings` field to back it -> warning

test("lintSpec: a prompt citing a § section with no rulings field warns, naming the prompt", () => {
  const spec = rulingsSpec(undefined, { prompt: "Apply media §6 when copying the batch." });
  const { errors, warnings } = lintSpec(spec, { personaExists: okPersonaExists });
  assert.deepEqual(errors, [], "a prose citation is not a hard failure");
  assert.ok(warnings.some((w) => /engineer-sonnet:x/.test(w) && /rulings/.test(w)), warnings.join("\n"));
});

test("lintSpec: a prompt using the token 'ruling' with no rulings field warns", () => {
  const spec = rulingsSpec(undefined, { prompt: "Honour the standing ruling on asset replacement." });
  const { warnings } = lintSpec(spec, { personaExists: okPersonaExists });
  assert.ok(warnings.some((w) => /citation is not compliance|quote/i.test(w)), warnings.join("\n"));
});

test("lintSpec: the same citing prompt WITH a rulings field produces no citation warning", () => {
  const spec = rulingsSpec([VALID_RULING], { prompt: "Apply media §6 when copying the batch." });
  const { errors, warnings } = lintSpec(spec, { personaExists: okPersonaExists });
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, []);
});

test("lintSpec: an ordinary prompt with no citation and no rulings field warns about nothing", () => {
  const { warnings } = lintSpec(rulingsSpec(undefined), { personaExists: okPersonaExists });
  assert.deepEqual(warnings, []);
});

test("lintSpec: a VERIFY prompt citing a ruling with no rulings field warns (the reviewer half of the breach)", () => {
  const spec = rulingsSpec(undefined);
  spec.phases[0].verify = { prompt: "Check media §6 compliance in: {{RESULT}}", model: "haiku", votes: 1 };
  const { errors, warnings } = lintSpec(spec, { personaExists: okPersonaExists });
  assert.deepEqual(errors, []);
  assert.ok(warnings.some((w) => /verify/.test(w)), warnings.join("\n"));
});

// (c) work-type heuristic: media/ingest/replacement work with no rulings field

test("lintSpec: an ingest prompt with no rulings field warns, citing media §6 by name", () => {
  const spec = rulingsSpec(undefined, { prompt: "Ingest the latest Sakara batch into the deck." });
  const { errors, warnings } = lintSpec(spec, { personaExists: okPersonaExists });
  assert.deepEqual(errors, [], "the heuristic is advisory, never a hard failure");
  assert.ok(warnings.some((w) => /§6/.test(w) && /UNCONDITIONAL/i.test(w)), warnings.join("\n"));
});

test("lintSpec: a 'replace' prompt with no rulings field trips the same heuristic", () => {
  const spec = rulingsSpec(undefined, { prompt: "Replace the hero assets with the new drop." });
  const { warnings } = lintSpec(spec, { personaExists: okPersonaExists });
  assert.ok(warnings.some((w) => /§6/.test(w)), warnings.join("\n"));
});

test("lintSpec: a 'media drop' prompt with no rulings field trips the same heuristic", () => {
  const spec = rulingsSpec(undefined, { prompt: "A new media drop landed — wire it up." });
  const { warnings } = lintSpec(spec, { personaExists: okPersonaExists });
  assert.ok(warnings.some((w) => /§6/.test(w)), warnings.join("\n"));
});

test("lintSpec: the same ingest prompt WITH a rulings field trips no heuristic warning", () => {
  const spec = rulingsSpec([VALID_RULING], { prompt: "Ingest the latest Sakara batch into the deck." });
  const { warnings } = lintSpec(spec, { personaExists: okPersonaExists });
  assert.deepEqual(warnings, []);
});

// ---- DO/DON'T contrast pairs ---------------------------------------------
//
// Operator ruling 2026-08-10 (vault/fleet/rulings/2026-08-10-do-dont-pairs.md):
// "every standing ruling and every skill law carries at least one CONTRAST
// PAIR — a concrete DO … and a concrete DON'T … Abstractions state the rule;
// the pair makes it unmistakable to a model mid-task." The ruling itself sets
// the severity: "Spec-lint treats a rulings entry without both pair fields as
// a warning." A warning, not an error, because some rulings genuinely resist
// pairing — the author, not the linter, is the one who can tell.

test("lintSpec: a rulings entry with no DO and no DON'T warns, naming the entry", () => {
  const bare = { id: "media-§6", source: VALID_RULING.source, text: VALID_RULING.text };
  const { errors, warnings } = lintSpec(rulingsSpec([bare]), { personaExists: okPersonaExists });
  assert.deepEqual(errors, [], "a missing pair is never a hard failure");
  assert.ok(warnings.some((w) => /media-§6/.test(w) && /\bdo\b/i.test(w) && /don't/i.test(w)), warnings.join("\n"));
});

test("lintSpec: a rulings entry with a DO but no DON'T warns about the missing half only", () => {
  const half = { ...VALID_RULING, dont: undefined };
  const { warnings } = lintSpec(rulingsSpec([half]), { personaExists: okPersonaExists });
  assert.equal(warnings.length, 1, warnings.join("\n"));
  assert.ok(/don't/i.test(warnings[0]), warnings[0]);
});

test("lintSpec: a rulings entry with a DON'T but no DO warns about the missing half only", () => {
  const half = { ...VALID_RULING, do: undefined };
  const { warnings } = lintSpec(rulingsSpec([half]), { personaExists: okPersonaExists });
  assert.equal(warnings.length, 1, warnings.join("\n"));
  assert.ok(/\bdo\b/i.test(warnings[0]) && !/don't/i.test(warnings[0]), warnings[0]);
});

test("lintSpec: a complete pair produces no pair warning", () => {
  const { errors, warnings } = lintSpec(rulingsSpec([VALID_RULING]), { personaExists: okPersonaExists });
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, []);
});

test("lintSpec: a blank-string pair half counts as missing", () => {
  const blank = { ...VALID_RULING, do: "   " };
  const { warnings } = lintSpec(rulingsSpec([blank]), { personaExists: okPersonaExists });
  assert.ok(warnings.some((w) => /\bdo\b/i.test(w)), warnings.join("\n"));
});

test("lintSpec: the pair warning names why the pair exists, not just that it is absent", () => {
  const bare = { id: "media-§6", source: VALID_RULING.source, text: VALID_RULING.text };
  const { warnings } = lintSpec(rulingsSpec([bare]), { personaExists: okPersonaExists });
  assert.ok(warnings.some((w) => /contrast pair|unmistakable|mid-task/i.test(w)), warnings.join("\n"));
});
