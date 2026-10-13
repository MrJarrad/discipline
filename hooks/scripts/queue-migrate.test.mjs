// queue-migrate — the one-time vault migration (backlog 166). Fixture vault with the
// shapes that hurt: the same number in two sections, a struck row, a duplicate number
// inside one backlog (backlog numbers stay clear of the queue's: one ID, one row per project, DISC-167), a merged-project section, a placeholder row.
// Run: node --test hooks/scripts/queue-migrate.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { migrate } from "./queue-migrate.mjs";
import { checkVault } from "./list-drift-check.mjs";
import { neededFromYou, render } from "./needed-from-you.mjs";

const script = fileURLToPath(new URL("./queue-migrate.mjs", import.meta.url));
const BL = (rows, done = "") => `---\nname: x-backlog\nkind: backlog\n---\n# b\n\n**Next free number: 10.**\n\n## Open\n\n| # | Item | Raised | Status |\n| - | --- | --- | --- |\n${rows}\n\n## Done\n\n| # | Item | Raised | Status |\n| - | --- | --- | --- |\n${done}\n`;
const QUEUE = [
  "# Operator queue", "", "Archive: [[operator-queue-archive-2026-10|2026-10]]", "",
  "## Portfolio + discipline", "", "**Next free number: 7** (highest used 6).", "", "| # | Needed | Where | Why | Recommended |", "|---|---|---|---|---|",
  "| 5 | pf five | | | |", "| 6 | ~~DS item~~ answered | | | |", "",
  "## Hoverboard", "", "**Next free number: 6**", "", "| # | Needed | Where | Why | Recommended |", "|---|---|---|---|---|",
  "| 5 | hb five | | | |", "| 4 | ~~hb struck~~ yes | | | |", "",
  "## Capture + Squish", "", "| # | Needed |", "|---|---|", "| — | No open rows. |", "",
].join("\n");

function fixture() {
  const v = mkdtempSync(join(tmpdir(), "qmig-"));
  const put = (p, t) => { mkdirSync(join(v, p, ".."), { recursive: true }); writeFileSync(join(v, p), t); };
  put("orchestrator/operator-queue.md", QUEUE);
  put("projects/portfolio/portfolio-backlog.md", BL("| 1 | pf backlog one | d | waiting on operator |\n| 2 | two | d | open |", "| 2 | dup two | d | moot (x) |"));
  put("projects/hoverboard/hoverboard-backlog.md", BL("| 1 | hb backlog one | d | open |"));
  put("projects/jhd-design-system/jhd-design-system-backlog.md", BL("| 1 | ds backlog one | d | open |"));
  return v;
}

test("migrate: counts match per project, rows keep their text, struck stays struck", () => {
  const r = migrate(fixture());
  assert.deepEqual(r.errors, []);
  assert.equal(r.totalQueueRows, 4);
  assert.equal(r.projects.portfolio.queueAfter, 2);
  assert.equal(r.projects.hoverboard.queueAfter, 2);
  assert.equal(r.projects["jhd-design-system"].queueAfter, 0);
  const hb = r.files["projects/hoverboard/hoverboard-queue.md"];
  assert.match(hb, /^prefix: HB$/m);
  assert.match(hb, /\| HB-5 \| hb five \|/);
  assert.match(hb, /\| HB-4 \| ~~hb struck~~ yes \|/);
  assert.match(hb, /\*\*Next free number: 6\*\*/);
  assert.match(hb, /exactly `HB-N`/);
  assert.equal(r.files["orchestrator/operator-queue.md"].includes("| 5 |"), false, "the shared file keeps no rows");
});

test("migrate: backlog rows are prefixed, the ID-less duplicate gets the next free number, nothing is dropped", () => {
  const r = migrate(fixture());
  const pf = r.files["projects/portfolio/portfolio-backlog.md"];
  assert.match(pf, /^prefix: PF$/m);
  assert.match(pf, /\| PF-1 \| pf backlog one/);
  assert.match(pf, /\| PF-10 \| dup two \| d \| moot \(x\) \(was PF-2, a duplicate number/);
  assert.equal(r.projects.portfolio.backlogBefore, r.projects.portfolio.backlogAfter);
  assert.equal(r.renumbered.length, 1);
});

test("CLI --apply writes the files; the vault then lints clean and same-number rows no longer cross", () => {
  const v = fixture();
  const dry = spawnSync("node", [script, "--vault", v], { encoding: "utf8" });
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, /\[dry-run\]/);
  assert.match(readFileSync(join(v, "orchestrator", "operator-queue.md"), "utf8"), /^# Operator queue\n/, "dry run wrote nothing");
  const run = spawnSync("node", [script, "--vault", v, "--apply"], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(checkVault(v, []).filter((f) => f.kind !== "suspect" && f.kind !== "unknown").map((f) => `${f.kind} ${f.file}`), []);
  const out = render(neededFromYou(v, ["HB"]));
  assert.match(out, /HB-5 \| hb five/);
  assert.doesNotMatch(out, /pf five|HB-4/);
  const again = spawnSync("node", [script, "--vault", v, "--apply"], { encoding: "utf8" });
  assert.equal(again.status, 0, "idempotent: a second run changes no row");
  assert.match(readFileSync(join(v, "projects", "hoverboard", "hoverboard-queue.md"), "utf8"), /\| HB-5 \| hb five \|/);
});
