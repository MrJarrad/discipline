#!/usr/bin/env node
/* lane-end — one deterministic parent call per lane-completion notification,
   replacing four or five hand-run Bash turns (`spend-levers` rule 5,
   2026-09-22 addendum: the orchestrator "avoids mechanical grunt work").

   It: (1) runs `lane-sweep.mjs --session-dir <dir>`; (2) replaces queue row
   `--row <n>` in the operator's own section of `--vault <root>`'s
   `orchestrator/operator-queue.md` with `--text <full replacement row text>`,
   refusing if the row is absent or the replace would touch another section;
   (3) greps the write back with `queue-write-check.mjs`; (4) `git add`s only
   the queue file plus `--evidence <dir>` (if given), commits naming the row,
   and pushes; (5) if `--pr <owner/repo#n>` is given, prints the PR's
   `statusCheckRollup` conclusions and `mergeable`.

   Exit non-zero on any refusal, printing what it did not do — never a
   silent partial run. Pure logic (row lookup/replace, section fencing) is
   exported so the tests drive it without touching disk, git or gh; the CLI
   `main()` wires it to the real filesystem/process calls.

   Usage:
     node lane-end.mjs --session-dir <path> --vault <root> --row <n>
       --text "<full replacement row text>" [--evidence <dir>] [--pr <owner/repo#n>]
*/
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    out[key] = next && !next.startsWith("--") ? next : true;
    if (out[key] !== true) i++;
  }
  return out;
}

/* A queue file is sectioned by `## <project>` headings, each operator's own
   section owning its numbered rows (`## Row N` or a leading `N.`/`N)` line).
   Returns { section, lineIndex } for the row, or null if not found — the
   caller refuses rather than guessing which section a numberless row is in. */
export function findRow(queueText, rowNumber) {
  const lines = queueText.split("\n");
  let section = null;
  const rowRe = new RegExp(`^\\s*(?:-\\s*)?\\[?\\s*(?:Row\\s*)?${rowNumber}[.)\\]]`, "i");
  for (let i = 0; i < lines.length; i++) {
    const headingMatch = /^##\s+(.+)$/.exec(lines[i]);
    if (headingMatch) {
      section = headingMatch[1].trim();
      continue;
    }
    if (rowRe.test(lines[i])) {
      return { section, lineIndex: i };
    }
  }
  return null;
}

/* Returns { ok: true, text } with row `rowNumber`'s line replaced by
   `newRowText`, or { ok: false, reason } — refuses when the row is absent,
   or when `expectSection` is given and does not match the row's own
   section (never lets one row's edit spill into another section). */
export function replaceRow(queueText, rowNumber, newRowText, expectSection) {
  const found = findRow(queueText, rowNumber);
  if (!found) {
    return { ok: false, reason: `row ${rowNumber} not found in the queue file` };
  }
  if (expectSection && found.section !== expectSection) {
    return {
      ok: false,
      reason: `row ${rowNumber} is in section "${found.section}", not "${expectSection}" — refusing to edit another section`,
    };
  }
  const lines = queueText.split("\n");
  lines[found.lineIndex] = newRowText;
  return { ok: true, text: lines.join("\n"), section: found.section };
}

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: "utf8", ...opts });
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const missing = ["session-dir", "vault", "row", "text"].filter((k) => !args[k]);
  if (missing.length) {
    console.error(`lane-end: missing required args: ${missing.join(", ")}`);
    process.exit(1);
  }

  const scriptDir = new URL(".", import.meta.url).pathname;
  const failures = [];

  // 1. Sweep.
  try {
    console.log(run("node", [join(scriptDir, "lane-sweep.mjs"), "--session-dir", args["session-dir"]]));
  } catch (err) {
    failures.push(`sweep: ${err.message}`);
  }

  // 2. Replace queue row.
  const queuePath = join(args.vault, "orchestrator", "operator-queue.md");
  let queueText;
  try {
    queueText = readFileSync(queuePath, "utf8");
  } catch (err) {
    console.error(`lane-end: cannot read ${queuePath}: ${err.message}`);
    process.exit(1);
  }
  const replaced = replaceRow(queueText, args.row, args.text, args.section || null);
  if (!replaced.ok) {
    console.error(`lane-end: did not replace the queue row — ${replaced.reason}`);
    process.exit(1);
  }
  writeFileSync(queuePath, replaced.text, "utf8");

  // 3. Grep the write back.
  try {
    run("node", [join(scriptDir, "queue-write-check.mjs"), queuePath, args.text]);
  } catch (err) {
    console.error(`lane-end: queue-write-check failed after write — ${err.message}`);
    process.exit(1);
  }

  // 4. Commit + push (queue file + evidence dir only, never a broad add).
  try {
    const addPaths = [queuePath];
    if (args.evidence) addPaths.push(args.evidence);
    run("git", ["add", ...addPaths], { cwd: args.vault });
    run("git", ["commit", "-m", `queue: row ${args.row} landed`], { cwd: args.vault });
    run("git", ["push"], { cwd: args.vault });
  } catch (err) {
    failures.push(`commit/push: ${err.message}`);
  }

  // 5. PR status, if named.
  if (args.pr) {
    try {
      const [repo, num] = String(args.pr).split("#");
      const out = run("gh", ["pr", "view", num, "--repo", repo, "--json", "statusCheckRollup,mergeable"]);
      console.log(out);
    } catch (err) {
      failures.push(`pr status: ${err.message}`);
    }
  }

  if (failures.length) {
    console.error(`lane-end: did not complete everything:\n${failures.map((f) => `  - ${f}`).join("\n")}`);
    process.exit(1);
  }
  process.exit(0);
}

if (process.argv[1] && process.argv[1].endsWith("lane-end.mjs")) main();
