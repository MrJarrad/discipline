// lane-sweep — pure-logic tests for the matcher (`matchProcess`,
// `isWaitLoopShell`) and the port bound. No real process is ever swept here.
// Run: node --test hooks/scripts/lane-sweep.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { matchProcess, isWaitLoopShell, shellExecutableBasename, parseEtimeSeconds } from "./lane-sweep.mjs";

test("isWaitLoopShell matches an until/pgrep/sleep polling loop", () => {
  assert.equal(isWaitLoopShell("bash -c 'until pgrep -f done-marker; do sleep 2; done'"), true);
});

test("isWaitLoopShell matches the while spelling", () => {
  assert.equal(isWaitLoopShell("zsh -c 'while ! pgrep -f server; do sleep 1; done'"), true);
});

test("isWaitLoopShell does not match a shell missing pgrep or sleep", () => {
  assert.equal(isWaitLoopShell("bash -c 'until curl -sf localhost:3000; do echo waiting; done'"), false);
  assert.equal(isWaitLoopShell("bash -c 'pgrep -f server'"), false);
});

test("matchProcess sweeps a doer's own wait-loop shell once past 60s old", () => {
  const proc = { pid: 500, ppid: 1, etime: "05:00", argv: "bash -c 'until pgrep -f done-marker; do sleep 2; done'" };
  const result = matchProcess(proc, new Map(), "/some/session/dir", new Set());
  assert.equal(result.match, true);
  assert.match(result.reason, /wait loop/);
});

test("matchProcess never sweeps a wait-loop shell younger than 60s", () => {
  const proc = { pid: 500, ppid: 1, etime: "00:10", argv: "bash -c 'until pgrep -f done-marker; do sleep 2; done'" };
  const result = matchProcess(proc, new Map(), "/some/session/dir", new Set());
  assert.equal(result.match, false);
});

test("matchProcess never sweeps the sweep's own pid even if it looks like a wait loop", () => {
  const proc = { pid: 500, ppid: 1, etime: "05:00", argv: "bash -c 'until pgrep -f done-marker; do sleep 2; done'" };
  const result = matchProcess(proc, new Map(), "/some/session/dir", new Set([500]));
  assert.equal(result.match, false);
  assert.match(result.reason, /own pid/);
});

test("matchProcess never sweeps a non-shell process whose argv happens to mention pgrep/sleep", () => {
  const proc = { pid: 500, ppid: 1, etime: "05:00", argv: "node /some/script.js --until pgrep --sleep 2" };
  const result = matchProcess(proc, new Map(), "/some/session/dir", new Set());
  assert.equal(result.match, false);
});

test("matchProcess sweeps a next server listening on a port inside 3220-3299", () => {
  const proc = { pid: 42, ppid: 1, etime: "40:00", argv: "next-server (v14.0.0)" };
  const ports = new Map([[42, [3230]]]);
  const result = matchProcess(proc, ports, "", new Set());
  assert.equal(result.match, true);
  assert.equal(result.port, 3230);
});

test("matchProcess never sweeps a next server outside the 3220-3299 band (e.g. 3211 hoverboard, or 3300+)", () => {
  const proc1 = { pid: 43, ppid: 1, etime: "40:00", argv: "next-server (v14.0.0)" };
  assert.equal(matchProcess(proc1, new Map([[43, [3211]]]), "", new Set()).match, false);
  const proc2 = { pid: 44, ppid: 1, etime: "40:00", argv: "next-server (v14.0.0)" };
  assert.equal(matchProcess(proc2, new Map([[44, [3300]]]), "", new Set()).match, false);
});
