#!/usr/bin/env node
/* lane-end — one deterministic parent call per lane-completion notification,
   replacing four or five hand-run Bash turns (`spend-levers` rule 5,
   2026-09-22 addendum: the orchestrator "avoids mechanical grunt work").

   It: (1) runs `lane-sweep.mjs --session-dir <dir>`; (2) replaces queue row
   `--id <PREFIX-n>` (e.g. PF-279; a bare number is refused) in that project's own
   `projects/<p>/<p>-queue.md`, found from the prefix declared in its frontmatter,
   with `--text <full replacement row text>`, which must itself start with the same
   ID. A same-numbered row in another project is in another file and is never
   reachable (backlog 166, 2026-10-12: bare numbers repeated across projects and a
   write keyed to one landed on another's row); the backlog flip must be that same
   project's backlog and `--backlog-row` the same prefix;
   (3) greps the write back with `queue-write-check.mjs`; (4) `git add`s only
   the queue file plus `--evidence <dir>` (if given), commits naming the row,
   and pushes; (5) if `--pr <owner/repo#n>` is given, prints the PR's
   gate verdict: the gate-run tail on the head sha, else the check rollup, plus
   `mergeable` (a missing or failed GitHub check is not red under a passing tail).

   Lists never stale (ruling `lists-never-stale`, 2026-10-08): `--backlog <file in
   vault> --backlog-row <PREFIX-n> --status "<status>"` flips that backlog row (status
   must be in the fixed set; done/moot moves it under ## Done) in the SAME commit
   as the queue row; `--backlog-add "<item>"` adds a new open row for a new
   finding. After the commit and push, `list-drift-check.mjs` runs over the whole
   vault (`--drift-repo <path>[,<path>]` supplies git history for PR lookups) and
   a finding fails the exit code — never before the flip and evidence are
   committed, so drift cannot lose the lane's own record.

   `--dry-run` prints the replacement and the commit message it would make —
   no write, no commit, no push, no sweep, no PR call.

   Exit non-zero on any refusal, printing what it did not do — never a
   silent partial run. Pure logic (section range, row lookup/replace) is
   exported so the tests drive it without touching disk, git or gh; the CLI
   `main()` wires it to the real filesystem/process calls.

   Usage:
     node lane-end.mjs --session-dir <path> --vault <root> --id <PREFIX-n>
       --text "<full replacement row text>"
       [--evidence <dir>] [--pr <owner/repo#n>] [--dry-run]
       [--then-merge <owner/repo#n> --repo <path> [--then-build]]
*/
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { canMerge, gateRunTail, trustedLogins } from "./merge-after-review.mjs";
import { addRow, crossFileDupIds, setRowStatus } from "./list-drift-check.mjs";
import { acquireVaultLock, highestUsed, remoteTexts } from "./lib/row-alloc.mjs";
import { isStruckRow } from "./queue-write-check.mjs";
import { discoverFiles, parseId, tableRows } from "./lib/queue-ids.mjs";

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
  // `--vault`/`--repo` are filesystem roots other calls (git -C, cwd) depend
  // on — resolve to absolute here so a relative arg never depends on the
  // caller's cwd downstream.
  if (typeof out.vault === "string") out.vault = resolve(out.vault);
  if (typeof out.repo === "string") out.repo = resolve(out.repo);
  return out;
}

/* The queue row `id` (`PF-279`) in ONE project's queue text. A row is found by
   its full prefixed ID only: a bare number is refused, the replacement text
   must itself carry that same ID in its first cell (so a write keyed to one
   project's row can never put another project's row in its place), exactly one
   line may match, and a struck row is never overwritten. The caller resolves
   the file from the ID's prefix (see lib/queue-ids.mjs), so a row in another
   project's file is not even reachable from here. */
export function replaceRowById(queueText, id, newRowText) {
  if (!parseId(id)) {
    return { ok: false, reason: `"${id}" is not a project-prefixed row ID (like PF-279); bare numbers collide across projects and are refused` };
  }
  if (/[\r\n]/.test(String(newRowText))) {
    return { ok: false, reason: "the replacement text contains a newline; a row is one line, and a second line would write an unchecked row into the queue" };
  }
  const newId = tableRows(String(newRowText))[0]?.id;
  if (newId !== id) {
    return { ok: false, reason: `the replacement text starts with "${newId ?? "no row ID"}", not ${id}; a row is only ever replaced by a row with the same ID` };
  }
  const lines = queueText.split("\n");
  const hits = tableRows(queueText).filter((r) => r.id === id);
  if (!hits.length) return { ok: false, reason: `row ${id} not found in this project's queue` };
  if (hits.length > 1) return { ok: false, reason: `row ${id} appears ${hits.length} times in this queue; refusing to guess which` };
  if (isStruckRow(lines[hits[0].lineIndex])) {
    return { ok: false, reason: `row ${id} is already struck — a struck row is history and is never overwritten (use the next free number)` };
  }
  lines[hits[0].lineIndex] = newRowText;
  return { ok: true, text: lines.join("\n"), id };
}

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: "utf8", ...opts });
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.row || args.section) {
    console.error("lane-end: --row/--section are gone (bare numbers collide across projects); pass --id <PREFIX-n>, e.g. --id PF-279");
    process.exit(1);
  }
  const missing = ["session-dir", "vault", "id", "text"].filter((k) => !args[k]);
  if (missing.length) {
    console.error(`lane-end: missing required args: ${missing.join(", ")}`);
    process.exit(1);
  }
  const dryRun = args["dry-run"] === true;

  // The ID's prefix picks the project; its queue and backlog are the only files this call may touch.
  const idParts = parseId(args.id);
  if (!idParts) {
    console.error(`lane-end: --id "${args.id}" is not a project-prefixed row ID (like PF-279); bare numbers are refused`);
    process.exit(1);
  }
  const owner = discoverFiles(args.vault).byPrefix.get(idParts.prefix);
  if (!owner || !owner.queue) {
    console.error(`lane-end: no project queue declares prefix ${idParts.prefix} (frontmatter \`prefix:\` in projects/<p>/<p>-queue.md)`);
    process.exit(1);
  }

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

  // 2. Replace queue row (found by its prefixed ID in that project's own queue — see replaceRowById).
  const queuePath = join(args.vault, owner.queue);
  let queueText;
  try {
    queueText = readFileSync(queuePath, "utf8");
  } catch (err) {
    console.error(`lane-end: cannot read ${queuePath}: ${err.message}`);
    process.exit(1);
  }
  let replaced = replaceRowById(queueText, args.id, args.text);
  if (!replaced.ok) {
    console.error(`lane-end: did not replace the queue row — ${replaced.reason}`);
    process.exit(1);
  }

  // 2b. Backlog flip / add — computed before any write so a refusal writes nothing.
  let backlog = null;
  let releaseLock = () => {};
  if (args["backlog-row"] && args["backlog-add"]) {
    console.error("lane-end: --backlog-row and --backlog-add are exclusive; pass one");
    process.exit(1);
  }
  if (args.backlog && !args["backlog-row"] && !args["backlog-add"]) {
    console.error("lane-end: --backlog needs --backlog-row (with --status) or --backlog-add");
    process.exit(1);
  }
  if (args.backlog && (args["backlog-row"] || args["backlog-add"])) {
    if (!owner.backlog || String(args.backlog).replace(/^\.\//, "") !== owner.backlog) {
      console.error(`lane-end: --backlog ${args.backlog} is not ${idParts.prefix}'s backlog (${owner.backlog || "none"}); a lane writes one project's queue and backlog only`);
      process.exit(1);
    }
    if (args["backlog-row"]) {
      const bp = parseId(args["backlog-row"]);
      if (!bp || bp.prefix !== idParts.prefix) {
        console.error(`lane-end: --backlog-row ${args["backlog-row"]} must be a ${idParts.prefix}-<n> ID; bare numbers and other projects' IDs are refused`);
        process.exit(1);
      }
    }
    const bpath = join(args.vault, String(args.backlog));
    let btext;
    try { btext = readFileSync(bpath, "utf8"); } catch (err) {
      console.error(`lane-end: cannot read ${bpath}: ${err.message}`);
      process.exit(1);
    }
    let floor = 0;
    if (args["backlog-add"] && !dryRun) {
      // The number comes from the allocator: above every number in this project's queue AND
      // backlog, local and origin/main, under the vault lock held until exit (lib/row-alloc.mjs).
      // Released right after the file writes (before git); the exit hook covers early exits.
      releaseLock = acquireVaultLock(args.vault);
      process.on("exit", releaseLock);
      const rels = [owner.queue, owner.backlog].filter(Boolean);
      const remote = args.offline ? { texts: [], warnings: [] } : remoteTexts(args.vault, rels);
      for (const w of remote.warnings) console.error(`lane-end: warning — ${w}`);
      // Re-read both files under the lock: a writer that finished while we waited is seen.
      btext = readFileSync(bpath, "utf8");
      queueText = readFileSync(queuePath, "utf8");
      replaced = replaceRowById(queueText, args.id, args.text);
      if (!replaced.ok) {
        console.error(`lane-end: did not replace the queue row — ${replaced.reason}`);
        process.exit(1);
      }
      floor = highestUsed([...rels.map((r) => readFileSync(join(args.vault, r), "utf8")), ...remote.texts]);
    }
    const edit = args["backlog-add"]
      ? addRow(btext, String(args["backlog-add"]), String(args.raised || new Date().toISOString().slice(0, 10)), { floor })
      : setRowStatus(btext, args["backlog-row"], String(args.status || ""));
    if (!edit.ok) {
      console.error(`lane-end: did not edit the backlog — ${edit.reason}`);
      process.exit(1);
    }
    backlog = { path: bpath, text: edit.text, before: btext };
  } else if (args["backlog-row"] || args["backlog-add"] || args.status) {
    console.error("lane-end: --backlog <file> is required with --backlog-row / --backlog-add / --status");
    process.exit(1);
  }

  if (dryRun) {
    if (backlog) console.log(`[dry-run] would edit backlog ${args.backlog}`);
    console.log(`[dry-run] would replace row ${args.id} in ${owner.queue} with:\n  ${args.text}`);
    console.log(`[dry-run] would commit: queue: row ${args.id} landed`);
    process.exit(0);
  }

  writeFileSync(queuePath, replaced.text, "utf8");
  if (backlog) {
    try { writeFileSync(backlog.path, backlog.text, "utf8"); } catch (err) {
      writeFileSync(queuePath, queueText, "utf8"); // no half-landed lane: put the queue back
      console.error(`lane-end: cannot write ${backlog.path}: ${err.message}`);
      process.exit(1);
    }
  }

  // A failed check after the write puts every written file back to its pre-write bytes.
  const restore = () => {
    writeFileSync(queuePath, queueText, "utf8");
    if (backlog) writeFileSync(backlog.path, backlog.before, "utf8");
  };

  // 3. Grep the write back.
  try {
    run("node", [join(scriptDir, "queue-write-check.mjs"), queuePath, args.text]);
  } catch (err) {
    restore();
    console.error(`lane-end: queue-write-check failed after write; files restored — ${err.message}`);
    process.exit(1);
  }

  // 3b. Lint the queue's row numbers (unique per table; named grandfather list).
  try {
    run("node", [join(scriptDir, "queue-write-check.mjs"), "--lint", queuePath]);
  } catch (err) {
    restore();
    console.error(`lane-end: queue lint failed after write; files restored — ${err.stderr || err.message}`);
    process.exit(1);
  }

  // 3c. One ID, one row across the project's queue AND backlog; a duplicate puts the files back.
  const dups = crossFileDupIds(args.vault).filter((d) => d.kind === "dup-id");
  if (dups.length) {
    restore();
    console.error(`lane-end: duplicate row number after write; files restored — ${dups.map((d) => d.msg).join("; ")}`);
    process.exit(1);
  }

  // The files are written and checked; the lock guards only that window, not git.
  releaseLock();

  // 4. Commit + push (queue file + evidence dir only, never a broad add).
  try {
    const addPaths = [queuePath];
    if (backlog) addPaths.push(backlog.path);
    if (args.evidence) addPaths.push(args.evidence);
    run("git", ["add", ...addPaths], { cwd: args.vault });
    run("git", ["commit", "-m", `queue: row ${args.id} landed`], { cwd: args.vault });
    run("git", ["push"], { cwd: args.vault });
  } catch (err) {
    failures.push(`commit/push: ${err.message}`);
  }

  // 4b. Drift check over every backlog and the queue, after the record is committed.
  try {
    const driftArgs = [join(scriptDir, "list-drift-check.mjs"), "--vault", args.vault];
    if (args["drift-repo"]) driftArgs.push("--repo", String(args["drift-repo"]));
    console.log(run("node", driftArgs));
  } catch (err) {
    failures.push(`list drift:\n${err.stdout || err.message}`);
  }

  // 5. PR status, if named.
  if (args.pr) {
    try {
      const [repo, num] = String(args.pr).split("#");
      const out = run("gh", ["pr", "view", num, "--repo", repo, "--json", "statusCheckRollup,mergeable,headRefOid,comments"]);
      const st = JSON.parse(out);
      st.trusted = trustedLogins(repo, (a) => run("gh", a));
      const tail = gateRunTail(st.comments, st.headRefOid, st.trusted);
      console.log(`mergeable=${st.mergeable} gate-run tail ${tail ? tail.verdict : "absent"}`);
      const v = canMerge(st);
      if (!v.ok) failures.push(`pr gate: ${v.reason}`);
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
