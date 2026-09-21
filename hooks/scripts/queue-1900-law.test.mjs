// The 1.90.0 queue: lane-end sweep is a script; doers never poll (operator
// ruling 2026-09-21, `lane-end-sweep`) — on orphaned `until … sleep` loops
// from finished lanes: "can we do something to make sure they just [don't]
// stick around moving forward". (1) `doer-rules.md` § You are the doer gains
// a no-polling-loops / no-detached-shells rule, echoed one line in each doer
// agent file. (2) `hooks/scripts/lane-sweep.mjs`, run by the parent on every
// completion notification, stops next servers on ports >= 3220 (never
// 3210/3211), Playwright/headless Chromium, and any shell referencing the
// session's task-output directory. `routing`'s baton row and
// `output-styles/discipline.md`'s completion-notification step both name it,
// replacing the by-hand sweep sentence from 1.89.0's baton table.
//
// Run: node --test hooks/scripts/queue-1900-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { matchProcess, parseEtimeSeconds, shellExecutableBasename } from "./lane-sweep.mjs";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(repo, p), "utf8");
const flat = (text) => text.replace(/\s+/g, " ");
const carries = (file, sentence) =>
  assert.ok(
    flat(read(file)).includes(flat(sentence)),
    `${file} no longer carries: ${sentence}`,
  );

// --- doer-rules.md: no polling loops ----------------------------------------

test("doer-rules.md § You are the doer bans polling loops and detached shells", () => {
  const dr = flat(read("doer-rules.md"));
  assert.match(
    dr,
    /No `until`\/`while … sleep` polling loops and no detached shells inside a lane/,
  );
  assert.match(dr, /wait with a foreground command and a timeout/);
  const doerIdx = dr.indexOf("## You are the doer");
  const sizeIdx = dr.indexOf("## Size class");
  const ruleIdx = dr.indexOf("No `until`/`while … sleep` polling loops");
  assert.ok(
    ruleIdx > doerIdx && ruleIdx < sizeIdx,
    "the polling-loop rule must sit inside § You are the doer",
  );
});

test("each doer agent file points at the no-polling-loops rule", () => {
  for (const file of [
    "agents/engineer.md",
    "agents/ux-designer.md",
    "agents/researcher.md",
    "agents/reviewer.md",
  ]) {
    const doc = flat(read(file));
    assert.match(
      doc,
      /No polling loops or detached shells/,
      `${file} missing the no-polling-loops line`,
    );
  }
});

// --- routing baton row + output-styles --------------------------------------

test("routing's baton table names lane-sweep.mjs, replacing the by-hand sweep sentence", () => {
  const routing = flat(read("skills/routing/SKILL.md"));
  assert.match(routing, /lane-sweep\.mjs/);
  assert.doesNotMatch(
    routing,
    /Parent sweeps verification servers\*\* \(`:3220` and up\); the lane stopped only its own pids \(`doer-rules\.md` § Size class\)/,
  );
});

test("output-styles/discipline.md names the sweep on the completion notification", () => {
  carries("output-styles/discipline.md", "run `lane-sweep.mjs`");
});

// --- lane-sweep.mjs: the port fence, unit-tested with a fake process table -

test("a next server on port 3220+, old enough, is matched and swept", () => {
  const proc = { pid: 100, ppid: 900, etime: "01:00:00", argv: "node .../next-server" };
  const ports = new Map([[100, [3220]]]);
  const result = matchProcess(proc, ports, "/session/dir");
  assert.equal(result.match, true);
  assert.equal(result.port, 3220);
});

test("a next process on port 3210 is never swept", () => {
  const proc = { pid: 101, ppid: 1, etime: "00:10:00", argv: "next-server (v14)" };
  const ports = new Map([[101, [3210]]]);
  assert.equal(matchProcess(proc, ports, "/session/dir").match, false);
});

test("a next process on port 3211 is never swept", () => {
  const proc = { pid: 102, ppid: 1, etime: "00:10:00", argv: "node bin/next start" };
  const ports = new Map([[102, [3211]]]);
  assert.equal(matchProcess(proc, ports, "/session/dir").match, false);
});

test("a next process not listening on any port is never swept", () => {
  const proc = { pid: 103, ppid: 1, etime: "00:05:00", argv: "next dev" };
  const ports = new Map(); // no listening entry
  assert.equal(matchProcess(proc, ports, "/session/dir").match, false);
});

test("a next process listening on both 3210 and 3220+, orphaned, is swept for the sweepable port only", () => {
  const proc = { pid: 104, ppid: 1, etime: "00:05:00", argv: "next-server" };
  const ports = new Map([[104, [3210, 3221]]]);
  const result = matchProcess(proc, ports, "/session/dir");
  assert.equal(result.match, true);
  assert.equal(result.port, 3221);
});

test("a next server under 30 min old with a live parent is skipped — another lane's server", () => {
  const proc = { pid: 105, ppid: 900, etime: "00:05:00", argv: "node .../next-server" };
  const ports = new Map([[105, [3220]]]);
  const result = matchProcess(proc, ports, "/session/dir");
  assert.equal(result.match, false);
  assert.match(result.reason, /another lane/);
});

test("a next server orphaned (ppid 1) is matched even though it's young", () => {
  const proc = { pid: 106, ppid: 1, etime: "00:01:00", argv: "node .../next-server" };
  const ports = new Map([[106, [3220]]]);
  assert.equal(matchProcess(proc, ports, "/session/dir").match, true);
});

test("a next server with a live parent but 31 min old is matched", () => {
  const proc = { pid: 107, ppid: 900, etime: "00:31:00", argv: "node .../next-server" };
  const ports = new Map([[107, [3220]]]);
  assert.equal(matchProcess(proc, ports, "/session/dir").match, true);
});

test("headless chromium / playwright processes, old enough, are matched regardless of port", () => {
  const proc = {
    pid: 200,
    ppid: 900,
    etime: "01:00:00",
    argv: "/ms-playwright/chromium-1234/chrome-mac/chromium_headless_shell --headless",
  };
  assert.equal(matchProcess(proc, new Map(), "/session/dir").match, true);
});

test("a headless chromium under 30 min old with a live parent is skipped — another lane's browser", () => {
  const proc = {
    pid: 201,
    ppid: 900,
    etime: "00:00:01",
    argv: "/ms-playwright/chromium-1234/chrome-mac/chromium_headless_shell --headless",
  };
  const result = matchProcess(proc, new Map(), "/session/dir");
  assert.equal(result.match, false);
  assert.match(result.reason, /another lane/);
});

test("a headless chromium orphaned (ppid 1) is matched even though it's young", () => {
  const proc = {
    pid: 202,
    ppid: 1,
    etime: "00:00:01",
    argv: "/ms-playwright/chromium-1234/chrome-mac/chromium_headless_shell --headless",
  };
  assert.equal(matchProcess(proc, new Map(), "/session/dir").match, true);
});

test("a headless chromium with a live parent but 31 min old is matched", () => {
  const proc = {
    pid: 203,
    ppid: 900,
    etime: "00:31:00",
    argv: "/ms-playwright/chromium-1234/chrome-mac/chromium_headless_shell --headless",
  };
  assert.equal(matchProcess(proc, new Map(), "/session/dir").match, true);
});

test("a shell whose argv contains the session dir is matched", () => {
  const proc = { pid: 300, etime: "02:00:00", argv: "bash -c until ... /session/dir/task" };
  assert.equal(matchProcess(proc, new Map(), "/session/dir").match, true);
});

test("an unrelated process is never matched", () => {
  const proc = { pid: 400, etime: "10:00:00", argv: "/usr/sbin/cupsd" };
  assert.equal(matchProcess(proc, new Map(), "/session/dir").match, false);
});

test("lane-sweep.mjs exits 0 and prints one line per matched process", () => {
  const script = read("hooks/scripts/lane-sweep.mjs");
  assert.match(script, /process\.exit\(0\)/);
  assert.match(script, /Node built-ins only/);
});

// --- self / ancestor / age safety fences ------------------------------------
// (the dry run first caught these: the sweep's own pid and its launching
// shell both matched "shell referencing session dir" and would have been
// killed on a real run)

test("the sweep's own pid is excluded even though its argv matches the session dir", () => {
  const proc = { pid: 500, etime: "00:00", argv: "node lane-sweep.mjs --session-dir /session/dir" };
  const excludePids = new Set([500, 499, 1]);
  const result = matchProcess(proc, new Map(), "/session/dir", excludePids);
  assert.equal(result.match, false);
  assert.match(result.reason, /own pid or ancestor/);
});

test("an ancestor pid (the shell that launched the sweep) is excluded", () => {
  const proc = { pid: 499, etime: "00:00", argv: "/bin/zsh -c ... /session/dir" };
  const excludePids = new Set([500, 499, 1]);
  const result = matchProcess(proc, new Map(), "/session/dir", excludePids);
  assert.equal(result.match, false);
  assert.match(result.reason, /own pid or ancestor/);
});

test("a shell matching the session dir but younger than 60s is skipped", () => {
  const proc = { pid: 600, etime: "00:45", argv: "/bin/zsh -c ... /session/dir" };
  const result = matchProcess(proc, new Map(), "/session/dir", new Set());
  assert.equal(result.match, false);
  assert.match(result.reason, /younger than 60s/);
});

test("a shell matching the session dir at exactly 60s is matched (boundary)", () => {
  const proc = { pid: 601, etime: "01:00", argv: "/bin/zsh -c ... /session/dir" };
  const result = matchProcess(proc, new Map(), "/session/dir", new Set());
  assert.equal(result.match, true);
});

test("a five-hour-old snapshot shell referencing the session dir is still swept as a real leftover", () => {
  const proc = {
    pid: 700,
    etime: "05:02:08",
    argv: "/bin/zsh -c source /Users/x/.claude/shell-snapshots/snapshot-zsh-178 && /session/dir/task",
  };
  const result = matchProcess(proc, new Map(), "/session/dir", new Set());
  assert.equal(result.match, true);
});

test("parseEtimeSeconds handles mm:ss, hh:mm:ss, and dd-hh:mm:ss forms", () => {
  assert.equal(parseEtimeSeconds("00:45"), 45);
  assert.equal(parseEtimeSeconds("01:00"), 60);
  assert.equal(parseEtimeSeconds("05:02:08"), 5 * 3600 + 2 * 60 + 8);
  assert.equal(parseEtimeSeconds("1-05:02:08"), 86400 + 5 * 3600 + 2 * 60 + 8);
});

// --- reviewer round 2, S1: session-dir rule scoped to shells only -----------
// `lane-sweep.mjs:76` matched any process whose argv contained the session
// dir — an editor or `tail` on a session file would have been killed. Fixed:
// the rule applies only when the argv's leading executable, path-stripped,
// is `sh`, `bash`, or `zsh`.

test("vim opened on a file under the session dir, 5h old, is never matched", () => {
  const proc = {
    pid: 800,
    etime: "05:00:00",
    argv: "vim /session/dir/notes.md",
  };
  const result = matchProcess(proc, new Map(), "/session/dir", new Set());
  assert.equal(result.match, false);
  assert.match(result.reason, /not a shell/);
});

test("a real /bin/zsh -c shell referencing the session dir, 5h old, is still matched", () => {
  const proc = {
    pid: 801,
    etime: "05:00:00",
    argv: "/bin/zsh -c source /Users/x/.claude/shell-snapshots/snapshot-zsh-178 && /session/dir/task",
  };
  const result = matchProcess(proc, new Map(), "/session/dir", new Set());
  assert.equal(result.match, true);
  assert.equal(result.reason, "shell referencing session dir");
});

test("a node script running under the session dir is never matched", () => {
  const proc = {
    pid: 802,
    etime: "05:00:00",
    argv: "node /session/dir/scratchpad/script.mjs",
  };
  const result = matchProcess(proc, new Map(), "/session/dir", new Set());
  assert.equal(result.match, false);
  assert.match(result.reason, /not a shell/);
});

test("shellExecutableBasename strips path and login-shell leading dash", () => {
  assert.equal(shellExecutableBasename("bash -c foo"), "bash");
  assert.equal(shellExecutableBasename("/bin/zsh -c foo"), "zsh");
  assert.equal(shellExecutableBasename("-zsh"), "zsh");
  assert.equal(shellExecutableBasename("node script.mjs"), "node");
});
