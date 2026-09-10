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

// ---- Lesson-ledger gate ---------------------------------------------------
// A release commit (staged plugin.json version bump) must not land while a
// fleet lesson or ruling is still `queued`.

// A real git repo with the plugin manifest staged at `version`, plus a green
// typecheck script so only the ledger gate can deny.
function makeReleaseRepo(version) {
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
  git("add", "-A");
  git("commit", "-qm", "base");
  writeFileSync(join(dir, ".claude-plugin", "plugin.json"), JSON.stringify({ name: "d", version }, null, 2));
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
      DISCIPLINE_LEDGER_GATE: "1",
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
      DISCIPLINE_LEDGER_GATE: "1",
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
      DISCIPLINE_LEDGER_GATE: "1",
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
      DISCIPLINE_LEDGER_GATE: "1",
      DISCIPLINE_VAULT_ROOT: vault,
    });
    assert.equal(result.stdout, "", "only a version bump is a release commit");
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(vault, { recursive: true, force: true });
  }
});

test("the ledger gate stays off unless DISCIPLINE_LEDGER_GATE=1", () => {
  const dir = makeReleaseRepo("1.73.0");
  const vault = makeVault("queued");
  try {
    const result = runGate(dir, 'git commit -m "release: 1.73.0"', { DISCIPLINE_VAULT_ROOT: vault });
    assert.equal(result.stdout, "", "gate ships off by default while the vault is backfilled");
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(vault, { recursive: true, force: true });
  }
});
