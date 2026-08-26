#!/usr/bin/env node
/* Runs synchronously in its OWN detached process (spawned by
   typecheck-marker.mjs) so it keeps running after the PostToolUse hook that
   launched it has already exited. Picks a typecheck command, runs it, writes
   the green/red marker the commit gate (bin/commit-gate.mjs) reads.

   Also exported for commit-gate.mjs's absent-marker fallback: when the gate
   finds no marker at all (e.g. a fresh worktree, or a commit before any
   Write/Edit fired the async check), it runs this same command-picking +
   marker-writing logic SYNCHRONOUSLY inline instead of hard-failing the
   commit — see defect record in the handover ("commit-gate marker
   fragility... SECOND strike").

   Usage: node run-typecheck.mjs <cwd> */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export function pickTypecheckCommand(cwd) {
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

export function markerPathFor(cwd) {
  return join(cwd, ".claude", ".typecheck-status.json");
}

export function writeMarker(cwd, marker) {
  const dir = join(cwd, ".claude");
  mkdirSync(dir, { recursive: true });
  writeFileSync(markerPathFor(cwd), JSON.stringify(marker, null, 2));
  return marker;
}

// Bounded so a hung/slow typecheck can't hang the caller forever — this
// matters most for commit-gate.mjs's absent-marker fallback, which runs
// INSIDE the blocking PreToolUse hook (unlike the old fire-and-forget async
// path, a hang here hangs `git commit` itself). Overridable via env for
// tests, which need a short timeout to prove the fail-fast behavior without
// a 2-minute test run.
export function typecheckTimeoutMs() {
  const raw = process.env.TYPECHECK_TIMEOUT_MS;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 120000;
}

// Runs the typecheck (or records "skipped" when no command applies)
// synchronously and writes the marker. Returns the marker object so callers
// (commit-gate.mjs's absent-marker fallback) can gate on the fresh result
// without a second file read.
export function runTypecheckSync(cwd) {
  const command = pickTypecheckCommand(cwd);
  if (!command) {
    return writeMarker(cwd, {
      status: "skipped",
      ts: new Date().toISOString(),
      command: null,
      tail: "no typecheck script or tsconfig.json found",
    });
  }

  const timeoutMs = typecheckTimeoutMs();
  let status = "green";
  let tail = "";
  try {
    tail = execSync(command, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: timeoutMs });
  } catch (err) {
    if (err.code === "ETIMEDOUT" || (err.killed && err.signal)) {
      // execSync's own timeout kill — distinct from a real type error: the
      // command never finished, so there's no red result to report, only a
      // hung one. Gated separately so the deny message says "timed out",
      // not "type errors found".
      status = "timeout";
      tail = `typecheck timed out after ${timeoutMs}ms (${command})`;
    } else {
      status = "red";
      tail = String(err.stdout || "") + String(err.stderr || "");
    }
  }
  return writeMarker(cwd, { status, ts: new Date().toISOString(), command, tail: tail.slice(-4000) });
}

// CLI entry point — unchanged behavior when invoked directly by
// typecheck-marker.mjs's detached spawn.
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const cwd = process.argv[2] || process.cwd();
  runTypecheckSync(cwd);
}
