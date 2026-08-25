#!/usr/bin/env node
/* Runs synchronously in its OWN detached process (spawned by
   typecheck-marker.mjs) so it keeps running after the PostToolUse hook that
   launched it has already exited. Picks a typecheck command, runs it, writes
   the green/red marker the commit gate (bin/commit-gate.mjs) reads.

   Usage: node run-typecheck.mjs <cwd> */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";

const cwd = process.argv[2] || process.cwd();

function pickTypecheckCommand() {
  const pkgPath = join(cwd, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
      const scripts = pkg.scripts || {};
      if (scripts.typecheck) return "npm run typecheck --silent";
      if (scripts["type-check"]) return "npm run type-check --silent";
    } catch { /* fall through */ }
  }
  if (existsSync(join(cwd, "tsconfig.json"))) return "npx tsc --noEmit";
  return null;
}

function writeMarker(marker) {
  const dir = join(cwd, ".claude");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, ".typecheck-status.json"), JSON.stringify(marker, null, 2));
}

const command = pickTypecheckCommand();
if (!command) {
  writeMarker({ status: "skipped", ts: new Date().toISOString(), command: null, tail: "no typecheck script or tsconfig.json found" });
  process.exit(0);
}

let status = "green";
let tail = "";
try {
  tail = execSync(command, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
} catch (err) {
  status = "red";
  tail = String(err.stdout || "") + String(err.stderr || "");
}
writeMarker({ status, ts: new Date().toISOString(), command, tail: tail.slice(-4000) });
