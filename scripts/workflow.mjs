#!/usr/bin/env node
/* workflow — deterministic multi-agent runner for Claude Code desktop.
   Orchestration as code, not willpower: phases run in order, agents within a
   phase run in parallel, every phase can carry a verify stage whose agents
   are prompted to REFUTE. Journal written next to the spec.

   Usage:  node workflow.mjs <spec.json>
   Spec:   { "name": "...", "phases": [ { "title": "...",
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

   Housekeeping note: dispatched-repo .claude/journal.jsonl files (session
   journals a doer's own tooling may write inside the target repo) should be
   gitignored in that target repo — they're run-local scratch, not source.
   Similarly, capture artifacts (capture-listener.mjs / capture-poll.mjs
   output under ~/JHD/captures/) must never land inside a git-tracked
   plugin directory (e.g. figma-plugin/capture-figma/) — they're written
   to ~/JHD/captures/ specifically so this distinction is structural, not
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
import { readFileSync, appendFileSync } from "node:fs";
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const pluginRoot = dirname(scriptsDir);
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

// Persona -> skill mandate -> task, in that order. Throws (via loadPersona)
// when `persona` is set but its file is missing — spec-lint is meant to
// catch this before dispatch; this throw is the backstop for a spec that
// skipped lint, surfacing as a rejected runClaude() rather than a silently
// degraded prompt.
function applyPersona(prompt, persona, skills) {
  const preamble = buildSkillPreamble(skills);
  const taskBlock = `${preamble ? `${preamble}\n\n---\n` : ""}TASK:\n${prompt}`;
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
  sessionId, label, pluginDir,
}, specName, { spawnImpl = spawn, timeoutMs } = {}) {
  return new Promise((resolve) => {
    const finalPrompt = applyPersona(prompt, persona, skills);
    const resolvedSessionId = sessionId ?? (label ? deterministicSessionId(`${specName}:${label}`) : undefined);
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

  const summary = [];
  let anyFailed = false;
  let anyCapped = false;
  for (const phase of spec.phases) {
    console.log(`▸ ${phase.title} (${phase.agents.length} agents)`);
    log({ type: "phase", title: phase.title });
    const results = await Promise.all(phase.agents.map(async (rawAgent) => {
      const a = applyAgentDefaults(rawAgent);
      logDispatch(a);
      const r = await runClaude(a, spec.name, { spawnImpl, timeoutMs: a.timeoutMs });
      const full = { ...a, ...r };
      logCompletion(full);
      log({
        type: "agent", label: a.label, ok: r.ok, outcome: r.outcome, sessionId: r.sessionId,
        numTurns: r.numTurns, maxTurns: a.maxTurns, costUsd: r.costUsd, durationMs: r.durationMs,
        result: r.result?.slice?.(0, 4000),
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
          }), spec.name)));
        const confirmed = votes.filter((vt) => /CONFIRMED\s*$/.test(String(vt.result))).length;
        const survives = confirmed > votes.length / 2;
        log({ type: "verify", label: r.label, confirmed, of: votes.length, survives });
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

function isMainModule() {
  return import.meta.url === `file://${process.argv[1]}`;
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
