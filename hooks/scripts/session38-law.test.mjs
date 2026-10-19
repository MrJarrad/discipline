// 1.152.1: the reviewer's ambers A1-A5 on #113 — bypasses of the force-push, kill-by-name and Mac-job gates.
// Seams: the Bash gate's exported checks. Run: node --test hooks/scripts/session38-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { checkBashKillByName, checkBashForcePush, checkBashMacJob } from "../bin/agent-dispatch-gate.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const GOOD_JOB = "---\nrepo: ~/JHD/hoverboard\n---\nDo it. No background tasks, no subagents.\n";
const BAD_JOB = "---\nrepo: ~\n---\nx\n";
const tmp = (p) => mkdtempSync(join(realpathSync(tmpdir()), p));

function jobRepo(jobs, { git = false } = {}) {
  const d = tmp("jobs-");
  mkdirSync(join(d, "queue", "mac", "pending"), { recursive: true });
  for (const [f, text] of Object.entries(jobs)) writeFileSync(join(d, "queue", "mac", "pending", f), text);
  if (git) execFileSync("git", ["-C", d, "init", "-q"]);
  return d;
}
const macOk = (command, cwd) => checkBashMacJob({ command }, cwd).ok;

// --- A1: git accepts unique option abbreviations --------------------------------

test("A1: abbreviated force options are force-pushes (3+ characters after --)", () => {
  for (const c of ["git push --force-w origin x", "git push --mir", "git push --force-i origin x", "git push --for origin x", "git push --force-with origin x", "git push --mirr"])
    assert.equal(checkBashForcePush({ command: c }).ok, false, c);
});

// --- A2/A3: path-prefixed git, and every wrapper that runs a command ------------

test("A2: a path-prefixed git is still git", () => {
  for (const c of ["/usr/bin/git push -f", "/opt/homebrew/bin/git -C x push --force", "./git push -f"])
    assert.equal(checkBashForcePush({ command: c }).ok, false, c);
  const d = jobRepo({ "job.md": BAD_JOB });
  assert.equal(macOk("/usr/bin/git add queue/mac/pending/job.md", d), false);
});

const WRAPPED = [
  "(git push -f)", "$(git push -f)", "x=$(git push -f origin x)", "{ git push -f; }", "if true; then git push -f; fi",
  "for b in a b; do git push -f origin $b; done", "while false; do git push -f; done", "`git push -f`", "echo `git push -f`",
  "eval 'git push -f'", "eval git push -f", "eval \"git push --force\"", "bash <<< 'git push -f'", "! git push -f", "true && (cd x; git push --force)",
  "bash -c 'eval \"git push -f\"'",
];
test("A3: force-push is caught inside subshell, $(), braces, then/do, backticks, eval and here-strings", () => {
  for (const c of WRAPPED) assert.equal(checkBashForcePush({ command: c }).ok, false, c);
});
test("A3: kill-by-name is caught in the same wrappers", () => {
  for (const c of ["(pkill x)", "$(pkill x)", "{ pkill x; }", "if true; then killall node; fi", "`pkill x`", "eval 'pkill x'", "eval pkill x", "bash <<< 'killall node'", "! pkill x"])
    assert.equal(checkBashKillByName({ command: c }).ok, false, c);
});

test("ordinary commands stay unblocked", () => {
  for (const c of [
    "git push", "git push -u origin x", "git push origin main", "git push --tags", "git push --dry-run", "git push origin feat/x-y",
    "git push origin refs/heads/x:refs/heads/x", "git push --follow-tags", "git push --set-upstream origin x", "git push --no-verify",
    "git push --delete origin x", "git push origin :main", "git commit -m 'git push -f'", "echo git push -f", "git fetch --force",
    "(git status)", "if true; then git push origin x; fi", "eval 'git status'", "bash -c 'git push -u origin x'", "git log --format=%h -n 5",
  ])
    assert.equal(checkBashForcePush({ command: c }).ok, true, c);
  for (const c of ["grep pkill notes.md", "command -v pkill", "echo pkill", "(echo hi)", "eval 'echo killall'", "git commit -m 'pkill x'", "kill 4242"])
    assert.equal(checkBashKillByName({ command: c }).ok, true, c);
  const d = jobRepo({ "job.md": GOOD_JOB }, { git: true });
  writeFileSync(join(d, "notes.txt"), "n");
  for (const c of ["git add notes.txt", "git add -- notes.txt", "git add -p notes.txt", "git add queue/mac/pending/job.md", "(cd queue/mac/pending && git add job.md)", "git status", "git add -A"])
    assert.equal(macOk(c, d), true, c);
});

// --- A4: paths resolve against the directory the command sets -------------------

test("A4: a relative add from inside queue/ (cd, git -C, pushd-free) checks the resolved file", () => {
  const d = jobRepo({ "bad.md": BAD_JOB, "good.md": GOOD_JOB });
  for (const c of [
    "cd queue/mac/pending && git add bad.md", "cd queue && git add mac/pending/bad.md", "cd queue/mac && git add pending/bad.md",
    "cd queue/mac && git add pending", "git -C queue/mac/pending add bad.md", "git -C queue add mac/pending/bad.md",
    "cd queue/mac/pending; git add ./bad.md", "cd queue/mac/pending && git add ../pending/bad.md", "(cd queue/mac/pending && git add bad.md)",
  ])
    assert.equal(macOk(c, d), false, c);
  assert.equal(macOk("cd queue/mac/pending && git add good.md", d), true);
  assert.equal(macOk("git -C queue/mac/pending add good.md", d), true);
});
test("A4: cd into the pending directory then a tree-wide add asks git", () => {
  const d = jobRepo({ "bad.md": BAD_JOB }, { git: true });
  for (const c of ["cd queue/mac/pending && git add .", "cd queue/mac/pending && git add -A", "git -C queue/mac/pending add ."])
    assert.equal(macOk(c, d), false, c);
});

// --- A5: bash -c, git stage, --pathspec-from-file, substitutions -----------------

test("A5: bash -c / eval bodies, git stage and the cwd they inherit are checked", () => {
  const d = jobRepo({ "bad.md": BAD_JOB, "good.md": GOOD_JOB });
  for (const c of [
    "bash -c 'git add queue/mac/pending/bad.md'", "sh -c \"git add queue/mac/pending/bad.md\"", "eval 'git add queue/mac/pending/bad.md'",
    "git stage queue/mac/pending/bad.md", "cd queue/mac/pending && bash -c 'git add bad.md'", "bash <<< 'git add queue/mac/pending/bad.md'",
    "timeout 5 git add queue/mac/pending/bad.md",
  ])
    assert.equal(macOk(c, d), false, c);
  assert.equal(macOk("bash -c 'git add queue/mac/pending/good.md'", d), true);
  assert.equal(macOk("git stage queue/mac/pending/good.md", d), true);
});
test("A5: --pathspec-from-file is read (a file, never stdin), and a substitution in an add asks git", () => {
  const d = jobRepo({ "bad.md": BAD_JOB, "good.md": GOOD_JOB }, { git: true });
  writeFileSync(join(d, "bad.list"), "queue/mac/pending/bad.md\n");
  writeFileSync(join(d, "good.list"), "queue/mac/pending/good.md\n");
  assert.equal(macOk("git add --pathspec-from-file=bad.list", d), false);
  assert.equal(macOk("git add --pathspec-from-file bad.list", d), false);
  assert.equal(macOk("git add --pathspec-from-file=missing.list", d), false); // unreadable: fails closed
  assert.equal(macOk("git add --pathspec-from-file=-", d), false); // stdin cannot be read ahead: fails closed
  const clean = jobRepo({ "good.md": GOOD_JOB }, { git: true });
  writeFileSync(join(clean, "good.list"), "queue/mac/pending/good.md\n");
  assert.equal(macOk("git add --pathspec-from-file=good.list", clean), true);
  for (const c of ["git add $(ls queue/mac/pending/*)", "git add `ls queue/mac/pending/*`", "git add $FILES"])
    assert.equal(macOk(c, d), false, c);
  assert.equal(macOk("git add $(ls queue/mac/pending/*)", jobRepo({ "good.md": GOOD_JOB }, { git: true })), true);
});

// --- Encoded with 1.152.1: the session-only discipline backlog ruling and three queued lessons ----------

const flat = (p) => readFileSync(join(root, p), "utf8").replace(/\s+/g, " ");
const has = (p, text) => assert.ok(flat(p).includes(text), `${p} is missing: ${text}`);

function discVault(openRows, doneRows = "") {
  const v = tmp("discvault-");
  mkdirSync(join(v, "projects", "jhd-discipline"), { recursive: true });
  const fm = (kind) => `---\nname: d-${kind}\nkind: ${kind}\nprefix: DISC\n---\n`;
  writeFileSync(join(v, "projects", "jhd-discipline", "jhd-discipline-queue.md"), `${fm("queue")}| # | Needed |\n| - | - |\n`);
  writeFileSync(join(v, "projects", "jhd-discipline", "jhd-discipline-backlog.md"),
    `${fm("backlog")}# Backlog\n\n## Open\n\n| # | Item | Raised | Status |\n| - | --- | --- | --- |\n${openRows}\n\n## Done\n\n| # | Item | Raised | Status |\n| - | --- | --- | --- |\n${doneRows}\n`);
  return v;
}
const drift = (v, ...flags) => spawnSync("node", [join(root, "hooks", "scripts", "list-drift-check.mjs"), "--vault", v, ...flags], { encoding: "utf8" });

test("discipline backlog is session-only: --discipline-empty fails on every open DISC row, at wrap", () => {
  const open = discVault("| DISC-1 | carried over | 2026-10-01 | open |\n| DISC-2 | waiting | 2026-10-01 | waiting on operator |");
  const r = drift(open, "--discipline-empty");
  assert.equal(r.status, 1);
  assert.match(r.stdout, /disc-open.*DISC-1.*still open at wrap/);
  assert.match(r.stdout, /disc-open.*DISC-2/);
  assert.equal(drift(open).status, 0, "without the flag the open rows are ordinary, as before");
});
test("discipline backlog is session-only: an empty Open section (done with a PR, moot with a reason) passes", () => {
  const v = discVault("", "| DISC-4 | shipped | 2026-10-01 | done (#113 6b139e7) |\n| DISC-5 | dropped | 2026-10-01 | moot (operator dropped it) |");
  const r = drift(v, "--discipline-empty");
  assert.equal(r.status, 0, r.stdout);
  assert.doesNotMatch(r.stdout, /disc-open/);
});
test("wrap points at the ruling and the check; the wrap reference states what it fails on", () => {
  has("skills/wrap/SKILL.md", "--discipline-empty");
  has("skills/wrap/references/REPORT-AND-LEARN.md", "2026-10-19-discipline-backlog-is-session-only");
  has("skills/wrap/references/REPORT-AND-LEARN.md", "fails on every row left under `## Open` in the DISC backlog");
});
test("the three queued lessons each have a pointer line in the skill that owns the moment", () => {
  has("skills/vault-recall/SKILL.md", "2026-10-18-check-parallel-sessions-before-resuming");
  has("skills/pause-resume/SKILL.md", "2026-10-18-interrupt-stops-background-lanes");
  has("skills/research-synthesis/SKILL.md", "2026-10-18-pattern-reads-start-from-the-reference");
});
test("CHANGED.txt names the ruling and all three lessons under 1.152.1", () => {
  const top = readFileSync(join(root, "CHANGED.txt"), "utf8").split("\n\n")[0];
  for (const n of ["2026-10-19-discipline-backlog-is-session-only", "2026-10-18-check-parallel-sessions-before-resuming", "2026-10-18-interrupt-stops-background-lanes", "2026-10-18-pattern-reads-start-from-the-reference"])
    assert.ok(top.includes(n), n);
});

test("release: 1.152.1 in both manifests and CHANGED.txt, with the encoded line", () => {
  for (const p of [".claude-plugin/plugin.json", ".claude-plugin/marketplace.json"])
    assert.ok(readFileSync(join(root, p), "utf8").includes('"version": "1.152.1"'), p);
  const top = readFileSync(join(root, "CHANGED.txt"), "utf8");
  assert.ok(top.startsWith("1.152.1 — "));
  assert.match(top.split("\n\n")[0], /\nencoded: 1\.152\.1 — /);
});
