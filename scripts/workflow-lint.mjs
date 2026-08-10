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

/* DO/DON'T contrast pair (operator ruling 2026-08-10,
   vault/fleet/rulings/2026-08-10-do-dont-pairs.md): "every standing ruling and
   every skill law carries at least one CONTRAST PAIR — a concrete DO (the
   compliant behavior in a real scenario) and a concrete DON'T (the violating
   behavior, ideally phrased as the exact reasoning a violator would use).
   Abstractions state the rule; the pair makes it unmistakable to a model
   mid-task."

   The ruling sets this severity itself — "Spec-lint treats a rulings entry
   without both pair fields as a warning" — and that is the right call: some
   rulings genuinely resist pairing, and only the author can tell which. A
   half pair warns about the half that's missing and nothing else, so a spec
   fixing one warning doesn't inherit the other's noise.                     */
function lintRulingPair(r, locus) {
  const hasDo = isNonEmptyString(r.do);
  const hasDont = isNonEmptyString(r.dont);
  if (hasDo && hasDont) return [];
  if (!hasDo && !hasDont) {
    return [`spec-lint: ${locus} has no DO/DON'T contrast pair — add \`do\` (one concrete compliant scenario) and \`dont\` (the violating one, ideally the exact reasoning a violator used). Abstractions state the rule; the pair is what makes it unmistakable to a model mid-task.`];
  }
  if (!hasDo) {
    return [`spec-lint: ${locus} has a \`dont\` but no \`do\` — half a pair leaves the compliant scenario to inference, which is the gap the pair exists to close. Add one concrete compliant scenario; the pair is what makes the rule unmistakable to a model mid-task.`];
  }
  return [`spec-lint: ${locus} has a \`do\` but no \`dont\` — the DON'T half is the one that catches a model mid-rationalisation, so make it the exact reasoning a violator used, not a restatement of the rule.`];
}

// lintRulings(rulings) -> { errors, warnings }. Pure. Absent field = no rulings
// to check (rule (a)/(c) below are what notice a spec that should have had one).
export function lintRulings(rulings) {
  const errors = [];
  const warnings = [];
  if (rulings == null) return { errors, warnings };
  if (!Array.isArray(rulings)) {
    errors.push("spec-lint: spec `rulings` must be an array of {id, source, text} entries");
    return { errors, warnings };
  }
  rulings.forEach((r, i) => {
    const locus = `rulings[${i}]${r && isNonEmptyString(r.id) ? ` "${r.id}"` : ""}`;
    if (!r || typeof r !== "object") {
      errors.push(`spec-lint: ${locus} must be an object with {id, source, text}`);
      return;
    }
    if (!isNonEmptyString(r.id)) errors.push(`spec-lint: ${locus} missing non-empty id`);
    if (!isNonEmptyString(r.source)) errors.push(`spec-lint: ${locus} missing non-empty source`);

    warnings.push(...lintRulingPair(r, locus));

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
  return { errors, warnings };
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

/* ---- protected checkouts and protected ports -----------------------------
   Two hazards from the operator's 2026-08-10 structural-enforcement triage,
   split on the same severity convention as everything above: the checkout rule
   is definitely wrong so it blocks; the port rules are heuristics so they warn
   and name the exact prompt.                                                */

// Checkouts the operator works in live. A dispatched agent that lands here
// will branch-switch and commit in the tree the operator is looking at —
// exactly the failure the worktree convention exists to prevent — and no
// legitimate spec needs it, so this one blocks rather than warns. Listed in
// every form a spec might write, rather than expanding ~ at lint time, so
// this module stays pure and its behaviour doesn't depend on whose $HOME
// runs it.
export const PROTECTED_CHECKOUTS = [
  "/Users/jarradharvey/JHD/portfolio",
  "~/JHD/portfolio",
  "$HOME/JHD/portfolio",
];

// The one carve-out: a git worktree nested inside the protected checkout is
// not the live tree, whichever container convention put it there.
const NESTED_WORKTREE_RE = /(^|\/)worktrees\//;

// protectedCheckoutHit(cwd) -> the protected root it lands in, or null.
// Compares on path SEGMENT boundaries, so the sibling checkout
// "~/JHD/portfolio-homeconcept" — which has a protected root as a raw string
// prefix — is not a hit.
export function protectedCheckoutHit(cwd) {
  if (!isNonEmptyString(cwd)) return null;
  const path = cwd.trim().replace(/\/+$/, "");
  for (const root of PROTECTED_CHECKOUTS) {
    if (path === root) return root;
    if (path.startsWith(`${root}/`)) {
      const rest = path.slice(root.length + 1);
      if (NESTED_WORKTREE_RE.test(`/${rest}`)) return null;
      return root;
    }
  }
  return null;
}

// Ports the operator owns and keeps running. :3210 is the portfolio dev server
// the fleet's own charters already fence off ("Verification servers you start
// run on :3211 and up — never the operator's live :3210", agents/engineer.md);
// :3288 and :3260 are the sibling live services named in the same triage.
export const PROTECTED_PORTS = ["3210", "3288", "3260"];

// The documented heuristic, deliberately crude: a protected port is fine to
// NAME — briefs should name it, to fence it off — so the flag fires unless the
// SAME SENTENCE also carries a leave-it-alone word. "Never touch :3210" reads
// clean; "reload :3210 to check" does not. A sentence is the unit because an
// exemption three sentences away doesn't govern the instruction that uses the
// port. False positives are the intended failure direction: a warning naming
// the prompt costs one look, and the miss it prevents costs the operator's
// running server.
const LEAVE_IT_RE = /\bnever\b|\bleave\b|\bdo not touch\b|\bdon'?t touch\b/i;

// A dev-server instruction with no port named anywhere in the prompt leaves
// the doer to pick one, and the one it picks is the one already running.
const DEV_SERVER_RE = /\bdev(?:elopment)?[ -]server\b|\bnpm run dev\b|\b(?:pnpm|yarn) dev\b/i;
const PORT_NAMED_RE = /\bport\s*:?\s*\d{2,5}\b|:\d{4}\b/;

function sentences(text) {
  return text.split(/(?<=[.!?\n])\s+/);
}

/* ---- worktree container convention ---------------------------------------
   Banked convention (memory sibling worktrees-live-in-container-folder): a
   worktree lives in a container — ~/JHD/worktrees/<repo>/<name> or
   ~/JHD/<repo>-worktrees/<name> — never as a loose <repo>-<name> sibling of
   the repo itself. A loose sibling reads to the operator as a second repo (it
   has happened), and nothing sweeps it, so it survives every prune.

   A warning, not a failure: the strays below are real, registered, and still
   dispatched into. This rule's job is to stop the population growing.        */

// The prefix must be a repo the fleet actually branches worktrees off, or the
// rule would fire on every hyphenated sibling repo — ~/JHD/claude-usage and
// ~/JHD/paperclip-lab are their own repos, not strays.
const WORKTREE_REPOS = ["portfolio", "discipline", "vault"];

// Registered stray worktrees that predate this rule. THEY MOVE AT THE NEXT
// PRUNE — when they do, delete the entry rather than letting the list grow;
// an allowlist that accretes is just the convention repealed slowly.
export const GRANDFATHERED_WORKTREE_STRAYS = [
  "portfolio-homeconcept",
  "portfolio-herotext-enter",
  "portfolio-transitions",
  "portfolio-adaptive",
];

// Siblings that match the loose shape but are permanent checkouts in their own
// right, not worktrees — ~/JHD/vault-archive is the archived vault, and its
// prefix collides with a real worktree repo. Distinct from the grandfather
// list above: these never move, so they never leave this constant.
const NON_WORKTREE_SIBLINGS = ["vault-archive"];

// Every spelling of the ~/JHD root a spec might write, for the same
// no-I/O-at-lint-time reason as PROTECTED_CHECKOUTS.
const JHD_ROOTS = ["/Users/jarradharvey/JHD/", "~/JHD/", "$HOME/JHD/"];

// looseWorktreeSibling(cwd) -> { dir, repo } for a cwd sitting in a loose
// <repo>-<name> sibling, or null. Only the first path segment under ~/JHD
// matters — a cwd deeper inside a stray is still inside that stray.
export function looseWorktreeSibling(cwd) {
  if (!isNonEmptyString(cwd)) return null;
  const path = cwd.trim().replace(/\/+$/, "");
  const root = JHD_ROOTS.find((r) => path.startsWith(r));
  if (!root) return null;
  const dir = path.slice(root.length).split("/")[0];
  if (!dir || !dir.includes("-")) return null;
  if (dir.endsWith("-worktrees")) return null;              // the container itself
  if (GRANDFATHERED_WORKTREE_STRAYS.includes(dir) || NON_WORKTREE_SIBLINGS.includes(dir)) return null;
  const repo = dir.slice(0, dir.indexOf("-"));
  if (!WORKTREE_REPOS.includes(repo)) return null;
  return { dir, repo };
}

// lintPromptServers(prompt, { locus, label }) -> { warnings }. Pure.
export function lintPromptServers(prompt, { locus, label } = {}) {
  const warnings = [];
  if (!isNonEmptyString(prompt)) return { warnings };
  const who = `${locus}${label ? ` "${label}"` : ""}`;

  if (DEV_SERVER_RE.test(prompt) && !PORT_NAMED_RE.test(prompt)) {
    warnings.push(`spec-lint: ${who} prompt tells the agent about a dev server but names no port — a doer left to choose reuses the one already running. State the port: doers verify on :3211 and up, the operator's :3210 is never started, stopped, or reused.`);
  }

  for (const sentence of sentences(prompt)) {
    if (LEAVE_IT_RE.test(sentence)) continue;
    for (const port of PROTECTED_PORTS) {
      if (!sentence.includes(port)) continue;
      warnings.push(`spec-lint: ${who} prompt names protected port ${port} in a sentence that is not a leave-it-running instruction ("${sentence.trim().slice(0, 80)}") — that port is the operator's live server. Point the agent at :3211+ instead, or say "never"/"leave"/"do not touch" in the same sentence.`);
    }
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
  warnings.push(...lintPromptServers(agent.prompt, { locus, label: agent.label }).warnings);

  const protectedRoot = protectedCheckoutHit(agent.cwd);
  if (protectedRoot) {
    errors.push(`spec-lint: ${locus} agent "${agent.label ?? "?"}" cwd "${agent.cwd}" is inside the protected live checkout ${protectedRoot} — agents work in a git worktree, never the operator's live checkout, because a dispatched branch-switch clobbers the tree the operator is looking at. Point cwd at a worktree.`);
  }

  const stray = looseWorktreeSibling(agent.cwd);
  if (stray) {
    warnings.push(`spec-lint: ${locus} agent "${agent.label ?? "?"}" cwd "${agent.cwd}" is a loose ${stray.repo}-<name> sibling — worktrees live in a container folder, ~/JHD/worktrees/${stray.repo}/<name> or ~/JHD/${stray.repo}-worktrees/<name>, so the operator doesn't read "${stray.dir}" as a second repo and the prune sweep can find it.`);
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
  // A refuter that reloads the operator's live server does the same damage a
  // doer would, so the server heuristics cover the verify prompt too.
  warnings.push(...lintPromptServers(verify.prompt, { locus: `${locus} verify block` }).warnings);
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

  const { errors: rulingErrors, warnings: rulingWarnings } = lintRulings(spec.rulings);
  errors.push(...rulingErrors);
  warnings.push(...rulingWarnings);

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
