// Tests for commit-gate.mjs's absent-marker fallback — vertical slices, one
// behavior per test.
// Run: node --test hooks/bin/commit-gate.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const gatePath = join(dirname(fileURLToPath(import.meta.url)), "commit-gate.mjs");

function makeRepo({ typecheckExit }) {
  const dir = mkdtempSync(join(tmpdir(), "commit-gate-test-"));
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({
      name: "fixture",
      scripts: { typecheck: `node -e "process.exit(${typecheckExit})"` },
    }, null, 2),
  );
  return dir;
}

function runGate(dir, command = 'git commit -m "test"', env = {}) {
  const input = JSON.stringify({ cwd: dir, tool_input: { command } });
  try {
    const stdout = execFileSync(process.execPath, [gatePath], {
      input,
      encoding: "utf8",
      env: { ...process.env, ...env },
    });
    return { exitCode: 0, stdout };
  } catch (err) {
    return { exitCode: err.status, stdout: err.stdout || "" };
  }
}

test("absent marker on a green repo: gate runs typecheck inline and allows the commit", () => {
  const dir = makeRepo({ typecheckExit: 0 });
  try {
    const result = runGate(dir);
    assert.equal(result.stdout, "", "allow path emits no deny JSON");

    const markerPath = join(dir, ".claude", ".typecheck-status.json");
    assert.ok(existsSync(markerPath), "gate must write the marker it computed");
    const marker = JSON.parse(readFileSync(markerPath, "utf8"));
    assert.equal(marker.status, "green");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("absent marker on a red repo: gate runs typecheck inline and denies the commit", () => {
  const dir = makeRepo({ typecheckExit: 1 });
  try {
    const result = runGate(dir);
    assert.match(result.stdout, /permissionDecision":"deny"/);
    assert.match(result.stdout, /Typecheck gate/);

    const markerPath = join(dir, ".claude", ".typecheck-status.json");
    assert.ok(existsSync(markerPath), "gate must write the marker it computed even when red");
    const marker = JSON.parse(readFileSync(markerPath, "utf8"));
    assert.equal(marker.status, "red");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("existing green marker: freshness/allow behavior untouched (no inline re-run)", () => {
  const dir = makeRepo({ typecheckExit: 1 }); // would fail if re-run — proves no re-run happens
  mkdirSync(join(dir, ".claude"), { recursive: true });
  writeFileSync(
    join(dir, ".claude", ".typecheck-status.json"),
    JSON.stringify({ status: "green", ts: new Date().toISOString(), command: "npm run typecheck --silent", tail: "" }),
  );
  try {
    const result = runGate(dir);
    assert.equal(result.stdout, "");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("existing red marker: still denies, unchanged", () => {
  const dir = makeRepo({ typecheckExit: 0 }); // would pass if re-run — proves the stale red marker is honored, not re-run
  mkdirSync(join(dir, ".claude"), { recursive: true });
  writeFileSync(
    join(dir, ".claude", ".typecheck-status.json"),
    JSON.stringify({ status: "red", ts: new Date().toISOString(), command: "npm run typecheck --silent", tail: "boom" }),
  );
  try {
    const result = runGate(dir);
    assert.match(result.stdout, /permissionDecision":"deny"/);
    assert.match(result.stdout, /RED/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("absent marker with a hung typecheck: gate times out fast and denies with a timeout message", () => {
  const dir = mkdtempSync(join(tmpdir(), "commit-gate-test-"));
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({
      name: "fixture",
      // Sleeps far longer than the test-local timeout override below —
      // proves the gate doesn't hang waiting on a stuck typecheck.
      scripts: { typecheck: "node -e \"setTimeout(() => {}, 60000)\"" },
    }, null, 2),
  );
  try {
    const start = Date.now();
    const result = runGate(dir, 'git commit -m "test"', { TYPECHECK_TIMEOUT_MS: "500" });
    const elapsed = Date.now() - start;

    assert.ok(elapsed < 10000, `gate must fail fast, not hang until the real command finishes (took ${elapsed}ms)`);
    assert.match(result.stdout, /permissionDecision":"deny"/);
    assert.match(result.stdout, /TIMED OUT/);
    assert.match(result.stdout, /timed out after 500ms/);

    const markerPath = join(dir, ".claude", ".typecheck-status.json");
    assert.ok(existsSync(markerPath), "gate must write the marker it computed even on timeout");
    const marker = JSON.parse(readFileSync(markerPath, "utf8"));
    assert.equal(marker.status, "timeout", "timeout is its own status, distinct from red");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("non-commit commands pass through untouched even with no marker", () => {
  const dir = makeRepo({ typecheckExit: 1 });
  try {
    const result = runGate(dir, "git status");
    assert.equal(result.stdout, "");
    assert.equal(existsSync(join(dir, ".claude", ".typecheck-status.json")), false, "no inline typecheck for non-commit commands");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---- Version-match gate ----------------------------------------------------
// 1.93.1 shipped with plugin.json bumped and marketplace.json left behind —
// this gate makes that class refuse the commit instead of shipping red.

test("release commit whose marketplace.json version does not match plugin.json is denied", () => {
  const dir = makeReleaseRepo("1.93.2", "1.93.0");
  try {
    const result = runGate(dir, 'git commit -m "release: 1.93.2"', {
      DISCIPLINE_LEDGER_GATE: "0", // isolate this gate from the ledger gate
    });
    assert.match(result.stdout, /permissionDecision":"deny"/);
    assert.match(result.stdout, /Version-match gate/);
    assert.match(result.stdout, /1\.93\.2/);
    assert.match(result.stdout, /1\.93\.0/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("release commit whose marketplace.json version matches plugin.json passes the gate", () => {
  const dir = makeReleaseRepo("1.93.2", "1.93.2");
  try {
    const result = runGate(dir, 'git commit -m "release: 1.93.2"', {
      DISCIPLINE_LEDGER_GATE: "0",
    });
    assert.equal(result.stdout, "", "matching versions emit no deny JSON");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a commit that stages no plugin.json version bump never runs the version-match gate", () => {
  const dir = makeReleaseRepo("1.72.0", "1.72.0"); // manifest rewritten, version unchanged
  try {
    const result = runGate(dir, 'git commit -m "chore: reformat manifest"', {
      DISCIPLINE_LEDGER_GATE: "0",
    });
    assert.equal(result.stdout, "", "only a version bump triggers the gate");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---- Lesson-ledger gate ---------------------------------------------------
// A release commit (staged plugin.json version bump) must not land while a
// fleet lesson or ruling is still `queued`.

// A real git repo with the plugin manifest staged at `version`, a
// marketplace manifest staged at the same version (unless `marketplaceVersion`
// says otherwise, for the version-match gate's own denial tests), plus a
// green typecheck script so only the gate under test can deny.
function makeReleaseRepo(version, marketplaceVersion = version) {
  const dir = mkdtempSync(join(tmpdir(), "commit-gate-release-"));
  const git = (...args) => execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" });
  git("init", "-q");
  git("config", "user.email", "t@example.com");
  git("config", "user.name", "t");
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ name: "fixture", scripts: { typecheck: 'node -e "process.exit(0)"' } }, null, 2),
  );
  mkdirSync(join(dir, ".claude-plugin"), { recursive: true });
  writeFileSync(join(dir, ".claude-plugin", "plugin.json"), JSON.stringify({ name: "d", version: "1.72.0" }, null, 2));
  writeFileSync(
    join(dir, ".claude-plugin", "marketplace.json"),
    JSON.stringify({ name: "d", plugins: [{ name: "d", version: "1.72.0" }] }, null, 2),
  );
  git("add", "-A");
  git("commit", "-qm", "base");
  writeFileSync(join(dir, ".claude-plugin", "plugin.json"), JSON.stringify({ name: "d", version }, null, 2));
  writeFileSync(
    join(dir, ".claude-plugin", "marketplace.json"),
    JSON.stringify({ name: "d", plugins: [{ name: "d", version: marketplaceVersion }] }, null, 2),
  );
  git("add", "-A");
  return dir;
}

// Fixture vault carrying one lesson at the given `encoded:` value.
function makeVault(encoded) {
  const root = mkdtempSync(join(tmpdir(), "commit-gate-vault-"));
  mkdirSync(join(root, "fleet", "lessons"), { recursive: true });
  writeFileSync(join(root, "fleet", "lessons", "a.md"), `---\nname: a\nencoded: ${encoded}\n---\n\nbody\n`);
  return root;
}

test("release commit with a queued lesson is denied, naming the release and the record", () => {
  const dir = makeReleaseRepo("1.73.0");
  const vault = makeVault("queued");
  try {
    const result = runGate(dir, 'git commit -m "release: 1.73.0"', {
      DISCIPLINE_VAULT_ROOT: vault,
    });
    assert.match(result.stdout, /permissionDecision":"deny"/);
    assert.match(result.stdout, /Lesson-ledger gate/);
    assert.match(result.stdout, /1\.73\.0/);
    assert.match(result.stdout, /a\.md/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(vault, { recursive: true, force: true });
  }
});

test("release commit with an encoded ledger passes the gate", () => {
  const dir = makeReleaseRepo("1.73.0");
  const vault = makeVault("1.73.0");
  try {
    const result = runGate(dir, 'git commit -m "release: 1.73.0"', {
      DISCIPLINE_VAULT_ROOT: vault,
    });
    assert.equal(result.stdout, "", "clean ledger emits no deny JSON");
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(vault, { recursive: true, force: true });
  }
});

test("an absent vault root warns and skips rather than blocking the release", () => {
  const dir = makeReleaseRepo("1.73.0");
  try {
    const result = runGate(dir, 'git commit -m "release: 1.73.0"', {
      DISCIPLINE_VAULT_ROOT: join(tmpdir(), "no-such-vault-root-abc"),
    });
    assert.equal(result.stdout, "", "absent vault must not deny the commit");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a commit that stages no version bump never runs the ledger", () => {
  const dir = makeReleaseRepo("1.72.0"); // manifest rewritten, version unchanged
  const vault = makeVault("queued");
  try {
    const result = runGate(dir, 'git commit -m "chore: reformat manifest"', {
      DISCIPLINE_VAULT_ROOT: vault,
    });
    assert.equal(result.stdout, "", "only a version bump is a release commit");
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(vault, { recursive: true, force: true });
  }
});

test("DISCIPLINE_LEDGER_GATE=0 is the opt-out; anything else leaves the gate on", () => {
  const dir = makeReleaseRepo("1.73.0");
  const vault = makeVault("queued");
  try {
    const off = runGate(dir, 'git commit -m "release: 1.73.0"', {
      DISCIPLINE_VAULT_ROOT: vault,
      DISCIPLINE_LEDGER_GATE: "0",
    });
    assert.equal(off.stdout, "", "=0 opts a run out of the ledger gate");
    const on = runGate(dir, 'git commit -m "release: 1.73.0"', { DISCIPLINE_VAULT_ROOT: vault });
    assert.match(on.stdout, /permissionDecision":"deny"/, "the gate is on with no flag set");
    assert.match(on.stdout, /Lesson-ledger gate/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(vault, { recursive: true, force: true });
  }
});

// Session-10 lesson 8: the gate keys on the repo being committed, not the first `cd`.
test("a command that cds into a red repo first but commits in a green one is allowed", () => {
  const red = makeRepo({ typecheckExit: 1 });
  const green = makeRepo({ typecheckExit: 0 });
  try {
    const r = runGate(green, `cd ${red} && ls && cd ${green} && git commit -m "x"`);
    assert.equal(r.stdout, "", "the committed repo (green) decides, not the first cd");
  } finally {
    rmSync(red, { recursive: true, force: true });
    rmSync(green, { recursive: true, force: true });
  }
});

test("git -C <path> commit gates on that path, not the session cwd or an earlier cd", () => {
  const red = makeRepo({ typecheckExit: 1 });
  const green = makeRepo({ typecheckExit: 0 });
  try {
    assert.equal(runGate(red, `git -C ${green} commit -m "x"`).stdout, "", "green target allowed from a red cwd");
    assert.match(runGate(green, `git -C ${red} commit -m "x"`).stdout, /Typecheck gate/, "red target denied from a green cwd");
  } finally {
    rmSync(red, { recursive: true, force: true });
    rmSync(green, { recursive: true, force: true });
  }
});

test("a later cd into a red repo before the commit still denies", () => {
  const red = makeRepo({ typecheckExit: 1 });
  const green = makeRepo({ typecheckExit: 0 });
  try {
    assert.match(runGate(green, `cd ${green} && cd ${red} && git commit -m "x"`).stdout, /Typecheck gate/);
  } finally {
    rmSync(red, { recursive: true, force: true });
    rmSync(green, { recursive: true, force: true });
  }
});

// Audit finding 1: command shape decides whether and where a commit happens.
const SHAPES = [
  // [label, session repo is red?, command builder(redDir, greenDir), expect deny]
  ["subshell cd into a red repo", false, (r) => `(cd ${r} && git commit -m x)`, true],
  ["-C into a red repo", false, (r) => `git -C ${r} commit -m x`, true],
  ["cd chain after other commands", false, (r) => `git add . && cd ${r} && git commit -m x`, true],
  ["pushd into a red repo", false, (r) => `pushd ${r} && git commit -m x`, true],
  ["bash -c body", false, (r) => `bash -c 'cd ${r} && git commit -m x'`, true],
  ["env assignment before git", true, () => "FOO=1 git commit -m x", true],
  ["commit message mentioning git commit", true, () => 'git commit -m "fix git commit gate"', true],
  ["grep for the phrase is not a commit", true, () => "grep -rn 'git commit' docs/", false],
  ["echo of the phrase is not a commit", true, () => "echo 'git commit later'", false],
  ["--grep argument is not a commit", true, () => 'git log --grep="git commit"', false],
  ["cd to a green repo then commit", true, (_r, g) => `cd ${g} && git commit -m x`, false],
  // Reviewer r1 (7037bec) escapes — real commits the first parser let through.
  ["absolute git path", true, () => "/usr/bin/git commit -m x", true],
  ["if/then", true, () => "if true; then git commit -m x; fi", true],
  ["while/do", true, () => "while true; do git commit -m x; done", true],
  ["negation", true, () => "! git commit -m x", true],
  ["brace group with cd", false, (r) => `{ cd ${r} && git commit -m x; }`, true],
  ["eval", true, () => "eval 'git commit -m x'", true],
  ["xargs", true, () => "xargs git commit", true],
  ["timeout", true, () => "timeout 5 git commit -m x", true],
  ["sudo -u", true, () => "sudo -u me git commit -m x", true],
  ["env -i", true, () => "env -i git commit -m x", true],
  ["env -C into red", false, (r) => `env -C ${r} git commit -m x`, true],
  ["backticks", true, () => "`git commit -m x`", true],
  ["bash -lc", true, () => "bash -lc 'git commit -m x'", true],
  ["bash -c with cd into red", false, (r) => `bash -c 'cd ${r}; git commit'`, true],
  // Shapes the reviewer confirmed already behave.
  ["env assignment wrapper", true, () => "env X=1 git commit -m x", true],
  ["git -c k=v", true, () => "git -c k=v commit -m x", true],
  ["git -c twice", true, () => "git -c a=1 -c b=2 commit -m x", true],
  ["command git", true, () => "command git commit -m x", true],
  ["git --no-pager", true, () => "git --no-pager commit -m x", true],
  ["-C red from green", false, (r) => `git -C ${r} commit -m x`, true],
  ["newline then commit", true, () => "echo hi\ngit commit -m x", true],
  ["cd on its own line", false, (r) => `cd ${r}\ngit commit -m x`, true],
  ["cd || exit; commit", false, (r) => `cd ${r} || exit; git commit -m x`, true],
  [";/&& inside quotes", true, () => 'git commit -m "a;b && c"', true],
  ["heredoc message", true, () => "git commit -F - <<'EOF'\nmsg; foo\nEOF", true],
  ["$(cat <<EOF) message", true, () => 'git commit -m "$(cat <<\'EOF\'\nfix: x\nEOF\n)"', true],
  ["git commit-tree is not a commit", true, () => "git commit-tree abc", false],
  ["git status", true, () => "git status", false],
  ["-C green from red", true, (_r, g) => `git -C ${g} commit -m x`, false],
  // Review r2 (bff2fc1): a commit line fed to a stdin shell.
  ["echo piped into bash", true, () => "echo 'git commit -m x' | bash", true],
  ["printf piped into sh", true, () => "printf 'git commit -m x' | sh", true],
  ["here-string into bash", true, () => "bash <<< 'git commit'", true],
  ["glued here-string after commit", true, () => "git commit<<<x", true],
  ["piped through a filter into zsh", true, () => "echo 'git commit -m x' | cat | zsh", true],
  ["env -S", true, () => "env -S 'git commit -m x'", true],
  ["cd into red then piped shell", false, (r) => `cd ${r} && echo 'git commit -m x' | bash`, true],
  ["bash running a script file is not re-parsed", true, () => "echo 'git commit' | bash script.sh", false],
  ["echo piped into cat is not a commit", true, () => "echo 'git commit' | cat", false],
  ["here-string of plain text into bash", true, () => "bash <<< 'ls -la'", false],
  ["heredoc body mentioning git commit is data", true, () => "cat <<'EOF' > notes.md\nrun:\ngit commit -m x\nEOF", false],
];
for (const [label, sessionRed, build, expectDeny] of SHAPES) {
  test(`command shape: ${label}`, () => {
    const red = makeRepo({ typecheckExit: 1 });
    const green = makeRepo({ typecheckExit: 0 });
    try {
      const result = runGate(sessionRed ? red : green, build(red, green));
      assert.equal(/permissionDecision":"deny"/.test(result.stdout), expectDeny, result.stdout);
    } finally {
      rmSync(red, { recursive: true, force: true });
      rmSync(green, { recursive: true, force: true });
    }
  });
}

// 1119: the hook sees the command text BEFORE the shell expands it, so `cd $S/x && git commit`
// reaches the gate with a literal `$S`. A target dir that does not exist must not be created.
test("a commit target that does not exist (unexpanded $S) creates no directory", () => {
  const dir = makeRepo({ typecheckExit: 0 });
  try {
    runGate(dir, 'cd $S/x/$r && git commit -m "x"');
    runGate(dir, 'git -C "$S/up" commit -m "x"');
    assert.equal(existsSync(join(dir, "$S")), false, "no $S directory written under the session cwd");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
