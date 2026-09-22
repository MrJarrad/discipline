#!/usr/bin/env node
/* ds-regen — replaces the design-system regen lane (`scripts-not-agents`,
   2026-09-22, the #68 commit shape). Unzips a design-handoff export (or
   copies an already-unzipped dir), vendors it under
   `design/handoff/v<N>-<date>/` with canonical names, repoints `latest`,
   runs the DS repo's `pnpm run tokens` + `tokens:check` + `test` +
   `typecheck`, commits in the #68 shape, pushes, opens a PR; prints the
   export's `changes` block plus a VALUE-DRIFT count. The parent still reads
   the printed change block — this script never rules on a value drift, it
   only surfaces the count.

   Pure logic exported: `nextVersionDir()` (v<N> numbering from the existing
   `design/handoff/` entries), `parseChangesBlock()` (extracts the export's
   own `## Changes`-shaped block and counts `VALUE-DRIFT` lines).

   Usage:
     node ds-regen.mjs --export <zip|dir> --repo <DS path> [--dry-run]
   Exit 0 vendored/regenerated/PR'd (or a clean --dry-run print) · 1 any
   step failed, naming which.                                              */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, symlinkSync, unlinkSync } from "node:fs";
import { join } from "node:path";

export function parseArgs(argv) {
  const out = { dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") out.dryRun = true;
    else if (a === "--export") out.export = argv[++i];
    else if (a === "--repo") out.repo = argv[++i];
  }
  return out;
}

/* Next `v<N>-<date>` dir name given the existing entries under
   `design/handoff/` (each named `v<N>-...`) — N is one past the highest
   existing N, or 1 when the directory is empty/absent. `date` is
   YYYY-MM-DD, injected so the function stays pure (no `Date.now()` call
   buried in git logic). */
export function nextVersionDir(existingEntries, date) {
  const nums = existingEntries
    .map((e) => /^v(\d+)-/.exec(e))
    .filter(Boolean)
    .map((m) => Number(m[1]));
  const next = nums.length ? Math.max(...nums) + 1 : 1;
  return `v${next}-${date}`;
}

/* An export's `changes` block is a `## Changes` (or `# Changes`) heading
   through the next heading of equal-or-higher level, or end of file.
   Returns { block, valueDriftCount } — `block` is the raw text (or "" if
   absent), `valueDriftCount` the number of lines containing `VALUE-DRIFT`. */
export function parseChangesBlock(exportText) {
  const headingMatch = /^(#{1,2})\s*Changes\s*$/m.exec(exportText);
  if (!headingMatch) return { block: "", valueDriftCount: 0 };
  const level = headingMatch[1].length;
  const start = headingMatch.index;
  const rest = exportText.slice(start + headingMatch[0].length);
  const nextHeadingRe = new RegExp(`^#{1,${level}}\\s+\\S`, "m");
  const nextMatch = nextHeadingRe.exec(rest);
  const block = nextMatch ? rest.slice(0, nextMatch.index) : rest;
  const valueDriftCount = (block.match(/VALUE-DRIFT/g) || []).length;
  return { block: block.trim(), valueDriftCount };
}

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: "utf8", ...opts });
}

function vendorExport(exportPath, repo, dryRun) {
  const handoffDir = join(repo, "design", "handoff");
  const existing = existsSync(handoffDir) ? readdirSync(handoffDir) : [];
  const versionDir = nextVersionDir(existing, new Date().toISOString().slice(0, 10));
  const targetDir = join(handoffDir, versionDir);
  const latestLink = join(handoffDir, "latest");

  if (dryRun) {
    return { targetDir, latestLink, versionDir };
  }

  mkdirSync(targetDir, { recursive: true });
  if (exportPath.endsWith(".zip")) {
    run("unzip", ["-q", exportPath, "-d", targetDir]);
  } else {
    cpSync(exportPath, targetDir, { recursive: true });
  }
  if (existsSync(latestLink)) unlinkSync(latestLink);
  symlinkSync(versionDir, latestLink);
  return { targetDir, latestLink, versionDir };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.export || !args.repo) {
    console.error("Usage: node ds-regen.mjs --export <zip|dir> --repo <DS path> [--dry-run]");
    process.exit(1);
  }

  const steps = ["pnpm run tokens", "pnpm run tokens:check", "pnpm test", "pnpm typecheck"];

  if (args.dryRun) {
    const { targetDir, latestLink, versionDir } = vendorExport(args.export, args.repo, true);
    console.log(`ds-regen --dry-run: would vendor ${args.export} -> ${targetDir}`);
    console.log(`  repoint ${latestLink} -> ${versionDir}`);
    for (const s of steps) console.log(`  would run: ${s} (cwd=${args.repo})`);
    console.log(`  would commit "design: regen tokens (${versionDir})", push, open PR`);
    process.exit(0);
  }

  let vendored;
  try {
    vendored = vendorExport(args.export, args.repo, false);
  } catch (err) {
    console.error(`ds-regen: did not vendor the export — ${err.message}`);
    process.exit(1);
  }

  for (const s of steps) {
    const [cmd, ...cmdArgs] = s.split(" ");
    try {
      run(cmd, cmdArgs, { cwd: args.repo });
    } catch (err) {
      console.error(`ds-regen: did not complete "${s}" — ${err.message}`);
      process.exit(1);
    }
  }

  let changesText = "";
  try {
    changesText = readExportText(args.export);
  } catch {
    // Export without a readable changes block (e.g. a binary-only zip we
    // already unzipped) — not a failure, just nothing to print.
  }
  const { block, valueDriftCount } = parseChangesBlock(changesText);
  if (block) console.log(`changes:\n${block}`);
  console.log(`VALUE-DRIFT count: ${valueDriftCount}`);

  try {
    run("git", ["-C", args.repo, "add", "design/handoff"]);
    run("git", ["-C", args.repo, "commit", "-m", `design: regen tokens (${vendored.versionDir})`]);
    run("git", ["-C", args.repo, "push"]);
    const prOut = run("gh", ["pr", "create", "--repo", args.repo, "--title", `design: regen tokens (${vendored.versionDir})`, "--body", block || "Automated DS regen."]);
    console.log(prOut.trim());
  } catch (err) {
    console.error(`ds-regen: did not commit/push/PR — ${err.message}`);
    process.exit(1);
  }
  process.exit(0);
}

function readExportText(exportPath) {
  if (existsSync(exportPath) && !exportPath.endsWith(".zip")) {
    const entries = readdirSync(exportPath);
    const md = entries.find((e) => e.endsWith(".md"));
    if (md) return readFileSync(join(exportPath, md), "utf8");
  }
  return "";
}

if (process.argv[1] && process.argv[1].endsWith("ds-regen.mjs")) main();
