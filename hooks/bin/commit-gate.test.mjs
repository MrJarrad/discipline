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
