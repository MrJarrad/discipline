// wrap-gate — DISC-255 (operator s58: "is the backlog list up to date? It seems to continuously not be"):
// a session does not wrap while its projects' lists have failing findings or rows a merged PR names.
// Run: node --test hooks/scripts/wrap-gate.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { wrapGate } from "./wrap-gate.mjs";

const script = fileURLToPath(new URL("./wrap-gate.mjs", import.meta.url));
const FM = (px, kind) => `---\nname: x-${kind}\nkind: ${kind}\nprefix: ${px}\n---\n`;
const BACKLOG = (px, open) => FM(px, "backlog") + `## Open\n\n| # | Item | Raised | Status |\n| - | --- | --- | --- |\n${open}\n\n## Done\n\n| # | Item | Raised | Status |\n| - | --- | --- | --- |\n`;
const QUEUE = (px) => FM(px, "queue") + `| # | Needed |\n| - | - |\n`;
const git = (cwd, ...a) => execFileSync("git", ["-C", cwd, ...a], { encoding: "utf8" }).trim();

function vault(files) {
  const v = mkdtempSync(join(tmpdir(), "wg-vault-"));
  for (const [p, t] of Object.entries({ "orchestrator/operator-queue.md": "# index\n", ...files })) {
    mkdirSync(join(v, p, ".."), { recursive: true });
    writeFileSync(join(v, p), t);
  }
  return v;
}
function repo(name, subject, body) {
  const r = join(mkdtempSync(join(tmpdir(), "wg-repo-")), name);
  mkdirSync(r);
  git(r, "init", "-q", "-b", "main"); git(r, "config", "user.email", "t@e.com"); git(r, "config", "user.name", "t");
  writeFileSync(join(r, "a"), "1"); git(r, "add", "."); git(r, "commit", "-q", "-m", "init");
  git(r, "commit", "-q", "--allow-empty", "-m", subject, ...(body ? ["-m", body] : []));
  return r;
}
const two = () => vault({
  "projects/alpha/alpha-backlog.md": BACKLOG("AL", "| AL-1 | named by a merged PR | d | open |\n| AL-2 | status is junk | d | gibberish |"),
  "projects/alpha/alpha-queue.md": QUEUE("AL"),
  "projects/beta/beta-backlog.md": BACKLOG("BE", "| BE-1 | other project, junk status | d | gibberish |"),
  "projects/beta/beta-queue.md": QUEUE("BE"),
});

test("a session project with a failing finding or a named-by row does not wrap; the lines name the rows", () => {
  const v = two();
  const r = repo("alpha", "ship the thing (#9)", "Closes AL-1.");
  const g = wrapGate(v, ["AL"], [r]);
  assert.equal(g.ok, false);
  assert.ok(g.lines.some((l) => /^bad-status .*row AL-2/.test(l)), g.lines.join("\n"));
  assert.ok(g.lines.some((l) => /^named-by .*row AL-1/.test(l)), g.lines.join("\n"));
});

test("other projects' findings are not this session's: a clean session project wraps", () => {
  const v = vault({
    "projects/alpha/alpha-backlog.md": BACKLOG("AL", "| AL-1 | fine | d | open |"),
    "projects/alpha/alpha-queue.md": QUEUE("AL"),
    "projects/beta/beta-backlog.md": BACKLOG("BE", "| BE-1 | junk | d | gibberish |"),
    "projects/beta/beta-queue.md": QUEUE("BE"),
  });
  const none = repo("alpha", "init-only", "");
  assert.deepEqual(wrapGate(v, ["AL"], [none]), { ok: true, lines: [] });
  assert.equal(wrapGate(v, ["BE"], [none]).ok, false);
});

test("an unknown prefix is refused, not passed", () => {
  const g = wrapGate(two(), ["ZZ"], [repo("alpha", "x", "")]);
  assert.equal(g.ok, false);
  assert.match(g.reason, /unknown project prefix: ZZ/);
});

test("CLI: exit 1 listing the lines when the gate fails, 0 and one line when clean", () => {
  const v = two();
  const bad = spawnSync(process.execPath, [script, "--vault", v, "--projects", "AL", "--repo", repo("alpha", "x", "")], { encoding: "utf8" });
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /bad-status/);
  assert.match(bad.stdout, /do not wrap/i);
  const clean = vault({ "projects/alpha/alpha-backlog.md": BACKLOG("AL", "| AL-1 | fine | d | open |"), "projects/alpha/alpha-queue.md": QUEUE("AL") });
  const ok = spawnSync(process.execPath, [script, "--vault", clean, "--projects", "AL", "--repo", repo("alpha", "x", "")], { encoding: "utf8" });
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.match(ok.stdout, /wrap-gate: clean/);
});

test("CLI: a container vault root works and a missing --projects is a usage error (exit 2)", () => {
  const v = two();
  const box = mkdtempSync(join(tmpdir(), "wg-box-"));
  mkdirSync(join(box, ".bare"));
  spawnSync("mv", [v, join(box, "main")]);
  assert.equal(spawnSync(process.execPath, [script, "--vault", box, "--projects", "AL", "--repo", repo("alpha", "x", "")], { encoding: "utf8" }).status, 1);
  assert.equal(spawnSync(process.execPath, [script, "--vault", box], { encoding: "utf8" }).status, 2);
});

// DISC-255 review amber (#144): named-by cannot run without the product repos' history, so "clean" with
// no --repo is a false clear. The gate refuses instead.
test("no --repo: the gate refuses (exit 2) rather than print clean", () => {
  const clean = vault({ "projects/alpha/alpha-backlog.md": BACKLOG("AL", "| AL-1 | fine | d | open |"), "projects/alpha/alpha-queue.md": QUEUE("AL") });
  const g = wrapGate(clean, ["AL"], []);
  assert.equal(g.ok, false);
  assert.match(g.reason, /--repo/);
  const r = spawnSync(process.execPath, [script, "--vault", clean, "--projects", "AL"], { encoding: "utf8" });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /--repo/);
  assert.doesNotMatch(r.stdout, /clean/);
});
