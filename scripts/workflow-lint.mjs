#!/usr/bin/env node
/* workflow-lint — pure static validation for workflow.mjs spec JSON. No I/O
   beyond the optional personaExists callback (and the CLI entrypoint's own
   file read) — every rule here is a plain function of the spec object, so
   it can run before any dispatch, and be tested without touching disk.

   Usage (CLI): node workflow-lint.mjs <spec.json>  -> prints errors, exit 1/0
   Usage (lib): lintSpec(spec, { personaExists }) -> { errors, warnings }     */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export const KNOWN_MODELS = ["haiku", "sonnet", "opus"];
export const KNOWN_EFFORTS = ["low", "medium", "high", "xhigh"];
export const KNOWN_PERMISSION_MODES = ["bypassPermissions", "acceptEdits", "plan", "default"];

// Minimum maxTurns a persona may run at without maxTurnsOverride:true.
// Named per persona because burn risk scales with how much a persona
// typically has to do (an engineer building something vs. a reviewer
// reading it) — see the commit that introduced this for the operator
// burn-ruling this schematizes.
export const TURN_FLOORS = {
  byPersona: {
    engineer: 100,
    releaseops: 80,
    "ux-designer": 60,
    reviewer: 40,
    researcher: 40,
    "project-manager": 40,
  },
  default: 40,
};

export function floorFor(agent) {
  if (agent && agent.persona && agent.persona in TURN_FLOORS.byPersona) {
    return TURN_FLOORS.byPersona[agent.persona];
  }
  return TURN_FLOORS.default;
}

const NON_VAULT_PATTERNS = [
  /~\/Downloads/,
  /~\/Desktop/,
  /~\/Documents/,
  /(?<!\/private)\/tmp\//,
  /\/private\/tmp\//,
  /\$HOME\/Downloads/,
  /\$HOME\/Desktop/,
  /\$HOME\/Documents/,
];

// findNonVaultPaths(prompt, { cwd }) -> array of matched substrings citing
// paths outside the vault/allowed cwd. Allowlists ~/JHD/ (the vault + all
// dispatched-repo checkouts live under it) and anything under the agent's
// own cwd, since a prompt legitimately referencing its own working tree
// isn't a stray-path risk.
export function findNonVaultPaths(prompt, { cwd } = {}) {
  if (!prompt) return [];
  const hits = [];
  for (const re of NON_VAULT_PATTERNS) {
    const m = prompt.match(re);
    if (m) hits.push(m[0]);
  }
  // Filter out matches that are actually inside the allowed cwd (rare, but
  // e.g. a cwd itself under /tmp/ for test isolation should not false-positive).
  return hits.filter((h) => {
    if (cwd && cwd.includes(h.replace(/^~\//, ""))) return false;
    return true;
  });
}

function isNonEmptyString(x) {
  return typeof x === "string" && x.trim().length > 0;
}

export function lintAgent(agent, { personaExists, locus }) {
  const errors = [];
  const warnings = [];

  if (!isNonEmptyString(agent.label)) errors.push(`spec-lint: ${locus} agent missing non-empty label`);
  if (!isNonEmptyString(agent.prompt)) errors.push(`spec-lint: ${locus} agent "${agent.label ?? "?"}" missing non-empty prompt`);

  if ("model" in agent && agent.model != null && !KNOWN_MODELS.includes(agent.model)) {
    errors.push(`spec-lint: ${locus} agent "${agent.label ?? "?"}" has unknown model "${agent.model}" (expected one of ${KNOWN_MODELS.join(", ")})`);
  }
  if ("effort" in agent && agent.effort != null && !KNOWN_EFFORTS.includes(agent.effort)) {
    errors.push(`spec-lint: ${locus} agent "${agent.label ?? "?"}" has unknown effort "${agent.effort}" (expected one of ${KNOWN_EFFORTS.join(", ")})`);
  }
  if ("permissionMode" in agent && agent.permissionMode != null && !KNOWN_PERMISSION_MODES.includes(agent.permissionMode)) {
    errors.push(`spec-lint: ${locus} agent "${agent.label ?? "?"}" has unknown permissionMode "${agent.permissionMode}" (expected one of ${KNOWN_PERMISSION_MODES.join(", ")})`);
  }

  if (agent.persona != null) {
    if (typeof personaExists === "function" && !personaExists(agent.persona)) {
      errors.push(`spec-lint: ${locus} agent "${agent.label ?? "?"}" references unknown persona "${agent.persona}"`);
    }
  }

  if ("skills" in agent && agent.skills != null) {
    const ok = Array.isArray(agent.skills) && agent.skills.every((s) => isNonEmptyString(s));
    if (!ok) errors.push(`spec-lint: ${locus} agent "${agent.label ?? "?"}" has invalid skills — must be an array of non-empty strings`);
  }

  const nonVault = findNonVaultPaths(agent.prompt, { cwd: agent.cwd });
  for (const hit of nonVault) {
    errors.push(`spec-lint: ${locus} agent "${agent.label ?? "?"}" prompt references non-vault path "${hit}" (allowlist: ~/JHD/, or paths under the agent's own cwd)`);
  }

  const floor = floorFor(agent);
  const effectiveMaxTurns = "maxTurns" in agent ? agent.maxTurns : undefined; // pre-default; caller applies defaults elsewhere
  const belowFloor = effectiveMaxTurns === null || (typeof effectiveMaxTurns === "number" && effectiveMaxTurns < floor);
  if (belowFloor && agent.maxTurnsOverride !== true) {
    errors.push(`spec-lint: ${locus} agent "${agent.label ?? "?"}" maxTurns ${effectiveMaxTurns === null ? "null" : effectiveMaxTurns} is below the ${agent.persona ?? "default"} floor of ${floor} — set maxTurns ≥ ${floor} or maxTurnsOverride: true`);
  }

  return { errors, warnings };
}

function lintVerify(verify, locus) {
  const errors = [];
  if (!verify) return { errors };
  if ("votes" in verify && !(Number.isInteger(verify.votes) && verify.votes > 0)) {
    errors.push(`spec-lint: ${locus} verify block has invalid votes "${verify.votes}" — must be a positive integer`);
  }
  if (!isNonEmptyString(verify.prompt) || !verify.prompt.includes("{{RESULT}}")) {
    errors.push(`spec-lint: ${locus} verify block prompt must be a non-empty string containing {{RESULT}}`);
  }
  return { errors };
}

// lintSpec(spec, { personaExists }) -> { errors, warnings }. personaExists is
// injected so this module never touches disk itself for that check — the
// caller (CLI entrypoint, or workflow.mjs's main block) decides how personas
// resolve.
export function lintSpec(spec, { personaExists } = {}) {
  const errors = [];
  const warnings = [];

  if (!spec || typeof spec !== "object") {
    return { errors: ["spec-lint: spec must be a JSON object"], warnings };
  }
  if (!isNonEmptyString(spec.name)) errors.push("spec-lint: spec missing non-empty name");
  if (!Array.isArray(spec.phases) || spec.phases.length === 0) {
    errors.push("spec-lint: spec must have a non-empty phases array");
    return { errors, warnings };
  }

  const seenLabels = new Map();

  spec.phases.forEach((phase, pIdx) => {
    const phaseLocus = `phase[${pIdx}]${phase?.title ? ` "${phase.title}"` : ""}`;
    if (!Array.isArray(phase.agents) || phase.agents.length === 0) {
      errors.push(`spec-lint: ${phaseLocus} must have a non-empty agents array`);
      return;
    }
    phase.agents.forEach((agent, aIdx) => {
      const locus = `${phaseLocus} agent[${aIdx}]`;
      const { errors: agentErrors, warnings: agentWarnings } = lintAgent(agent, { personaExists, locus });
      errors.push(...agentErrors);
      warnings.push(...agentWarnings);

      if (isNonEmptyString(agent.label)) {
        if (seenLabels.has(agent.label)) {
          // Cites the session-ID collision mechanism directly: workflow.mjs's
          // deterministicSessionId derives a session id from `${spec.name}:${label}`,
          // so a duplicate label anywhere in the spec re-addresses the same
          // Claude session as an earlier agent, silently colliding.
          errors.push(`spec-lint: duplicate label "${agent.label}" (${seenLabels.get(agent.label)} and ${locus}) — workflow.mjs's deterministicSessionId derives the session id from \`\${spec.name}:\${label}\`, so duplicate labels collide onto the same session`);
        } else {
          seenLabels.set(agent.label, locus);
        }
      }
    });

    if (phase.verify) {
      const { errors: verifyErrors } = lintVerify(phase.verify, phaseLocus);
      errors.push(...verifyErrors);
    }
  });

  return { errors, warnings };
}

// personaExistsOnDisk(persona, pluginRoot) -> boolean. The one place this
// module touches disk in library use — kept as a separate export so
// lintSpec/lintAgent stay pure and testable with an injected personaExists.
export function personaExistsOnDisk(persona, pluginRoot) {
  return existsSync(join(pluginRoot, "agents", `${persona}.md`));
}

function isMainModule() {
  return import.meta.url === `file://${process.argv[1]}`;
}

if (isMainModule()) {
  const specPath = process.argv[2];
  if (!specPath) { console.error("usage: workflow-lint <spec.json>"); process.exit(1); }
  const pluginRoot = join(process.cwd());
  let spec;
  try {
    spec = JSON.parse(readFileSync(specPath, "utf8"));
  } catch (err) {
    console.error(`✗ failed to parse spec JSON: ${err.message}`);
    process.exit(1);
  }
  const { errors, warnings } = lintSpec(spec, { personaExists: (p) => personaExistsOnDisk(p, pluginRoot) });
  for (const w of warnings) console.warn(`  ⚠ ${w}`);
  if (errors.length) {
    console.error(`✗ spec-lint failed (${errors.length} error(s)):`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log("✓ spec-lint passed");
  process.exit(0);
}
