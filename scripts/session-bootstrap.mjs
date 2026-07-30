#!/usr/bin/env node
/* session-bootstrap — fast, idempotent, silent-on-success environment
   bootstrap for Claude Code SessionStart hooks. Single-file, no deps.

   Checks (each isolated — one check failing never blocks another):
     1. LISTENER   capture-listener health at 127.0.0.1:4411/health; starts
                    it detached (CONFORMANCE_MAP_PATH set) if down.
     2. DEV SERVER  the portfolio's Next.js dev server at localhost:3210;
                    ensures the portfolio repo is on main first (only when a
                    start is needed) — checks out main only when the tree is
                    clean apart from .claude/* noise, otherwise leaves the
                    branch alone and notes it.
     3. TOKENS      FIGMA_TOKEN / CLAUDE_CODE_OAUTH_TOKEN resolve from
                    ~/.zshrc, non-empty, with the expected figd_ prefix
                    split. Presence only is ever reported — values never
                    leave resolveTokens().
     4. PLUGIN       compares this repo's .claude-plugin/plugin.json version
                    against the highest version dir cached under
                    ~/.claude/plugins/cache/discipline/discipline/.
     5. WORKTREES    counts portfolio git worktrees beyond the main tree and
                    .claude/worktrees/*.

   Interface (deep module — small surface):
     runBootstrap({ paths, fetchImpl, execFileImpl, spawnDetachedImpl, sleepImpl })
       -> { line, ok, record }
   `paths` fields all default to the real production locations; overriding
   them (or the injectable impls) is test-isolation only — direct CLI
   invocation always uses the production defaults, no env-var indirection
   needed for normal use.

   Output contract: exactly one compact line to stdout, always (success or
   failure — hooks inject stdout into session context either way), and the
   process always exits 0 — a bootstrap must never block session start.
   Structured detail (ts, checks, actions taken) is appended as one JSONL
   record to ~/JHD/captures/live/bootstrap.jsonl. */
import { spawn } from "node:child_process";
import { spawnSync } from "node:child_process";
import { openSync, appendFileSync, mkdirSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

// Every field is overridable via a SESSION_BOOTSTRAP_* env var — test
// isolation only (see the CLI test in session-bootstrap.test.mjs). Direct
// invocation with no env vars set always uses the production defaults below,
// same convention as capture-listener.mjs's CAPTURES_DIR override.
function defaultPaths() {
  const env = process.env;
  return {
    listenerUrl: env.SESSION_BOOTSTRAP_LISTENER_URL || "http://127.0.0.1:4411/health",
    listenerScript: env.SESSION_BOOTSTRAP_LISTENER_SCRIPT || join(SCRIPT_DIR, "capture-listener.mjs"),
    conformanceMapPath: env.SESSION_BOOTSTRAP_CONFORMANCE_MAP || "/Users/jarradharvey/JHD/portfolio/design/figma-map.json",
    listenerLog: env.SESSION_BOOTSTRAP_LISTENER_LOG || "/tmp/capture-listener.log",
    devUrl: env.SESSION_BOOTSTRAP_DEV_URL || "http://localhost:3210",
    portfolioDir: env.SESSION_BOOTSTRAP_PORTFOLIO_DIR || "/Users/jarradharvey/JHD/portfolio",
    devLog: env.SESSION_BOOTSTRAP_DEV_LOG || "/tmp/portfolio-dev.log",
    zshrcPath: env.SESSION_BOOTSTRAP_ZSHRC || join(homedir(), ".zshrc"),
    pluginJsonPath: env.SESSION_BOOTSTRAP_PLUGIN_JSON || join(SCRIPT_DIR, "..", ".claude-plugin", "plugin.json"),
    cacheDir: env.SESSION_BOOTSTRAP_CACHE_DIR || join(homedir(), ".claude", "plugins", "cache", "discipline", "discipline"),
    logPath: env.SESSION_BOOTSTRAP_LOG_PATH || join(homedir(), "JHD", "captures", "live", "bootstrap.jsonl"),
  };
}

function defaultExecFile(cmd, args, opts) {
  const res = spawnSync(cmd, args, { encoding: "utf8", ...opts });
  return { status: res.status, stdout: res.stdout || "", stderr: res.stderr || "" };
}

function defaultSpawnDetached(cmd, args, opts) {
  const child = spawn(cmd, args, { ...opts, detached: true });
  child.unref();
  return child;
}

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(fetchImpl, url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function isUp(fetchImpl, url, timeoutMs = 1000) {
  try {
    await fetchWithTimeout(fetchImpl, url, timeoutMs);
    return true;
  } catch {
    return false;
  }
}

function compareVersions(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

function checkPluginVersion(paths) {
  let marketplaceVersion = null;
  try {
    marketplaceVersion = JSON.parse(readFileSync(paths.pluginJsonPath, "utf8")).version;
  } catch {
    return { marketplaceVersion: null, cacheVersion: null, status: "unknown" };
  }
  let cacheVersion = null;
  try {
    const versionDirRe = /^\d+\.\d+\.\d+$/;
    const versions = readdirSync(paths.cacheDir).filter((d) => versionDirRe.test(d));
    for (const v of versions) {
      if (cacheVersion === null || compareVersions(v, cacheVersion) > 0) cacheVersion = v;
    }
  } catch {
    cacheVersion = null;
  }
  let status = "unknown";
  if (marketplaceVersion && cacheVersion) {
    const cmp = compareVersions(cacheVersion, marketplaceVersion);
    status = cmp === 0 ? "current" : cmp < 0 ? "stale" : "ahead";
  } else if (marketplaceVersion && !cacheVersion) {
    status = "missing";
  }
  return { marketplaceVersion, cacheVersion, status };
}

function checkWorktrees(paths, execFileImpl) {
  try {
    const res = execFileImpl("git", ["-C", paths.portfolioDir, "worktree", "list", "--porcelain"]);
    const entries = res.stdout
      .split("\n")
      .filter((l) => l.startsWith("worktree "))
      .map((l) => l.slice("worktree ".length).trim());
    const worktreesDir = join(paths.portfolioDir, ".claude", "worktrees");
    const stale = entries.filter((p) => p !== paths.portfolioDir && !p.startsWith(worktreesDir));
    return { count: stale.length };
  } catch {
    return { count: null };
  }
}

// A portfolio-tree status line is "dirty" for the checkout guard only when it
// carries changes outside .claude/* — `.claude/worktrees` churn and journal/
// typecheck-marker noise are expected working-tree state, not user work in
// progress that a branch switch would risk.
function isDirtyIgnoringClaudeNoise(porcelainOutput) {
  return porcelainOutput
    .split("\n")
    .filter((l) => l.trim())
    .some((l) => {
      const path = l.slice(3).trim();
      return !path.startsWith(".claude/");
    });
}

async function checkListener(paths, fetchImpl, spawnDetachedImpl, sleepImpl, actions) {
  if (await isUp(fetchImpl, paths.listenerUrl)) return { ok: true };

  try {
    const logFd = openSync(paths.listenerLog, "a");
    spawnDetachedImpl(process.execPath, [paths.listenerScript], {
      cwd: SCRIPT_DIR,
      env: { ...process.env, CONFORMANCE_MAP_PATH: paths.conformanceMapPath },
      stdio: ["ignore", logFd, logFd],
    });
    actions.push("started capture-listener");
  } catch (err) {
    return { ok: false, hint: `capture-listener failed to start: ${err.message}` };
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    await sleepImpl(300);
    if (await isUp(fetchImpl, paths.listenerUrl)) return { ok: true };
  }
  return { ok: false, hint: `started but not healthy yet — check ${paths.listenerLog}` };
}

async function checkDevServer(paths, fetchImpl, execFileImpl, spawnDetachedImpl, actions) {
  if (await isUp(fetchImpl, paths.devUrl)) return { ok: true };

  let branchNote = null;
  try {
    const branch = execFileImpl("git", ["-C", paths.portfolioDir, "branch", "--show-current"]).stdout.trim();
    if (branch !== "main") {
      const status = execFileImpl("git", ["-C", paths.portfolioDir, "status", "--porcelain"]).stdout;
      if (isDirtyIgnoringClaudeNoise(status)) {
        branchNote = `!main:dirty(${branch})`;
      } else {
        execFileImpl("git", ["-C", paths.portfolioDir, "checkout", "main"]);
        actions.push(`checked out main in ${paths.portfolioDir} (was ${branch})`);
      }
    }
  } catch (err) {
    return { ok: false, hint: `portfolio branch check failed: ${err.message}` };
  }

  try {
    const logFd = openSync(paths.devLog, "a");
    spawnDetachedImpl("npm", ["run", "dev", "--", "-p", "3210"], {
      cwd: paths.portfolioDir,
      stdio: ["ignore", logFd, logFd],
    });
    actions.push("started portfolio npm run dev");
  } catch (err) {
    return { ok: false, hint: `npm run dev failed to start: ${err.message}` };
  }

  return { ok: true, note: branchNote };
}

function resolveTokens(paths, execFileImpl) {
  try {
    const script = `source '${paths.zshrcPath}' >/dev/null 2>&1; printf '%s\\x1f%s' "$FIGMA_TOKEN" "$CLAUDE_CODE_OAUTH_TOKEN"`;
    const res = execFileImpl("zsh", ["-c", script]);
    const [figma, oauth] = res.stdout.split("\x1f");
    return { figma: figma || "", oauth: oauth || "" };
  } catch {
    return { figma: "", oauth: "" };
  }
}

function checkTokens(paths, execFileImpl) {
  const { figma, oauth } = resolveTokens(paths, execFileImpl);
  const missing = [];
  if (!figma) missing.push("FIGMA_TOKEN missing");
  else if (!figma.startsWith("figd_")) missing.push("FIGMA_TOKEN unexpected format");
  if (!oauth) missing.push("CLAUDE_CODE_OAUTH_TOKEN missing");
  else if (oauth.startsWith("figd_")) missing.push("CLAUDE_CODE_OAUTH_TOKEN unexpected format");

  if (missing.length) return { ok: false, hint: `${missing.join(", ")} — check ~/.zshrc` };
  return { ok: true };
}

function formatLine({ listener, dev, tokens, plugin, worktrees }) {
  const mark = (c) => (c.ok ? "✓" : "✗");
  const parts = [`listener${mark(listener)}`, `dev${mark(dev)}`, `tokens${mark(tokens)}`];
  if (dev.note) parts[1] += `(${dev.note})`;

  const pluginVersion = plugin.marketplaceVersion || "?.?.?";
  const cacheLabel = { current: "cache current", stale: "cache stale", ahead: "cache ahead", missing: "cache missing", unknown: "cache ?" }[
    plugin.status
  ];
  parts.push(`plugin v${pluginVersion} (${cacheLabel})`);
  parts.push(`worktrees:${worktrees.count === null ? "?" : worktrees.count}`);

  const hints = [listener, dev, tokens]
    .filter((c) => !c.ok && c.hint)
    .map((c) => c.hint);
  let line = `bootstrap: ${parts.join(" ")}`;
  if (hints.length) line += ` (${hints.join("; ")})`;
  return line;
}

export async function runBootstrap(opts = {}) {
  const paths = { ...defaultPaths(), ...(opts.paths || {}) };
  const fetchImpl = opts.fetchImpl || globalThis.fetch;
  const execFileImpl = opts.execFileImpl || defaultExecFile;
  const spawnDetachedImpl = opts.spawnDetachedImpl || defaultSpawnDetached;
  const sleepImpl = opts.sleepImpl || defaultSleep;

  const actions = [];
  const [listener, dev, tokens] = await Promise.all([
    checkListener(paths, fetchImpl, spawnDetachedImpl, sleepImpl, actions),
    checkDevServer(paths, fetchImpl, execFileImpl, spawnDetachedImpl, actions),
    Promise.resolve(checkTokens(paths, execFileImpl)),
  ]);
  const plugin = checkPluginVersion(paths);
  const worktrees = checkWorktrees(paths, execFileImpl);

  const line = formatLine({ listener, dev, tokens, plugin, worktrees });
  const record = {
    ts: new Date().toISOString(),
    checks: { listener, dev, tokens, plugin, worktrees },
    actions,
  };
  return { line, ok: listener.ok && dev.ok && tokens.ok, record };
}

const isDirectRun = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;

if (isDirectRun) {
  runBootstrap()
    .then((result) => {
      console.log(result.line);
      try {
        const paths = defaultPaths();
        mkdirSync(dirname(paths.logPath), { recursive: true });
        appendFileSync(paths.logPath, JSON.stringify(result.record) + "\n", "utf8");
      } catch {
        // Logging is best-effort — never block session start on a JSONL write failure.
      }
      process.exit(0);
    })
    .catch((err) => {
      console.log(`bootstrap: listener✗ dev✗ tokens✗ plugin v?.?.? (cache ?) worktrees:? (bootstrap crashed: ${err.message})`);
      process.exit(0);
    });
}
