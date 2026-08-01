#!/usr/bin/env node
/* skill-eval — the meta/skill-eval harness (shape:
   ~/JHD/vault/documents/eval-harness-shape-2026-08-01.md). Scores whether a
   prompt triggers the right skill(s)/persona, on real evidence (a run's
   transcript), never self-report. Reuses workflow.mjs as the dispatch
   engine — this file adds four pure functions (compile / score / lint /
   discriminate) plus a thin transcript reader and a CLI. No dispatch logic
   is reimplemented here.

   S1 guard (mandatory-skill contamination, shape §9): every agent this
   module generates MUST carry `skills: []` — never a persona's mandated
   skill list — or the harness measures obedience to a mandate instead of
   spontaneous triggering. assertSkillsGuard() enforces this and is called
   unconditionally inside compileSpec(); it is not optional and not
   bypassable by a case file.

   Usage (CLI):
     node skill-eval.mjs <cases.json> [--tag route|trigger|fence]
       [--baseline-plugin-dir <path>] [--live]
   Without --live, prints the compiled spec and exits (dry run — no spawn).
   With --live, dispatches via runWorkflow (real `claude -p` calls) and
   prints the scorecard.                                                    */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { runWorkflow } from "./workflow.mjs";

// ---- case loading + fixture lint ----------------------------------------

export function loadCases(path) {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  if (!Array.isArray(raw.cases)) throw new Error(`${path}: expected a top-level "cases" array`);
  return raw.cases;
}

// Fixture rule (shape §5.1, non-negotiable): a case prompt may never name a
// skill — that tests obedience to an instruction, not spontaneous
// triggering. skillNames is the full roster (e.g. every skills/<dir> name)
// to check the prompt against, case-insensitively, as a whole-word/skill-id
// substring.
export function lintCaseFixtures(cases, skillNames) {
  const violations = [];
  for (const c of cases) {
    const promptLower = (c.prompt || "").toLowerCase();
    for (const name of skillNames) {
      if (promptLower.includes(name.toLowerCase())) {
        violations.push({ id: c.id, skill: name, message: `case "${c.id}" prompt names skill "${name}" — tests obedience, not triggering` });
      }
    }
    if (!c.provenance) violations.push({ id: c.id, skill: null, message: `case "${c.id}" has no provenance field` });
  }
  return { ok: violations.length === 0, violations };
}

// ---- S1 guard -------------------------------------------------------------

// Throws if any agent in the spec carries a non-empty `skills` array or a
// `persona` field with a `trigger`/`fence`-type case — the one assertion
// the shape's S1 stress requires as a hard, unbypassable guard, not a lint
// warning. Every eval-generated agent must have skills:[] regardless of
// case type; route cases additionally must have no persona set.
export function assertSkillsGuard(spec) {
  for (const phase of spec.phases) {
    for (const agent of phase.agents) {
      if (Array.isArray(agent.skills) ? agent.skills.length !== 0 : agent.skills != null) {
        throw new Error(`S1 guard violated: agent "${agent.label}" has a non-empty skills list (${JSON.stringify(agent.skills)}) — eval-generated agents must always carry skills: [] so mandatory-skill injection can't contaminate results`);
      }
      if (agent.persona != null) {
        throw new Error(`S1 guard violated: agent "${agent.label}" has persona "${agent.persona}" set — eval-generated agents must never carry a persona, or buildSkillPreamble/charter frontmatter re-introduces mandated skills`);
      }
    }
  }
}

// ---- compile ---------------------------------------------------------------

const ROUTE_JSON_SCHEMA = JSON.stringify({
  type: "object",
  properties: {
    persona: { type: "string", description: "which persona (engineer, researcher, ux-designer, reviewer, releaseops, project-manager) this work should route to" },
    skills: { type: "array", items: { type: "string" }, description: "skill names the brief should mandate" },
  },
  required: ["persona", "skills"],
});

function expandHome(p) {
  if (!p) return p;
  return p.startsWith("~") ? join(homedir(), p.slice(1)) : p;
}

// compileSpec(cases, { armName, pluginDir }) -> a workflow.mjs spec. Pure
// (no I/O beyond none — path expansion only). Every generated agent: no
// persona, skills: [], haiku/low (per the shape's cost scoping), a small
// maxTurns with the required maxTurnsOverride (workflow-lint's turn floors
// are sized for real work, not a 2-4 turn eval probe). `route` cases carry
// a jsonSchema so the routing decision is a typed field, not prose to regex.
export function compileSpec(cases, { armName = "candidate", pluginDir, maxTurns = 4 } = {}) {
  const agents = cases.flatMap((c) => {
    const samples = c.samples ?? 3;
    return Array.from({ length: samples }, (_, i) => {
      const agent = {
        label: `${c.id}--${armName}--s${i}`,
        prompt: c.prompt,
        model: "haiku",
        effort: "low",
        cwd: expandHome(c.cwd) ?? process.cwd(),
        skills: [],
        maxTurns,
        maxTurnsOverride: true,
      };
      if (c.type === "route") agent.jsonSchema = ROUTE_JSON_SCHEMA;
      if (pluginDir) agent.pluginDir = pluginDir;
      return agent;
    });
  });
  const spec = { name: `skill-eval-${armName}`, phases: [{ title: `skill-eval (${armName})`, agents }] };
  assertSkillsGuard(spec);
  return spec;
}

// ---- transcript reading + skill extraction --------------------------------

// slugifyCwd(cwd) -> the directory-name transform `claude -p` uses for a
// session's transcript folder: every "/" becomes "-". Verified against two
// real transcript paths in the T1 spike
// (~/JHD/vault/documents/eval-t1-plugin-root-spike-2026-08-01.md).
export function slugifyCwd(cwd) {
  return expandHome(cwd).replace(/\//g, "-");
}

export function transcriptPath(sessionId, cwd, { projectsRoot = join(homedir(), ".claude", "projects") } = {}) {
  return join(projectsRoot, slugifyCwd(cwd), `${sessionId}.jsonl`);
}

// normalizeSkillName("discipline:quality") -> "quality". Live data shows
// both prefixed and bare forms in circulation (shape §5.3) — comparisons
// must be plugin-prefix-insensitive.
export function normalizeSkillName(name) {
  const idx = name.indexOf(":");
  return idx === -1 ? name : name.slice(idx + 1);
}

// extractFiredSkills(transcriptText) -> Set of normalized skill names. Ports
// the parse at ~/JHD/claude-usage/generate.py:49-59 (walk message.content[]
// for tool_use blocks named "Skill", read input.skill) rather than shelling
// out to python.
export function extractFiredSkills(transcriptText) {
  const fired = new Set();
  for (const line of transcriptText.split("\n")) {
    if (!line.trim()) continue;
    let rec;
    try { rec = JSON.parse(line); } catch { continue; }
    const content = rec?.message?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (block?.type === "tool_use" && block.name === "Skill" && block.input?.skill) {
        fired.add(normalizeSkillName(String(block.input.skill)));
      }
    }
  }
  return fired;
}

// readTranscript(sessionId, cwd, opts) -> { firedSkills: Set, persona }.
// `persona` is read from the run's structured (--json-schema) result, when
// this agent's compiled spec requested one (route cases) — readFileImpl is
// injected so tests never touch a real transcript on disk.
export function readTranscript(sessionId, cwd, { readFileImpl = (p) => readFileSync(p, "utf8"), projectsRoot } = {}) {
  const path = transcriptPath(sessionId, cwd, { projectsRoot });
  const text = readFileImpl(path);
  return { firedSkills: extractFiredSkills(text), path };
}

// ---- scoring ---------------------------------------------------------------

export const VERDICT = { GREEN: "GREEN", RED: "RED", FLAKY: "FLAKY" };

// sampleOutcome(caseDef, observed) -> boolean. observed: { firedSkills: Set,
// persona?: string }. A sample passes iff every expectSkills member fired,
// no forbidSkills member fired, and (route cases only) persona matches.
export function sampleOutcome(caseDef, observed) {
  const expect = caseDef.expectSkills ?? [];
  const forbid = caseDef.forbidSkills ?? [];
  const fired = observed.firedSkills ?? new Set();
  const skillsOk = expect.every((s) => fired.has(normalizeSkillName(s))) &&
    forbid.every((s) => !fired.has(normalizeSkillName(s)));
  if (caseDef.type !== "route") return skillsOk;
  const personaOk = !caseDef.expectPersona || observed.persona === caseDef.expectPersona;
  return skillsOk && personaOk;
}

// scoreCase(caseDef, observedSamples) -> { id, verdict, passed, of }.
// Majority rule: GREEN if a strict majority of samples pass, RED if a
// strict majority fail, FLAKY on an exact split (only possible with an even
// sample count) — never silently rounded to a pass or fail (shape AC 5).
export function scoreCase(caseDef, observedSamples) {
  const results = observedSamples.map((o) => sampleOutcome(caseDef, o));
  const passed = results.filter(Boolean).length;
  const of = results.length;
  let verdict;
  if (passed > of / 2) verdict = VERDICT.GREEN;
  else if (of - passed > of / 2) verdict = VERDICT.RED;
  else verdict = VERDICT.FLAKY;
  return { id: caseDef.id, verdict, passed, of };
}

// ---- discrimination (baseline arm) ----------------------------------------

export const DISCRIMINATION = { DISCRIMINATES: "DISCRIMINATES", NON_DISCRIMINATING: "NON-DISCRIMINATING", BASELINE_UNAVAILABLE: "BASELINE UNAVAILABLE" };

// discriminate(candidateScore, baselineScore | null) -> one of DISCRIMINATION.
// No baseline arm at all (mechanism unavailable, or arm not run) ->
// BASELINE UNAVAILABLE, never GREEN (operator ruling, this task's brief).
// Baseline and candidate produce the identical verdict -> NON-DISCRIMINATING
// (shape AC 3) even when the candidate itself is GREEN.
export function discriminate(candidateScore, baselineScore) {
  if (!baselineScore) return DISCRIMINATION.BASELINE_UNAVAILABLE;
  if (candidateScore.verdict === baselineScore.verdict && candidateScore.passed === baselineScore.passed) {
    return DISCRIMINATION.NON_DISCRIMINATING;
  }
  return DISCRIMINATION.DISCRIMINATES;
}

// ---- CLI --------------------------------------------------------------------

function isMainModule() {
  return import.meta.url === `file://${process.argv[1]}`;
}

function discoverSkillNames(discRoot) {
  const skillsDir = join(discRoot, "skills");
  try {
    return readdirSync(skillsDir).filter((n) => !n.startsWith("."));
  } catch {
    return [];
  }
}

async function main() {
  const args = process.argv.slice(2);
  const casesPath = args.find((a) => !a.startsWith("--"));
  if (!casesPath) {
    console.error("Usage: node skill-eval.mjs <cases.json> [--tag T] [--baseline-plugin-dir P] [--live]");
    process.exit(2);
  }
  const getArg = (flag) => { const i = args.indexOf(flag); return i === -1 ? undefined : args[i + 1]; };
  const tag = getArg("--tag");
  const baselinePluginDir = getArg("--baseline-plugin-dir");
  const candidatePluginDir = getArg("--candidate-plugin-dir");
  const live = args.includes("--live");

  let cases = loadCases(casesPath);
  if (tag) cases = cases.filter((c) => c.type === tag);

  const discRoot = join(new URL(".", import.meta.url).pathname, "..");
  const skillNames = discoverSkillNames(discRoot);
  const lint = lintCaseFixtures(cases, skillNames);
  if (!lint.ok) {
    console.error("skill-eval: fixture lint failed:");
    for (const v of lint.violations) console.error(`  - ${v.message}`);
    process.exit(1);
  }

  const candidateSpec = compileSpec(cases, { armName: "candidate", pluginDir: candidatePluginDir });
  if (!live) {
    console.log(JSON.stringify({ dryRun: true, candidateSpec, baselinePluginDir: baselinePluginDir ?? null }, null, 2));
    return;
  }

  const results = await runArms({ cases, baselinePluginDir, candidatePluginDir });
  console.log(JSON.stringify({ results }, null, 2));
  const anyRed = results.some((r) => r.candidate.verdict === VERDICT.RED);
  process.exit(anyRed ? 1 : 0);
}

// runArms({ cases, baselinePluginDir }) -> per-case results across the
// candidate arm (and, when baselinePluginDir is given, a baseline arm run
// against that plugin root via --plugin-dir — the T1-proven mechanism).
// Each agent's real sessionId is captured off runWorkflow's `log` callback
// (workflow.mjs computes it internally and never returns it in its final
// value), then used to locate and read that agent's transcript.
export async function runArms({ cases, baselinePluginDir, candidatePluginDir, runWorkflowImpl = runWorkflow }) {
  const runArm = async (armName, pluginDir) => {
    const spec = compileSpec(cases, { armName, pluginDir });
    const sessionsByLabel = new Map();
    await runWorkflowImpl(spec, (entry) => {
      if (entry.type === "agent") sessionsByLabel.set(entry.label, entry.sessionId);
    });
    const observedByCase = new Map();
    for (const phase of spec.phases) {
      for (const agent of phase.agents) {
        const caseId = agent.label.split("--")[0];
        const sessionId = sessionsByLabel.get(agent.label);
        let observed = { firedSkills: new Set() };
        if (sessionId) {
          try { observed = readTranscript(sessionId, agent.cwd); } catch { /* transcript missing -> treat as no fire */ }
        }
        if (!observedByCase.has(caseId)) observedByCase.set(caseId, []);
        observedByCase.get(caseId).push(observed);
      }
    }
    return observedByCase;
  };

  const candidateByCase = await runArm("candidate", candidatePluginDir);
  const baselineByCase = baselinePluginDir ? await runArm("baseline", baselinePluginDir) : null;

  return cases.map((c) => {
    const candidateScore = scoreCase(c, candidateByCase.get(c.id) ?? []);
    const baselineScore = baselineByCase ? scoreCase(c, baselineByCase.get(c.id) ?? []) : null;
    return { id: c.id, candidate: candidateScore, baseline: baselineScore, discrimination: discriminate(candidateScore, baselineScore) };
  });
}

if (isMainModule()) {
  main();
}
