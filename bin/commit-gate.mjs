#!/usr/bin/env node
/* PreToolUse (Bash) — makes "no commit without green typecheck" mechanical
   instead of prompt-trusted. Only acts on `git commit` invocations; every
   other Bash command passes through untouched. Reads the marker file written
   by bin/run-typecheck.mjs (fired async by bin/typecheck-marker.mjs on every
   Write|Edit) and denies the commit unless it says "green". */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

function readHookInput() {
  try { return JSON.parse(readFileSync(0, "utf8") || "{}"); }
  catch { return {}; }
}

function allow() {
  process.exit(0);
}

function deny(reason) {
  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason,
    },
  }));
  process.exit(0);
}

const input = readHookInput();
const command = input.tool_input?.command || "";

// Only gate actual `git commit` invocations (allow git commit --amend/--help
// etc. through the same check — anything that writes a commit).
if (!/\bgit\s+commit\b/.test(command)) allow();

const cwd = input.cwd || process.cwd();
const markerPath = join(cwd, ".claude", ".typecheck-status.json");

if (!existsSync(markerPath)) {
  deny("Typecheck gate: no typecheck marker found yet — make at least one Write/Edit " +
    "(which triggers the async typecheck) before committing, or run the repo's " +
    "typecheck manually and retry.");
}

let marker;
try { marker = JSON.parse(readFileSync(markerPath, "utf8")); }
catch { deny("Typecheck gate: marker file is unreadable/corrupt — re-run typecheck."); }

if (marker.status === "green" || marker.status === "skipped") allow();

deny(`Typecheck gate: last typecheck (${marker.command || "unknown command"}) was RED ` +
  `at ${marker.ts}. Fix the errors and let a Write/Edit re-trigger the check before committing.\n` +
  `Tail:\n${marker.tail || ""}`);
