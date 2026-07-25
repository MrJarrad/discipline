#!/usr/bin/env node
/* PostToolUse (Skill|Task|SlashCommand|mcp__.*) — appends a journal entry
   recording tool_name from the hook payload. Makes the ANNOUNCE rule
   (operator-rules.md, rule 1) tamper-proof: visibility comes from the native
   tool invocation itself (Skill/Task/SlashCommand render in the thread UI),
   and this hook journals the same event mechanically off tool_input, using
   the same fields (agent_id, effort, transcript_path) the plan calls out.
   File-append only, no stdout beyond a short confirmation — respects the
   10k-char stdout cap on hook output. */
import { readFileSync, appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

function readHookInput() {
  try { return JSON.parse(readFileSync(0, "utf8") || "{}"); }
  catch { return {}; }
}

const input = readHookInput();
const cwd = input.cwd || process.cwd();
const dir = join(cwd, ".claude");
mkdirSync(dir, { recursive: true });
const journalPath = join(dir, "journal.jsonl");

const entry = {
  t: new Date().toISOString(),
  type: "announce",
  tool: input.tool_name,
  agent_id: input.agent_id ?? null,
  effort: input.effort ?? null,
  transcript_path: input.transcript_path ?? null,
  tool_input: input.tool_input ?? null,
};

appendFileSync(journalPath, JSON.stringify(entry) + "\n");
process.exit(0);
