// DISC-243: every vault-taking script accepts a vault CONTAINER root (<dir>/.bare + <dir>/main, the Mac's
// ~/JHD/vault layout) and reads/writes the main/ checkout, exactly as it does when handed main/ itself.
// Run: node --test hooks/scripts/vault-root-cli.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const S = (n) => fileURLToPath(new URL(`./${n}.mjs`, import.meta.url));
const FM = (px, kind) => `---\nname: x\nkind: ${kind}\nprefix: ${px}\n---\n`;
const BACKLOG = FM("PF", "backlog") + `## Open\n\n| # | Item | Raised | Status |\n| - | --- | --- | --- |\n| PF-5 | a row | 2026-11-01 | open |\n| 7 | a bare id | 2026-11-01 | open |\n\n## Done\n\n| # | Item | Raised | Status |\n| - | --- | --- | --- |\n`;
const QUEUE = FM("PF", "queue") + `| # | Needed | Where | Why | Recommended |\n| - | - | - | - | - |\n`;

function container() {
  const box = mkdtempSync(join(tmpdir(), "vrc-"));
  const main = join(box, "main");
  mkdirSync(join(box, ".bare"));
  const put = (p, t) => { mkdirSync(join(main, p, ".."), { recursive: true }); writeFileSync(join(main, p), t); };
  put("projects/portfolio/portfolio-backlog.md", BACKLOG);
  put("projects/portfolio/portfolio-queue.md", QUEUE);
  put("orchestrator/operator-queue.md", "# Operator queue index\n\nNo rows here.\n");
  put("orchestrator/cockpit.md", "# Cockpit\n\nnothing.\n");
  spawnSync("git", ["init", "-q", main]);
  spawnSync("git", ["-C", main, "remote", "add", "origin", "https://example.invalid/x/y.git"]);
  return { box, main };
}
const run = (script, args) => spawnSync(process.execPath, [S(script), ...args], { encoding: "utf8" });

for (const [name, argsFor] of [
  ["list-drift-check", (v) => ["--vault", v]],
  ["cockpit-check", (v) => ["--vault", v]],
  ["queue-migrate", (v) => ["--vault", v]],
  ["vault-pr-files", (v) => ["--vault", v, "--pr", "1"]],
  ["session-resume", (v) => [v]],
  ["lane-end", (v) => ["--vault", v, "--id", "PF-5", "--text", "PF-5 | x", "--offline", "--session-dir", join(v, "nope")]],
]) {
  test(`DISC-243: ${name} given a container root behaves exactly as given main/`, () => {
    // a fresh vault per run: session-resume and list-drift-check may fix files in place
    const a = container(), b = container();
    const viaBox = run(name, argsFor(a.box)), viaMain = run(name, argsFor(b.main));
    // DISC-264: session-resume heads its digest with a minute-resolution clock; two runs may straddle a minute.
    const norm = (r, c) => (r.stdout + r.stderr).split(c.main).join("<V>").split(c.box).join("<V>").replace(/\d{4}-\d\d-\d\dT\d\d:\d\dZ/g, "<T>");
    assert.equal(viaBox.status, viaMain.status, norm(viaBox, a));
    assert.equal(norm(viaBox, a), norm(viaMain, b));
    assert.doesNotMatch(viaBox.stdout + viaBox.stderr, /ENOENT|no such file/i);
  });
}

test("DISC-243: row-add given a container root writes the row into main/", () => {
  const { box, main } = container();
  const r = run("row-add", ["--vault", box, "--prefix", "PF", "--to", "backlog", "--text", "container-root probe row", "--offline"]);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.match(readFileSync(join(main, "projects/portfolio/portfolio-backlog.md"), "utf8"), /container-root probe row/);
});
