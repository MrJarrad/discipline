#!/usr/bin/env node
/* Lane-end sweep (ruling `lane-end-sweep`, 2026-09-21). The parent runs this
   on every completion notification. It never touches anything the lane
   didn't leave behind: a `next start`/`next-server`/`next dev` process
   listening on a TCP port >= 3220 (resolved via `lsof`, never a process on
   3210 or 3211, and never one not listening), Playwright/headless Chromium,
   or any shell whose argv contains the session's task-output directory path.

   Safety fences, all required before anything is ever swept:
   - **own pid / ancestor pid** — the sweep never stops itself or the shell
     that launched it (or any process between it and init); computed by
     walking `ps -o ppid=` up from `process.pid` before matching starts.
   - **younger than 60s** — a shell that matches "argv references the
     session dir" but was spawned less than a minute ago is skipped, since
     it may be the sweep's own freshly-spawned invocation rather than a real
     leftover.
   - **cross-session guard on next servers and Playwright/headless
     Chromium** — a young process (< 30 min) with a live parent (ppid != 1)
     belongs to another lane running alongside this one, not this lane's own
     leftover; matched only when orphaned (reparented to launchd, ppid == 1)
     or old enough (>= 30 min) that any owning lane is long done.

   Exit 0 always. Nothing else is ever killed. Node built-ins only.

   Usage:
     node lane-sweep.mjs --session-dir <path> [--dry-run]
*/
import { execFileSync } from "node:child_process";

// --- pure matcher: testable with a fake process/port table -----------------

// ps etime is [[DD-]HH:]MM:SS. Parse to whole seconds.
export function parseEtimeSeconds(etime) {
  let rest = etime;
  let days = 0;
  if (rest.includes("-")) {
    const [d, r] = rest.split("-");
    days = Number(d) || 0;
    rest = r;
  }
  const parts = rest.split(":").map(Number);
  let h = 0;
  let m = 0;
  let s = 0;
  if (parts.length === 3) [h, m, s] = parts;
  else if (parts.length === 2) [m, s] = parts;
  else if (parts.length === 1) [s] = parts;
  return days * 86400 + h * 3600 + m * 60 + s;
}

// The session-dir rule only ever sweeps a shell — `sh`/`bash`/`zsh`, path
// stripped, leading `-` (login shell marker) stripped. Any other process
// whose argv happens to mention the session dir (an editor, `tail`, a
// `node` script reading a file under it) is left alone.
const SHELL_BASENAMES = new Set(["sh", "bash", "zsh"]);

export function shellExecutableBasename(argv) {
  const first = argv.trim().split(/\s+/)[0] || "";
  const stripped = first.startsWith("-") ? first.slice(1) : first;
  return stripped.split("/").pop();
}

// A next server or Playwright/headless Chromium process only ever belongs to
// THIS lane's leftovers when it's either orphaned (reparented to launchd,
// ppid === 1) or old enough (>= 30 min) that any owning lane is long done. A
// young process with a live parent is another session's lane running
// alongside this one.
const CROSS_SESSION_AGE_SECONDS = 30 * 60;

export function isOrphanOrOld(proc) {
  return proc.ppid === 1 || parseEtimeSeconds(proc.etime) >= CROSS_SESSION_AGE_SECONDS;
}

/**
 * @param {{pid: number, ppid: number, etime: string, argv: string}} proc
 * @param {Map<number, number[]>} listeningPortsByPid  pid -> [ports]
 * @param {string} sessionDir
 * @param {Set<number>} excludePids  own pid + every ancestor pid up to init
 * @returns {{match: boolean, reason?: string, port?: number}}
 */
export function matchProcess(proc, listeningPortsByPid, sessionDir, excludePids = new Set()) {
  if (excludePids.has(proc.pid)) {
    return { match: false, reason: "excluded: own pid or ancestor of the sweep" };
  }

  const argv = proc.argv;
  const ports = listeningPortsByPid.get(proc.pid) || [];
  const isNextProcess = /\bnext-server\b|\bnext\s+(start|dev)\b/.test(argv);

  if (isNextProcess) {
    const sweepablePort = ports.find((p) => p >= 3220);
    if (sweepablePort !== undefined) {
      if (!isOrphanOrOld(proc)) {
        return {
          match: false,
          reason: "excluded: next server has a live parent and is under 30 min old (another lane)",
        };
      }
      return { match: true, reason: "next server on swept port", port: sweepablePort };
    }
    // A next process not listening, or listening only on 3210/3211/<3220,
    // is never swept — no match, whatever else is true about it.
    return { match: false };
  }

  if (/chromium_headless_shell|ms-playwright/.test(argv)) {
    if (!isOrphanOrOld(proc)) {
      return {
        match: false,
        reason: "excluded: browser has a live parent and is under 30 min old (another lane)",
      };
    }
    return { match: true, reason: "playwright / headless chromium" };
  }

  if (sessionDir && argv.includes(sessionDir)) {
    const base = shellExecutableBasename(argv);
    if (!SHELL_BASENAMES.has(base)) {
      // Any process whose argv happens to mention the session dir — an
      // editor, `tail`, `node <script under the session dir>` — is never
      // swept; only a shell invoked to run something there is.
      return { match: false, reason: `not a shell (leading executable "${base || "?"}")` };
    }
    const ageSeconds = parseEtimeSeconds(proc.etime);
    if (ageSeconds < 60) {
      return { match: false, reason: "excluded: shell younger than 60s" };
    }
    return { match: true, reason: "shell referencing session dir" };
  }

  return { match: false };
}

// --- real-world data gathering ----------------------------------------------

function listProcesses() {
  // pid, parent pid, elapsed time, full argv — one process per line.
  const out = execFileSync("ps", ["-axo", "pid,ppid,etime,args"], { encoding: "utf8" });
  const lines = out.split("\n").slice(1); // drop header
  const procs = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const m = trimmed.match(/^(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/);
    if (!m) continue;
    const [, pidStr, ppidStr, etime, argv] = m;
    procs.push({ pid: Number(pidStr), ppid: Number(ppidStr), etime, argv });
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

// --- own pid + ancestor pids, up to init -------------------------------------

function getPpid(pid) {
  try {
    const out = execFileSync("ps", ["-o", "ppid=", "-p", String(pid)], { encoding: "utf8" }).trim();
    const ppid = Number(out);
    return Number.isFinite(ppid) && ppid > 0 ? ppid : null;
  } catch {
    return null;
  }
}

function collectSelfAndAncestors(pid) {
  const seen = new Set([pid]);
  let current = pid;
  for (let i = 0; i < 200; i++) {
    const ppid = getPpid(current);
    if (!ppid || seen.has(ppid)) break;
    seen.add(ppid);
    if (ppid === 1) break; // init — stop climbing
    current = ppid;
  }
  return seen;
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
  const excludePids = collectSelfAndAncestors(process.pid);

  let any = false;
  for (const proc of procs) {
    const result = matchProcess(proc, portsByPid, sessionDir, excludePids);
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
