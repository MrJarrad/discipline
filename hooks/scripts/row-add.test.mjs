// row-add / row-alloc — the tool picks the number; a duplicate cannot land (DISC-167).
// Run: node --test hooks/scripts/row-add.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, utimesSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { rowAdd } from "./row-add.mjs";
import { crossFileDupIds } from "./list-drift-check.mjs";
import { acquireVaultLock, highestUsed, lockPath, STALE_MS, WAIT_MS } from "./lib/row-alloc.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const QUEUE = `---\nname: zz-queue\nkind: queue\nprefix: ZZ\n---\n\n**Next free number: 601** (highest used 600).\n\n| # | Needed | Where | Why | Recommended |\n|---|---|---|---|---|\n| ZZ-600 | ~~old~~ done | | | |\n`;
const BACKLOG = `---\nname: zz-backlog\nkind: backlog\nprefix: ZZ\n---\n\n**Next free number: 193.**\n\n## Open\n\n| # | Item | Raised | Status | Notes |\n| - | --- | --- | --- | --- |\n| ZZ-192 | thing | 2026-10-01 | open | |\n`;
const mkVault = () => {
  const v = mkdtempSync(join(tmpdir(), "rowadd-"));
  mkdirSync(join(v, "projects/zz"), { recursive: true });
  writeFileSync(join(v, "projects/zz/zz-queue.md"), QUEUE);
  writeFileSync(join(v, "projects/zz/zz-backlog.md"), BACKLOG);
  return v;
};
const ids = (v, f) => [...readFileSync(join(v, `projects/zz/zz-${f}.md`), "utf8").matchAll(/^\| (ZZ-\d+)/gm)].map((m) => m[1]);

test("a backlog add gets a number above the QUEUE's range too (one sequence per prefix)", () => {
  const v = mkVault();
  const r = rowAdd({ vault: v, prefix: "ZZ", to: "backlog", text: "new thing", offline: true });
  assert.equal(r.ok, true);
  assert.equal(r.id, "ZZ-601");
  assert.ok(ids(v, "backlog").includes("ZZ-601"));
  assert.deepEqual(crossFileDupIds(v), []);
});

test("a queue add is numbered from the backlog's range as well, and bumps the marker", () => {
  const v = mkVault();
  writeFileSync(join(v, "projects/zz/zz-backlog.md"), BACKLOG.replace("ZZ-192", "ZZ-900").replace("193.", "901."));
  const r = rowAdd({ vault: v, prefix: "ZZ", to: "queue", text: "need X", where: "w", why: "y", recommended: "r", offline: true });
  assert.equal(r.id, "ZZ-901");
  assert.match(readFileSync(join(v, "projects/zz/zz-queue.md"), "utf8"), /Next free number: 902/);
});

test("a number typed by hand that collides across queue and backlog is reported", () => {
  const v = mkVault();
  writeFileSync(join(v, "projects/zz/zz-backlog.md"), BACKLOG + "| ZZ-600 | clash | d | open | |\n");
  const d = crossFileDupIds(v);
  assert.equal(d.length, 1);
  assert.equal(d[0].kind, "dup-id");
  assert.match(d[0].msg, /ZZ-600 is in both/);
});

test("refusals: unknown prefix, bad target, pipe in text, no text", () => {
  const v = mkVault();
  assert.match(rowAdd({ vault: v, prefix: "QQ", to: "backlog", text: "x", offline: true }).reason, /no project queue declares prefix QQ/);
  assert.match(rowAdd({ vault: v, prefix: "ZZ", to: "nope", text: "x", offline: true }).reason, /queue or backlog/);
  assert.match(rowAdd({ vault: v, prefix: "ZZ", to: "backlog", text: "a|b", offline: true }).reason, /must not contain \|/);
  assert.match(rowAdd({ vault: v, prefix: "ZZ", to: "backlog", text: " ", offline: true }).reason, /--text is required/);
});

test("highestUsed counts struck rows and the marker reservation", () => {
  assert.equal(highestUsed(["| ZZ-5 | ~~x~~ |\n", "**Next free number: 40.**"]), 39);
});

test("origin/main is part of the floor: a row another session already took is not reused", () => {
  const origin = mkdtempSync(join(tmpdir(), "rowadd-origin-"));
  execFileSync("git", ["init", "-q", "-b", "main", origin]);
  const v = mkVault();
  // the other session's copy of origin/main carries ZZ-650
  mkdirSync(join(origin, "projects/zz"), { recursive: true });
  writeFileSync(join(origin, "projects/zz/zz-queue.md"), QUEUE.replace("| ZZ-600 |", "| ZZ-650 | n | | | |\n| ZZ-600 |"));
  writeFileSync(join(origin, "projects/zz/zz-backlog.md"), BACKLOG);
  const g = (cwd, ...a) => execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...a], { cwd });
  g(origin, "add", "-A"); g(origin, "commit", "-qm", "o");
  g(v, "init", "-q", "-b", "main"); g(v, "remote", "add", "origin", origin);
  const r = rowAdd({ vault: v, prefix: "ZZ", to: "backlog", text: "n" });
  assert.equal(r.id, "ZZ-651");
  assert.deepEqual(r.warnings, []);
});

test("offline / no origin: falls back to local with a warning, still adds", () => {
  const v = mkVault();
  execFileSync("git", ["init", "-q", "-b", "main", v]);
  const r = rowAdd({ vault: v, prefix: "ZZ", to: "backlog", text: "n" });
  assert.equal(r.ok, true);
  assert.match(r.warnings[0], /could not reach origin\/main/);
});

test("race: 8 parallel CLI adds get 8 distinct IDs and no duplicate lands", async () => {
  const v = mkVault();
  const run = (to) => new Promise((res) => {
    const c = spawn("node", [join(here, "row-add.mjs"), "--vault", v, "--prefix", "ZZ", "--to", to, "--text", "r", "--offline"]);
    let out = ""; c.stdout.on("data", (d) => (out += d)); c.on("close", (code) => res({ code, id: out.trim() }));
  });
  const results = await Promise.all(Array.from({ length: 8 }, (_, i) => run(i % 2 ? "queue" : "backlog")));
  assert.ok(results.every((r) => r.code === 0), JSON.stringify(results));
  assert.equal(new Set(results.map((r) => r.id)).size, 8);
  const all = [...ids(v, "queue"), ...ids(v, "backlog")];
  assert.equal(new Set(all).size, all.length);
  assert.deepEqual(crossFileDupIds(v), []);
  assert.equal(existsSync(lockPath(v)), false);
});

test("a stale lock (older than 30 s) is broken, not waited on", () => {
  const v = mkVault();
  writeFileSync(lockPath(v), "999999");
  const old = new Date(Date.now() - 120_000);
  utimesSync(lockPath(v), old, old);
  assert.equal(rowAdd({ vault: v, prefix: "ZZ", to: "backlog", text: "n", offline: true }).ok, true);
});

test("WAIT_MS outlasts STALE_MS, so a waiter reaches a dead holder's stale break", () => {
  assert.ok(WAIT_MS > STALE_MS);
});

test("release() removes only a lock it still owns", () => {
  const v = mkVault();
  const releaseA = acquireVaultLock(v);
  unlinkSync(lockPath(v)); // A's lock is broken out from under it (e.g. judged stale)
  const releaseB = acquireVaultLock(v);
  releaseA(); // must not remove B's lock
  assert.equal(existsSync(lockPath(v)), true);
  releaseB();
  assert.equal(existsSync(lockPath(v)), false);
});

test("stale break is atomic: six waiters on one stale lock never hold it together", async () => {
  const v = mkVault();
  writeFileSync(lockPath(v), "dead");
  const old = new Date(Date.now() - 120_000);
  utimesSync(lockPath(v), old, old);
  const marker = join(v, "holders");
  const worker = `import { acquireVaultLock } from ${JSON.stringify(join(here, "lib/row-alloc.mjs"))};
    import { openSync, closeSync, unlinkSync } from "node:fs";
    const go = Date.now() + 300; while (Date.now() < go) {}
    const rel = acquireVaultLock(${JSON.stringify(v)});
    let bad = 0; try { closeSync(openSync(${JSON.stringify(marker)}, "wx")); } catch { bad = 1; }
    const t = Date.now() + 80; while (Date.now() < t) {}
    if (!bad) unlinkSync(${JSON.stringify(marker)});
    rel(); process.exit(bad);`;
  const codes = await Promise.all(Array.from({ length: 6 }, () => new Promise((res) => {
    spawn("node", ["--input-type=module", "-e", worker]).on("close", res);
  })));
  assert.deepEqual(codes, [0, 0, 0, 0, 0, 0]);
  assert.equal(existsSync(lockPath(v)), false);
});

test("row-add rolls the write back when the new ID would appear twice (seen !== 1)", () => {
  // A concurrent writer (one that ignores the lock) lands the same number in the queue while
  // origin is being fetched; the fetch's ext transport is the in-lock hook that does it.
  const v = mkVault();
  const inject = join(v, "inject.sh");
  writeFileSync(inject, `printf '| ZZ-601 | racer | | | |\\n' >> ${join(v, "projects/zz/zz-queue.md")}\nexit 1\n`);
  execFileSync("git", ["init", "-q", "-b", "main", v]);
  execFileSync("git", ["-C", v, "remote", "add", "origin", `ext::sh ${inject}`]);
  const env = process.env;
  const saved = [env.GIT_CONFIG_COUNT, env.GIT_CONFIG_KEY_0, env.GIT_CONFIG_VALUE_0];
  env.GIT_CONFIG_COUNT = "1"; env.GIT_CONFIG_KEY_0 = "protocol.ext.allow"; env.GIT_CONFIG_VALUE_0 = "always";
  let r;
  try { r = rowAdd({ vault: v, prefix: "ZZ", to: "backlog", text: "n" }); } finally {
    [env.GIT_CONFIG_COUNT, env.GIT_CONFIG_KEY_0, env.GIT_CONFIG_VALUE_0] = saved;
    for (const k of ["GIT_CONFIG_COUNT", "GIT_CONFIG_KEY_0", "GIT_CONFIG_VALUE_0"]) if (env[k] === undefined) delete env[k];
  }
  assert.equal(r.ok, false);
  assert.match(r.reason, /ZZ-601 would appear 2 times.*rolled back/);
  assert.equal(readFileSync(join(v, "projects/zz/zz-backlog.md"), "utf8"), BACKLOG);
  assert.equal(existsSync(lockPath(v)), false);
});
