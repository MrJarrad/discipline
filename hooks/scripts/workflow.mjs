#!/usr/bin/env node
/* workflow — deterministic multi-agent runner for Claude Code desktop.
   Orchestration as code, not willpower: phases run in order, agents within a
   phase run in parallel, every phase can carry a verify stage whose agents
   are prompted to REFUTE. Journal written next to the spec.

   Usage:  node workflow.mjs <spec.json>
   Spec:   { "name": "...",
             "rulings": [ { "id": "media-§6", "source": "vault/fleet/rulings/....md",
               "text": "the operative ruling QUOTED VERBATIM — not a summary, not a
                 citation",
               "do": "one concrete compliant scenario (optional, warned-on if absent)",
               "dont": "the violating scenario, ideally the exact reasoning a violator
                 used (optional, warned-on if absent)" } ]
                 (optional, top-level — see the rulings note below)
             "phases": [ { "title": "...",
             "agents": [{ "label": "...", "prompt": "...", "model": "haiku|sonnet|opus", "cwd": "...",
             "persona": "reviewer (optional — resolves <plugin root>/agents/<persona>.md, strips its
               YAML front-matter, and prepends the remaining body to the prompt as discipline context)",
             "allowedTools": "Bash(git:*) (optional, passed through as --allowedTools)",
             "disallowedTools": "Bash(rm:*) (optional, passed through as --disallowedTools)",
             "jsonSchema": "{...} or a path (optional, passed through as --json-schema)",
             "effort": "low|medium|high|xhigh (optional, passed through as --effort; haiku
               agents default to low when unset)",
             "permissionMode": "bypassPermissions|acceptEdits|plan|... (optional, defaults to
               bypassPermissions — set acceptEdits to restore mechanical tool denies for
               untrusted work)",
             "maxTurns": "50 (optional, passed through as --max-turns; defaults to 60 when
               unset — set explicit null to deliberately run uncapped)",
             "maxBudgetUsd": "5 (optional, passed through as --max-budget-usd)",
             "fallbackModel": "haiku (optional, passed through as --fallback-model)",
             "sessionId": "explicit UUID (optional — otherwise derived deterministically
               from `${spec.name}:${label}` so re-running the same spec re-addresses the
               same session)" }],
             "verify": { "prompt": "Refute: {{RESULT}}", "model": "haiku", "votes": 2 } } ] }
   Each agent runs `claude -p` headless with --output-format json. A verify
   stage spawns `votes` refuters per agent result; a result survives only if
   a majority do not refute. Nonzero exit or a truthy `is_error` in the parsed
   response is always treated as a hard failure, regardless of any text the
   agent printed. Every spawn always carries --append-system-prompt-file
   pointed at <plugin root>/operator-rules.md — the operator protocol is
   injected once here, not duplicated per prompt. Journal: <spec>.journal.jsonl

   Labels follow the persona-model convention, e.g. "engineer-sonnet:two-line" —
   <persona>-<model>:<short-task-tag> — so journal entries and console output
   name who ran the step and on what model at a glance.

   Default permission-mode is bypassPermissions (operator ruling 2026-07-26):
   dispatched specialists run with full read/write, no prompt friction. Under
   bypass, the deny fence below (git push, git reset --hard, rm -rf) is NOT
   mechanically enforced by the tool layer — those constraints hold only
   because (a) every brief's scope fence says "do NOT push" and (b) the
   reviewer gate sits before any merge. If a spec needs the mechanical denies
   back (untrusted work), set that agent's `permissionMode` to "acceptEdits".

   Every spawn also always carries --settings <plugin root>/runner-settings.json:
   standing tool-level allow/deny rights (Edit, Write, git checkout/add/commit/
   status/diff/log/branch, npx tsc, npm run typecheck, grep, rg allowed; git
   push, git reset --hard, rm -rf denied). This file still applies whenever a
   spec overrides permissionMode to something stricter than bypass (e.g.
   acceptEdits) — harmless and inert under bypass itself, but documents intent
   and gives the runner dispatch-level permissions without a repo-local
   settings file. Per-agent `allowedTools` in the spec is additive on top of
   this file, never a replacement for it.

   Standing rulings (operator ruling 2026-08-10): a spec's top-level `rulings`
   array carries governing operator rulings by their OWN WORDS. The runner
   prepends a "STANDING RULINGS — verbatim, binding:" block to EVERY agent
   prompt and EVERY verify prompt in the spec, immediately ahead of the brief
   body, and journals the ruling ids on every dispatch. The field exists
   because citation demonstrably failed: a 2026-08-07 brief named media §6
   and gave its vault path, and both the engineer and its reviewer still
   reproduced the forbidden hash-adjudication pattern — "clearly decision
   notes alone aren't cutting it." `text` is therefore contractually the
   ruling's operative sentences quoted verbatim; workflow-lint.mjs hard-fails
   a placeholder and warns when a prompt cites a ruling with no `rulings`
   field to back it. Specs without the field are entirely unaffected.

   Each ruling also carries a CONTRAST PAIR — `do` and `dont` — rendered as
   "DO: …" / "DON'T: …" lines beneath the quoted text, and journalled per
   dispatch as `rulingPairs: { <id>: both|do-only|dont-only|none }`. Operator
   ruling 2026-08-10 (vault/fleet/rulings/2026-08-10-do-dont-pairs.md):
   "Abstractions state the rule; the pair makes it unmistakable to a model
   mid-task." The `dont` is most useful when it quotes the exact reasoning a
   previous violator used, so the next agent recognises its own thought before
   acting on it. Both fields are optional and spec-lint only warns on a missing
   half — some rulings genuinely resist pairing.

   Housekeeping note: dispatched-repo .claude/journal.jsonl files (session
   journals a doer's own tooling may write inside the target repo) should be
   gitignored in that target repo — they're run-local scratch, not source.
   Similarly, capture artifacts (the listener family — capture-listener.mjs
   / capture-poll.mjs, now living in
   ~/JHD/figma-plugins/main/capture-figma/listener/ — output under
   ~/JHD/figma-plugins/main/capture-figma/captures/) must never land inside
   that plugin's own git-tracked source tree — they're written to the
   captures/ ground specifically so this distinction is structural, not
   just a gitignore rule, but keep it in mind if that ever changes.

   Burn defaults (operator ruling 2026-07-26, after a fleet burn drained a
   day's credit pool — see skills/model-routing/SKILL.md footnote): every
   agent gets a default `maxTurns` of DEFAULT_MAX_TURNS unless the spec sets
   its own; every haiku agent gets a default `effort` of "low" unless the
   spec sets its own. Both are spec-overridable, additive-only — an existing
   spec that already sets maxTurns/effort is untouched. A spec that wants a
   deliberately uncapped agent can still opt out by setting `"maxTurns":
   null` explicitly (the pre-existing "don't pass --max-turns" convention);
   doing so is exactly what the no-cap burn-warning below flags. Any spec
   that dispatches more than HEAVY_AGENT_THRESHOLD agents, or any agent on
   "opus" or explicitly opted out of the turn cap, gets a `burn-warning`
   journal entry (and a console.warn) so heavy runs are visible, not
   silent — this does not block the run.                                  */
import { readFileSync, appendFileSync, realpathSync } from "node:fs";
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const pluginRoot = dirname(dirname(scriptsDir));
const operatorRulesPath = join(pluginRoot, "operator-rules.md");
const runnerSettingsPath = join(pluginRoot, "runner-settings.json");

export const DEFAULT_MAX_TURNS = 60;
export const DEFAULT_HAIKU_EFFORT = "low";
export const HEAVY_AGENT_THRESHOLD = 6;

// Terminal states for a single agent run. "capped" is deliberately distinct
// from "failed" — an agent that ran out of turns may still have committed
// real work, so it needs its own signal, not a false negative.
export const OUTCOME = {
  SUCCESS: "success",
  FAILED: "failed",
  CAPPED: "capped",
  SPAWN_ERROR: "spawn-error",
};

// classifyOutcome({code, parsed, maxTurns}) — pure, no I/O. `parsed` is the
// JSON.parse of stdout (or null if it didn't parse as JSON). Capped always
// wins over a nonzero exit/is_error: running out of turns is a distinct
// terminal state from failing, and is checked first so it's never folded
// into "failed".
export function classifyOutcome({ code, parsed, maxTurns }) {
  if (code == null) return OUTCOME.SPAWN_ERROR;
  const numTurns = parsed?.num_turns;
  if (parsed?.subtype === "error_max_turns" || (maxTurns != null && numTurns != null && numTurns >= maxTurns)) {
    return OUTCOME.CAPPED;
  }
  if (code === 0 && parsed && !parsed.is_error) return OUTCOME.SUCCESS;
  return OUTCOME.FAILED;
}

// parseVerdict(text) — pure, no I/O. Extracts a refuter's real verdict from
// its free-text reply. Refuters are told to end with a literal last word,
// but qa-acceptance-style prompts (VERDICT REASONS sections) naturally end
// in prose instead, so a single "ends with CONFIRMED" regex miscounts a
// clear structured PASS as a refutation. Tried in priority order:
//   1. last-word CONFIRMED/REFUTED (the original, still-honored contract)
//   2. a "VERDICT: PASS|BLOCK" line anywhere (qa-acceptance/reviewer style,
//      tolerant of markdown bold markers around it)
//   3. a PASS/BLOCK verdict formation in the trailing 1000 chars (last one
//      wins, so a final restated verdict beats an earlier hedge)
// Ambiguous or absent verdicts fail closed to REFUTED (unchanged posture)
// but are tagged verdict:'unparsed' so the ambiguity is visible in the
// journal instead of silently swallowed.
export function parseVerdict(text) {
  const str = String(text ?? "");
  if (/CONFIRMED\s*$/.test(str)) return { confirmed: true, verdict: "CONFIRMED" };
  if (/REFUTED\s*$/.test(str)) return { confirmed: false, verdict: "REFUTED" };
  const lineMatch = str.match(/^\s*\**\s*VERDICT:\s*\**\s*(PASS|BLOCK)\s*\**\s*$/im);
  if (lineMatch) {
    const pass = lineMatch[1] === "PASS";
    return { confirmed: pass, verdict: pass ? "CONFIRMED" : "REFUTED" };
  }
  const tail = str.slice(-1000);
  const tailMatches = [...tail.matchAll(/\b(PASS|BLOCK)\b/g)];
  if (tailMatches.length) {
    const pass = tailMatches[tailMatches.length - 1][1] === "PASS";
    return { confirmed: pass, verdict: pass ? "CONFIRMED" : "REFUTED" };
  }
  return { confirmed: false, verdict: "unparsed" };
}

// Fills in spend-guardrail defaults an agent didn't set itself. Pure and
// additive: a key already present on `agent` (including an explicit `null`
// opting out of a cap) is never touched.
export function applyAgentDefaults(agent) {
  const out = { ...agent };
  if (!("maxTurns" in out)) out.maxTurns = DEFAULT_MAX_TURNS;
  if (out.model === "haiku" && !("effort" in out)) out.effort = DEFAULT_HAIKU_EFFORT;
  return out;
}

// Scans the raw (pre-default) spec for heavy-spend shapes worth surfacing:
// more than HEAVY_AGENT_THRESHOLD agents total, any opus agent, or any agent
// that explicitly opted out of the turn cap (`"maxTurns": null`). Returns an
// array of human-readable warning strings; empty when nothing is heavy.
export function collectBurnWarnings(spec) {
  const warnings = [];
  const allAgents = spec.phases.flatMap((p) => p.agents);
  if (allAgents.length > HEAVY_AGENT_THRESHOLD) {
    warnings.push(`spec dispatches ${allAgents.length} agents (> ${HEAVY_AGENT_THRESHOLD}) — heavy run`);
  }
  for (const a of allAgents) {
    const label = a.label ?? "(unlabeled)";
    if (a.model === "opus") warnings.push(`opus agent dispatched: ${label}`);
    if ("maxTurns" in a && a.maxTurns == null) warnings.push(`no-cap agent (maxTurns disabled): ${label}`);
  }
  return warnings;
}

// Throws on a missing persona file — spec-lint (workflow-lint.mjs) is meant
// to catch this before dispatch by checking personaExists(); this throw is
// the backstop for a spec that skipped lint (or a persona deleted between
// lint and dispatch), so a run never silently proceeds without the
// discipline context it was supposed to carry.
export function loadPersona(persona) {
  const path = join(pluginRoot, "agents", `${persona}.md`);
  const raw = readFileSync(path, "utf8");
  return raw.replace(/^---\n[\s\S]*?\n---\n/, "");
}

// buildSkillPreamble(["quality", "test-first"]) -> mandate string, or "" for
// an empty/undefined list. Pure — no I/O, no persona/prompt knowledge — so
// ordering (persona -> skill mandate -> task) can be asserted independent of
// where the persona body or task prompt come from.
export function buildSkillPreamble(skills) {
  if (!skills || skills.length === 0) return "";
  const list = skills.join(", ");
  return `MANDATORY SKILLS: Before starting work you MUST invoke the Skill tool for each of: ${list}. Do not begin the task until each has been loaded.`;
}

// Header framing for the standing-rulings block. Exported so spec-lint, the
// tests, and any future consumer assert against one literal rather than
// re-typing the wording.
export const RULINGS_HEADER = "STANDING RULINGS — verbatim, binding:";

// buildRulingsBlock([{id, source, text, do?, dont?}]) -> framed block string,
// or "" for an empty/undefined list. Pure — no I/O, no persona/prompt knowledge.
//
// Why the runner carries ruling TEXT and not a citation (operator, 2026-08-10,
// after the media §6 hash-adjudication violation recurred): "clearly decision
// notes alone aren't cutting it." The violated brief named §6 and gave its
// vault path; the engineer AND its reviewer both read it and still reproduced
// the forbidden pattern. A name delegates interpretation to the reader; the
// ruling's own sentences in the prompt constrain it. So `text` is contractually
// the operative ruling QUOTED verbatim — spec-lint hard-fails a placeholder —
// and this function never summarises, truncates, or reflows it.
//
// `do` / `dont` are the ruling's CONTRAST PAIR (operator ruling 2026-08-10,
// vault/fleet/rulings/2026-08-10-do-dont-pairs.md): "Abstractions state the
// rule; the pair makes it unmistakable to a model mid-task." They render
// BENEATH the quoted text — the quote is the ruling, the pair is how it cashes
// out in a real scenario, and inverting that order would let a reader take the
// example for the rule. Both are optional (spec-lint warns, never fails, on a
// missing half: some rulings genuinely resist pairing), and a ruling with
// neither renders byte-identically to how it did before these fields existed.
export function buildRulingsBlock(rulings) {
  if (!Array.isArray(rulings) || rulings.length === 0) return "";
  const entries = rulings.map((r) => {
    const lines = [`[${r.id}] source: ${r.source}`, r.text];
    if (isNonEmptyString(r.do)) lines.push(`DO: ${r.do.trim()}`);
    if (isNonEmptyString(r.dont)) lines.push(`DON'T: ${r.dont.trim()}`);
    return lines.join("\n");
  }).join("\n\n");
  return `${RULINGS_HEADER}\n\n${entries}\n\n` +
    "The text above is quoted verbatim from standing operator rulings and binds this task " +
    "absolutely. Comply with it as written — a paraphrase, a \"materially similar\" outcome, " +
    "or your own judgement about when it applies is NOT compliance. If a ruling appears to " +
    "conflict with the task below, STOP and surface the conflict; never resolve it yourself. " +
    "Any DO/DON'T lines are that ruling's concrete contrast pair: the DO is compliant " +
    "behaviour in a real scenario, and the DON'T line is the actual reasoning a previous " +
    "agent used to talk itself into the breach. If your own reasoning starts to sound like " +
    "a DON'T line, you are already in breach — stop there.";
}

function isNonEmptyString(x) {
  return typeof x === "string" && x.trim().length > 0;
}

// pairPresence(ruling) -> "both" | "do-only" | "dont-only" | "none". The
// journal's record of how much of the contrast pair a dispatch actually
// carried; kept next to buildRulingsBlock so the two read the same fields.
export function pairPresence(ruling) {
  const hasDo = isNonEmptyString(ruling?.do);
  const hasDont = isNonEmptyString(ruling?.dont);
  if (hasDo && hasDont) return "both";
  if (hasDo) return "do-only";
  if (hasDont) return "dont-only";
  return "none";
}

// Persona -> skill mandate -> rulings -> task, in that order. Throws (via
// loadPersona) when `persona` is set but its file is missing — spec-lint is
// meant to catch this before dispatch; this throw is the backstop for a spec
// that skipped lint, surfacing as a rejected runClaude() rather than a
// silently degraded prompt.
//
// Rulings sit LAST before the brief body deliberately: they are the constraint
// the brief is read under, so they get the position immediately adjacent to
// the task rather than being buried above a long persona charter.
function composePrompt(prompt, persona, skills, rulings) {
  const preamble = buildSkillPreamble(skills);
  const rulingsBlock = buildRulingsBlock(rulings);
  const taskBlock = `${preamble ? `${preamble}\n\n---\n` : ""}` +
    `${rulingsBlock ? `${rulingsBlock}\n\n---\n` : ""}TASK:\n${prompt}`;
  if (!persona) return taskBlock;
  const body = loadPersona(persona);
  return `You are operating as the ${persona} persona. Your discipline:\n${body}\n\n---\n${taskBlock}`;
}

/* Deterministic UUID (v5-shaped) from a seed string, so re-running the same
   spec re-addresses the same session without an external ID map. */
function deterministicSessionId(seed) {
  const hash = createHash("sha1").update(seed).digest("hex").slice(0, 32);
  const bytes = hash.match(/.{2}/g);
  bytes[6] = ((parseInt(bytes[6], 16) & 0x0f) | 0x50).toString(16).padStart(2, "0"); // version 5
  bytes[8] = ((parseInt(bytes[8], 16) & 0x3f) | 0x80).toString(16).padStart(2, "0"); // RFC 4122 variant
  const hex = bytes.join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/* Section-5 env block: pins doer bash cwd, keeps stages foreground and
   deterministic, sizes bash output to avoid truncation, and stops repo
   agents from writing memory the vault doesn't track. */
const spawnEnv = {
  ...process.env,
  CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR: "1",
  CLAUDE_AFK_TIMEOUT_MS: "0",
  CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: "1",
  CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1",
  BASH_MAX_OUTPUT_LENGTH: "150000",
};

// Pure argv builder — no I/O, no spec/session knowledge — so the actual
// flags a set of agent options resolves to (including the burn defaults
// above) can be asserted on directly, without spawning a real `claude`.
export function buildArgs({
  prompt, model = "sonnet", allowedTools, disallowedTools,
  jsonSchema, effort, permissionMode = "bypassPermissions", maxTurns, maxBudgetUsd, fallbackModel,
  sessionId, pluginDir,
}) {
  const args = [
    "-p", prompt,
    "--model", model,
    "--output-format", "json",
    "--permission-mode", permissionMode,
    "--append-system-prompt-file", operatorRulesPath,
    "--settings", runnerSettingsPath,
  ];
  if (allowedTools) args.push("--allowedTools", allowedTools);
  if (disallowedTools) args.push("--disallowedTools", disallowedTools);
  if (jsonSchema) args.push("--json-schema", jsonSchema);
  if (effort) args.push("--effort", effort);
  if (maxTurns != null) args.push("--max-turns", String(maxTurns));
  if (maxBudgetUsd != null) args.push("--max-budget-usd", String(maxBudgetUsd));
  if (fallbackModel) args.push("--fallback-model", fallbackModel);
  if (sessionId) args.push("--session-id", sessionId);
  // Session-only alternate plugin root (T1 spike, eval-harness-shape
  // §5.3/§9 S3) — never installs/registers a plugin, just points this one
  // invocation at a different skills/ tree. Used by skill-eval.mjs's
  // baseline arm to dispatch against a pre-change plugin worktree.
  if (pluginDir) args.push("--plugin-dir", pluginDir);
  return args;
}

// Max bytes of stderr retained per spawn — enough for a useful failure tail
// without letting a runaway process grow an unbounded in-memory buffer or
// stall waiting on a full OS pipe (the pipe-fill stall this constant fixes).
export const STDERR_TAIL_BYTES = 64 * 1024;

// runClaude(agent, specName, opts) — spawnImpl is an injectable seam so tests
// can drive the full lifecycle (stdout/stderr/close/error) without touching
// a real `claude` binary. timeoutMs, when set, SIGTERMs the child and, if it
// hasn't exited within 10s of that, SIGKILLs it; the outcome records a
// timeout note either way.
export function runClaude({
  prompt, model = "sonnet", cwd = process.cwd(), allowedTools, disallowedTools, persona, skills,
  jsonSchema, effort, permissionMode = "bypassPermissions", maxTurns, maxBudgetUsd, fallbackModel,
  sessionId, label, pluginDir, sessionSalt, rulings,
}, specName, { spawnImpl = spawn, timeoutMs } = {}) {
  return new Promise((resolve) => {
    const finalPrompt = composePrompt(prompt, persona, skills, rulings);
    // sessionSalt (optional, additive-only) lets a caller that dispatches the
    // same spec name + label across separate --live invocations (skill-eval's
    // candidate/baseline arms, run repeatedly) avoid colliding on the same
    // deterministic session id. Omitted entirely, the seed — and therefore
    // buildArgs' output — is byte-identical to before this option existed,
    // preserving legitimate resume/dedup semantics for every other spec.
    const seed = `${specName}:${label}${sessionSalt ? `:${sessionSalt}` : ""}`;
    const resolvedSessionId = sessionId ?? (label ? deterministicSessionId(seed) : undefined);
    const args = buildArgs({
      prompt: finalPrompt, model, allowedTools, disallowedTools, jsonSchema, effort,
      permissionMode, maxTurns, maxBudgetUsd, fallbackModel, sessionId: resolvedSessionId, pluginDir,
    });

    const startedAt = Date.now();
    const child = spawnImpl("claude", args, { cwd, env: spawnEnv, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let errTail = "";
    let settled = false;
    let timedOut = false;
    let timeoutTimer;
    let killTimer;

    const clearTimers = () => {
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (killTimer) clearTimeout(killTimer);
    };

    if (timeoutMs) {
      timeoutTimer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
        killTimer = setTimeout(() => child.kill("SIGKILL"), 10_000);
      }, timeoutMs);
    }

    const finish = (partial) => {
      if (settled) return;
      settled = true;
      clearTimers();
      resolve({ sessionId: resolvedSessionId, durationMs: Date.now() - startedAt, timedOut, errTail, ...partial });
    };

    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => {
      errTail = (errTail + d).slice(-STDERR_TAIL_BYTES);
    });
    // Spawn failure (e.g. binary not found) previously left the promise
    // pending forever — this settles it as a hard, explicit failure.
    child.on("error", (err) => {
      finish({ ok: false, outcome: OUTCOME.SPAWN_ERROR, result: `spawn error: ${err.message}` });
    });
    child.on("close", (code) => {
      try {
        const parsed = JSON.parse(out);
        // Nonzero exit or a truthy is_error is always a hard failure, no
        // exceptions — the exit code (or is_error flag) is the ground truth,
        // never text the agent happened to print.
        const outcome = classifyOutcome({ code, parsed, maxTurns });
        finish({
          ok: outcome === OUTCOME.SUCCESS,
          outcome,
          result: parsed.result ?? out,
          numTurns: parsed.num_turns,
          costUsd: parsed.total_cost_usd ?? parsed.cost_usd,
        });
      }
      catch {
        const outcome = classifyOutcome({ code, parsed: null, maxTurns });
        finish({ ok: outcome === OUTCOME.SUCCESS, outcome, result: out.trim() });
      }
    });
  });
}

function formatDuration(ms) {
  if (ms == null) return "?";
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}m${String(s).padStart(2, "0")}s`;
}

function logDispatch(a) {
  console.log(`  → dispatch: ${a.label} (${a.model ?? "sonnet"}, maxTurns ${a.maxTurns ?? "uncapped"})`);
}

function logCompletion(r) {
  const turns = r.numTurns != null ? `${r.numTurns}${r.maxTurns != null ? `/${r.maxTurns}` : ""} turns` : "? turns";
  const dur = formatDuration(r.durationMs);
  const cost = r.costUsd != null ? `$${r.costUsd.toFixed(2)}` : "$?";
  if (r.outcome === OUTCOME.SUCCESS) {
    console.log(`  ✓ done: ${r.label} (success, ${turns}, ${dur}, ${cost})`);
  } else if (r.outcome === OUTCOME.CAPPED) {
    console.log(`  ⚠ capped: ${r.label} (${turns} — work may be committed, inspect session ${r.sessionId})`);
  } else if (r.outcome === OUTCOME.SPAWN_ERROR) {
    console.log(`  ✗ failed: ${r.label} (spawn-error — ${r.result})`);
  } else {
    console.log(`  ✗ failed: ${r.label} (${turns}, ${dur}${r.errTail ? ` — stderr: ${r.errTail.slice(-300)}` : ""})`);
  }
}

export async function runWorkflow(spec, log, { spawnImpl } = {}) {
  for (const warning of collectBurnWarnings(spec)) {
    console.warn(`  ⚠ ${warning}`);
    log({ type: "burn-warning", message: warning });
  }

  // Spec-level standing rulings ride into every dispatch this run makes —
  // doers and refuters alike. The refuter half is not an afterthought: the
  // 2026-08-07 media §6 breach was waved through by a reviewer that had been
  // dispatched without the ruling's text, so a verify stage blind to the
  // rulings is exactly the hole this closes.
  const rulings = Array.isArray(spec.rulings) && spec.rulings.length ? spec.rulings : undefined;
  const rulingIds = rulings?.map((r) => r.id);
  // Pair presence, journalled per dispatch alongside the ids: an audit of a
  // finished run can then answer "was this agent shown the ruling's contrast
  // pair, or only its abstraction?" without re-reading a spec that may have
  // moved on since. Recorded per ruling id rather than as a single boolean
  // because a half pair is a real, distinct state that spec-lint warns about.
  const rulingPairs = rulings && Object.fromEntries(rulings.map((r) => [r.id, pairPresence(r)]));

  const summary = [];
  let anyFailed = false;
  let anyCapped = false;
  for (const phase of spec.phases) {
    console.log(`▸ ${phase.title} (${phase.agents.length} agents)`);
    log({ type: "phase", title: phase.title });
    const results = await Promise.all(phase.agents.map(async (rawAgent) => {
      const a = { ...applyAgentDefaults(rawAgent), rulings };
      logDispatch(a);
      const r = await runClaude(a, spec.name, { spawnImpl, timeoutMs: a.timeoutMs });
      const full = { ...a, ...r };
      logCompletion(full);
      log({
        type: "agent", label: a.label, ok: r.ok, outcome: r.outcome, sessionId: r.sessionId,
        numTurns: r.numTurns, maxTurns: a.maxTurns, costUsd: r.costUsd, durationMs: r.durationMs,
        rulings: rulingIds, rulingPairs, result: r.result?.slice?.(0, 4000),
      });
      return full;
    }));
    let kept = results.filter((x) => x.outcome === OUTCOME.SUCCESS);
    const capped = results.filter((x) => x.outcome === OUTCOME.CAPPED);
    const failed = results.filter((x) => x.outcome === OUTCOME.FAILED || x.outcome === OUTCOME.SPAWN_ERROR);
    if (capped.length) anyCapped = true;
    if (failed.length) anyFailed = true;
    if (phase.verify) {
      const survivors = [];
      for (const r of kept) {
        const v = phase.verify;
        const votes = await Promise.all(Array.from({ length: v.votes ?? 2 }, () =>
          runClaude(applyAgentDefaults({
            prompt: v.prompt.replaceAll("{{RESULT}}", String(r.result).slice(0, 6000)) +
              '\nReply with exactly REFUTED or CONFIRMED as your last word.',
            model: v.model ?? "haiku",
            cwd: r.cwd,
            // Verify (refuter) agents deliberately do NOT inherit the doer's
            // persona/tools/permissionMode/maxTurns — they're independent
            // adversarial checks, only the fields explicitly set here apply.
            persona: v.persona,
            allowedTools: v.allowedTools,
            permissionMode: v.permissionMode,
            maxTurns: v.maxTurns,
            // Standing rulings are the one thing a refuter DOES inherit from
            // the spec: they bind the whole run, and a refuter that can't see
            // them can't refute a breach of them.
            rulings,
          }), spec.name, { spawnImpl, timeoutMs: v.timeoutMs })));
        const parsedVotes = votes.map((vt) => parseVerdict(vt.result));
        const confirmed = parsedVotes.filter((p) => p.confirmed).length;
        const survives = confirmed > votes.length / 2;
        const result = votes.map((vt) => String(vt.result ?? "")).join("\n---\n").slice(0, 4000);
        log({
          type: "verify", label: r.label, confirmed, of: votes.length, survives,
          verdicts: parsedVotes.map((p) => p.verdict), rulings: rulingIds, rulingPairs, result,
        });
        if (survives) survivors.push(r); else console.log(`  ✗ refuted: ${r.label}`);
      }
      kept = survivors;
    }
    summary.push({ phase: phase.title, ran: results.length, survived: kept.length, capped: capped.length, failed: failed.length });
  }
  const totals = {
    ran: summary.reduce((n, s) => n + s.ran, 0),
    survived: summary.reduce((n, s) => n + s.survived, 0),
    capped: summary.reduce((n, s) => n + s.capped, 0),
    failed: summary.reduce((n, s) => n + s.failed, 0),
  };
  console.log(JSON.stringify({ name: spec.name, summary, totals }, null, 2));
  log({ type: "done", summary, totals });
  const exitCode = anyFailed ? 1 : anyCapped ? 2 : 0;
  return { summary, totals, exitCode };
}

// realpath-normalizes both sides before comparing: import.meta.url resolves
// symlinks (e.g. macOS's /tmp -> /private/tmp) while process.argv[1] does
// not, so a script invoked through a symlinked path used to fail this check
// and silently no-op its CLI block. Falls back to the raw path if realpath
// itself fails (e.g. a path that no longer exists).
function isMainModule() {
  const realpath = (p) => {
    try {
      return realpathSync(p);
    } catch {
      return p;
    }
  };
  const invoked = process.argv[1];
  return Boolean(invoked) && realpath(fileURLToPath(import.meta.url)) === realpath(invoked);
}

// Duplicated (not imported) from session-bootstrap.mjs:222-237's
// resolveTokens pattern, with provenance noted here: the OAuth token needs
// resolving the same way (env first, then sourcing ~/.zshrc) before any
// dispatch, but this module intentionally has no dependency on
// session-bootstrap.mjs's other bootstrap concerns (listener/dev-server/etc).
export function resolveOAuthToken({ execFileImpl = execFileSync } = {}) {
  if (process.env.CLAUDE_CODE_OAUTH_TOKEN) return process.env.CLAUDE_CODE_OAUTH_TOKEN;
  try {
    const out = execFileImpl("zsh", ["-c", "source ~/.zshrc >/dev/null 2>&1; printf '%s' $CLAUDE_CODE_OAUTH_TOKEN"], { encoding: "utf8" });
    const token = String(out).trim();
    return token || null;
  } catch {
    return null;
  }
}

if (isMainModule()) {
  const specPath = process.argv[2];
  if (!specPath) { console.error("usage: workflow <spec.json>"); process.exit(1); }

  let spec;
  try {
    spec = JSON.parse(readFileSync(specPath, "utf8"));
  } catch (err) {
    console.error(`✗ failed to parse spec JSON at ${specPath}: ${err.message}`);
    process.exit(1);
  }

  const { lintSpec, personaExistsOnDisk } = await import("./workflow-lint.mjs");
  const lint = lintSpec(spec, { personaExists: (p) => personaExistsOnDisk(p, pluginRoot) });
  if (lint.errors.length) {
    console.error(`✗ spec-lint failed (${lint.errors.length} error(s)):`);
    for (const e of lint.errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  for (const w of lint.warnings) console.warn(`  ⚠ ${w}`);

  const token = resolveOAuthToken();
  if (!token) {
    console.error("✗ CLAUDE_CODE_OAUTH_TOKEN not found in env or ~/.zshrc — cannot dispatch any agent.");
    process.exit(1);
  }
  process.env.CLAUDE_CODE_OAUTH_TOKEN = token;

  const journalPath = specPath.replace(/\.json$/, "") + ".journal.jsonl";
  const log = (e) => appendFileSync(journalPath, JSON.stringify({ t: new Date().toISOString(), ...e }) + "\n");
  const { exitCode } = await runWorkflow(spec, log);
  process.exit(exitCode);
}
