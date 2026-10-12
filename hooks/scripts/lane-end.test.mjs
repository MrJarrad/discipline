// lane-end — the one deterministic parent call per lane-completion
// notification (`spend-levers` rule 5, 2026-09-22; round 2 fix same day:
// 1.132.0, backlog 166: rows are keyed by a project-prefixed ID (`--id PF-9`),
// resolved to that project's own queue file — a same-numbered row in another
// project is in another file and can neither be refused nor overwritten).
// Tests the pure row-lookup/replace logic only — no disk, git or gh here.
// Run: node --test hooks/scripts/lane-end.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { replaceRowById, parseArgs } from "./lane-end.mjs";
import { discoverFiles } from "./lib/queue-ids.mjs";

const scriptPath = fileURLToPath(new URL("./lane-end.mjs", import.meta.url));


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

// --- Backlog 166 (operator 2026-10-12): rows are keyed by a project-prefixed ID ---

const PF_QUEUE = "| # | Needed |\n| - | - |\n| PF-9 | portfolio row nine |\n| PF-10 | portfolio row ten |\n| ~~PF-8~~ | ~~old~~ |\n";

test("replaceRowById replaces exactly the named row and nothing else", () => {
  const r = replaceRowById(PF_QUEUE, "PF-9", "| PF-9 | ~~portfolio row nine~~ done |");
  assert.equal(r.ok, true, r.reason);
  assert.match(r.text, /PF-9 \| ~~portfolio row nine~~ done/);
  assert.match(r.text, /\| PF-10 \| portfolio row ten \|/);
});

test("replaceRowById refuses a bare number", () => {
  const r = replaceRowById(PF_QUEUE, "9", "| 9 | x |");
  assert.equal(r.ok, false);
  assert.match(r.reason, /project-prefixed/);
});

test("replaceRowById refuses replacement text carrying another project's ID — the cross-project overwrite", () => {
  const r = replaceRowById(PF_QUEUE, "PF-9", "| HB-9 | hoverboard row, wrongly landed here |");
  assert.equal(r.ok, false);
  assert.match(r.reason, /not PF-9/);
  assert.equal(replaceRowById(PF_QUEUE, "PF-9", "no id at all").ok, false);
});

test("replaceRowById refuses a row absent from this project's queue, a duplicate ID, and a struck row", () => {
  assert.match(replaceRowById(PF_QUEUE, "HB-9", "| HB-9 | x |").reason, /not found/);
  assert.match(replaceRowById(PF_QUEUE + "| PF-9 | again |\n", "PF-9", "| PF-9 | x |").reason, /appears 2 times/);
  assert.match(replaceRowById(PF_QUEUE, "PF-8", "| PF-8 | new |").reason, /already struck/);
});

test("same number in two projects: writing PF-5 leaves HB-5 byte-identical (separate files, separate prefixes)", () => {
  const vault = mkdtempSync(join(tmpdir(), "lane-end-xproj-"));
  const q = (px, name) => `---\nname: ${name}\nkind: queue\nprefix: ${px}\n---\n| # | Needed |\n| - | - |\n| ${px}-5 | ${name} five |\n`;
  mkdirSync(join(vault, "projects", "portfolio"), { recursive: true });
  mkdirSync(join(vault, "projects", "hoverboard"), { recursive: true });
  writeFileSync(join(vault, "projects", "portfolio", "portfolio-queue.md"), q("PF", "portfolio"));
  writeFileSync(join(vault, "projects", "hoverboard", "hoverboard-queue.md"), q("HB", "hoverboard"));
  const before = readFileSync(join(vault, "projects", "hoverboard", "hoverboard-queue.md"), "utf8");
  const reg = discoverFiles(vault);
  assert.equal(reg.byPrefix.get("PF").queue, "projects/portfolio/portfolio-queue.md");
  const pf = readFileSync(join(vault, reg.byPrefix.get("PF").queue), "utf8");
  const r = replaceRowById(pf, "PF-5", "| PF-5 | ~~portfolio five~~ |");
  assert.equal(r.ok, true);
  writeFileSync(join(vault, reg.byPrefix.get("PF").queue), r.text);
  assert.equal(readFileSync(join(vault, "projects", "hoverboard", "hoverboard-queue.md"), "utf8"), before);
  rmSync(vault, { recursive: true, force: true });
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
  mkdirSync(join(vault, "projects", "p"), { recursive: true });
  mkdirSync(join(vault, "projects", "q"), { recursive: true });
  writeFileSync(join(vault, "projects", "p", "p-queue.md"), "---\nname: p-queue\nkind: queue\nprefix: TP\n---\n| # | Needed |\n| - | - |\n| TP-1 | old row |\n");
  writeFileSync(join(vault, "projects", "q", "q-queue.md"), "---\nname: q-queue\nkind: queue\nprefix: TQ\n---\n| # | Needed |\n| - | - |\n| TQ-1 | other project row |\n");
  execFileSync("git", ["-C", vault, "add", "."]);
  execFileSync("git", ["-C", vault, "commit", "-q", "-m", "init"]);
  execFileSync("git", ["-C", vault, "push", "-u", "origin", "main"]);
  return vault;
}

function makeTargetRepoWithPr(name) {
  const remoteDir = mkdtempSync(join(tmpdir(), "lane-end-target-remote-"));
  execFileSync("git", ["init", "-q", "--bare", remoteDir]);
  const repo = name ? join(mkdtempSync(join(tmpdir(), "lane-end-target-")), name) : mkdtempSync(join(tmpdir(), "lane-end-target-"));
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
        "--id", "TP-1", "--text", "| TP-1 | new row |",
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
        "--id", "TP-1", "--text", "| TP-1 | new row |",
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
          "--id", "TP-1", "--text", "| TP-1 | new row |",
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

const BACKLOG_TEXT = "---\nname: p-backlog\nkind: backlog\nprefix: TP\n---\n## Open\n\n| # | Item | Raised | Status |\n| - | --- | --- | --- |\n| TP-1 | thing | d | in flight (#7) |\n| TP-2 | other | d | in flight (#7) |\n\n## Done\n\n| # | Item | Raised | Status |\n| - | --- | --- | --- |\n";

function laneEndWithBacklog(extra) {
  const vault = makeVaultWithQueue();
  mkdirSync(join(vault, "projects", "p"), { recursive: true });
  writeFileSync(join(vault, "projects", "p", "p-backlog.md"), BACKLOG_TEXT);
  execFileSync("git", ["-C", vault, "add", "."]);
  execFileSync("git", ["-C", vault, "commit", "-q", "-m", "backlog"]);
  execFileSync("git", ["-C", vault, "push", "-q"]);
  const repo = makeTargetRepoWithPr("p"); // named for the backlog project: a bare #n maps by name
  execFileSync("git", ["-C", repo, "commit", "-q", "--allow-empty", "-m", "thing (#7)"]);
  const sha = execFileSync("git", ["-C", repo, "rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
  const sessionDir = mkdtempSync(join(tmpdir(), "lane-end-session-"));
  const r = spawnSync("node", [scriptPath, "--session-dir", sessionDir, "--vault", vault, "--id", "TP-1", "--text", "| TP-1 | landed |",
    "--backlog", "projects/p/p-backlog.md", "--backlog-row", "TP-1", "--status", `done (#7 ${sha})`, "--drift-repo", repo, ...extra], { encoding: "utf8" });
  return { vault, r, sha };
}

test("lane-end flips the backlog row to done in the lane's own commit, then fails on remaining drift", () => {
  const { vault, r, sha } = laneEndWithBacklog([]);
  const text = readFileSync(join(vault, "projects", "p", "p-backlog.md"), "utf8");
  assert.match(text, new RegExp(`\\| TP-1 \\| thing \\| d \\| done \\(#7 ${sha}\\) \\|`));
  assert.ok(text.indexOf("| TP-1 | thing") > text.indexOf("## Done"), "row moved under Done");
  const files = execFileSync("git", ["-C", vault, "show", "--name-only", "--format=", "HEAD"], { encoding: "utf8" });
  assert.match(files, /p-queue\.md/);
  assert.match(files, /p-backlog\.md/);
  assert.equal(r.status, 1, "row 2 still in flight on a merged PR: drift fails the exit");
  assert.match(r.stderr + r.stdout, /drift projects\/p\/p-backlog\.md row TP-2/);
});

test("lane-end refuses a status outside the fixed set before writing anything", () => {
  const vault = makeVaultWithQueue();
  mkdirSync(join(vault, "projects", "p"), { recursive: true });
  writeFileSync(join(vault, "projects", "p", "p-backlog.md"), BACKLOG_TEXT);
  const r = spawnSync("node", [scriptPath, "--session-dir", tmpdir(), "--vault", vault, "--id", "TP-1", "--text", "| TP-1 | x |",
    "--backlog", "projects/p/p-backlog.md", "--backlog-row", "TP-1", "--status", "DONE yesterday"], { encoding: "utf8" });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /outside the fixed set/);
  assert.match(readFileSync(join(vault, "projects", "p", "p-queue.md"), "utf8"), /TP-1 \| old row/);
});

test("N3: --backlog alone, or --backlog-row with --backlog-add, is refused before any write", () => {
  for (const extra of [["--backlog", "projects/p/p-backlog.md"], ["--backlog", "projects/p/p-backlog.md", "--backlog-row", "TP-1", "--backlog-add", "x", "--status", "open"]]) {
    const vault = makeVaultWithQueue();
    mkdirSync(join(vault, "projects", "p"), { recursive: true });
    writeFileSync(join(vault, "projects", "p", "p-backlog.md"), BACKLOG_TEXT);
    const r = spawnSync("node", [scriptPath, "--session-dir", tmpdir(), "--vault", vault, "--id", "TP-1", "--text", "| TP-1 | x |", ...extra], { encoding: "utf8" });
    assert.equal(r.status, 1, extra.join(" "));
    assert.match(r.stderr, /--backlog/);
    assert.match(readFileSync(join(vault, "projects", "p", "p-queue.md"), "utf8"), /TP-1 \| old row/);
  }
});

// --- --pr reads the gate-run tail, not just GitHub checks (no-paid-github) ---

function runLaneEndPr(prJson) {
  const vault = makeVaultWithQueue();
  const binDir = mkdtempSync(join(tmpdir(), "lane-end-prbin-"));
  writeFileSync(join(binDir, "gh"), `#!/usr/bin/env bash\necho '${prJson}'\n`);
  chmodSync(join(binDir, "gh"), 0o755);
  const sessionDir = mkdtempSync(join(tmpdir(), "lane-end-session-"));
  try {
    return spawnSync("node", [scriptPath, "--session-dir", sessionDir, "--vault", vault, "--id", "TP-1", "--text", "| TP-1 | new row |", "--pr", "owner/repo#9"], { encoding: "utf8", env: { ...process.env, PATH: `${binDir}:${process.env.PATH}` } });
  } finally {
    rmSync(vault, { recursive: true, force: true });
    rmSync(binDir, { recursive: true, force: true });
    rmSync(sessionDir, { recursive: true, force: true });
  }
}
const H = "c".repeat(40);
const body = (v, sha = H) => `<!-- gate-run-tail -->\\ngate-run: ${v} sha=${sha} exit=${v === "PASS" ? 0 : 1} cmd=t`;

test("--pr: an empty GitHub rollup is not red when the PR records a passing gate-run tail", () => {
  const r = runLaneEndPr(`{"statusCheckRollup":[],"mergeable":"MERGEABLE","headRefOid":"${H}","comments":[{"author":{"login":"owner"},"body":"${body("PASS")}"}]}`);
  assert.doesNotMatch(r.stderr, /pr gate/);
  assert.match(r.stdout, /gate-run tail PASS/);
});

test("--pr: a PASS tail from a stranger does not count (review r1 A1)", () => {
  const r = runLaneEndPr(`{"statusCheckRollup":[],"mergeable":"MERGEABLE","headRefOid":"${H}","comments":[{"author":{"login":"rando"},"body":"${body("PASS")}"}]}`);
  assert.match(r.stderr + r.stdout, /pr gate.*gate-run/s);
  assert.match(r.stdout, /gate-run tail absent/);
});

test("--pr: a failed GitHub check is not red when the PR records a passing gate-run tail", () => {
  const r = runLaneEndPr(`{"statusCheckRollup":[{"conclusion":"FAILURE"}],"mergeable":"MERGEABLE","headRefOid":"${H}","comments":[{"author":{"login":"owner"},"body":"${body("PASS")}"}]}`);
  assert.doesNotMatch(r.stderr, /pr gate/);
});

test("--pr: no tail and no checks is red, naming the gate-run lane", () => {
  const r = runLaneEndPr(`{"statusCheckRollup":[],"mergeable":"MERGEABLE","headRefOid":"${H}","comments":[]}`);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr + r.stdout, /pr gate.*gate-run/s);
});

// --- Backlog 166: the CLI refuses every unkeyed or cross-project write ---

test("CLI refuses --row/--section, a bare --id, an unknown prefix, and writes nothing", () => {
  const vault = makeVaultWithQueue();
  const before = readFileSync(join(vault, "projects", "p", "p-queue.md"), "utf8");
  const run = (...a) => spawnSync("node", [scriptPath, "--session-dir", tmpdir(), "--vault", vault, ...a], { encoding: "utf8" });
  const legacy = run("--row", "1", "--section", "Discipline", "--text", "1. x");
  assert.equal(legacy.status, 1); assert.match(legacy.stderr, /--id <PREFIX-n>/);
  const bare = run("--id", "1", "--text", "| 1 | x |");
  assert.equal(bare.status, 1); assert.match(bare.stderr, /bare numbers are refused/);
  const unknown = run("--id", "ZZ-1", "--text", "| ZZ-1 | x |");
  assert.equal(unknown.status, 1); assert.match(unknown.stderr, /no project queue declares prefix ZZ/);
  assert.equal(readFileSync(join(vault, "projects", "p", "p-queue.md"), "utf8"), before);
});

test("CLI: text carrying another project's ID, or another project's backlog, is refused with no write", () => {
  const vault = makeVaultWithQueue();
  writeFileSync(join(vault, "projects", "p", "p-backlog.md"), BACKLOG_TEXT);
  writeFileSync(join(vault, "projects", "q", "q-backlog.md"), BACKLOG_TEXT.replace(/TP/g, "TQ"));
  const before = [["p", "p-queue.md"], ["q", "q-queue.md"], ["p", "p-backlog.md"], ["q", "q-backlog.md"]].map(([d, f]) => readFileSync(join(vault, "projects", d, f), "utf8"));
  const run = (...a) => spawnSync("node", [scriptPath, "--session-dir", tmpdir(), "--vault", vault, ...a], { encoding: "utf8" });
  const wrongText = run("--id", "TP-1", "--text", "| TQ-1 | landed on the wrong project |");
  assert.equal(wrongText.status, 1); assert.match(wrongText.stderr, /not TP-1/);
  const wrongBacklog = run("--id", "TP-1", "--text", "| TP-1 | x |", "--backlog", "projects/q/q-backlog.md", "--backlog-row", "TQ-1", "--status", "open");
  assert.equal(wrongBacklog.status, 1); assert.match(wrongBacklog.stderr, /not TP's backlog/);
  const wrongRow = run("--id", "TP-1", "--text", "| TP-1 | x |", "--backlog", "projects/p/p-backlog.md", "--backlog-row", "TQ-1", "--status", "open");
  assert.equal(wrongRow.status, 1); assert.match(wrongRow.stderr, /must be a TP-<n> ID/);
  const bareRow = run("--id", "TP-1", "--text", "| TP-1 | x |", "--backlog", "projects/p/p-backlog.md", "--backlog-row", "1", "--status", "open");
  assert.equal(bareRow.status, 1);
  const after = [["p", "p-queue.md"], ["q", "q-queue.md"], ["p", "p-backlog.md"], ["q", "q-backlog.md"]].map(([d, f]) => readFileSync(join(vault, "projects", d, f), "utf8"));
  assert.deepEqual(after, before);
});

// --- review ambers A1: a multi-line --text is refused; a post-write lint failure restores the bytes ---

test("replaceRowById refuses replacement text containing a newline", () => {
  const r = replaceRowById(PF_QUEUE, "PF-8", "| PF-8 | new |\n| PF-9 | smuggled |");
  assert.equal(r.ok, false);
  assert.match(r.reason, /newline/);
});

test("lane-end restores the queue's pre-write bytes when the post-write lint fails", () => {
  const vault = makeVaultWithQueue();
  const qpath = join(vault, "projects", "p", "p-queue.md");
  const bad = "---\nname: p-queue\nkind: queue\nprefix: TP\n---\n| # | Needed |\n| - | - |\n| TP-1 | old row |\n| TP-2 | dup |\n| TP-2 | dup again |\n";
  writeFileSync(qpath, bad);
  const r = spawnSync("node", [scriptPath, "--session-dir", tmpdir(), "--vault", vault, "--id", "TP-1", "--text", "| TP-1 | new |"], { encoding: "utf8" });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /lint failed after write; files restored/);
  assert.equal(readFileSync(qpath, "utf8"), bad);
  rmSync(vault, { recursive: true, force: true });
});
