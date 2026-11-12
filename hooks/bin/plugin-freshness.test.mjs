// s79 (operator, doc comment 2026-11-12): the cloud container loaded plugin 1.181.0 while main was 1.198.0, so newer rules never loaded.
// plugin-freshness.mjs is self-contained (no repo imports) so the vault's own .claude/settings.json can run it when a stale cache loads no plugin hooks.
// Run: node --test hooks/bin/plugin-freshness.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const hook = fileURLToPath(new URL("./plugin-freshness.mjs", import.meta.url));
const STATUS = "Lane landed.\n\n## Needed from you\n\nFull list: [Needed from you](https://claude.ai/artifact/x)";

function env(loaded, latest) {
  const dir = mkdtempSync(join(tmpdir(), "pf-"));
  const root = join(dir, "plugin", ".claude-plugin");
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, "plugin.json"), JSON.stringify({ name: "discipline", version: loaded }));
  mkdirSync(join(dir, "home"), { recursive: true });
  return { dir, env: { ...process.env, HOME: join(dir, "home"), CLAUDE_PLUGIN_ROOT: join(dir, "plugin"), DISCIPLINE_LATEST_VERSION: latest } };
}
const start = (e) => spawnSync(process.execPath, [hook, "start"], { input: JSON.stringify({ session_id: "s" }), env: e.env, encoding: "utf8" });
function stop(e, text, stopActive = false) {
  const t = join(e.dir, "t.jsonl");
  writeFileSync(t, [{ type: "user", message: { content: "status?" } }, { type: "assistant", message: { content: [{ type: "text", text }] } }].map((x) => JSON.stringify(x)).join("\n"));
  const r = spawnSync(process.execPath, [hook, "stop"], { input: JSON.stringify({ transcript_path: t, stop_hook_active: stopActive, session_id: "s" }), env: e.env, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout ? JSON.parse(r.stdout) : null;
}

test("session start with a loaded plugin older than the newest release warns loudly and names the exact commands", () => {
  const e = env("1.181.0", "1.198.0");
  const r = start(e);
  assert.equal(r.status, 0, r.stderr);
  const ctx = JSON.parse(r.stdout).hookSpecificOutput.additionalContext;
  assert.match(ctx, /1\.181\.0/); assert.match(ctx, /1\.198\.0/);
  assert.match(ctx, /claude plugin update discipline@discipline/);
  assert.match(ctx, /\/reload-plugins/);
});

test("session start with the plugin current prints nothing and leaves no stale marker", () => {
  const e = env("1.198.0", "1.198.0");
  const r = start(e);
  assert.equal(r.stdout, "");
  assert.equal(existsSync(join(e.env.HOME, ".claude", "plugin-stale.json")), false);
});

test("a status reply is blocked while the loaded plugin is older than the release, naming the commands; an ordinary reply and a second try pass", () => {
  const e = env("1.181.0", "1.198.0");
  start(e);
  const out = stop(e, STATUS);
  assert.equal(out?.decision, "block");
  assert.match(out.reason, /1\.181\.0/);
  assert.match(out.reason, /\/reload-plugins/);
  assert.equal(stop(e, "Renamed the heading."), null);
  assert.equal(stop(e, STATUS, true), null);
});

test("after the plugin is updated (loaded now equals the recorded release) the status reply passes", () => {
  const e = env("1.181.0", "1.198.0");
  start(e);
  writeFileSync(join(e.dir, "plugin", ".claude-plugin", "plugin.json"), JSON.stringify({ name: "discipline", version: "1.198.0" }));
  assert.equal(stop(e, STATUS), null);
});

test("when the release cannot be read, nothing is blocked and nothing is claimed", () => {
  const e = env("1.181.0", "");
  e.env.DISCIPLINE_LATEST_VERSION = "";
  e.env.DISCIPLINE_LATEST_URL = "http://127.0.0.1:1/none";
  const r = start(e);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "");
  assert.equal(stop(e, STATUS), null);
});

// Review round 1 AMBER 2: the on-disk marketplace clone can be as stale as the cache (the s79 case), so the network is asked first.
test("the network release wins over a marketplace clone as stale as the cache; offline falls back to the clone", async () => {
  const e = env("1.181.0", "");
  e.env.DISCIPLINE_LATEST_VERSION = "";
  const clone = join(e.env.HOME, ".claude", "plugins", "marketplaces", "discipline", ".claude-plugin");
  mkdirSync(clone, { recursive: true });
  writeFileSync(join(clone, "plugin.json"), JSON.stringify({ version: "1.181.0" }));
  const srv = createServer((_, res) => res.end(JSON.stringify({ version: "1.198.0" })));
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const run = (url) => new Promise((resolve) => {
    const c = spawn(process.execPath, [hook, "start"], { env: { ...e.env, DISCIPLINE_LATEST_URL: url } });
    let out = ""; c.stdout.on("data", (d) => (out += d)); c.stdin.end(JSON.stringify({ session_id: "s" })); c.on("close", () => resolve(out));
  });
  try {
    assert.match(await run(`http://127.0.0.1:${srv.address().port}/plugin.json`), /1\.198\.0/);
    assert.equal(await run("http://127.0.0.1:1/none"), "", "offline: the clone says 1.181.0 = loaded, so silent");
  } finally { srv.close(); }
});

// Run from the vault's own .claude/settings.json there is no CLAUDE_PLUGIN_ROOT: the loaded plugin is the one in installed_plugins.json.
test("outside the plugin's hooks (no CLAUDE_PLUGIN_ROOT) the loaded version comes from installed_plugins.json", () => {
  const e = env("1.198.0", "1.199.0");
  delete e.env.CLAUDE_PLUGIN_ROOT;
  mkdirSync(join(e.env.HOME, ".claude", "plugins"), { recursive: true });
  writeFileSync(join(e.env.HOME, ".claude", "plugins", "installed_plugins.json"), JSON.stringify({ plugins: { "discipline@discipline": [{ version: "1.181.0" }] } }));
  const r = start(e);
  assert.match(JSON.parse(r.stdout).hookSpecificOutput.additionalContext, /1\.181\.0 is loaded but 1\.199\.0 is released/);
  assert.match(stop(e, STATUS)?.reason, /1\.181\.0/);
});

// DISC-298 (s81): the Default environment's setup script runs `plugin update`, but it ran once when the container image was
// built and is restored, not rerun, so the loaded plugin is as old as the image. The warning must say so, with the dated proof.
import { utimesSync } from "node:fs";
function withSetupOutput(e, daysOld) {
  const d = join(e.dir, "home", ".claude", "environment-manager");
  mkdirSync(d, { recursive: true });
  const f = join(d, "setup-script-output");
  writeFileSync(f, "discipline is already at the latest version (1.184.0).\n");
  const t = new Date(Date.now() - daysOld * 864e5);
  utimesSync(f, t, t);
  return t.toISOString().slice(0, 10);
}
test("DISC-298: when the setup script's output is older than a day, the stale warning names the cached image, its date, and the environment fix", () => {
  const e = env("1.184.0", "1.199.0");
  const date = withSetupOutput(e, 4);
  const ctx = JSON.parse(start(e).stdout).hookSpecificOutput.additionalContext;
  assert.ok(ctx.includes(date), "the date the setup script last ran");
  assert.match(ctx, /cached (container )?image/i);
  assert.match(ctx, /edit the (Default )?environment's setup script/i);
});
test("DISC-298: a setup script that ran today adds no image note (the cause is elsewhere)", () => {
  const e = env("1.184.0", "1.199.0");
  withSetupOutput(e, 0);
  const ctx = JSON.parse(start(e).stdout).hookSpecificOutput.additionalContext;
  assert.doesNotMatch(ctx, /cached/i);
});
test("DISC-298: no setup-script output file (a local machine) adds no image note", () => {
  const e = env("1.184.0", "1.199.0");
  assert.doesNotMatch(JSON.parse(start(e).stdout).hookSpecificOutput.additionalContext, /cached/i);
});

// DISC-299 (s81): a stale session's loaded style is old, so a vault ruling that disagrees with it wins.
test("DISC-299: the stale warning says vault rulings win over the loaded output style", () => {
  const ctx = JSON.parse(start(env("1.184.0", "1.199.0")).stdout).hookSpecificOutput.additionalContext;
  assert.match(ctx, /vault rulings win over the loaded (output )?style/i);
});
