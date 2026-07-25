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
             "effort": "low|medium|high|xhigh (optional, passed through as --effort)",
             "permissionMode": "acceptEdits|plan|... (optional, defaults to acceptEdits)",
             "maxTurns": "50 (optional, passed through as --max-turns)",
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

   Every spawn also always carries --settings <plugin root>/runner-settings.json:
   standing tool-level allow/deny rights (Edit, Write, git checkout/add/commit/
   status/diff/log/branch, npx tsc, npm run typecheck, grep, rg allowed; git
   push, git reset --hard, rm -rf denied) so specialists get dispatch-level
   permissions from the runner itself — no repo-local settings file needed,
   operator/interactive posture untouched. Per-agent `allowedTools` in the
   spec is additive on top of this file, never a replacement for it.

   Housekeeping note: dispatched-repo .claude/journal.jsonl files (session
   journals a doer's own tooling may write inside the target repo) should be
   gitignored in that target repo — they're run-local scratch, not source.
   Similarly, capture artifacts (capture-listener.mjs / capture-poll.mjs
   output under ~/JHD/captures/) must never land inside a git-tracked
   plugin directory (e.g. figma-plugin/capture-figma/) — they're written
   to ~/JHD/captures/ specifically so this distinction is structural, not
   just a gitignore rule, but keep it in mind if that ever changes.        */
import { readFileSync, appendFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";

const specPath = process.argv[2];
if (!specPath) { console.error("usage: workflow <spec.json>"); process.exit(1); }
const spec = JSON.parse(readFileSync(specPath, "utf8"));
const journal = specPath.replace(/\.json$/, "") + ".journal.jsonl";
const log = (e) => appendFileSync(journal, JSON.stringify({ t: new Date().toISOString(), ...e }) + "\n");

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const pluginRoot = dirname(scriptsDir);
const operatorRulesPath = join(pluginRoot, "operator-rules.md");
const runnerSettingsPath = join(pluginRoot, "runner-settings.json");

function loadPersona(persona) {
  const path = join(pluginRoot, "agents", `${persona}.md`);
  try {
    const raw = readFileSync(path, "utf8");
    const body = raw.replace(/^---\n[\s\S]*?\n---\n/, "");
    return body;
  } catch {
    console.warn(`✗ persona not found: ${persona}`);
    return null;
  }
}

function applyPersona(prompt, persona) {
  if (!persona) return prompt;
  const body = loadPersona(persona);
  if (body == null) return prompt;
  return `You are operating as the ${persona} persona. Your discipline:\n${body}\n\n---\nTASK:\n${prompt}`;
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

function runClaude({
  prompt, model = "sonnet", cwd = process.cwd(), allowedTools, disallowedTools, persona,
  jsonSchema, effort, permissionMode = "acceptEdits", maxTurns, maxBudgetUsd, fallbackModel,
  sessionId, label,
}) {
  return new Promise((resolve) => {
    const finalPrompt = applyPersona(prompt, persona);
    const args = [
      "-p", finalPrompt,
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
    const resolvedSessionId = sessionId ?? (label ? deterministicSessionId(`${spec.name}:${label}`) : undefined);
    if (resolvedSessionId) args.push("--session-id", resolvedSessionId);

    const child = spawn("claude", args, { cwd, env: spawnEnv, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.on("close", (code) => {
      try {
        const parsed = JSON.parse(out);
        // Nonzero exit or a truthy is_error is always a hard failure, no
        // exceptions — the exit code (or is_error flag) is the ground truth,
        // never text the agent happened to print.
        resolve({ ok: code === 0 && !parsed.is_error, result: parsed.result ?? out, sessionId: resolvedSessionId });
      }
      catch { resolve({ ok: code === 0, result: out.trim(), sessionId: resolvedSessionId }); }
    });
  });
}

const summary = [];
for (const phase of spec.phases) {
  console.log(`▸ ${phase.title} (${phase.agents.length} agents)`);
  log({ type: "phase", title: phase.title });
  const results = await Promise.all(phase.agents.map(async (a) => {
    const r = await runClaude(a);
    log({ type: "agent", label: a.label, ok: r.ok, sessionId: r.sessionId, result: r.result?.slice?.(0, 4000) });
    return { ...a, ...r };
  }));
  let kept = results.filter((x) => x.ok);
  for (const r of results.filter((x) => !x.ok)) console.log(`  ✗ failed: ${r.label}`);
  if (phase.verify) {
    kept = [];
    for (const r of results.filter((x) => x.ok)) {
      const votes = await Promise.all(Array.from({ length: phase.verify.votes ?? 2 }, () =>
        runClaude({ prompt: phase.verify.prompt.replaceAll("{{RESULT}}", String(r.result).slice(0, 6000)) +
          '\nReply with exactly REFUTED or CONFIRMED as your last word.', model: phase.verify.model ?? "haiku", cwd: r.cwd })));
      const confirmed = votes.filter((v) => /CONFIRMED\s*$/.test(String(v.result))).length;
      const survives = confirmed > votes.length / 2;
      log({ type: "verify", label: r.label, confirmed, of: votes.length, survives });
      if (survives) kept.push(r); else console.log(`  ✗ refuted: ${r.label}`);
    }
  }
  summary.push({ phase: phase.title, ran: results.length, survived: kept.length });
}
console.log(JSON.stringify({ name: spec.name, summary }, null, 2));
log({ type: "done", summary });
