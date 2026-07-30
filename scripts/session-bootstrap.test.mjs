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

test("listener down -> starts it detached with CONFORMANCE_MAP_PATH, then reports healthy once recheck succeeds", async () => {
  const fixture = makeFixture();
  let listenerUp = false; // flips true once the "start" spawn call fires
  const spawnCalls = [];
  const result = await runBootstrap({
    paths: basePaths(fixture),
    fetchImpl: async (url) => {
      if (url === "http://127.0.0.1:4411/health" && !listenerUp) throw new Error("ECONNREFUSED");
      return { ok: true, status: 200 };
    },
    execFileImpl: healthyExecFile(),
    spawnDetachedImpl: (cmd, args, opts) => {
      spawnCalls.push({ cmd, args, opts });
      if (args.includes("/fake/capture-listener.mjs")) listenerUp = true;
      return { unref() {} };
    },
    sleepImpl: async () => {},
  });

  assert.equal(spawnCalls.length, 1);
  assert.equal(spawnCalls[0].args[0], "/fake/capture-listener.mjs");
  assert.equal(spawnCalls[0].opts.env.CONFORMANCE_MAP_PATH, "/fake/portfolio/design/figma-map.json");
  assert.ok(result.line.startsWith("bootstrap: listener✓"));
});

test("listener never comes healthy after start -> listener✗ with a remediation hint, still resolves (never throws)", async () => {
  const fixture = makeFixture();
  const spawnCalls = [];
  const result = await runBootstrap({
    paths: basePaths(fixture),
    fetchImpl: async (url) => {
      if (url === "http://127.0.0.1:4411/health") throw new Error("ECONNREFUSED");
      return { ok: true, status: 200 };
    },
    execFileImpl: healthyExecFile(),
    spawnDetachedImpl: (cmd, args, opts) => {
      spawnCalls.push({ cmd, args, opts });
      return { unref() {} };
    },
    sleepImpl: async () => {},
  });

  assert.equal(spawnCalls.filter((c) => c.args.includes("/fake/capture-listener.mjs")).length, 1);
  assert.match(result.line, /listener✗/);
  assert.match(result.line, /capture-listener/);
  assert.equal(result.ok, false);
});

test("dev server down, portfolio on a feature branch with a CLEAN tree -> checks out main, then starts npm run dev", async () => {
  const fixture = makeFixture();
  const execCalls = [];
  const spawnCalls = [];
  const exec = healthyExecFile({ branch: "feat/some-work", porcelainStatus: "" });
  const result = await runBootstrap({
    paths: basePaths(fixture),
    fetchImpl: async (url) => {
      if (url === "http://localhost:3210") throw new Error("ECONNREFUSED");
      return { ok: true, status: 200 };
    },
    execFileImpl: (cmd, args) => {
      execCalls.push({ cmd, args });
      return exec(cmd, args);
    },
    spawnDetachedImpl: (cmd, args, opts) => {
      spawnCalls.push({ cmd, args, opts });
      return { unref() {} };
    },
  });

  assert.ok(execCalls.some((c) => c.cmd === "git" && c.args.includes("checkout") && c.args.includes("main")));
  const devSpawn = spawnCalls.find((c) => c.cmd === "npm");
  assert.deepEqual(devSpawn.args, ["run", "dev", "--", "-p", "3210"]);
  assert.equal(devSpawn.opts.cwd, "/fake/portfolio");
  assert.match(result.line, /dev✓/);
});

test("dev server down, portfolio on a feature branch with a DIRTY tree (ignoring .claude/* noise) -> does NOT switch branches, still starts npm run dev", async () => {
  const fixture = makeFixture();
  const execCalls = [];
  const spawnCalls = [];
  // Only .claude/journal.jsonl touched -> counts as noise, not dirty, on its own;
  // this test also dirties a real tracked file (src/app/page.tsx) to force the guard.
  const exec = healthyExecFile({
    branch: "feat/wip",
    porcelainStatus: " M .claude/journal.jsonl\n M src/app/page.tsx\n",
  });
  const result = await runBootstrap({
    paths: basePaths(fixture),
    fetchImpl: async (url) => {
      if (url === "http://localhost:3210") throw new Error("ECONNREFUSED");
      return { ok: true, status: 200 };
    },
    execFileImpl: (cmd, args) => {
      execCalls.push({ cmd, args });
      return exec(cmd, args);
    },
    spawnDetachedImpl: (cmd, args, opts) => {
      spawnCalls.push({ cmd, args, opts });
      return { unref() {} };
    },
  });

  assert.ok(!execCalls.some((c) => c.cmd === "git" && c.args.includes("checkout")));
  assert.ok(spawnCalls.some((c) => c.cmd === "npm"));
  assert.match(result.line, /dev✓\(!main:dirty/);
});

test("a tree dirtied only under .claude/* is treated as clean for the checkout guard", async () => {
  const fixture = makeFixture();
  const execCalls = [];
  const exec = healthyExecFile({
    branch: "feat/wip",
    porcelainStatus: " M .claude/journal.jsonl\n?? .claude/worktrees/foo/\n",
  });
  await runBootstrap({
    paths: basePaths(fixture),
    fetchImpl: async (url) => {
      if (url === "http://localhost:3210") throw new Error("ECONNREFUSED");
      return { ok: true, status: 200 };
    },
    execFileImpl: (cmd, args) => {
      execCalls.push({ cmd, args });
      return exec(cmd, args);
    },
    spawnDetachedImpl: () => ({ unref() {} }),
  });

  assert.ok(execCalls.some((c) => c.cmd === "git" && c.args.includes("checkout") && c.args.includes("main")));
});

test("tokens valid (figd_ prefix on FIGMA_TOKEN, no figd_ prefix on oauth) -> tokens✓, and the raw values never appear in the line or record", async () => {
  const fixture = makeFixture();
  const result = await runBootstrap({
    paths: basePaths(fixture),
    fetchImpl: okFetch(),
    execFileImpl: healthyExecFile(),
    spawnDetachedImpl: () => ({ unref() {} }),
  });

  assert.match(result.line, /tokens✓/);
  assert.ok(!result.line.includes("figd_realtoken"));
  assert.ok(!JSON.stringify(result.record).includes("figd_realtoken"));
  assert.ok(!JSON.stringify(result.record).includes("sk-oauth-abc"));
});

test("FIGMA_TOKEN missing -> tokens✗ with a hint, never echoing any value", async () => {
  const fixture = makeFixture();
  const result = await runBootstrap({
    paths: basePaths(fixture),
    fetchImpl: okFetch(),
    execFileImpl: (cmd, args) => {
      if (cmd === "zsh") return { status: 0, stdout: "\x1fsk-oauth-abc", stderr: "" };
      return healthyExecFile()(cmd, args);
    },
    spawnDetachedImpl: () => ({ unref() {} }),
  });

  assert.match(result.line, /tokens✗/);
  assert.match(result.line, /FIGMA_TOKEN/);
  assert.equal(result.ok, false);
});

test("CLAUDE_CODE_OAUTH_TOKEN wrongly carries a figd_ value -> tokens✗ (sanity check catches the swap)", async () => {
  const fixture = makeFixture();
  const result = await runBootstrap({
    paths: basePaths(fixture),
    fetchImpl: okFetch(),
    execFileImpl: (cmd, args) => {
      if (cmd === "zsh") return { status: 0, stdout: "figd_realtoken\x1ffigd_wrongtoken", stderr: "" };
      return healthyExecFile()(cmd, args);
    },
    spawnDetachedImpl: () => ({ unref() {} }),
  });

  assert.match(result.line, /tokens✗/);
  assert.match(result.line, /CLAUDE_CODE_OAUTH_TOKEN/);
});

test("plugin cache lagging behind the marketplace version is reported as stale, not a failure", async () => {
  const fixture = makeFixture({ marketplaceVersion: "1.14.0", cacheVersions: ["1.13.0", "1.12.1"] });
  const result = await runBootstrap({
    paths: basePaths(fixture),
    fetchImpl: okFetch(),
    execFileImpl: healthyExecFile(),
    spawnDetachedImpl: () => ({ unref() {} }),
  });

  assert.match(result.line, /plugin v1\.14\.0 \(cache stale\)/);
});

test("stale worktrees beyond the main tree and .claude/worktrees are counted", async () => {
  const fixture = makeFixture();
  const result = await runBootstrap({
    paths: basePaths(fixture),
    fetchImpl: okFetch(),
    execFileImpl: healthyExecFile({
      worktreeEntries: [
        "/fake/portfolio",
        "/fake/portfolio/.claude/worktrees/some-task",
        "/fake/portfolio/.claude/worktrees/other-task",
        "/tmp/some-stale-manual-worktree",
      ],
    }),
    spawnDetachedImpl: () => ({ unref() {} }),
  });

  assert.match(result.line, /worktrees:1/);
});
