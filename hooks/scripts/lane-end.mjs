#!/usr/bin/env node
/* lane-end — one deterministic parent call per lane-completion notification,
   replacing four or five hand-run Bash turns (`spend-levers` rule 5,
   2026-09-22 addendum: the orchestrator "avoids mechanical grunt work").

   It: (1) runs `lane-sweep.mjs --session-dir <dir>`; (2) replaces queue row
   `--row <n>` INSIDE `--section <name>` (required — no whole-file fallback)
   of `--vault <root>`'s `orchestrator/operator-queue.md` with
   `--text <full replacement row text>`, refusing if the section is missing
   or the row is absent from that section's own line range; a same-numbered
   row in another section is never touched, in either direction (round 2
   fix, 2026-09-22: an unscoped whole-file search either falsely refused a
   real row or silently overwrote another project's same-numbered row);
   (3) greps the write back with `queue-write-check.mjs`; (4) `git add`s only
   the queue file plus `--evidence <dir>` (if given), commits naming the row,
   and pushes; (5) if `--pr <owner/repo#n>` is given, prints the PR's
   `statusCheckRollup` conclusions and `mergeable`.

   `--dry-run` prints the replacement and the commit message it would make —
   no write, no commit, no push, no sweep, no PR call.

   Exit non-zero on any refusal, printing what it did not do — never a
   silent partial run. Pure logic (section range, row lookup/replace) is
   exported so the tests drive it without touching disk, git or gh; the CLI
   `main()` wires it to the real filesystem/process calls.

   Usage:
     node lane-end.mjs --session-dir <path> --vault <root> --row <n>
       --section <name> --text "<full replacement row text>"
       [--evidence <dir>] [--pr <owner/repo#n>] [--dry-run]
       [--then-merge <owner/repo#n> --repo <path> [--then-build]]
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
   Returns { start, end } line indices (end exclusive) spanning `section`'s
   own body — from its heading's next line to the next `## ` heading or EOF —
   or null when the section does not exist. Two sections can carry the same
   row number (e.g. both a "Portfolio" and a "Discipline" row 9); a caller
   that searches the whole file first-match can silently pick the wrong one,
   so every lookup is scoped to one section's line range, never the file
   (round 2 fix, 2026-09-22: row 9 in two sections). */
export function sectionRange(queueText, section) {
  const lines = queueText.split("\n");
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    const headingMatch = /^##\s+(.+)$/.exec(lines[i]);
    if (headingMatch && headingMatch[1].trim() === section) {
      start = i + 1;
      continue;
    }
    if (start !== -1 && headingMatch) {
      return { start, end: i };
    }
  }
  return start === -1 ? null : { start, end: lines.length };
}

/* Returns { lineIndex } for `rowNumber`'s line INSIDE `section` only, or
   null if the section does not exist or the row is not found within it —
   never a whole-file search, so a same-numbered row in another section is
   invisible to this lookup. */
export function findRow(queueText, rowNumber, section) {
  const range = sectionRange(queueText, section);
  if (!range) return null;
  const lines = queueText.split("\n");
  const rowRe = new RegExp(`^\\s*(?:-\\s*)?\\[?\\s*(?:Row\\s*)?${rowNumber}[.)\\]]`, "i");
  for (let i = range.start; i < range.end; i++) {
    if (rowRe.test(lines[i])) return { lineIndex: i };
  }
  return null;
}

/* Returns { ok: true, text } with row `rowNumber`'s line, found and
   replaced ONLY within `section`'s own line range, replaced by
   `newRowText`; or { ok: false, reason } — refuses when `section` is
   missing, when the row is absent from that section, and never writes a
   line outside the section's range. `section` is required — there is no
   whole-file fallback. */
export function replaceRow(queueText, rowNumber, newRowText, section) {
  if (!section) {
    return { ok: false, reason: "a --section is required — no whole-file fallback" };
  }
  const range = sectionRange(queueText, section);
  if (!range) {
    return { ok: false, reason: `section "${section}" not found in the queue file` };
  }
  const found = findRow(queueText, rowNumber, section);
  if (!found) {
    return { ok: false, reason: `row ${rowNumber} not found in section "${section}"` };
  }
  const lines = queueText.split("\n");
  lines[found.lineIndex] = newRowText;
  return { ok: true, text: lines.join("\n"), section };
}

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: "utf8", ...opts });
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const missing = ["session-dir", "vault", "row", "text", "section"].filter((k) => !args[k]);
  if (missing.length) {
    console.error(`lane-end: missing required args: ${missing.join(", ")}`);
    process.exit(1);
  }
  const dryRun = args["dry-run"] === true;

  const scriptDir = new URL(".", import.meta.url).pathname;
  const failures = [];

  // 1. Sweep.
  if (dryRun) {
    console.log(`[dry-run] would run: node ${join(scriptDir, "lane-sweep.mjs")} --session-dir ${args["session-dir"]}`);
  } else {
    try {
      console.log(run("node", [join(scriptDir, "lane-sweep.mjs"), "--session-dir", args["session-dir"]]));
    } catch (err) {
      failures.push(`sweep: ${err.message}`);
    }
  }

  // 2. Replace queue row (scoped to --section — see replaceRow).
  const queuePath = join(args.vault, "orchestrator", "operator-queue.md");
  let queueText;
  try {
    queueText = readFileSync(queuePath, "utf8");
  } catch (err) {
    console.error(`lane-end: cannot read ${queuePath}: ${err.message}`);
    process.exit(1);
  }
  const replaced = replaceRow(queueText, args.row, args.text, args.section);
  if (!replaced.ok) {
    console.error(`lane-end: did not replace the queue row — ${replaced.reason}`);
    process.exit(1);
  }

  if (dryRun) {
    console.log(`[dry-run] would replace row ${args.row} in section "${args.section}" with:\n  ${args.text}`);
    console.log(`[dry-run] would commit: queue: row ${args.row} landed`);
    process.exit(0);
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

  // 6. `--then-merge <owner/repo#n> --repo <path>` calls script 4
  // (merge-after-review.mjs), optionally followed by script 1
  // (release-build.mjs) when `--then-build` also rides (`scripts-not-agents`
  // Boundaries, 2026-09-22: "lane-end.mjs may call 4 then 1 via flags").
  if (args["then-merge"]) {
    if (!args.repo) {
      failures.push("then-merge: --repo is required alongside --then-merge");
    } else {
      try {
        const mergeArgs = [
          join(scriptDir, "merge-after-review.mjs"),
          "--pr",
          args["then-merge"],
          "--repo",
          args.repo,
        ];
        if (args["then-build"]) mergeArgs.push("--then-build");
        console.log(run("node", mergeArgs));
      } catch (err) {
        failures.push(`then-merge: ${err.message}`);
      }
    }
  }

  if (failures.length) {
    console.error(`lane-end: did not complete everything:\n${failures.map((f) => `  - ${f}`).join("\n")}`);
    process.exit(1);
  }
  process.exit(0);
}

if (process.argv[1] && process.argv[1].endsWith("lane-end.mjs")) main();
