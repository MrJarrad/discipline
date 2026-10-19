// 1.152.0: the gates-and-hooks bundle (DISC-106, 107, 143, 144, 164). Each test drives a public seam: the Bash gate's
// exported checks, the gate as a hook process, mac-job-check, the lane-sweep CLI, context-fill's handle().
// Run: node --test hooks/scripts/session37-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync, execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, symlinkSync, readFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { checkBashKillByName, checkBashForcePush, checkBashMacJob } from "../bin/agent-dispatch-gate.mjs";
import { macJobProblems } from "./mac-job-check.mjs";
import { handle, markWrapped } from "../bin/context-fill.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const gate = join(root, "hooks", "bin", "agent-dispatch-gate.mjs");
const sweep = join(here, "lane-sweep.mjs");
const GOOD_JOB = "---\nrepo: ~/JHD/hoverboard\n---\nDo it. No background tasks, no subagents.\n";

function runGate(tool_input, cwd) {
  const r = spawnSync("node", [gate], { input: JSON.stringify({ tool_name: "Bash", tool_input, cwd }), encoding: "utf8" });
  let decision = "allow"; // the gate prints a deny as hook JSON and nothing on a plain allow
  try { decision = JSON.parse(r.stdout).hookSpecificOutput.permissionDecision; } catch { /* no output = allow */ }
  return { decision, out: r.stdout + r.stderr };
}

// --- DISC-106: kill-by-name behind wrapper commands -------------------------

test("DISC-106: kill-by-name is blocked behind timeout, command, bash -c and env VAR=", () => {
  for (const c of [
    "timeout 5 pkill chrome", "timeout -s KILL 5 killall node", "command pkill vite", "env FOO=1 killall node",
    "bash -c 'pkill x'", 'sh -c "killall node"', "zsh -lc 'cd x && pkill -f vite'", "nice -n 5 pkill x",
  ])
    assert.equal(checkBashKillByName({ command: c }).ok, false, c);
});

test("DISC-106: the same words as text, or inside a wrapped harmless command, still pass", () => {
  for (const c of ["bash -c 'echo pkill'", "timeout 5 npm test", "command -v pkill", "env FOO=1 node x.mjs", "bash -c 'grep killall notes.md'"])
    assert.equal(checkBashKillByName({ command: c }).ok, true, c);
});

// --- DISC-106: mac-job-check agrees with run.sh on a bare home ---------------

test("DISC-106: a bare `repo: ~` (or the bare Mac home) is refused as run.sh does; a path under home passes", () => {
  assert.deepEqual(macJobProblems(GOOD_JOB), []);
  for (const repo of ["~", "'~'", "/Users/jarrad.harvey"]) {
    const p = macJobProblems(GOOD_JOB.replace("~/JHD/hoverboard", repo));
    assert.ok(p.some((m) => /not under \$HOME|exit 97/.test(m)), `${repo}: ${p.join("|")}`);
  }
});

// --- DISC-107: a hard force-push block ---------------------------------------

test("DISC-107: every force-push spelling is blocked, behind wrappers and git -C too", () => {
  for (const c of [
    "git push -f", "git push --force origin main", "git push origin main --force-with-lease", "git push --force-if-includes",
    "git push -uf origin x", "git push origin +preview/x", "git push origin HEAD:+x", "git -C /repo push -f", "cd x && git push --force",
    "timeout 60 git push -f", "bash -c 'git push --force'", "env GIT_TRACE=1 git push origin +x", "git push --mirror",
  ])
    assert.equal(checkBashForcePush({ command: c }).ok, false, c);
});

test("DISC-107: ordinary pushes and the words as text pass", () => {
  for (const c of [
    "git push -u origin claude/x", "git push origin HEAD:refs/heads/x", "git push --follow-tags", 'git commit -m "never git push --force"',
    "grep -- '--force' doer-rules.md", "git push origin feature-force", "git push origin x-f", "git pull --force",
  ])
    assert.equal(checkBashForcePush({ command: c }).ok, true, c);
});

test("DISC-107: the gate process denies a force-push and lets a plain push through", () => {
  assert.equal(runGate({ command: "git push -f origin x" }).decision, "deny");
  assert.equal(runGate({ command: "git push -u origin x" }).decision, "allow");
});

// --- DISC-144: git add of a Mac job runs mac-job-check -----------------------

function jobDir(text) {
  const d = mkdtempSync(join(tmpdir(), "macjob-"));
  mkdirSync(join(d, "queue", "mac", "pending"), { recursive: true });
  if (text !== null) writeFileSync(join(d, "queue", "mac", "pending", "job.md"), text);
  return d;
}
const LABEL = "local — Engineer (sonnet): file mac job";

test("DISC-144: git add of a bad job is refused with mac-job-check's problem named", () => {
  const d = jobDir("---\nrepo: ~\n---\nno marker line here\n");
  const v = checkBashMacJob({ command: "git add queue/mac/pending/job.md", description: LABEL }, d);
  assert.equal(v.ok, false);
  assert.match(v.reason, /mac-job-check/);
  assert.match(v.reason, /not under \$HOME/);
  assert.match(v.reason, /no background tasks/);
});

test("DISC-144: a clean job, an unrelated command and a cd-prefixed add resolve correctly", () => {
  const good = jobDir(GOOD_JOB);
  assert.equal(checkBashMacJob({ command: "git add queue/mac/pending/job.md" }, good).ok, true);
  assert.equal(checkBashMacJob({ command: "git status" }, "/nonexistent").ok, true);
  const bad = jobDir("---\nrepo: ~\n---\nx\n");
  assert.equal(checkBashMacJob({ command: `cd ${bad} && git add queue/mac/pending/job.md` }, good).ok, false);
});

test("DISC-144: fails closed — a missing file, a whole directory with one bad job, and a glob are all checked", () => {
  const empty = jobDir(null);
  assert.equal(checkBashMacJob({ command: "git add queue/mac/pending/job.md" }, empty).ok, false);
  const mixed = jobDir(GOOD_JOB);
  writeFileSync(join(mixed, "queue", "mac", "pending", "bad.md"), "---\nrepo: ~\n---\nx\n");
  assert.equal(checkBashMacJob({ command: "git add queue/mac/pending/" }, mixed).ok, false);
  assert.equal(checkBashMacJob({ command: "git add queue/mac/pending/*.md" }, mixed).ok, false);
  assert.equal(checkBashMacJob({ command: "git add -A queue/mac/pending/job.md" }, mixed).ok, true);
});

test("DISC-144: the gate process denies a bad job add and allows a good one", () => {
  const bad = jobDir("---\nrepo: ~\n---\nx\n");
  assert.equal(runGate({ command: "git add queue/mac/pending/job.md", description: LABEL }, bad).decision, "deny");
  const good = jobDir(GOOD_JOB);
  assert.equal(runGate({ command: "git add queue/mac/pending/job.md", description: LABEL }, good).decision, "allow");
});

// --- DISC-164: lane-sweep pointer, symlinked parent; context-fill reopen -----

function lane(rootDir, gitText, { makeTarget = true } = {}) {
  const d = join(rootDir, "lane");
  mkdirSync(join(d, "node_modules", "x"), { recursive: true });
  const target = join(rootDir, "repo", ".git", "worktrees", "lane");
  if (makeTarget) mkdirSync(target, { recursive: true });
  writeFileSync(join(d, ".git"), gitText(target));
  return d;
}
const clean = (wt) => spawnSync("node", [sweep, "--clean-artifacts", wt], { encoding: "utf8" });

test("DISC-164: a linked worktree whose gitdir target exists is cleaned; a pointer to nothing is refused", () => {
  const ok = mkdtempSync(join(realpathSync(tmpdir()), "sweep-"));
  const wt = lane(ok, (t) => `gitdir: ${t}\n`);
  assert.match(clean(wt).stdout, /action=removed/);
  const gone = mkdtempSync(join(realpathSync(tmpdir()), "sweep-"));
  const wt2 = lane(gone, (t) => `gitdir: ${t}\n`, { makeTarget: false });
  const r = clean(wt2);
  assert.match(r.stdout, /action=refused.*(does not exist|no such)/);
  assert.equal(existsSync(join(wt2, "node_modules")), true);
});

test("DISC-164: only a one-line pointer counts — a later line that matches does not rescue a first line that does not", () => {
  const d = mkdtempSync(join(realpathSync(tmpdir()), "sweep-"));
  const wt = lane(d, (t) => `gitdir: /elsewhere\ngitdir: ${t}\n`);
  assert.match(clean(wt).stdout, /action=refused/);
  assert.equal(existsSync(join(wt, "node_modules")), true);
});

test("DISC-164: a path reached through a symlinked parent folder is refused", () => {
  const d = mkdtempSync(join(realpathSync(tmpdir()), "sweep-"));
  const real = join(d, "real");
  mkdirSync(real);
  const wt = lane(real, (t) => `gitdir: ${t}\n`);
  symlinkSync(real, join(d, "alias"));
  const r = clean(join(d, "alias", "lane"));
  assert.match(r.stdout, /action=refused.*symlink/);
  assert.equal(existsSync(join(wt, "node_modules")), true);
});

test("DISC-164: 'reopen the PR' in a wrapped session is not the reopen word; 'reopen' and 'reopen please' still are", () => {
  const d = mkdtempSync(join(tmpdir(), "cf-"));
  const tp = join(d, "t.jsonl");
  writeFileSync(tp, JSON.stringify({ type: "assistant", message: { usage: { input_tokens: 100000 } } }) + "\n");
  const ev = (prompt) => ({ hook_event_name: "UserPromptSubmit", session_id: "w", transcript_path: tp, prompt });
  const opts = { window: 200_000, dir: d };
  markWrapped("w", { dir: d });
  assert.match(handle(ev("reopen the PR and fix the title"), opts), /^This session is wrapped/);
  assert.match(handle(ev("reopen the PR #12 please"), opts), /^This session is wrapped/);
  assert.match(handle(ev("reopen"), opts), /reopened this wrapped session/);
});

// --- DISC-144 (follow-up): tree-wide adds stage pending jobs without naming them ----

function gitJobRepo({ pending = {}, commit = {} } = {}) {
  const d = mkdtempSync(join(realpathSync(tmpdir()), "macrepo-"));
  const git = (...a) => execFileSync("git", ["-C", d, "-c", "user.email=t@t", "-c", "user.name=t", ...a], { stdio: "ignore" });
  git("init", "-q");
  mkdirSync(join(d, "queue", "mac", "pending"), { recursive: true });
  writeFileSync(join(d, "README.md"), "x");
  for (const [f, text] of Object.entries(commit)) writeFileSync(join(d, "queue", "mac", "pending", f), text);
  git("add", "-A");
  git("commit", "-q", "-m", "init");
  for (const [f, text] of Object.entries(pending)) writeFileSync(join(d, "queue", "mac", "pending", f), text);
  return d;
}
const BAD_JOB = "---\nrepo: ~\n---\nx\n";

test("DISC-144: git add -A / . / --all / queue / a glob refuse when an unstaged pending job is bad", () => {
  const d = gitJobRepo({ pending: { "bad.md": BAD_JOB } });
  for (const c of ["git add -A", "git add .", "git add --all", "git add queue", "git add queue/mac", "git add -A .", "git add ':/'", "git add *", "git add -Av"]) {
    const v = checkBashMacJob({ command: c }, d);
    assert.equal(v.ok, false, c);
    assert.match(v.reason, /bad\.md.*not under \$HOME/, c);
  }
});

test("DISC-144: git add -u checks modified tracked jobs only; a clean job, no pending dir and a non-pending path pass", () => {
  const modified = gitJobRepo({ commit: { "j.md": GOOD_JOB }, pending: { "j.md": BAD_JOB } });
  assert.equal(checkBashMacJob({ command: "git add -u" }, modified).ok, false);
  const untrackedOnly = gitJobRepo({ pending: { "bad.md": BAD_JOB } });
  assert.equal(checkBashMacJob({ command: "git add -u" }, untrackedOnly).ok, true); // -u never stages an untracked file
  assert.equal(checkBashMacJob({ command: "git add -A" }, gitJobRepo({ pending: { "ok.md": GOOD_JOB } })).ok, true);
  assert.equal(checkBashMacJob({ command: "git add -A" }, gitJobRepo()).ok, true);
  assert.equal(checkBashMacJob({ command: "git add README.md" }, untrackedOnly).ok, true);
  assert.equal(checkBashMacJob({ command: "git add src/" }, untrackedOnly).ok, true);
});

test("DISC-144: a tree-wide add fails closed when git cannot say what it stages", () => {
  const notARepo = mkdtempSync(join(realpathSync(tmpdir()), "norepo-"));
  assert.equal(checkBashMacJob({ command: "git add -A" }, notARepo).ok, false);
  assert.equal(checkBashMacJob({ command: "git add ." }, notARepo).ok, false);
});

test("DISC-144: the gate process denies git add -A over a bad pending job", () => {
  const d = gitJobRepo({ pending: { "bad.md": BAD_JOB } });
  assert.equal(runGate({ command: "git add -A" }, d).decision, "deny");
  assert.equal(runGate({ command: "git add -A" }, gitJobRepo()).decision, "allow");
});

// --- DISC-164 (follow-up): an unwritable marker dir must not repeat the 70% nudge ----

test("DISC-164: with the marker dir unwritable the 70% nudge falls back to a second dir and fires once per percent", () => {
  const d = mkdtempSync(join(tmpdir(), "cf-"));
  const tp = join(d, "t.jsonl");
  writeFileSync(tp, JSON.stringify({ type: "assistant", message: { usage: { input_tokens: 150000 } } }) + "\n");
  const blocked = join(d, "not-a-dir");
  writeFileSync(blocked, "file, so every marker write fails");
  const fallbackDir = mkdtempSync(join(tmpdir(), "cf-fallback-"));
  const ev = { hook_event_name: "PostToolUse", session_id: "u", transcript_path: tp };
  const opts = { window: 200_000, dir: blocked, fallbackDir };
  assert.match(handle(ev, opts), /past the 70% wrap line/);
  assert.equal(handle(ev, opts), null);
  // both unwritable: a repeat beats silence
  const both = { window: 200_000, dir: blocked, fallbackDir: blocked };
  assert.match(handle(ev, both), /past the 70% wrap line/);
  assert.match(handle(ev, both), /past the 70% wrap line/);
});

test("release: 1.152.0 in both manifests and CHANGED.txt, with the encoded line", () => {
  for (const p of [".claude-plugin/plugin.json", ".claude-plugin/marketplace.json"])
    assert.ok(readFileSync(join(root, p), "utf8").includes('"version": "1.152.0"'), p);
  const top = readFileSync(join(root, "CHANGED.txt"), "utf8");
  assert.ok(top.startsWith("1.152.0 — "));
  assert.match(top.split("\n\n")[0], /\nencoded: 1\.152\.0 — /);
});
