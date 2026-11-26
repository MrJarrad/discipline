#!/usr/bin/env node
/* PreToolUse (Bash) — makes "no commit without green typecheck" mechanical
   instead of prompt-trusted. Only acts on `git commit` invocations; every
   other Bash command passes through untouched. Reads the marker file written
   by bin/run-typecheck.mjs (fired async by bin/typecheck-marker.mjs on every
   Write|Edit) and denies the commit unless it says "green".

   Marker resolution: the marker lives at <repo>/.claude/.typecheck-status.json,
   where <repo> is the repo the commit actually targets — NOT input.cwd and NOT
   the first `cd` in the command. gitTarget() follows every `cd` before the
   commit and a `git -C <path> commit`; with neither it is input.cwd.        */
/* Second, independent gate on the same hook: FRONTMATTER GATE. Any commit
   whose staged changes touch skills/ gets every skills/<dir>/SKILL.md in
   the target repo re-parsed by hooks/scripts/frontmatter-check.mjs. An invalid
   frontmatter block (most notably an unquoted ": " inside a plain scalar —
   the class of bug that left shape-stress and stress-plan untriggerable
   for their whole lives, proposals/INTEGRATION-REPORT.md:87-95) denies the
   commit with the file and defect named, before it ever lands. */
/* Third, independent gate on the same hook: LESSON LEDGER GATE. A commit whose
   staged changes bump `.claude-plugin/plugin.json`'s version is a release, and
   a release must not ship while a fleet lesson, or a ruling THIS RELEASE
   NAMES, is still `queued` (problem 5, 2026-09-10: nine hoverboard lessons
   written and never shipped). The gate runs hooks/scripts/lesson-ledger.mjs
   against the vault at $DISCIPLINE_VAULT_ROOT (default ~/JHD/vault/main) with
   --release <new version>, and denies the commit with the ledger's own report
   when it fails. Warn-and-skip when the vault root is absent: cloud runners
   have no vault, and gating a release on a tree that isn't there would block
   every one of them. On by default; $DISCIPLINE_LEDGER_GATE=0 is the
   documented opt-out for a run that must not consult a vault at all.
   Scoped to the release (2026-09-21, `lane-progress-file`): a queued ruling
   only blocks when CHANGED.txt's own top entry names it (`[[stem]]` or a
   `fleet/rulings/<stem>.md` path) — any OTHER queued ruling, including one
   from a session unrelated to this commit, is a warning in the gate's output,
   never a refusal. Lessons are unaffected — a queued lesson still blocks
   every release, same as before. */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { checkSkillsDir } from "../scripts/frontmatter-check.mjs";
import {
  lintLessonLedger,
  formatLedgerReport,
  namedRulingsFromChangedEntry,
  topChangedEntry,
} from "../scripts/lesson-ledger.mjs";
import { gitTarget } from "../scripts/lib/git-command-target.mjs";
import { runTypecheckSync } from "./run-typecheck.mjs";
import { resolveVault, stopVerdict, CLOUD_VAULT } from "../scripts/lib/resolve-vault.mjs";

function readHookInput() {
  try { return JSON.parse(readFileSync(0, "utf8") || "{}"); }
  catch { return {}; }
}

function allow() {
  process.exit(0);
}

function deny(reason) {
  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason,
    },
  }));
  process.exit(0);
}

const input = readHookInput();
const command = input.tool_input?.command || "";

// Only gate actual `git commit` invocations (--amend/--help included — anything
// that writes a commit, including `git -C <path> commit`, which lanes use
// instead of a `cd` chain).
const sessionCwd = input.cwd || process.cwd();
const cwd = gitTarget(command, sessionCwd, (w, k) => w[k] === "commit");
if (cwd === null) allow();


// Frontmatter gate — only when this commit's staged changes actually touch
// skills/, and only against the target repo's own skills/ tree (never
// input.cwd, for the same reason the typecheck marker isn't).
const stagedFiles = spawnSync("git", ["-C", cwd, "diff", "--cached", "--name-only"], { encoding: "utf8" });
const touchesSkills = stagedFiles.status === 0 &&
  stagedFiles.stdout.split("\n").some((f) => f.startsWith("skills/"));

if (touchesSkills) {
  const frontmatterResult = checkSkillsDir(join(cwd, "skills"));
  if (!frontmatterResult.ok) {
    deny(`Frontmatter gate: invalid skill frontmatter — commit blocked.\n${frontmatterResult.summary}`);
  }
}

// Lesson-ledger gate — only when this commit's staged changes bump the
// plugin version (a release commit), and only when explicitly enabled.
const PLUGIN_MANIFEST = ".claude-plugin/plugin.json";
const MARKETPLACE_MANIFEST = ".claude-plugin/marketplace.json";

// The `version` value on the staged (+) side of the manifest diff, or null
// when this commit does not change it. Reading the diff rather than the
// working file is what distinguishes a release commit from any other commit
// that happens to touch the manifest.
function stagedVersionBump(repoCwd) {
  const diff = spawnSync("git", ["-C", repoCwd, "diff", "--cached", "--", PLUGIN_MANIFEST], { encoding: "utf8" });
  if (diff.status !== 0 || !diff.stdout) return null;
  const added = diff.stdout.match(/^\+\s*"version":\s*"([^"]+)"/m);
  return added ? added[1] : null;
}

// The marketplace manifest's own plugin version, read from the INDEX (staged
// content, including any change this commit makes to the file, falling back
// to whatever was last committed when this commit leaves it untouched) —
// never the working tree, which may carry unrelated uncommitted edits.
function indexedMarketplaceVersion(repoCwd) {
  const show = spawnSync("git", ["-C", repoCwd, "show", `:${MARKETPLACE_MANIFEST}`], { encoding: "utf8" });
  if (show.status !== 0 || !show.stdout) return null;
  try {
    return JSON.parse(show.stdout).plugins?.[0]?.version ?? null;
  } catch {
    return null;
  }
}

// Version-match gate — independent of the lesson-ledger gate and its
// vault dependency, always on. 1.93.1 shipped with plugin.json bumped to
// 1.93.1 and marketplace.json left at 1.93.0 (queue-1820/1830/.../1880-law's
// "one matching semver" tests went red the moment 1.93.0's own top-of-file
// pin rolled past). A release commit (one that bumps plugin.json's version)
// must bump marketplace.json's `plugins[0].version` to the same value in the
// same commit, or be refused before it lands.
const bumpedTo = stagedVersionBump(cwd);
if (bumpedTo) {
  const marketplaceVersion = indexedMarketplaceVersion(cwd);
  if (marketplaceVersion !== bumpedTo) {
    deny(
      `Version-match gate: plugin.json is being bumped to ${bumpedTo} but ` +
      `${MARKETPLACE_MANIFEST}'s plugins[0].version is ${marketplaceVersion ?? "unreadable"} — ` +
      `stage a matching marketplace.json bump in this same commit.`,
    );
  }
}

if (process.env.DISCIPLINE_LEDGER_GATE !== "0") {
  if (bumpedTo) {
    const found = resolveVault({ need: "" });
    const vaultRoot = found?.root;
    if (!found) {
      console.error(
        `Lesson-ledger gate: no vault found (DISCIPLINE_VAULT_ROOT, ~/JHD/vault, ${CLOUD_VAULT}) — skipping the ` +
        `ledger check for release ${bumpedTo}. Set DISCIPLINE_VAULT_ROOT to gate on a vault elsewhere.`,
      );
    } else {
      let namedRulings;
      try {
        const changedTxt = readFileSync(join(cwd, "CHANGED.txt"), "utf8");
        namedRulings = namedRulingsFromChangedEntry(topChangedEntry(changedTxt));
      } catch {
        namedRulings = new Set(); // no CHANGED.txt entry to name a ruling by — every queued ruling is a warning, not a block
      }
      const ledger = lintLessonLedger(vaultRoot, { release: bumpedTo, namedRulings });
      if (!ledger.ok) {
        const msg = `Lesson-ledger gate: release ${bumpedTo} cannot ship while the ledger is unclean — ` +
          `lessons ship or say why not.\n${formatLedgerReport(ledger, vaultRoot)}`;
        if (stopVerdict(msg, found.via).decision === "block") deny(msg);
        else console.error(`[warn-only, DISC-351: this gate blocks from the next release] ${msg}`);
      }
    }
  }
}

const markerPath = join(cwd, ".claude", ".typecheck-status.json");

// Marker fallback: an absent marker (no Write/Edit has fired the async typecheck yet — marker
// fragility, SECOND strike, see the handover defect record) and a red or timed-out marker are both
// only a record of the past. The fix may have gone in through Bash (no Write|Edit event), or the
// async re-check may still be running, so the gate never refuses on the record alone: it runs the
// SAME command-picking + marker-writing logic synchronously right here and gates on the fresh
// result. A green marker is trusted as before.
let marker;
let reran = false;
if (!existsSync(markerPath)) {
  marker = runTypecheckSync(cwd);
} else {
  try { marker = JSON.parse(readFileSync(markerPath, "utf8")); }
  catch { deny("Typecheck gate: marker file is unreadable/corrupt — re-run typecheck."); }
  if (marker.status === "red" || marker.status === "timeout") {
    marker = runTypecheckSync(cwd);
    reran = true;
  }
}

if (marker.status === "green" || marker.status === "skipped") allow();

if (marker.status === "timeout") {
  deny(`Typecheck gate: typecheck (${marker.command || "unknown command"}) TIMED OUT ` +
    `at ${marker.ts}${reran ? " (the gate re-ran it just now)" : ""} — the check never finished, so there's no result to gate on.\n` +
    `${marker.tail || ""}`);
}

deny(`Typecheck gate: typecheck (${marker.command || "unknown command"}) is RED at ${marker.ts}` +
  `${reran ? " — the gate re-ran it just now, so this is current, not a stale record" : ""}. ` +
  `Fix the errors and commit again; the gate re-runs the check itself, no edit is needed to trigger it.\n` +
  `Tail:\n${marker.tail || ""}`);
