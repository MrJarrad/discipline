// 1.147.0: DISC-189, decision 2026-10-18-orderly-backlogs — orderly backlogs.
// (1) row-add refuses a near-duplicate and offers merge-into; (2) a merged PR strikes the rows
// its title names, and list-drift-check --fix repairs layout itself; (3) rows untouched 30 days
// are flagged stale at wrap. Run: node --test hooks/scripts/session31-law.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { rowAdd } from "./row-add.mjs";
import * as drift from "./list-drift-check.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const flat = (p) => readFileSync(join(root, p), "utf8").replace(/\s+/g, " ");
const git = (cwd, ...a) => execFileSync("git", ["-C", cwd, ...a], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });

const QUEUE = `---\nname: zz-queue\nkind: queue\nprefix: ZZ\n---\n\n| # | Needed | Where | Why | Recommended |\n|---|---|---|---|---|\n| ZZ-10 | Approve the hover glow on project tiles | preview | look | yes |\n`;
const BACKLOG = `---\nname: zz-backlog\nkind: backlog\nprefix: ZZ\n---\n\n**Next free number: 5.**\n\n## Open\n\n| # | Item | Raised | Status | Notes |\n| - | --- | --- | --- | --- |\n| ZZ-1 | Gallery strip images flash blank on first hover in Safari | 2026-10-01 | open | |\n| ZZ-2 | Footer copyright year hardcoded | 2026-10-01 | done (#4 abcdef1) | |\n| ZZ-3 | Nav wordmark size token wrong | 2026-10-01 | in flight (#7) | [NEXT SESSION] check |\n\n## Done archive\n\n| # | Item | Raised | Status | Notes |\n| - | --- | --- | --- | --- |\n| ZZ-4 | Reopened thing | 2026-10-01 | open | |\n\n## Moved to other backlogs\n\n- row 9 moved\n| ZZ-12 | Stranded profile copy row | 2026-10-02 | open | |\n| ZZ-11 | Stranded shipped row | 2026-10-02 | done — #4 shipped | |\n| 13 | Bare number row | 2026-10-02 | open | |\n`;
const mkVault = (backlog = BACKLOG, queue = QUEUE) => {
  const v = mkdtempSync(join(tmpdir(), "s31-"));
  mkdirSync(join(v, "projects/zz"), { recursive: true });
  writeFileSync(join(v, "projects/zz/zz-queue.md"), queue);
  writeFileSync(join(v, "projects/zz/zz-backlog.md"), backlog);
  return v;
};
/* A product repo named zz whose main carries merged PR #7 (title names ZZ-1 and ZZ-10) and #4. */
const mkRepo = () => {
  const r = join(mkdtempSync(join(tmpdir(), "s31r-")), "zz");
  mkdirSync(r);
  git(r, "init", "-q", "-b", "main");
  git(r, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "Merge pull request #4 from x/y\n\nFooter year");
  git(r, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "Merge pull request #7 from x/z\n\nGallery first-hover flash fixed (ZZ-1, ZZ-10)");
  return { path: r, sha: git(r, "rev-parse", "HEAD").trim().slice(0, 7) };
};

test("(1) row-add still refuses a status outside the fixed set", () => {
  assert.match(rowAdd({ vault: mkVault(), prefix: "ZZ", to: "backlog", text: "x", status: "parked", offline: true }).reason, /--status applies to a backlog row/);
});

test("(1) a row resembling an open row is refused, the rows are named, and merge-into is offered", () => {
  const v = mkVault();
  const r = rowAdd({ vault: v, prefix: "ZZ", to: "backlog", text: "Gallery strip images blank on first hover in Safari again", offline: true });
  assert.equal(r.ok, false);
  assert.deepEqual(r.similar, ["ZZ-1"]);
  assert.match(r.reason, /resembles open row ZZ-1 .*--merge-into ZZ-1.*--distinct/);
  assert.doesNotMatch(readFileSync(join(v, "projects/zz/zz-backlog.md"), "utf8"), /again/);
});

test("(1) --merge-into folds the text into the named row; no number is used", () => {
  const v = mkVault();
  const r = rowAdd({ vault: v, prefix: "ZZ", to: "backlog", text: "also on iPad", mergeInto: "ZZ-1", raised: "2026-10-18", offline: true });
  assert.equal(r.ok, true);
  assert.equal(r.id, "ZZ-1");
  const b = readFileSync(join(v, "projects/zz/zz-backlog.md"), "utf8");
  assert.match(b, /\| ZZ-1 \| Gallery strip .* \| 2026-10-18: also on iPad \|/);
  assert.match(b, /Next free number: 5\./);
  assert.match(rowAdd({ vault: v, prefix: "ZZ", to: "backlog", text: "x", mergeInto: "ZZ-2", offline: true }).reason, /ZZ-2 is not an open row/);
});

test("(1) --distinct adds the row anyway", () => {
  const r = rowAdd({ vault: mkVault(), prefix: "ZZ", to: "backlog", text: "Gallery strip images blank on first hover in Safari again", distinct: true, offline: true });
  assert.equal(r.ok, true);
});

test("(2) --fix flips merged in-flight rows and repairs layout; a title-only mention is reported, not struck", () => {
  const v = mkVault();
  const repo = mkRepo();
  const res = drift.fixVault(v, [repo.path]);
  const b = readFileSync(join(v, "projects/zz/zz-backlog.md"), "utf8");
  const q = readFileSync(join(v, "projects/zz/zz-queue.md"), "utf8");
  const rows = drift.parseBacklog(b);
  const at = (id) => rows.find((r) => r.id === id);
  assert.equal(at("ZZ-1").status, "open");                               // only named by #7's title: left open
  assert.ok(res.findings.some((f) => f.kind === "named-by" && f.row === "ZZ-1"), "title mention reported for a person");
  assert.equal(at("ZZ-3").status, `done (zz #7 ${repo.sha})`);          // in flight on a merged PR
  assert.equal(at("ZZ-2").section, "done");                              // misplaced done row moved
  assert.equal(at("ZZ-4").section, "open");                              // misplaced open row moved
  assert.equal(at("ZZ-12").section, "open");                             // stranded row refiled
  assert.equal(at("ZZ-11").section, "done");                             // off-set "done — …" filed under Done
  assert.ok(at("ZZ-13"), "bare id given the project prefix");
  assert.match(b, /~~\[NEXT SESSION\]~~ check/);                         // tag struck in place, text kept
  assert.match(b, /Next free number: 14\./);                             // stale header recomputed
  assert.match(q, /\| ZZ-10 \| Approve the hover glow on project tiles \|/);  // queue rows are never struck by the tool
  assert.ok(res.findings.some((f) => f.kind === "named-by" && f.row === "ZZ-10"));
  assert.equal(rows.length, 7, "no row deleted");
  assert.ok(res.changed.includes("projects/zz/zz-backlog.md"));
  const left = drift.checkVault(v, [repo.path]).filter((f) => drift.FAILING.has(f.kind));
  assert.deepEqual(left.map((f) => `${f.kind} ${f.row}`), ["bad-status ZZ-11"], "only the judgement call is left failing");
  assert.deepEqual(drift.fixVault(v, [repo.path]).changed, [], "idempotent");
});

test("(2) #107 repros: revert, prototype on a waiting row, part 1 of 3, incidental squash mention, queue row: nothing struck", () => {
  const v = mkVault(BACKLOG.replace("| ZZ-2 | Footer copyright year hardcoded | 2026-10-01 | done (#4 abcdef1) |", "| ZZ-2 | Pick the footer typeface | 2026-10-01 | waiting on operator |").replace("| ZZ-3 | Nav wordmark size token wrong | 2026-10-01 | in flight (#7) |", "| ZZ-3 | Nav wordmark size token wrong | 2026-10-01 | open |") + "| ZZ-5 | Squash row | 2026-10-01 | open | |\n");
  const r = join(mkdtempSync(join(tmpdir(), "s31r-")), "zz");
  mkdirSync(r);
  git(r, "init", "-q", "-b", "main");
  const c = (m) => git(r, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", m);
  c('Merge pull request #8 from x/a\n\nRevert "Gallery flash fix (ZZ-1)"');
  c("Merge pull request #9 from x/b\n\nPrototype for ZZ-2 options (no decision yet)");
  c("Merge pull request #10 from x/c\n\nZZ-3 part 1 of 3");
  c("Squash title not ZZ-5 related, see ZZ-10 (#11)");
  const before = { b: readFileSync(join(v, "projects/zz/zz-backlog.md"), "utf8"), q: readFileSync(join(v, "projects/zz/zz-queue.md"), "utf8") };
  const res = drift.fixVault(v, [r]);
  const rows = drift.parseBacklog(readFileSync(join(v, "projects/zz/zz-backlog.md"), "utf8"));
  for (const id of ["ZZ-1", "ZZ-2", "ZZ-3", "ZZ-5"]) assert.ok(!/^done/.test(rows.find((x) => x.id === id).status), `${id} not struck`);
  assert.equal(readFileSync(join(v, "projects/zz/zz-queue.md"), "utf8"), before.q, "queue untouched");
  const named = res.findings.filter((f) => f.kind === "named-by").map((f) => f.row).sort();
  assert.deepEqual(named, ["ZZ-10", "ZZ-2", "ZZ-3", "ZZ-5"], "revert ignored; the rest reported for a person");
  assert.ok(!drift.FAILING.has("named-by"), "named-by never fails the check");
});

test("(1) --merge-into a queue row goes into the Needed cell, never Recommended", () => {
  const v = mkVault();
  const r = rowAdd({ vault: v, prefix: "ZZ", to: "queue", text: "also on the footer tiles", mergeInto: "ZZ-10", raised: "2026-10-18", offline: true });
  assert.equal(r.ok, true);
  assert.match(readFileSync(join(v, "projects/zz/zz-queue.md"), "utf8"), /\| ZZ-10 \| Approve the hover glow on project tiles · 2026-10-18: also on the footer tiles \| preview \| look \| yes \|/);
});

test("(1) a distinct row that reuses a topic's words passes; a near-restatement is refused", () => {
  const v = mkVault(BACKLOG.replace("| ZZ-1 | Gallery strip images flash blank on first hover in Safari", "| ZZ-1 | Pick the footer typeface for project pages"));
  assert.equal(rowAdd({ vault: v, prefix: "ZZ", to: "backlog", text: "Remove the footer typeface override on project pages once DS ships", offline: true }).ok, true);
  assert.deepEqual(rowAdd({ vault: v, prefix: "ZZ", to: "backlog", text: "Project page footer typeface", offline: true }).similar, ["ZZ-1"]);
});

test("(2) a stranded block below a table after a blank line is refiled once; the second --fix is a byte-identical no-op", () => {
  const head = "| # | Item | Raised | Status | Notes |\n| - | --- | --- | --- | --- |\n";
  for (const n of [6, 7]) { // 6 is the real DISC ## Done archive shape; 7 does not divide 1000
    const stranded = Array.from({ length: n }, (_, i) => `| ZZ-${20 + i} | shipped ${i} | 2026-10-01 | done (#4 abcdef1) | |`).join("\n");
    const b = `---\nname: zz-backlog\nkind: backlog\nprefix: ZZ\n---\n\n## Open\n\n${head}| ZZ-1 | a | 2026-10-01 | open | |\n\n## Done archive\n\n${head}| ZZ-2 | b | 2026-10-01 | done (#4 abcdef1) | |\n\n${stranded}\n`;
    const v = mkVault(b);
    const file = join(v, "projects/zz/zz-backlog.md");
    assert.ok(drift.fixVault(v, []).changed.includes("projects/zz/zz-backlog.md"), `n=${n}: first run refiles`);
    const once = readFileSync(file, "utf8");
    assert.deepEqual(drift.parseBacklog(once).filter((r) => r.section === "done").map((r) => r.id), ["ZZ-2", ...Array.from({ length: n }, (_, i) => `ZZ-${20 + i}`)], `n=${n}: order kept`);
    assert.deepEqual(drift.fixVault(v, []).changed, [], `n=${n}: second run changes nothing`);
    assert.equal(readFileSync(file, "utf8"), once, `n=${n}: byte-identical`);
  }
});

test("(2) judgement calls are surfaced, not fixed", () => {
  const v = mkVault(BACKLOG.replace("| ZZ-1 | Gallery", "| ZZ-1 | Gallery").replace("2026-10-01 | open | |\n| ZZ-2", "2026-10-01 | parked | |\n| ZZ-2"));
  const res = drift.fixVault(v, []);
  assert.ok(res.findings.some((f) => f.kind === "bad-status" && f.row === "ZZ-1"));
});

test("(3) rows untouched 30 days are flagged stale for keep-or-park; fresh rows are not", () => {
  const v = mkVault(BACKLOG.replace("| ZZ-3 | Nav", "| ZZ-3 | Nav").replace("2026-10-01 | in flight (#7)", "2026-10-17 | in flight (#7)"));
  git(v, "init", "-q", "-b", "main");
  git(v, "add", "-A");
  execFileSync("git", ["-C", v, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "old"], { env: { ...process.env, GIT_AUTHOR_DATE: "2026-09-01T00:00:00Z", GIT_COMMITTER_DATE: "2026-09-01T00:00:00Z" } });
  const stale = drift.staleRows(v, { days: 30, today: "2026-11-15" });
  assert.ok(stale.some((f) => f.kind === "stale" && f.row === "ZZ-1" && /keep or park/.test(f.msg)));
  assert.ok(!stale.some((f) => f.row === "ZZ-3"), "raised 2026-10-17, inside the window: not stale");
  assert.ok(!stale.some((f) => f.row === "ZZ-2"), "done rows are never stale");
});

test("skill text: the wrap and session-start runs are named where they are owned", () => {
  assert.match(flat("skills/wrap/references/REPORT-AND-LEARN.md"), /list-drift-check\.mjs --vault <vault> --repo <each product repo touched> --fix --stale/);
  assert.match(flat("skills/wrap/references/REPORT-AND-LEARN.md"), /`stale` row.*keep or park/);
  assert.match(flat("skills/vault-write/references/WRITING.md"), /refuses a row that resembles an open one.*`--merge-into <ID>`.*`--distinct`/);
  assert.match(flat("hooks/scripts/session-resume.mjs"), /fixVault/);
  assert.match(flat("hooks/scripts/session-resume.mjs"), /no product clone found, so merged-PR checks were skipped/);
  assert.match(flat("skills/wrap/references/REPORT-AND-LEARN.md"), /`named-by` line, never struck/);
});
