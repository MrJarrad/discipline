// ds-regen — the design-system regen lane (`scripts-not-agents`, 2026-09-22,
// the #68 commit shape). Pure-logic tests plus one full run against a
// scratch git repo (as the DS repo) with a fake export dir and a stubbed
// `pnpm`/`gh` on PATH — never a real remote, never a real network call.
// Run: node --test hooks/scripts/ds-regen.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, nextVersionDir, parseChangesBlock } from "./ds-regen.mjs";

const scriptPath = fileURLToPath(new URL("./ds-regen.mjs", import.meta.url));

test("parseArgs reads --export, --repo, --dry-run", () => {
  const args = parseArgs(["--export", "/e", "--repo", "/r", "--dry-run"]);
  assert.equal(args.export, "/e");
  assert.equal(args.repo, "/r");
  assert.equal(args.dryRun, true);
});

test("nextVersionDir starts at v1 when the handoff dir is empty", () => {
  assert.equal(nextVersionDir([], "2026-09-22"), "v1-2026-09-22");
});

test("nextVersionDir increments past the highest existing v<N>", () => {
  assert.equal(nextVersionDir(["v67-2026-08-01", "v68-2026-09-01", "latest"], "2026-09-22"), "v69-2026-09-22");
});

test("nextVersionDir ignores non-v-prefixed entries (latest, README)", () => {
  assert.equal(nextVersionDir(["latest", "README.md", "v3-2026-01-01"], "2026-09-22"), "v4-2026-09-22");
});

test("parseChangesBlock extracts a ## Changes heading through the next heading", () => {
  const text = "# Export\n\n## Changes\n- token A renamed\n- VALUE-DRIFT: spacing-4 changed\n\n## Other\nnothing";
  const { block, valueDriftCount } = parseChangesBlock(text);
  assert.match(block, /token A renamed/);
  assert.doesNotMatch(block, /Other/);
  assert.equal(valueDriftCount, 1);
});

test("parseChangesBlock counts multiple VALUE-DRIFT lines", () => {
  const text = "## Changes\nVALUE-DRIFT: a\nVALUE-DRIFT: b\nVALUE-DRIFT: c\n";
  assert.equal(parseChangesBlock(text).valueDriftCount, 3);
});

test("parseChangesBlock returns an empty block and zero count when no Changes heading exists", () => {
  const { block, valueDriftCount } = parseChangesBlock("# Export\nnothing to see\n");
  assert.equal(block, "");
  assert.equal(valueDriftCount, 0);
});

// --- full run: scratch DS repo, fake export dir, stubbed pnpm/gh ------------

function makeScratchDsRepo() {
  const remoteDir = mkdtempSync(join(tmpdir(), "ds-regen-remote-"));
  execFileSync("git", ["init", "-q", "--bare", remoteDir]);
  const dir = mkdtempSync(join(tmpdir(), "ds-regen-repo-"));
  execFileSync("git", ["clone", "-q", remoteDir, dir]);
  execFileSync("git", ["-C", dir, "config", "user.email", "test@example.com"]);
  execFileSync("git", ["-C", dir, "config", "user.name", "test"]);
  execFileSync("git", ["-C", dir, "checkout", "-q", "-b", "main"]);
  writeFileSync(join(dir, "package.json"), "{}\n");
  execFileSync("git", ["-C", dir, "add", "."]);
  execFileSync("git", ["-C", dir, "commit", "-q", "-m", "init"]);
  execFileSync("git", ["-C", dir, "push", "-u", "origin", "main"]);
  return dir;
}

function makeFakeExportDir() {
  const dir = mkdtempSync(join(tmpdir(), "ds-regen-export-"));
  writeFileSync(
    join(dir, "design-handoff.md"),
    "# Export\n\n## Changes\n- spacing-4: 8px -> 10px\n- VALUE-DRIFT: spacing-4 changed\n",
  );
  writeFileSync(join(dir, "tokens.json"), "{}\n");
  return dir;
}

function makeFakeBin(binDir) {
  const pnpmPath = join(binDir, "pnpm");
  writeFileSync(pnpmPath, "#!/usr/bin/env bash\necho \"fake pnpm: $*\"\nexit 0\n");
  chmodSync(pnpmPath, 0o755);
  const ghPath = join(binDir, "gh");
  writeFileSync(ghPath, "#!/usr/bin/env bash\necho 'https://github.com/example/ds/pull/2'\nexit 0\n");
  chmodSync(ghPath, 0o755);
}

test("--dry-run prints the vendor target and step sequence, touching nothing", () => {
  const repo = makeScratchDsRepo();
  const exportDir = makeFakeExportDir();
  try {
    const out = execFileSync("node", [scriptPath, "--export", exportDir, "--repo", repo, "--dry-run"], {
      encoding: "utf8",
    });
    assert.match(out, /would vendor/);
    assert.match(out, /v1-\d{4}-\d{2}-\d{2}/);
    assert.match(out, /would run: pnpm run tokens/);
    assert.equal(existsSync(join(repo, "design", "handoff")), false, "dry-run must not create design/handoff");
  } finally {
    rmSync(repo, { recursive: true, force: true });
    rmSync(exportDir, { recursive: true, force: true });
  }
});

test("full run vendors the export, repoints latest, runs the four pnpm steps, prints changes + VALUE-DRIFT count, and commits/pushes/PRs", () => {
  const repo = makeScratchDsRepo();
  const exportDir = makeFakeExportDir();
  const binDir = mkdtempSync(join(tmpdir(), "ds-regen-bin-"));
  makeFakeBin(binDir);
  try {
    const out = execFileSync("node", [scriptPath, "--export", exportDir, "--repo", repo], {
      encoding: "utf8",
      env: { ...process.env, PATH: `${binDir}:${process.env.PATH}` },
    });
    assert.match(out, /spacing-4: 8px -> 10px/);
    assert.match(out, /VALUE-DRIFT count: 1/);
    assert.match(out, /https:\/\/github\.com\/example\/ds\/pull\/2/);

    const handoffDir = join(repo, "design", "handoff");
    const versionDirs = execFileSync("ls", [handoffDir], { encoding: "utf8" }).trim().split("\n");
    assert.ok(versionDirs.some((d) => /^v1-/.test(d)));

    const latestPath = join(handoffDir, "latest");
    assert.equal(lstatSync(latestPath).isSymbolicLink(), true);
    const target = readlinkSync(latestPath);
    assert.match(target, /^v1-/);

    const log = execFileSync("git", ["-C", repo, "log", "-1", "--format=%s"], { encoding: "utf8" });
    assert.match(log, /design: regen tokens \(v1-/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
    rmSync(exportDir, { recursive: true, force: true });
    rmSync(binDir, { recursive: true, force: true });
  }
});
