#!/usr/bin/env node
/* flux-workflow — deterministic multi-agent runner for Claude Code desktop.
   Orchestration as code, not willpower: phases run in order, agents within a
   phase run in parallel, every phase can carry a verify stage whose agents
   are prompted to REFUTE. Journal written next to the spec.

   Usage:  node flux-workflow.mjs <spec.json>
   Spec:   { "name": "...", "phases": [ { "title": "...",
             "agents": [{ "label": "...", "prompt": "...", "model": "haiku|sonnet|opus", "cwd": "...",
             "allowedTools": "Bash(git:*) (optional, passed through as --allowedTools)" }],
             "verify": { "prompt": "Refute: {{RESULT}}", "model": "haiku", "votes": 2 } } ] }
   Each agent runs `claude -p` headless with --output-format json. A verify
   stage spawns `votes` refuters per agent result; a result survives only if
   a majority do not refute. Journal: <spec>.journal.jsonl                     */
import { readFileSync, appendFileSync } from "node:fs";
import { spawn } from "node:child_process";

const specPath = process.argv[2];
if (!specPath) { console.error("usage: flux-workflow <spec.json>"); process.exit(1); }
const spec = JSON.parse(readFileSync(specPath, "utf8"));
const journal = specPath.replace(/\.json$/, "") + ".journal.jsonl";
const log = (e) => appendFileSync(journal, JSON.stringify({ t: new Date().toISOString(), ...e }) + "\n");

function runClaude({ prompt, model = "sonnet", cwd = process.cwd(), allowedTools }) {
  return new Promise((resolve) => {
    const args = ["-p", prompt, "--model", model, "--output-format", "json", "--permission-mode", "acceptEdits"];
    if (allowedTools) args.push("--allowedTools", allowedTools);
    const child = spawn("claude", args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.on("close", (code) => {
      try {
        const parsed = JSON.parse(out);
        resolve({ ok: code === 0 && !parsed.is_error, result: parsed.result ?? out });
      }
      catch { resolve({ ok: code === 0, result: out.trim() }); }
    });
  });
}

const summary = [];
for (const phase of spec.phases) {
  console.log(`▸ ${phase.title} (${phase.agents.length} agents)`);
  log({ type: "phase", title: phase.title });
  const results = await Promise.all(phase.agents.map(async (a) => {
    const r = await runClaude(a);
    log({ type: "agent", label: a.label, ok: r.ok, result: r.result?.slice?.(0, 4000) });
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
