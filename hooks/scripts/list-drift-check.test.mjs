// list-drift-check — backlogs and queues are never stale (ruling lists-never-stale,
// 2026-10-08). Offline: PRs are judged against git history the caller supplies.
// Run: node --test hooks/scripts/list-drift-check.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseStatus, parseBacklog, mergedIndex, checkBacklog, checkVault } from "./list-drift-check.mjs";

const script = fileURLToPath(new URL("./list-drift-check.mjs", import.meta.url));
const git = (cwd, ...a) => execFileSync("git", ["-C", cwd, ...a], { encoding: "utf8" }).trim();

function makeRepo() {
  const repo = mkdtempSync(join(tmpdir(), "drift-repo-"));
  git(repo, "init", "-q", "-b", "main");
  git(repo, "config", "user.email", "t@example.com");
  git(repo, "config", "user.name", "t");
  writeFileSync(join(repo, "a"), "1");
  git(repo, "add", ".");
  git(repo, "commit", "-q", "-m", "feature one (#7)");
  return { repo, sha: git(repo, "rev-parse", "--short", "HEAD") };
}

const BACKLOG = (open, done = "") =>
  `# Backlog\n\n## Open\n\n### Technical\n\n| # | Item | Raised | Status |\n| - | --- | --- | --- |\n${open}\n\n## Done\n\n| # | Item | Raised | Status |\n| - | --- | --- | --- |\n${done}\n`;

test("parseStatus accepts exactly the five statuses", () => {
  assert.equal(parseStatus("open").kind, "open");
  assert.equal(parseStatus("waiting on operator").kind, "waiting");
  assert.deepEqual(parseStatus("in flight (#12)"), { kind: "in-flight", pr: "#12" });
  assert.deepEqual(parseStatus("done (#7 abc1234)"), { kind: "done", pr: "#7", sha: "abc1234" });
  assert.deepEqual(parseStatus("done (owner/repo#7 abc1234)"), { kind: "done", pr: "owner/repo#7", sha: "abc1234" });
  assert.equal(parseStatus("moot (superseded by 48)").kind, "moot");
});

test("parseStatus rejects free text, bare in-flight, and done without a sha", () => {
  for (const s of ["DONE 2026-10-02", "open — rides 3", "in flight", "done (#7)", "unsure", "PARTLY DONE (sweep 2)", ""]) {
    assert.equal(parseStatus(s), null, s);
  }
});

test("parseBacklog reads rows with their Open/Done section and last cell as status", () => {
  const rows = parseBacklog(BACKLOG("| 1 | a | d | open |\n| ~~2~~ | b | d | in flight (#9) |", "| 3 | c | d | done (#7 abc1234) |"));
  assert.deepEqual(rows.map((r) => [r.n, r.section, r.status]), [
    ["1", "open", "open"],
    ["2", "open", "in flight (#9)"],
    ["3", "done", "done (#7 abc1234)"],
  ]);
});

test("mergedIndex finds squash and merge-commit PRs in supplied history", () => {
  const { repo, sha } = makeRepo();
  git(repo, "commit", "-q", "--allow-empty", "-m", "Merge pull request #8 from x/y");
  const idx = mergedIndex([repo]);
  assert.ok(idx.merged("#7") && idx.merged("#8"));
  assert.equal(idx.merged("#99"), false);
  assert.ok(idx.hasSha(sha));
  assert.equal(idx.hasSha("deadbee"), false);
});

test("an in-flight row citing a merged PR is drift (red-then-green core)", () => {
  const { repo } = makeRepo();
  const f = checkBacklog("p", BACKLOG("| 1 | a | d | in flight (#7) |"), mergedIndex([repo]));
  assert.deepEqual(f.map((x) => [x.kind, x.row]), [["drift", "1"]]);
});

test("a cited PR that cannot be resolved is unknown, never done", () => {
  const { repo } = makeRepo();
  const f = checkBacklog("p", BACKLOG("| 1 | a | d | in flight (#99) |", "| 2 | b | d | done (#98 abc1234) |"), mergedIndex([repo]));
  assert.deepEqual(f.map((x) => [x.kind, x.row]), [["unknown", "1"], ["unknown", "2"]]);
  assert.equal(checkBacklog("p", BACKLOG("| 1 | a | d | in flight (#99) |"), mergedIndex([])).some((x) => x.kind === "drift"), false);
});

test("an open row whose item text cites a merged PR is suspect, which does not fail", () => {
  const { repo } = makeRepo();
  const f = checkBacklog("p", BACKLOG("| 1 | fix thing, see #7 | d | open |"), mergedIndex([repo]));
  assert.equal(f[0].kind, "suspect");
});

test("a done row with a merged PR and a present sha is clean; a missing sha is unknown", () => {
  const { repo, sha } = makeRepo();
  const idx = mergedIndex([repo]);
  assert.deepEqual(checkBacklog("p", BACKLOG("", `| 1 | a | d | done (#7 ${sha}) |`), idx), []);
  assert.equal(checkBacklog("p", BACKLOG("", "| 1 | a | d | done (#7 deadbee) |"), idx)[0].kind, "unknown");
});

test("a status outside the set is bad-status; misplaced rows are flagged", () => {
  const f = checkBacklog("p", BACKLOG("| 1 | a | d | DONE 2026-10-02 |\n| 2 | b | d | moot (gone) |", "| 3 | c | d | open |"), mergedIndex([]));
  assert.deepEqual(f.map((x) => [x.kind, x.row]), [["bad-status", "1"], ["misplaced", "2"], ["misplaced", "3"]]);
});

function makeVault(files) {
  const v = mkdtempSync(join(tmpdir(), "drift-vault-"));
  for (const [p, t] of Object.entries(files)) {
    mkdirSync(join(v, p, ".."), { recursive: true });
    writeFileSync(join(v, p), t);
  }
  return v;
}

test("checkVault discovers every project backlog by glob, never a fixed list", () => {
  const { repo } = makeRepo();
  const v = makeVault({
    "projects/alpha/alpha-backlog.md": BACKLOG("| 1 | a | d | in flight (#7) |"),
    "projects/zeta/zeta-backlog.md": BACKLOG("| 1 | a | d | DONE |"),
    "orchestrator/operator-queue.md": "## X\n\n| # | Needed |\n| - | - |\n",
  });
  const f = checkVault(v, [repo]);
  assert.deepEqual(f.map((x) => [x.kind, x.project]).sort(), [["bad-status", "zeta"], ["drift", "alpha"]]);
});

test("a project with a handover but no backlog is a no-backlog finding; two backlogs is duplicate", () => {
  const v = makeVault({
    "projects/parked/parked-handover.md": "x",
    "projects/noop/noop.md": "x",
    "projects/dup/dup-handover.md": "x",
    "projects/dup/dup-backlog.md": BACKLOG(""),
    "projects/dup/dup-extra-backlog.md": BACKLOG(""),
    "projects/ok/ok-handover.md": "x",
    "projects/ok/ok-backlog.md": BACKLOG(""),
  });
  const f = checkVault(v, []);
  assert.deepEqual(f.map((x) => [x.kind, x.project]).sort(), [["duplicate", "dup"], ["no-backlog", "parked"]]);
});

test("an unstruck queue row citing a merged PR is suspect; a struck row is ignored", () => {
  const { repo } = makeRepo();
  const q = "## Portfolio\n\n| # | Needed |\n| - | - |\n| 5 | land #7 |\n| ~~6~~ | ~~land #7~~ |\n";
  const v = makeVault({ "orchestrator/operator-queue.md": q });
  const f = checkVault(v, [repo]);
  assert.deepEqual(f.map((x) => [x.kind, x.row]), [["suspect", "5"]]);
});

test("CLI exits 1 on drift, 0 when clean or only unknown", () => {
  const { repo } = makeRepo();
  const bad = makeVault({ "projects/a/a-backlog.md": BACKLOG("| 1 | a | d | in flight (#7) |") });
  const r = spawnSync("node", [script, "--vault", bad, "--repo", repo], { encoding: "utf8" });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /drift .*a-backlog\.md.*row 1/);
  const unk = makeVault({ "projects/a/a-backlog.md": BACKLOG("| 1 | a | d | in flight (#7) |") });
  assert.equal(spawnSync("node", [script, "--vault", unk], { encoding: "utf8" }).status, 0);
});

import { setRowStatus, addRow } from "./list-drift-check.mjs";

test("setRowStatus flips the status cell and moves a done row to ## Done", () => {
  const r = setRowStatus(BACKLOG("| 1 | a | d | open |\n| 2 | b | d | open |", "| 3 | c | d | done (#7 abc1234) |"), "1", "done (#9 abc1234)");
  assert.ok(r.ok);
  assert.deepEqual(parseBacklog(r.text).map((x) => [x.n, x.section, x.status]), [
    ["2", "open", "open"], ["3", "done", "done (#7 abc1234)"], ["1", "done", "done (#9 abc1234)"],
  ]);
});

test("setRowStatus keeps an in-flight flip in ## Open and refuses statuses outside the set", () => {
  const t = BACKLOG("| 1 | a | d | open |");
  assert.equal(parseBacklog(setRowStatus(t, "1", "in flight (#9)").text)[0].section, "open");
  assert.equal(setRowStatus(t, "1", "DONE").ok, false);
  assert.equal(setRowStatus(t, "9", "open").ok, false);
});

test("addRow appends a new open row with the next number", () => {
  const r = addRow(BACKLOG("| 1 | a | d | open |", "| 4 | c | d | moot (x) |"), "new finding", "2026-10-08");
  assert.equal(r.n, 5);
  assert.deepEqual(parseBacklog(r.text).map((x) => [x.n, x.section]), [["1", "open"], ["5", "open"], ["4", "done"]]);
});

const REBUILT = "**Next free number: 147.**\n\n## Open\n\n### Technical\n\n| # | Item | Raised | Status | Notes |\n| - | --- | --- | --- | --- |\n| 5 | a, see #99 | d | in flight (#7) | Was: PR #7 pending, #7 merged later |\n| 6 | b | d | open | Was: open |\n\n## Done archive\n\n| # | Item | Raised | Status | Notes |\n| - | --- | --- | --- | --- |\n";

test("the rebuilt vault shape: Status is found from the header; Notes are free history", () => {
  const rows = parseBacklog(REBUILT);
  assert.deepEqual(rows.map((r) => [r.n, r.status]), [["5", "in flight (#7)"], ["6", "open"]]);
  const { repo } = makeRepo();
  const f = checkBacklog("p", REBUILT, mergedIndex([repo]));
  assert.deepEqual(f.map((x) => [x.kind, x.row]), [["drift", "5"]], "Notes cite #7 but only the status and Item are read");
});

test("setRowStatus edits the Status column, not the last; addRow honours Next free number", () => {
  const r = setRowStatus(REBUILT, "6", "moot (superseded)");
  assert.match(r.text, /\| 6 \| b \| d \| moot \(superseded\) \| Was: open \|/);
  const a = addRow(REBUILT, "new", "2026-10-08");
  assert.equal(a.n, 147);
  assert.match(a.text, /\| 147 \| new \| 2026-10-08 \| open \|  \|/);
  assert.match(a.text, /Next free number: 148/);
});

test("a [[wikilink|alias]] pipe inside a cell is not a column break", () => {
  const [r] = parseBacklog(BACKLOG("| 1 | see [[a/b|alias]] text | d | open |"));
  assert.equal(r.status, "open");
  assert.equal(r.cells[1], "see [[a/b|alias]] text");
});

test("'Moved to other backlogs' pointer rows are not rows and never count as drift", () => {
  const { repo } = makeRepo();
  const t = REBUILT.replace("| 5 | a, see #99 | d | in flight (#7) |", "| 5 | a | d | open |") +
    "\n## Moved to other backlogs\n\n- 29 → [[hoverboard-backlog]] (open)\n- 41 → [[hoverboard-backlog]] (done #7)\n";
  assert.deepEqual(checkBacklog("p", t, mergedIndex([repo])), []);
  assert.equal(parseBacklog(t).length, 2);
});
