#!/usr/bin/env node
/* Lane-end sweep (ruling `lane-end-sweep`, 2026-09-21). The parent runs this
   on every completion notification. It never touches anything the lane
   didn't leave behind: a `next start`/`next-server`/`next dev` process
   listening on a TCP port >= 3220 (resolved via `lsof`, never a process on
   3210 or 3211, and never one not listening), Playwright/headless Chromium,
   or any shell whose argv contains the session's task-output directory path.

   Exit 0 always. Nothing else is ever killed. Node built-ins only.

   Usage:
     node lane-sweep.mjs --session-dir <path> [--dry-run]
*/
import { execFileSync } from "node:child_process";

// --- pure matcher: testable with a fake process/port table -----------------

/**
 * @param {{pid: number, etimeSeconds: number, argv: string}} proc
 * @param {Map<number, number[]>} listeningPortsByPid  pid -> [ports]
 * @param {string} sessionDir
 * @returns {{match: boolean, reason?: string, port?: number}}
 */
export function matchProcess(proc, listeningPortsByPid, sessionDir) {
  const argv = proc.argv;
  const ports = listeningPortsByPid.get(proc.pid) || [];
  const isNextProcess = /\bnext-server\b|\bnext\s+(start|dev)\b/.test(argv);

  if (isNextProcess) {
    const sweepablePort = ports.find((p) => p >= 3220);
    if (sweepablePort !== undefined) {
      return { match: true, reason: "next server on swept port", port: sweepablePort };
    }
    // A next process not listening, or listening only on 3210/3211/<3220,
    // is never swept — no match, whatever else is true about it.
    return { match: false };
  }

  if (/chromium_headless_shell|ms-playwright/.test(argv)) {
    return { match: true, reason: "playwright / headless chromium" };
  }

  if (sessionDir && argv.includes(sessionDir)) {
    return { match: true, reason: "shell referencing session dir" };
  }

  return { match: false };
}

// --- real-world data gathering ----------------------------------------------

function listProcesses() {
  // pid, elapsed time, full argv — one process per line.
  const out = execFileSync("ps", ["-axo", "pid,etime,args"], { encoding: "utf8" });
  const lines = out.split("\n").slice(1); // drop header
  const procs = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const m = trimmed.match(/^(\d+)\s+(\S+)\s+(.*)$/);
    if (!m) continue;
    const [, pidStr, etime, argv] = m;
    procs.push({ pid: Number(pidStr), etime, argv });
  }
  return procs;
}

function listListeningPorts() {
  // pid -> [ports], TCP LISTEN only.
  const map = new Map();
  let out;
  try {
    out = execFileSync("lsof", ["-nP", "-iTCP", "-sTCP:LISTEN"], { encoding: "utf8" });
  } catch {
    // lsof exits non-zero when it finds nothing to list; treat as empty.
    return map;
  }
  const lines = out.split("\n").slice(1);
  for (const line of lines) {
    const cols = line.trim().split(/\s+/);
    if (cols.length < 9) continue;
    const pid = Number(cols[1]);
    const nameCol = cols[cols.length - 1]; // e.g. *:3220 or 127.0.0.1:3220
    const portMatch = nameCol.match(/:(\d+)(\s|$)/);
    if (!pid || !portMatch) continue;
    const port = Number(portMatch[1]);
    if (!map.has(pid)) map.set(pid, []);
    map.get(pid).push(port);
  }
  return map;
}

// --- main --------------------------------------------------------------------

function parseArgs(argv) {
  const args = { sessionDir: null, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--session-dir") args.sessionDir = argv[++i];
    else if (argv[i] === "--dry-run") args.dryRun = true;
  }
  return args;
}

function main() {
  const { sessionDir, dryRun } = parseArgs(process.argv.slice(2));
  const procs = listProcesses();
  const portsByPid = listListeningPorts();

  let any = false;
  for (const proc of procs) {
    const result = matchProcess(proc, portsByPid, sessionDir);
    if (!result.match) continue;
    any = true;
    const action = dryRun ? "would stop" : "stopped";
    const portPart = result.port !== undefined ? ` port=${result.port}` : "";
    const argvSnippet = proc.argv.slice(0, 80);
    console.log(
      `pid=${proc.pid} age=${proc.etime}${portPart} argv="${argvSnippet}" reason="${result.reason}" action=${action}`,
    );
    if (!dryRun) {
      try {
        process.kill(proc.pid, "SIGTERM");
      } catch (err) {
        console.log(`pid=${proc.pid} action=failed error="${err.message}"`);
      }
    }
  }

  if (!any) {
    console.log("lane-sweep: nothing to stop");
  }

  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
