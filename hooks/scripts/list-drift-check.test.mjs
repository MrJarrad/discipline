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

// The repo dir is named for its project: a bare #n maps by name, never by repo count.
function makeRepo(name = "p") {
  const repo = join(mkdtempSync(join(tmpdir(), "drift-repo-")), name);
  mkdirSync(repo);
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
  assert.deepEqual(parseStatus("done (#7 abc1234)"), { kind: "done", pairs: [{ pr: "#7", sha: "abc1234" }] });
  assert.deepEqual(parseStatus("done (owner/repo#7 abc1234)"), { kind: "done", pairs: [{ pr: "owner/repo#7", sha: "abc1234" }] });
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
  const f = checkBacklog("p", BACKLOG("| 1 | a | d | in flight (skillz #99) |", "| 2 | b | d | done (#98 abc1234) |"), mergedIndex([repo]));
  assert.deepEqual(f.map((x) => [x.kind, x.row]), [["unknown", "1"], ["unknown", "2"]]);
  assert.deepEqual(checkBacklog("p", BACKLOG("| 1 | a | d | in flight (#99) |"), mergedIndex([repo])), [], "in flight and unmerged is the normal state");
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
  const { repo } = makeRepo("alpha");
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
  const { repo } = makeRepo("a");
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

test("parseStatus widened: a repo name before the PR, and a comma list of PR sha pairs", () => {
  assert.deepEqual(parseStatus("done (hoverboard #10 49c9ebc)").pairs, [{ pr: "hoverboard #10", sha: "49c9ebc" }]);
  assert.deepEqual(parseStatus("done (DS #91 d4b5bca)").pairs, [{ pr: "DS #91", sha: "d4b5bca" }]);
  assert.deepEqual(parseStatus("done (#243 eac5d79, #244 e1e0918)").pairs.map((p) => p.pr), ["#243", "#244"]);
  assert.deepEqual(parseStatus("in flight (discipline #75)"), { kind: "in-flight", pr: "discipline #75" });
  for (const s of ["done (#243 eac5d79, #244)", "done (#7 abc1234,#8 abc1234)", "done (release e0e5d28)", "done (two words #7 abc1234)"]) assert.equal(parseStatus(s), null, s);
});

test("a bare repo name resolves against --repo basenames; DS aliases jhd-design-system; wrong repo is unknown", () => {
  const base = mkdtempSync(join(tmpdir(), "drift-names-"));
  const mk = (name, subject) => {
    const r = join(base, name);
    mkdirSync(r);
    git(r, "init", "-q", "-b", "main");
    git(r, "config", "user.email", "t@example.com");
    git(r, "config", "user.name", "t");
    writeFileSync(join(r, "a"), "1");
    git(r, "add", ".");
    git(r, "commit", "-q", "-m", subject);
    return { r, sha: git(r, "rev-parse", "--short", "HEAD") };
  };
  const hb = mk("jhd-hoverboard", "board (#10)");
  const ds = mk("jhd-design-system", "tokens (#91)");
  const idx = mergedIndex([hb.r, ds.r]);
  const t = (status) => checkBacklog("p", BACKLOG("", `| 1 | a | d | ${status} |`), idx);
  assert.deepEqual(t(`done (hoverboard #10 ${hb.sha})`), []);
  assert.deepEqual(t(`done (DS #91 ${ds.sha})`), []);
  assert.deepEqual(t(`done (hoverboard #10 ${hb.sha}, DS #91 ${ds.sha})`), []);
  assert.equal(t(`done (hoverboard #91 ${ds.sha})`)[0].kind, "unknown", "#91 is not in hoverboard");
  assert.equal(t(`done (skillz #10 ${hb.sha})`)[0].kind, "unknown", "no skillz repo supplied");
  assert.equal(t(`done (hoverboard #10 ${ds.sha})`)[0].kind, "unknown", "sha checked in the named repo only");
  assert.equal(checkBacklog("p", BACKLOG("| 1 | a | d | in flight (hoverboard #10) |"), idx)[0].kind, "drift");
  assert.equal(checkBacklog("hoverboard", BACKLOG("| 1 | see #10 | d | open |"), idx)[0].kind, "suspect");
});

test("a <name>/main checkout is named by its parent folder", () => {
  const base = mkdtempSync(join(tmpdir(), "drift-main-"));
  const r = join(base, "jhd-design-system", "main");
  mkdirSync(r, { recursive: true });
  git(r, "init", "-q", "-b", "main");
  git(r, "config", "user.email", "t@example.com");
  git(r, "config", "user.name", "t");
  writeFileSync(join(r, "a"), "1");
  git(r, "add", ".");
  git(r, "commit", "-q", "-m", "tokens (#91)");
  const sha = git(r, "rev-parse", "--short", "HEAD");
  assert.deepEqual(checkBacklog("p", BACKLOG("", `| 1 | a | d | done (DS #91 ${sha}) |`), mergedIndex([r])), []);
});

/* --- 1118: review-r1 A1-A4 --- */
import { mkdtempSync as mk2 } from "node:fs";
function namedRepo(name, subject, branch) {
  const repo = join(mk2(join(tmpdir(), "drift-named-")), name);
  mkdirSync(repo);
  git(repo, "init", "-q", "-b", "main");
  git(repo, "config", "user.email", "t@example.com");
  git(repo, "config", "user.name", "t");
  writeFileSync(join(repo, "a"), "1");
  git(repo, "add", ".");
  git(repo, "commit", "-q", "-m", "base");
  if (branch) git(repo, "checkout", "-q", "-b", branch);
  if (subject) { git(repo, "commit", "-q", "--allow-empty", "-m", subject); }
  return repo;
}
const inflight = (n) => BACKLOG(`| 1 | thing | d | in flight (#${n}) |`);

test("A1: a bare #n resolves against the project's own repo, not every --repo", () => {
  const a = namedRepo("jhd-aaa", null);
  const b = namedRepo("jhd-bbb", "other thing (#5)");
  const idx = mergedIndex([a, b]);
  assert.deepEqual(checkBacklog("aaa", inflight(5), idx), [], "merged in b only: not drift for project aaa");
  assert.deepEqual(checkBacklog("bbb", inflight(5), idx).map((x) => x.kind), ["drift"]);
  assert.deepEqual(checkBacklog("zzz", inflight(5), idx).map((x) => x.kind), ["unknown"], "unmapped project with several repos: unknown, not failing");
});

test("A1: project names map to repos (jhd-design-system, discipline/jhd-discipline, <name>/main layout)", () => {
  const ds = join(namedRepo("jhd-design-system", "ds change (#18)"), "..");
  const dsMain = join(ds, "jhd-design-system", "main");
  mkdirSync(dsMain, { recursive: true });
  git(dsMain, "init", "-q", "-b", "main"); git(dsMain, "config", "user.email", "t@e.com"); git(dsMain, "config", "user.name", "t");
  git(dsMain, "commit", "-q", "--allow-empty", "-m", "ds main (#18)");
  const disc = namedRepo("discipline", null);
  const idx = mergedIndex([dsMain, disc]);
  assert.deepEqual(checkBacklog("jhd-design-system", inflight(18), idx).map((x) => x.kind), ["drift"]);
  assert.deepEqual(checkBacklog("jhd-discipline", inflight(18), idx), []);
  for (const p of ["own-tool", "capture-app", "capture-figma", "skillz", "squish"]) {
    assert.deepEqual(checkBacklog(p, inflight(18), idx).map((x) => x.kind), ["unknown"], p);
  }
});

test("A2: a commit on an unmerged branch does not make its PR merged", () => {
  const repo = namedRepo("jhd-aaa", "wip: address review on (#9)", "feat");
  const idx = mergedIndex([repo]);
  assert.equal(idx.merged("#9"), false);
  assert.deepEqual(checkBacklog("aaa", inflight(9), idx), []);
});

const rows = (t) => parseBacklog(t);
test("A3: a status containing | or a newline is refused, text untouched", () => {
  const t = BACKLOG("| 1 | a | d | open |");
  for (const s of ["moot (x | y)", "moot (x\ny)"]) {
    const r = setRowStatus(t, "1", s);
    assert.equal(r.ok, false, s);
  }
});

test("A4: a created ## Done table copies the Open table's columns", () => {
  const t = "# B\n\n## Open\n\n| # | Item | Raised | Status | Notes |\n| - | --- | --- | --- | --- |\n| 1 | a | d | open | n1 |\n";
  const out = setRowStatus(t, "1", "moot (gone)").text;
  const lines = out.split("\n");
  const head = lines.find((l, i) => i > lines.indexOf("## Done") && l.startsWith("| # |"));
  assert.equal(head, "| # | Item | Raised | Status | Notes |");
  const r = rows(out)[0];
  assert.equal(r.section, "done");
  assert.equal(r.cells.length, 5);
});

/* --- 1119: review-r1 B1, B2 --- */
test("B1: an unmapped project with exactly one --repo is unknown, same as with several", () => {
  const { repo } = makeRepo("d");
  const row = BACKLOG("| 7 | a | d | in flight (#7) |");
  assert.deepEqual(checkBacklog("skillz", row, mergedIndex([repo])).map((x) => x.kind), ["unknown"]);
  assert.deepEqual(checkBacklog("skillz", row, mergedIndex([repo, makeRepo("other").repo])).map((x) => x.kind), ["unknown"]);
  assert.deepEqual(checkBacklog("d", row, mergedIndex([repo])).map((x) => x.kind), ["drift"], "a mapped project still resolves");
});

test("B2: a clone with only origin/main (no origin/HEAD, no local main) judges merged against origin/main", () => {
  const { repo } = makeRepo("up");
  const clone = join(mkdtempSync(join(tmpdir(), "drift-clone-")), "up");
  execFileSync("git", ["clone", "-q", "--depth", "1", "file://" + repo, clone]);
  git(clone, "config", "user.email", "t@example.com");
  git(clone, "config", "user.name", "t");
  git(clone, "remote", "set-head", "origin", "-d");
  git(clone, "checkout", "-q", "-b", "feat");
  git(clone, "branch", "-D", "main");
  git(clone, "commit", "-q", "--allow-empty", "-m", "wip (#9)");
  const idx = mergedIndex([clone]);
  assert.equal(idx.merged("#9", "up"), false, "feature-branch commit is not merged");
  assert.equal(idx.merged("#7", "up"), true, "origin/main history is");
});
