// row-add / row-alloc — the tool picks the number; a duplicate cannot land (DISC-167).
// Run: node --test hooks/scripts/row-add.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
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
  const r = rowAdd({ vault: v, prefix: "ZZ", to: "backlog", owner: "Agent", text: "new thing", offline: true });
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
  assert.match(rowAdd({ vault: v, prefix: "QQ", to: "backlog", owner: "Agent", text: "x", offline: true }).reason, /no project queue declares prefix QQ/);
  assert.match(rowAdd({ vault: v, prefix: "ZZ", to: "nope", text: "x", offline: true }).reason, /queue or backlog/);
  assert.match(rowAdd({ vault: v, prefix: "ZZ", to: "backlog", owner: "Agent", text: "a|b", offline: true }).reason, /must not contain \|/);
  assert.match(rowAdd({ vault: v, prefix: "ZZ", to: "backlog", owner: "Agent", text: " ", offline: true }).reason, /--text is required/);
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
  const r = rowAdd({ vault: v, prefix: "ZZ", to: "backlog", owner: "Agent", text: "n" });
  assert.equal(r.id, "ZZ-651");
  assert.deepEqual(r.warnings, []);
});

test("offline / no origin: falls back to local with a warning, still adds", () => {
  const v = mkVault();
  execFileSync("git", ["init", "-q", "-b", "main", v]);
  const r = rowAdd({ vault: v, prefix: "ZZ", to: "backlog", owner: "Agent", text: "n" });
  assert.equal(r.ok, true);
  assert.match(r.warnings[0], /could not reach origin\/main/);
});

test("race: 8 parallel CLI adds get 8 distinct IDs and no duplicate lands", async () => {
  const v = mkVault();
  const run = (to) => new Promise((res) => {
    const c = spawn("node", [join(here, "row-add.mjs"), "--vault", v, "--prefix", "ZZ", "--to", to, "--text", "r", "--owner", "Agent", "--offline"]);
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
  assert.equal(rowAdd({ vault: v, prefix: "ZZ", to: "backlog", owner: "Agent", text: "n", offline: true }).ok, true);
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
  try { r = rowAdd({ vault: v, prefix: "ZZ", to: "backlog", owner: "Agent", text: "n" }); } finally {
    [env.GIT_CONFIG_COUNT, env.GIT_CONFIG_KEY_0, env.GIT_CONFIG_VALUE_0] = saved;
    for (const k of ["GIT_CONFIG_COUNT", "GIT_CONFIG_KEY_0", "GIT_CONFIG_VALUE_0"]) if (env[k] === undefined) delete env[k];
  }
  assert.equal(r.ok, false);
  assert.match(r.reason, /ZZ-601 would appear 2 times.*rolled back/);
  assert.equal(readFileSync(join(v, "projects/zz/zz-backlog.md"), "utf8"), BACKLOG);
  assert.equal(existsSync(lockPath(v)), false);
});

test("an idea row is added as `waiting on operator` and prints under Needed from you (DISC-168)", async () => {
  const v = mkVault();
  const r = rowAdd({ vault: v, prefix: "ZZ", to: "backlog", owner: "Agent", text: "idea: a lightning strike", status: "waiting on operator", offline: true });
  assert.equal(r.ok, true);
  assert.match(readFileSync(join(v, "projects/zz/zz-backlog.md"), "utf8"), new RegExp(`\\| ${r.id} \\| idea: a lightning strike \\| [^|]+\\| waiting on operator \\|`));
  const { neededFromYou, render } = await import("./needed-from-you.mjs");
  assert.match(render(neededFromYou(v, ["ZZ"])), /idea: a lightning strike/);
});

test("row-add refuses a status outside open / waiting on operator, and --status on a queue row", () => {
  const v = mkVault();
  assert.equal(rowAdd({ vault: v, prefix: "ZZ", to: "backlog", owner: "Agent", text: "x", status: "done (#1 abc1234)", offline: true }).ok, false);
  assert.equal(rowAdd({ vault: v, prefix: "ZZ", to: "queue", text: "x", status: "waiting on operator", offline: true }).ok, false);
});

test("DISC-178: a release-only ask is refused as a queue row and as a waiting-on-operator backlog row; a release plus an operator-owned call passes", () => {
  const v = mkVault();
  for (const to of ["queue", "backlog"]) {
    const r = rowAdd({ vault: v, prefix: "ZZ", to, text: "Release again for the underline and design system?", status: to === "backlog" ? "waiting on operator" : undefined, offline: true });
    assert.equal(r.ok, false, to);
    assert.match(r.reason, /release-follows-merge/);
  }
  assert.equal(rowAdd({ vault: v, prefix: "ZZ", to: "backlog", owner: "Agent", text: "Release?", offline: true }).ok, true, "a plain open backlog row is not an operator ask");
  assert.equal(rowAdd({ vault: v, prefix: "ZZ", to: "queue", text: "Release with SITE_MODE holding -> live?", offline: true }).ok, true);
  assert.equal(rowAdd({ vault: v, prefix: "ZZ", to: "queue", text: "Look at the footer and say yes", offline: true }).ok, true);
});

test("DISC-179(1): the CLI leaves a marker naming the prefix, for the Stop hook", async () => {
  const v = mkVault();
  const dir = mkdtempSync(join(tmpdir(), "marker-"));
  execFileSync("node", [join(here, "row-add.mjs"), "--vault", v, "--prefix", "ZZ", "--to", "queue", "--text", "pick one", "--offline"], { env: { ...process.env, DISCIPLINE_MARKER_DIR: dir } });
  process.env.DISCIPLINE_MARKER_DIR = dir;
  const { readMarkers } = await import("./lib/row-marker.mjs");
  const m = readMarkers(v);
  delete process.env.DISCIPLINE_MARKER_DIR;
  assert.equal(m.length, 1);
  assert.equal(m[0].prefix, "ZZ");
  assert.match(m[0].id, /^ZZ-\d+$/);
});

// DISC-221 L1 (s43): a queue row that cites other rows of its project is an ask built on
// list state, so it needs that state fresh (ruling lists-never-stale).
import { writeDriftStamp, DRIFT_STAMP_MINUTES } from "./lib/row-marker.mjs";

test("DISC-221 L1: a queue row citing a struck or done row is refused, naming it", () => {
  const v = mkVault();
  writeDriftStamp(v);
  const r = rowAdd({ vault: v, prefix: "ZZ", to: "queue", text: "which next: ZZ-600 or ZZ-192?", offline: true });
  assert.equal(r.ok, false);
  assert.match(r.reason, /ZZ-600/);
  assert.match(r.reason, /not an open row/);
});

test("DISC-221 L1: a queue row citing open rows is refused with no recent list-drift-check run", () => {
  const v = mkVault();
  const r = rowAdd({ vault: v, prefix: "ZZ", to: "queue", text: "pick the look for ZZ-192", offline: true });
  assert.equal(r.ok, false);
  assert.match(r.reason, /list-drift-check\.mjs --vault/);
});

test("DISC-221 L1: a fresh list-drift-check stamp lets the citing row in; a stale one does not", () => {
  const v = mkVault();
  writeDriftStamp(v, new Date(Date.now() - (DRIFT_STAMP_MINUTES + 1) * 60e3).toISOString());
  assert.equal(rowAdd({ vault: v, prefix: "ZZ", to: "queue", text: "pick the look for ZZ-192", offline: true }).ok, false);
  writeDriftStamp(v);
  const r = rowAdd({ vault: v, prefix: "ZZ", to: "queue", text: "pick the look for ZZ-192", offline: true });
  assert.equal(r.ok, true, r.reason);
});

test("DISC-221 L1: a queue row citing no rows needs no stamp; another project's ID is not checked", () => {
  const v = mkVault();
  assert.equal(rowAdd({ vault: v, prefix: "ZZ", to: "queue", text: "approve the hero copy", offline: true }).ok, true);
  assert.equal(rowAdd({ vault: v, prefix: "ZZ", to: "queue", text: "same call as PF-938 elsewhere", offline: true }).ok, true);
});

test("DISC-221 L1: the list-drift-check CLI leaves the stamp row-add reads", () => {
  const v = mkVault();
  try { execFileSync(process.execPath, [join(here, "list-drift-check.mjs"), "--vault", v], { stdio: "ignore" }); } catch { /* findings exit 1; the stamp is written either way */ }
  const r = rowAdd({ vault: v, prefix: "ZZ", to: "queue", text: "pick the look for ZZ-192", offline: true });
  assert.equal(r.ok, true, r.reason);
});

// DISC-259: the project's other file's "Next free number" marker rose in the same write, so list-drift-check
// has no next-free-stale finding after a row-add.
const marker = (v, f) => parseInt(/Next free number:\s*(\d+)/.exec(readFileSync(join(v, `projects/zz/zz-${f}.md`), "utf8"))[1], 10);
test("a backlog add raises the QUEUE's marker too (DISC-259)", () => {
  const v = mkVault();
  const r = rowAdd({ vault: v, prefix: "ZZ", to: "backlog", owner: "Agent", text: "new thing", offline: true });
  assert.equal(r.id, "ZZ-601");
  assert.equal(marker(v, "queue"), 602);
  assert.equal(marker(v, "backlog"), 602);
  assert.match(readFileSync(join(v, "projects/zz/zz-queue.md"), "utf8"), /\(highest used 601\)/);
});
test("a queue add raises the BACKLOG's marker too (DISC-259)", () => {
  const v = mkVault();
  rowAdd({ vault: v, prefix: "ZZ", to: "queue", text: "need X", where: "w", why: "y", recommended: "r", offline: true });
  assert.equal(marker(v, "backlog"), 602);
  assert.equal(marker(v, "queue"), 602);
});

// DISC-272 (operator 2026-11-08: "we can't be loosing track of these things"): a queue row that asks
// for a link, file or node is refused until the vault has been searched.
test("DISC-272: a link-ask queue row is refused without --searched, and added with it", () => {
  const v = mkVault();
  const ask = { vault: v, prefix: "ZZ", to: "queue", text: "Send the Figma link for the Yardsale case study", where: "chat", why: "needed to build", recommended: "paste it", offline: true };
  const no = rowAdd(ask);
  assert.equal(no.ok, false);
  assert.match(no.reason, /--searched/);
  assert.match(no.reason, /references\//);
  assert.equal(rowAdd({ ...ask, searched: "grep references/ + projects/zz/ for yardsale figma: nothing" }).ok, true);
});

test("DISC-272: an ask that is not for a link, file or node needs no --searched", () => {
  const v = mkVault();
  assert.equal(rowAdd({ vault: v, prefix: "ZZ", to: "queue", text: "Pick the footer blur strength", where: "preview", why: "look call", recommended: "medium", offline: true }).ok, true);
});

// DISC-272 review round 1 (#152): only an ask directed at the operator counts; a row that mentions a link does not.
test("DISC-272: asks for a link, file, media or ID are caught; rows that only mention a link are not", async () => {
  const { isLinkAsk } = await import("./lib/link-ask.mjs");
  for (const t of [
    "Send the links to your case-study Figma files: one per project", // PF-795
    "Re-export the design system handoff from Figma", // HB-304
    "One Figma tick, then re-export (HB-301 404 round 3)", // HB-317
    "Share the Notion 'Portfolio Site WIKI' with the connected Notion", // PF-848
    "run Plugins, then drop the zip in Drop", // HT-54
    "Drop the Sakara media in Drop media/projects/sakara/",
    "Create the Umami account and give me the Website ID",
    "Send a Figma link to the Yardsale spec block", // PF-1375
  ]) assert.equal(isLinkAsk(t), true, t);
  for (const t of [
    "Check the link to the case study opens in the same tab",
    "Review the case-study links for Wild — open the preview link and say yes",
    "we need the share image to be 1200x630 — confirm the files follow that",
    "Pressed look: what should a button do while it's held down? Alternative: give pressed its own fill, which you'd define in Figma", // PF-699
    "Recommended: drop it from Figma for now", // PF-1334
    "Export: the lighter stroke you approved is already in Figma", // PF-1171 label
  ]) assert.equal(isLinkAsk(t), false, t);
});

// s76 lesson 3: row-add raises the next-free marker in BOTH of the project's list files, so a commit that
// stages only the file it added to fails the vault `lists` check. The CLI names both files to stage.
test("s76 L3: the CLI names both of the project's list files to stage, on stderr; stdout stays the row id", () => {
  const v = mkVault();
  const r = spawnSync("node", [join(here, "row-add.mjs"), "--vault", v, "--prefix", "ZZ", "--to", "queue", "--text", "pick one", "--offline"], { encoding: "utf8", env: { ...process.env, DISCIPLINE_MARKER_DIR: mkdtempSync(join(tmpdir(), "marker-")) } });
  assert.match(r.stdout.trim(), /^ZZ-\d+$/);
  assert.match(r.stderr, /row-add: stage projects\/zz\/zz-queue\.md projects\/zz\/zz-backlog\.md/);
  assert.equal(rowAdd({ vault: v, prefix: "ZZ", to: "backlog", owner: "Agent", text: "another distinct idea about colour", offline: true }).files.length, 2);
});

test("DISC-336: an open backlog row without an owner label is refused, with the way out named", () => {
  const v = mkVault();
  const r = rowAdd({ vault: v, prefix: "ZZ", to: "backlog", text: "an unlabelled thing", offline: true });
  assert.equal(r.ok, false);
  assert.match(r.reason, /unlabelled backlog row refused.*Agent\.`, `Mac\.` or `Operator\.`.*--owner/);
});

test("DISC-336: --owner writes the trailing label; a text that already ends in one is kept; a bad owner is refused", () => {
  const v = mkVault();
  const a = rowAdd({ vault: v, prefix: "ZZ", to: "backlog", owner: "Mac", text: "check it in WebKit", offline: true });
  assert.match(readFileSync(join(v, "projects/zz/zz-backlog.md"), "utf8"), new RegExp(`\\| ${a.id} \\| check it in WebKit\\. Mac\\. \\|`));
  const b = rowAdd({ vault: v, prefix: "ZZ", to: "backlog", text: "build the footer test now. Agent.", offline: true });
  assert.match(readFileSync(join(v, "projects/zz/zz-backlog.md"), "utf8"), new RegExp(`\\| ${b.id} \\| build the footer test now\\. Agent\\. \\|`));
  assert.match(rowAdd({ vault: v, prefix: "ZZ", to: "backlog", owner: "Robot", text: "x thing", offline: true }).reason, /--owner is Agent, Mac or Operator/);
});

test("DISC-336: a waiting-on-operator idea, a queue row and a merge need no owner label", () => {
  const v = mkVault();
  assert.equal(rowAdd({ vault: v, prefix: "ZZ", to: "backlog", text: "idea: a lightning strike", status: "waiting on operator", offline: true }).ok, true);
  assert.equal(rowAdd({ vault: v, prefix: "ZZ", to: "queue", text: "pick the release day", where: "w", why: "y", recommended: "r", offline: true }).ok, true);
});

// DISC-367 slice 2: a look or behaviour ask to the operator quotes the rulings it was checked against (lesson 2026-11-24-s110).
const ASKROW = { vault: null, prefix: "ZZ", to: "queue", where: "w", why: "y", recommended: "r", offline: true };
const ask = (over) => rowAdd({ ...ASKROW, vault: mkVault(), ...over });

test("DISC-367: a look ask with no --rulings is refused, naming the flag and the none-found form", () => {
  const r = ask({ text: "How should the footer buttons turn yellow at the circle edge?" });
  assert.equal(r.ok, false);
  assert.match(r.reason, /--rulings/);
  assert.match(r.reason, /none-found/);
});

test("DISC-367: a behaviour ask calling something approved is refused without rulings", () => {
  assert.equal(ask({ text: "Keep the approved arc on hover or drop it?" }).ok, false);
});

test("DISC-367: --rulings with a quote and a vault path adds the row, and the row prints the ruling", () => {
  const v = mkVault();
  const r = rowAdd({ ...ASKROW, vault: v, text: "How should the footer buttons turn yellow at the circle edge?", rulings: ['"you shouldn\'t see an actual circle" — fleet/rulings/pf-1553.md'] });
  assert.equal(r.ok, true);
  const q = readFileSync(join(v, "projects/zz/zz-queue.md"), "utf8");
  assert.match(q, /Rulings: "you shouldn't see an actual circle" — fleet\/rulings\/pf-1553\.md/);
});

test("DISC-367: --rulings none-found needs --searched, and then the row says what was searched", () => {
  const text = "What colour should the new badge be?";
  assert.equal(ask({ text, rulings: ["none-found"] }).ok, false);
  const v = mkVault();
  const r = rowAdd({ ...ASKROW, vault: v, text, rulings: ["none-found"], searched: "docs/site card badge; grep badge in decisions + queue" });
  assert.equal(r.ok, true);
  assert.match(readFileSync(join(v, "projects/zz/zz-queue.md"), "utf8"), /Rulings: none found — searched: docs\/site card badge/);
});

test("DISC-367: a ruling without a quote or a path is refused", () => {
  assert.equal(ask({ text: "What colour should the new badge be?", rulings: ["it was approved"] }).ok, false);
});

test("DISC-367: an ask that is not about look or behaviour needs no rulings", () => {
  assert.equal(ask({ text: "Merge the plugin release PR when green?" }).ok, true);
});

test("DISC-367: the backlog waiting-on-operator door gates a look ask like the queue door", () => {
  const text = "How should the footer buttons turn yellow at the circle edge?";
  const base = { vault: null, prefix: "ZZ", to: "backlog", status: "waiting on operator", offline: true };
  assert.equal(rowAdd({ ...base, vault: mkVault(), text }).ok, false);
  assert.equal(rowAdd({ ...base, vault: mkVault(), text, rulings: ['"you shouldn\'t see an actual circle" — fleet/rulings/pf-1553.md'] }).ok, true);
});

// Table: asks the reviewer saw refused that are not about look or behaviour pass; the two look asks still trip.
for (const [text, refused] of [
  ["Which edge worker region should the preview deploy use?", false],
  ["Approval needed to rotate the Cloudflare token?", false],
  ["Confirm the font licence purchase for the studio, 120 pounds?", false],
  ["Which option for the vault migration: A or B?", false],
  ["Should we drop the legacy edge cache header?", false],
  ["Merge the plugin release PR when green?", false],
  ["Sign off the scope of the Q1 roadmap?", false],
  ["How should the footer buttons turn yellow at the circle edge?", true],
  ["Is the hover colour approved?", true],
]) test(`DISC-367 trigger: ${refused ? "refuses" : "passes"} "${text}"`, () => {
  assert.equal(ask({ text }).ok, !refused);
});

// DISC-371 (review leftovers of #253 round 2)
test("DISC-371: 'approved' near a design noun is a look ask; bare approval is not", () => {
  assert.equal(ask({ text: "Did you approve the new footer arrangement?" }).ok, false);
  assert.equal(ask({ text: "Confirm the header height 64px is as approved?" }).ok, false);
  assert.equal(ask({ text: "Approval needed to rotate the Cloudflare token?" }).ok, true);
  assert.equal(ask({ text: "Was the release plan approved?" }).ok, true);
});

test("DISC-375: 'approved' with a look word beside text is a look ask; a copy ask still passes", () => {
  assert.equal(ask({ text: "Did you approve the footer text size?" }).ok, false);
  assert.equal(ask({ text: "Is the hero text approved?" }).ok, false);
  assert.equal(ask({ text: "Do you approve the headline wording?" }).ok, true);
  assert.equal(ask({ text: "Do you approve the footer copy?" }).ok, true);
});

test("DISC-371: --searched too thin to say what was searched does not satisfy none-found", () => {
  const text = "What colour should the new badge be?";
  for (const searched of ["x", "none", "grep done"]) {
    const r = ask({ text, rulings: ["none-found"], searched });
    assert.equal(r.ok, false, searched);
    assert.match(r.reason, /searched/);
  }
  assert.equal(ask({ text, rulings: ["none-found"], searched: "docs/site card badge; grep badge in decisions" }).ok, true);
});
