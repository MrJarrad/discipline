// Tests for session-bootstrap.mjs — vertical slices, one behavior per test.
// Run: node --test scripts/session-bootstrap.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runBootstrap } from "./session-bootstrap.mjs";

// Builds a fixture dir with a plugin.json (marketplace version) and a cache
// dir containing version-numbered subdirs, matching the real repo layout
// (.claude-plugin/plugin.json vs ~/.claude/plugins/cache/discipline/discipline/<version>/).
function makeFixture({ marketplaceVersion = "1.14.0", cacheVersions = ["1.14.0"] } = {}) {
  const root = mkdtempSync(join(tmpdir(), "session-bootstrap-test-"));
  const pluginJsonPath = join(root, "plugin.json");
  writeFileSync(pluginJsonPath, JSON.stringify({ version: marketplaceVersion }), "utf8");
  const cacheDir = join(root, "cache");
  for (const v of cacheVersions) mkdirSync(join(cacheDir, v), { recursive: true });
  return { root, pluginJsonPath, cacheDir };
}

function basePaths(fixture, overrides = {}) {
  return {
    listenerUrl: "http://127.0.0.1:4411/health",
    listenerScript: "/fake/capture-listener.mjs",
    conformanceMapPath: "/fake/portfolio/design/figma-map.json",
    listenerLog: "/tmp/fake-capture-listener.log",
    devUrl: "http://localhost:3210",
    portfolioDir: "/fake/portfolio",
    devLog: "/tmp/fake-portfolio-dev.log",
    zshrcPath: "/fake/.zshrc",
    pluginJsonPath: fixture.pluginJsonPath,
    cacheDir: fixture.cacheDir,
    logPath: join(fixture.root, "bootstrap.jsonl"),
    ...overrides,
  };
}

function okFetch() {
  return async () => ({ ok: true, status: 200 });
}

// Routes by the git/zsh subcommand so one fake covers every execFileImpl
// call site (branch check, status check, checkout, worktree list, token
// resolution) — matches the module's single injectable-exec seam.
function healthyExecFile({ branch = "main", worktreeEntries = ["/fake/portfolio"], porcelainStatus = "" } = {}) {
  return (cmd, args) => {
    if (cmd === "git" && args.includes("branch")) return { status: 0, stdout: `${branch}\n`, stderr: "" };
    if (cmd === "git" && args.includes("status")) return { status: 0, stdout: porcelainStatus, stderr: "" };
    if (cmd === "git" && args.includes("checkout")) return { status: 0, stdout: "", stderr: "" };
    if (cmd === "git" && args.includes("worktree")) {
      return { status: 0, stdout: worktreeEntries.map((p) => `worktree ${p}\n`).join(""), stderr: "" };
    }
    if (cmd === "zsh") return { status: 0, stdout: "figd_realtoken\x1fsk-oauth-abc", stderr: "" };
    throw new Error(`healthyExecFile: unexpected call ${cmd} ${JSON.stringify(args)}`);
  };
}

test("all checks healthy -> compact success line, no actions taken", async () => {
  const fixture = makeFixture();
  const spawnCalls = [];
  const result = await runBootstrap({
    paths: basePaths(fixture),
    fetchImpl: okFetch(),
    execFileImpl: healthyExecFile(),
    spawnDetachedImpl: (...args) => {
      spawnCalls.push(args);
      return { unref() {} };
    },
  });

  assert.equal(result.line, "bootstrap: listener✓ dev✓ tokens✓ plugin v1.14.0 (cache current) worktrees:0");
  assert.equal(spawnCalls.length, 0);
});
