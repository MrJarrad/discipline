#!/usr/bin/env node
/* PostToolUse (Write|Edit) — launches run-typecheck.mjs as a fully detached,
   unref'd child process and exits immediately. The child keeps running (and
   writes the green/red marker bin/commit-gate.mjs reads) after this hook
   process has already exited, so PostToolUse stays fast — per the plan's
   "avoid /doctor slow-hook flags" note. */
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

function readHookInput() {
  try { return JSON.parse(readFileSync(0, "utf8") || "{}"); }
  catch { return {}; }
}

const input = readHookInput();
const cwd = input.cwd || process.cwd();
const binDir = dirname(fileURLToPath(import.meta.url));
const runner = join(binDir, "run-typecheck.mjs");

const child = spawn(process.execPath, [runner, cwd], {
  cwd,
  stdio: "ignore",
  detached: true,
});
child.unref();
process.exit(0);
