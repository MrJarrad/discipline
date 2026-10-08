// lane-end — the one deterministic parent call per lane-completion
// notification (`spend-levers` rule 5, 2026-09-22; round 2 fix same day:
// row lookup/replace is scoped to `--section`'s own line range, never a
// whole-file search — a same-numbered row in a different section must
// neither falsely refuse nor be silently overwritten).
// Tests the pure row-lookup/replace logic only — no disk, git or gh here.
// Run: node --test hooks/scripts/lane-end.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { findRow, replaceRow, sectionRange, parseArgs } from "./lane-end.mjs";

const scriptPath = fileURLToPath(new URL("./lane-end.mjs", import.meta.url));

const TWO_SECTION_QUEUE = "## Portfolio\n9. portfolio row nine\n## Discipline\n9. discipline row nine\n10. discipline row ten\n";

test("parseArgs reads flag/value pairs", () => {
  const args = parseArgs(["--session-dir", "/tmp/x", "--row", "9", "--text", "hello world"]);
  assert.equal(args["session-dir"], "/tmp/x");
  assert.equal(args.row, "9");
  assert.equal(args.text, "hello world");
});

test("parseArgs reads the --dry-run flag with no value", () => {
  const args = parseArgs(["--row", "9", "--dry-run"]);
  assert.equal(args["dry-run"], true);
});

test("sectionRange spans a section's own body only, not neighbouring sections", () => {
  const range = sectionRange(TWO_SECTION_QUEUE, "Portfolio");
  const lines = TWO_SECTION_QUEUE.split("\n");
  const body = lines.slice(range.start, range.end).join("\n");
  assert.match(body, /portfolio row nine/);
  assert.doesNotMatch(body, /discipline/);
});

test("sectionRange returns null for a section that does not exist", () => {
  assert.equal(sectionRange(TWO_SECTION_QUEUE, "Nope"), null);
});

// --- Round 2: row 9 exists in TWO sections ----------------------------------

test("findRow scoped to Discipline finds Discipline's row 9, not Portfolio's", () => {
  const found = findRow(TWO_SECTION_QUEUE, "9", "Discipline");
  const lines = TWO_SECTION_QUEUE.split("\n");
  assert.match(lines[found.lineIndex], /discipline row nine/);
});

test("findRow scoped to Portfolio finds Portfolio's row 9, not Discipline's", () => {
  const found = findRow(TWO_SECTION_QUEUE, "9", "Portfolio");
  const lines = TWO_SECTION_QUEUE.split("\n");
  assert.match(lines[found.lineIndex], /portfolio row nine/);
});

test("replaceRow with --section Discipline is NOT falsely refused when row 9 also exists in Portfolio", () => {
  const result = replaceRow(TWO_SECTION_QUEUE, "9", "9. discipline row nine, replaced", "Discipline");
  assert.equal(result.ok, true, result.reason);
});

test("replaceRow with --section Discipline never touches Portfolio's same-numbered row", () => {
  const result = replaceRow(TWO_SECTION_QUEUE, "9", "9. discipline row nine, replaced", "Discipline");
  assert.match(result.text, /portfolio row nine/); // Portfolio's row 9 survives untouched
  assert.match(result.text, /discipline row nine, replaced/);
  assert.doesNotMatch(result.text, /^9\. discipline row nine$/m);
});

test("replaceRow with --section Portfolio replaces Portfolio's row 9 only, leaving Discipline's row 9 untouched", () => {
  const result = replaceRow(TWO_SECTION_QUEUE, "9", "9. portfolio row nine, replaced", "Portfolio");
  assert.equal(result.ok, true);
  assert.match(result.text, /portfolio row nine, replaced/);
  assert.match(result.text, /discipline row nine/);
  assert.doesNotMatch(result.text, /^9\. discipline row nine, replaced$/m);
});

// --- Required --section, no whole-file fallback -----------------------------

test("replaceRow refuses with no --section at all — no whole-file fallback", () => {
  const result = replaceRow(TWO_SECTION_QUEUE, "9", "9. x");
  assert.equal(result.ok, false);
  assert.match(result.reason, /--section is required/);
});

test("replaceRow refuses when --section names a section that does not exist", () => {
  const result = replaceRow(TWO_SECTION_QUEUE, "9", "9. x", "Nope");
  assert.equal(result.ok, false);
  assert.match(result.reason, /not found in the queue file/);
});

test("replaceRow refuses when the row is absent from the named section, even though it exists elsewhere", () => {
  const result = replaceRow(TWO_SECTION_QUEUE, "10", "10. x", "Portfolio"); // row 10 only exists in Discipline
  assert.equal(result.ok, false);
  assert.match(result.reason, /not found in section "Portfolio"/);
});

test("replaceRow replaces only the named row's line within its section, leaving sibling rows untouched", () => {
  const result = replaceRow(TWO_SECTION_QUEUE, "9", "9. discipline row nine, replaced", "Discipline");
  assert.match(result.text, /10\. discipline row ten/);
});

// --- --then-merge / --then-build (scripts-not-agents Boundaries, 2026-09-22:
// "lane-end.mjs may call 4 then 1 via flags") ---------------------------------

function makeVaultWithQueue() {
  const remoteDir = mkdtempSync(join(tmpdir(), "lane-end-vault-remote-"));
  execFileSync("git", ["init", "-q", "--bare", remoteDir]);
  const vault = mkdtempSync(join(tmpdir(), "lane-end-vault-"));
  execFileSync("git", ["clone", "-q", remoteDir, vault]);
  execFileSync("git", ["-C", vault, "config", "user.email", "test@example.com"]);
  execFileSync("git", ["-C", vault, "config", "user.name", "test"]);
  execFileSync("git", ["-C", vault, "checkout", "-q", "-b", "main"]);
  mkdirSync(join(vault, "orchestrator"), { recursive: true });
  writeFileSync(join(vault, "orchestrator", "operator-queue.md"), "## Discipline\n1. old row\n");
  execFileSync("git", ["-C", vault, "add", "."]);
  execFileSync("git", ["-C", vault, "commit", "-q", "-m", "init"]);
  execFileSync("git", ["-C", vault, "push", "-u", "origin", "main"]);
  return vault;
}

function makeTargetRepoWithPr() {
  const remoteDir = mkdtempSync(join(tmpdir(), "lane-end-target-remote-"));
  execFileSync("git", ["init", "-q", "--bare", remoteDir]);
  const repo = mkdtempSync(join(tmpdir(), "lane-end-target-"));
  execFileSync("git", ["clone", "-q", remoteDir, repo]);
  execFileSync("git", ["-C", repo, "config", "user.email", "test@example.com"]);
  execFileSync("git", ["-C", repo, "config", "user.name", "test"]);
  execFileSync("git", ["-C", repo, "checkout", "-q", "-b", "main"]);
  writeFileSync(join(repo, "README.md"), "hello\n");
  execFileSync("git", ["-C", repo, "add", "."]);
  execFileSync("git", ["-C", repo, "commit", "-q", "-m", "init"]);
  execFileSync("git", ["-C", repo, "push", "-u", "origin", "main"]);
  return repo;
}

function makeFakeGhBin(binDir) {
  const ghPath = join(binDir, "gh");
  writeFileSync(
    ghPath,
    `#!/usr/bin/env bash
action="$1"; shift
sub="$1"; shift
case "$sub" in
  view)
    echo '{"statusCheckRollup":[{"conclusion":"SUCCESS"}],"mergeable":"MERGEABLE"}'
    ;;
  merge)
    exit 0
    ;;
esac
exit 0
`,
  );
  chmodSync(ghPath, 0o755);
}

test("--then-merge calls merge-after-review.mjs against the named PR and repo", () => {
  const vault = makeVaultWithQueue();
  const repo = makeTargetRepoWithPr();
  const binDir = mkdtempSync(join(tmpdir(), "lane-end-bin-"));
  makeFakeGhBin(binDir);
  const sessionDir = mkdtempSync(join(tmpdir(), "lane-end-session-"));
  try {
    const out = execFileSync(
      "node",
      [
        scriptPath,
        "--session-dir",
        sessionDir,
        "--vault",
        vault,
        "--row",
        "1",
        "--section",
        "Discipline",
        "--text",
        "1. new row",
        "--then-merge",
        "owner/repo#9",
        "--repo",
        repo,
      ],
      { encoding: "utf8", env: { ...process.env, PATH: `${binDir}:${process.env.PATH}` } },
    );
    assert.match(out, /merged owner\/repo#9, main fast-forwarded, worktrees pruned/);
  } finally {
    rmSync(vault, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
    rmSync(binDir, { recursive: true, force: true });
    rmSync(sessionDir, { recursive: true, force: true });
  }
});

// --- law: bare + worktrees layout (2026-09-22-scripts-not-agents § Layout) -
// lane-end.mjs delegates all repo git work to merge-after-review.mjs /
// release-build.mjs — this proves the chain composes against a bare-layout
// target without lane-end.mjs itself needing any layout-aware code.

function makeBareLayoutTargetRepoWithPr() {
  const remoteDir = mkdtempSync(join(tmpdir(), "lane-end-bl-remote-"));
  execFileSync("git", ["init", "-q", "--bare", remoteDir]);
  const root = mkdtempSync(join(tmpdir(), "lane-end-bl-root-"));
  execFileSync("git", ["init", "-q", "--bare", join(root, ".bare")]);
  execFileSync("git", ["-C", join(root, ".bare"), "remote", "add", "origin", remoteDir]);
  execFileSync("git", ["--git-dir", join(root, ".bare"), "worktree", "add", "-b", "main", join(root, "main")]);
  const mainDir = join(root, "main");
  execFileSync("git", ["-C", mainDir, "config", "user.email", "test@example.com"]);
  execFileSync("git", ["-C", mainDir, "config", "user.name", "test"]);
  writeFileSync(join(mainDir, "README.md"), "hello\n");
  execFileSync("git", ["-C", mainDir, "add", "."]);
  execFileSync("git", ["-C", mainDir, "commit", "-q", "-m", "init"]);
  execFileSync("git", ["-C", mainDir, "push", "-u", "origin", "main"]);
  return { root, mainDir };
}

test("law: --then-merge against a bare-layout repo ff-pulls main, never checking a branch out inside it", () => {
  const vault = makeVaultWithQueue();
  const { root, mainDir } = makeBareLayoutTargetRepoWithPr();
  const binDir = mkdtempSync(join(tmpdir(), "lane-end-blbin-"));
  makeFakeGhBin(binDir);
  const sessionDir = mkdtempSync(join(tmpdir(), "lane-end-session-"));
  try {
    const out = execFileSync(
      "node",
      [
        scriptPath,
        "--session-dir",
        sessionDir,
        "--vault",
        vault,
        "--row",
        "1",
        "--section",
        "Discipline",
        "--text",
        "1. new row",
        "--then-merge",
        "owner/repo#9",
        "--repo",
        root,
      ],
      { encoding: "utf8", env: { ...process.env, PATH: `${binDir}:${process.env.PATH}` } },
    );
    assert.match(out, /merged owner\/repo#9, main fast-forwarded, worktrees pruned/);
    const currentBranch = execFileSync("git", ["-C", mainDir, "branch", "--show-current"], {
      encoding: "utf8",
    }).trim();
    assert.equal(currentBranch, "main", "main worktree must never be switched off main");
  } finally {
    rmSync(vault, { recursive: true, force: true });
    rmSync(root, { recursive: true, force: true });
    rmSync(binDir, { recursive: true, force: true });
    rmSync(sessionDir, { recursive: true, force: true });
  }
});

test("--then-merge without --repo fails loud, naming the missing flag", () => {
  const vault = makeVaultWithQueue();
  const binDir = mkdtempSync(join(tmpdir(), "lane-end-bin-"));
  makeFakeGhBin(binDir);
  const sessionDir = mkdtempSync(join(tmpdir(), "lane-end-session-"));
  try {
    assert.throws(() => {
      execFileSync(
        "node",
        [
          scriptPath,
          "--session-dir",
          sessionDir,
          "--vault",
          vault,
          "--row",
          "1",
          "--section",
          "Discipline",
          "--text",
          "1. new row",
          "--then-merge",
          "owner/repo#9",
        ],
        { encoding: "utf8", env: { ...process.env, PATH: `${binDir}:${process.env.PATH}` } },
      );
    }, /--repo is required alongside --then-merge/);
  } finally {
    rmSync(vault, { recursive: true, force: true });
    rmSync(binDir, { recursive: true, force: true });
    rmSync(sessionDir, { recursive: true, force: true });
  }
});

// --- lists never stale (ruling lists-never-stale, 2026-10-08): the backlog row
// flips in the same action as its event; a drift finding fails the exit code but
// never loses the lane's own record.

const BACKLOG_TEXT = "## Open\n\n| # | Item | Raised | Status |\n| - | --- | --- | --- |\n| 1 | thing | d | in flight (#7) |\n| 2 | other | d | in flight (#7) |\n\n## Done\n\n| # | Item | Raised | Status |\n| - | --- | --- | --- |\n";

function laneEndWithBacklog(extra) {
  const vault = makeVaultWithQueue();
  mkdirSync(join(vault, "projects", "p"), { recursive: true });
  writeFileSync(join(vault, "projects", "p", "p-backlog.md"), BACKLOG_TEXT);
  execFileSync("git", ["-C", vault, "add", "."]);
  execFileSync("git", ["-C", vault, "commit", "-q", "-m", "backlog"]);
  execFileSync("git", ["-C", vault, "push", "-q"]);
  const repo = makeTargetRepoWithPr();
  execFileSync("git", ["-C", repo, "commit", "-q", "--allow-empty", "-m", "thing (#7)"]);
  const sha = execFileSync("git", ["-C", repo, "rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
  const sessionDir = mkdtempSync(join(tmpdir(), "lane-end-session-"));
  const r = spawnSync("node", [scriptPath, "--session-dir", sessionDir, "--vault", vault, "--row", "1", "--section", "Discipline", "--text", "1. landed",
    "--backlog", "projects/p/p-backlog.md", "--backlog-row", "1", "--status", `done (#7 ${sha})`, "--drift-repo", repo, ...extra], { encoding: "utf8" });
  return { vault, r, sha };
}

test("lane-end flips the backlog row to done in the lane's own commit, then fails on remaining drift", () => {
  const { vault, r, sha } = laneEndWithBacklog([]);
  const text = readFileSync(join(vault, "projects", "p", "p-backlog.md"), "utf8");
  assert.match(text, new RegExp(`\\| 1 \\| thing \\| d \\| done \\(#7 ${sha}\\) \\|`));
  assert.ok(text.indexOf("| 1 | thing") > text.indexOf("## Done"), "row moved under Done");
  const files = execFileSync("git", ["-C", vault, "show", "--name-only", "--format=", "HEAD"], { encoding: "utf8" });
  assert.match(files, /operator-queue\.md/);
  assert.match(files, /p-backlog\.md/);
  assert.equal(r.status, 1, "row 2 still in flight on a merged PR: drift fails the exit");
  assert.match(r.stderr + r.stdout, /drift projects\/p\/p-backlog\.md row 2/);
});

test("lane-end refuses a status outside the fixed set before writing anything", () => {
  const vault = makeVaultWithQueue();
  mkdirSync(join(vault, "projects", "p"), { recursive: true });
  writeFileSync(join(vault, "projects", "p", "p-backlog.md"), BACKLOG_TEXT);
  const r = spawnSync("node", [scriptPath, "--session-dir", tmpdir(), "--vault", vault, "--row", "1", "--section", "Discipline", "--text", "1. x",
    "--backlog", "projects/p/p-backlog.md", "--backlog-row", "1", "--status", "DONE yesterday"], { encoding: "utf8" });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /outside the fixed set/);
  assert.match(readFileSync(join(vault, "orchestrator", "operator-queue.md"), "utf8"), /1\. old row/);
});

test("N3: --backlog alone, or --backlog-row with --backlog-add, is refused before any write", () => {
  for (const extra of [["--backlog", "projects/p/p-backlog.md"], ["--backlog", "projects/p/p-backlog.md", "--backlog-row", "1", "--backlog-add", "x", "--status", "open"]]) {
    const vault = makeVaultWithQueue();
    mkdirSync(join(vault, "projects", "p"), { recursive: true });
    writeFileSync(join(vault, "projects", "p", "p-backlog.md"), BACKLOG_TEXT);
    const r = spawnSync("node", [scriptPath, "--session-dir", tmpdir(), "--vault", vault, "--row", "1", "--section", "Discipline", "--text", "1. x", ...extra], { encoding: "utf8" });
    assert.equal(r.status, 1, extra.join(" "));
    assert.match(r.stderr, /--backlog/);
    assert.match(readFileSync(join(vault, "orchestrator", "operator-queue.md"), "utf8"), /1\. old row/);
  }
});
