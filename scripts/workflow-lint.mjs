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

// Substrings whose presence inside a path *token* (not the raw prompt) marks
// it as worth flagging — checked against the whole token so a match deep
// inside an allowlisted path (e.g. "tmp" inside "~/JHD/vault/scripts/tmp/")
// doesn't fire in isolation; see isAllowlisted below for the actual guard.
const NON_VAULT_MARKERS = [
  "~/Downloads",
  "~/Desktop",
  "~/Documents",
  "/tmp/",
  "$HOME/Downloads",
  "$HOME/Desktop",
  "$HOME/Documents",
];

// Session-scratchpad convention (operator decision, 2026-08-01): both the
// legacy /tmp/claude-*/ form and the /private/tmp/claude-*/ form (macOS
// resolves /tmp -> /private/tmp) are scratch workspace, not an unfiled
// intake artifact — the lint rule's intent is catching ~/Downloads/
// ~/Desktop stray files, not banning scratch-path references.
const SCRATCHPAD_RE = /^(\/private)?\/tmp\/claude-/;

// Extracts path-like tokens from a prompt: runs of non-whitespace containing
// at least one "/", optionally preceded by ~ or $HOME. This is the unit
// findNonVaultPaths reasons about — a token, not a bare substring — so a
// prefix check can tell "/tmp/" starting a path from "/tmp/" merely
// appearing partway through an allowlisted one.
function extractPathTokens(prompt) {
  const re = /(?:~|\$HOME)?\/?[\w.-]+(?:\/[\w.-]+)*\/?/g;
  const candidates = prompt.match(re) || [];
  return candidates.filter((t) => t.includes("/"));
}

function isAllowlisted(token, cwd) {
  if (token.startsWith("~/JHD/")) return true;
  if (SCRATCHPAD_RE.test(token)) return true;
  if (cwd && (token.startsWith(cwd) || cwd.includes(token))) return true;
  return false;
}

// findNonVaultPaths(prompt, { cwd }) -> array of full path tokens that cite
// a location outside the vault/allowed cwd. Works on whole path tokens
// (extractPathTokens), not bare substring matches, so a marker like "/tmp/"
// only flags when it's genuinely the start of a non-allowlisted path —
// never when it merely appears inside an allowlisted one (e.g.
// "~/JHD/vault/scripts/tmp/output.log", a session scratchpad path under
// /private/tmp/claude-*/, or a path under the agent's own cwd).
export function findNonVaultPaths(prompt, { cwd } = {}) {
  if (!prompt) return [];
  const tokens = extractPathTokens(prompt);
  const hits = [];
  for (const token of tokens) {
    const flagged = NON_VAULT_MARKERS.some((marker) => token.includes(marker));
    if (!flagged) continue;
    if (isAllowlisted(token, cwd)) continue;
    hits.push(token);
  }
  return hits;
}

function isNonEmptyString(x) {
  return typeof x === "string" && x.trim().length > 0;
}

/* ---- standing rulings ----------------------------------------------------
   Operator ruling 2026-08-10, after the media §6 hash-adjudication breach
   recurred despite the brief citing §6 by name AND vault path: "clearly
   decision notes alone aren't cutting it." The runner injects a spec's
   top-level `rulings` verbatim into every prompt (workflow.mjs
   buildRulingsBlock); these rules are the static half — they make the
   difference between quoting a ruling and merely naming one visible before
   any agent is dispatched.

   Severity split follows the maxTurns-floor lint's convention: a state that
   is definitely wrong is an error, a state that is probably wrong but has
   legitimate exceptions is a warning naming the exact locus so the author can
   judge. A `rulings` entry that doesn't carry the ruling's words is the
   former — it looks like compliance while delegating interpretation, which is
   the precise failure mode being closed. A prompt that merely mentions a
   ruling is the latter: prose mentions are legitimate.                     */

// A verbatim operative ruling is prose. Fewer than this many words means the
// author pasted a citation, a path, or a stub — not the ruling's own
// sentences. Chosen as a shape test rather than a character count so short
// but real rulings ("Replace all media, unconditionally.") still pass.
export const RULING_MIN_WORDS = 3;

// Stub markers that mean "text to be filled in later". Deliberately narrow —
// these tokens have no place inside a quoted operator ruling, so a match is
// unambiguous rather than a heuristic.
const RULING_PLACEHOLDER_RE = /\b(TODO|TBD|FIXME|TK|XXX|placeholder|paste .{0,20}here|quote .{0,20}here)\b/i;

// A whole text wrapped in angle brackets is a fill-me-in slot (<quote here>),
// never a real quote.
const RULING_STUB_WRAP_RE = /^<[^>]*>$/;

// lintRulings(rulings) -> { errors }. Pure. Absent field = no rulings to check
// (rule (a)/(c) below are what notice a spec that should have had one).
export function lintRulings(rulings) {
  const errors = [];
  if (rulings == null) return { errors };
  if (!Array.isArray(rulings)) {
    errors.push("spec-lint: spec `rulings` must be an array of {id, source, text} entries");
    return { errors };
  }
  rulings.forEach((r, i) => {
    const locus = `rulings[${i}]${r && isNonEmptyString(r.id) ? ` "${r.id}"` : ""}`;
    if (!r || typeof r !== "object") {
      errors.push(`spec-lint: ${locus} must be an object with {id, source, text}`);
      return;
    }
    if (!isNonEmptyString(r.id)) errors.push(`spec-lint: ${locus} missing non-empty id`);
    if (!isNonEmptyString(r.source)) errors.push(`spec-lint: ${locus} missing non-empty source`);

    if (typeof r.text !== "string" || r.text.trim().length === 0) {
      errors.push(`spec-lint: ${locus} has empty text — \`text\` must be the ruling's operative sentences quoted verbatim, not a citation`);
      return;
    }
    const text = r.text.trim();
    if (RULING_PLACEHOLDER_RE.test(text) || RULING_STUB_WRAP_RE.test(text)) {
      errors.push(`spec-lint: ${locus} text is a placeholder ("${text.slice(0, 40)}") — quote the ruling's operative sentences verbatim`);
      return;
    }
    if (text.split(/\s+/).length < RULING_MIN_WORDS) {
      errors.push(`spec-lint: ${locus} text ("${text.slice(0, 60)}") is too short to be a verbatim quote — a name, path, or section number is a citation, and a citation is not compliance`);
    }
  });
  return { errors };
}

// Rule (a) trigger: the prompt talks about a governing ruling — either a
// §-style section citation or the word itself. This is exactly the shape of
// the brief that failed: it named "media §6" and gave the vault path.
const RULING_CITATION_RE = /§|\brulings?\b/i;

// Rule (c) trigger: work types the media-replacement ruling governs. Kept
// literal and narrow so it flags the known-dangerous shapes rather than
// guessing at work types no ruling covers.
const MEDIA_WORK_RE = /ingest|media drop|replace/i;

// The one ruling the (c) heuristic knows by name, so the warning tells the
// author WHICH ruling to go quote instead of leaving them to search.
const MEDIA_RULING_CITE =
  'media §6 "Asset replacement is UNCONDITIONAL" (vault/fleet/rulings/2026-08-06-design-contract-and-media-replacement.md)';

// lintPromptRulings(prompt, { locus, label, specHasRulings }) -> { warnings }.
// Pure. Warnings, never errors: a prompt may legitimately discuss a ruling in
// prose, and the work-type match is a heuristic. Each warning names the exact
// prompt so the author can dismiss it in one look.
export function lintPromptRulings(prompt, { locus, label, specHasRulings }) {
  const warnings = [];
  if (specHasRulings || !isNonEmptyString(prompt)) return { warnings };
  const who = `${locus}${label ? ` "${label}"` : ""}`;

  if (RULING_CITATION_RE.test(prompt)) {
    warnings.push(`spec-lint: ${who} prompt cites a ruling (§ or the word "ruling") but the spec has no \`rulings\` field — a name/path citation is not compliance; quote the ruling's operative sentences verbatim in spec.rulings so the runner injects them`);
  }
  const workMatch = prompt.match(MEDIA_WORK_RE);
  if (workMatch) {
    warnings.push(`spec-lint: ${who} prompt looks like media/replacement work (matched "${workMatch[0]}") and the spec has no \`rulings\` field — ${MEDIA_RULING_CITE} very likely binds it; quote it verbatim in spec.rulings`);
  }
  return { warnings };
}

export function lintAgent(agent, { personaExists, locus, specHasRulings }) {
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

  warnings.push(...lintPromptRulings(agent.prompt, { locus, label: agent.label, specHasRulings }).warnings);

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

function lintVerify(verify, locus, { specHasRulings } = {}) {
  const errors = [];
  const warnings = [];
  if (!verify) return { errors, warnings };
  if ("votes" in verify && !(Number.isInteger(verify.votes) && verify.votes > 0)) {
    errors.push(`spec-lint: ${locus} verify block has invalid votes "${verify.votes}" — must be a positive integer`);
  }
  if (!isNonEmptyString(verify.prompt) || !verify.prompt.includes("{{RESULT}}")) {
    errors.push(`spec-lint: ${locus} verify block prompt must be a non-empty string containing {{RESULT}}`);
  }
  // The refuter half matters as much as the doer half: the 2026-08-07 §6
  // breach was waved through by a reviewer whose own prompt named the ruling
  // without carrying its text.
  warnings.push(...lintPromptRulings(verify.prompt, { locus: `${locus} verify block`, specHasRulings }).warnings);
  return { errors, warnings };
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

  const { errors: rulingErrors } = lintRulings(spec.rulings);
  errors.push(...rulingErrors);

  if (!Array.isArray(spec.phases) || spec.phases.length === 0) {
    errors.push("spec-lint: spec must have a non-empty phases array");
    return { errors, warnings };
  }

  const seenLabels = new Map();
  // "Has rulings" means "the runner will actually inject something" — an
  // absent field and an empty array are the same thing to a dispatched agent.
  const specHasRulings = Array.isArray(spec.rulings) && spec.rulings.length > 0;

  spec.phases.forEach((phase, pIdx) => {
    const phaseLocus = `phase[${pIdx}]${phase?.title ? ` "${phase.title}"` : ""}`;
    if (!Array.isArray(phase.agents) || phase.agents.length === 0) {
      errors.push(`spec-lint: ${phaseLocus} must have a non-empty agents array`);
      return;
    }
    phase.agents.forEach((agent, aIdx) => {
      const locus = `${phaseLocus} agent[${aIdx}]`;
      const { errors: agentErrors, warnings: agentWarnings } = lintAgent(agent, { personaExists, locus, specHasRulings });
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
      const { errors: verifyErrors, warnings: verifyWarnings } = lintVerify(phase.verify, phaseLocus, { specHasRulings });
      errors.push(...verifyErrors);
      warnings.push(...verifyWarnings);
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
