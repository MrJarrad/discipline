#!/usr/bin/env node
/* PreToolUse (Bash) — makes "no commit without green typecheck" mechanical
   instead of prompt-trusted. Only acts on `git commit` invocations; every
   other Bash command passes through untouched. Reads the marker file written
   by bin/run-typecheck.mjs (fired async by bin/typecheck-marker.mjs on every
   Write|Edit) and denies the commit unless it says "green".

   Marker resolution: the marker lives at <repo>/.claude/.typecheck-status.json,
   where <repo> is the repo the commit actually targets — NOT input.cwd and NOT
   the first `cd` in the command. commitTarget() follows every `cd` before the
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
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { spawnSync } from "node:child_process";
import { checkSkillsDir } from "../scripts/frontmatter-check.mjs";
import {
  lintLessonLedger,
  formatLedgerReport,
  namedRulingsFromChangedEntry,
  topChangedEntry,
} from "../scripts/lesson-ledger.mjs";
import { runTypecheckSync } from "./run-typecheck.mjs";

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

// The repo a `git commit` command targets, or null when the command does not
// commit. The command is split into shell segments (&&, ||, ;, |, &, newline,
// subshell parens) with quotes respected, then walked in order: `cd`/`pushd`
// move the working directory (a `( … )` subshell restores it on exit), and a
// segment whose command is `git [-C <path>] commit` is the target. `git commit`
// appearing only as an argument (`grep 'git commit'`, `echo …`) is not a
// commit, and `bash -c '…'` bodies are parsed the same way. Audit finding 1.
function expand(raw) {
  return raw === "~" || raw.startsWith("~/") ? join(homedir(), raw.slice(1)) : raw;
}

function splitSegments(command) {
  const out = []; // { words: string[], open: number, close: number }
  let words = [], word = "", has = false, open = 0, close = 0;
  const endWord = () => { if (has) words.push(word); word = ""; has = false; };
  const endSeg = () => { endWord(); if (words.length || open || close) out.push({ words, open, close }); words = []; open = 0; close = 0; };
  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    if (ch === "'") { const j = command.indexOf("'", i + 1); const end = j < 0 ? command.length : j; word += command.slice(i + 1, end); has = true; i = end; }
    else if (ch === '"') {
      has = true; i++;
      for (; i < command.length && command[i] !== '"'; i++) {
        if (command[i] === "\\" && i + 1 < command.length) i++;
        word += command[i];
      }
    }
    else if (ch === "\\" && i + 1 < command.length) { word += command[++i]; has = true; }
    else if (/\s/.test(ch)) { if (ch === "\n") endSeg(); else endWord(); }
    else if (ch === ";" || ch === "|" || ch === "&") { endSeg(); if (command[i + 1] === ch) i++; }
    else if (ch === "(") { endSeg(); open++; }
    else if (ch === ")") { endSeg(); out.push({ words: [], open: 0, close: 1 }); }
    else { word += ch; has = true; }
  }
  endSeg();
  return out;
}

const WRAPPERS = new Set(["sudo", "command", "exec", "time", "env", "nohup", "builtin"]);
const SHELLS = new Set(["bash", "sh", "zsh"]);

function commitTarget(command, baseCwd, depth = 0) {
  let cur = baseCwd;
  const stack = [];
  for (const seg of splitSegments(command)) {
    for (let k = 0; k < seg.open; k++) stack.push(cur);
    let w = seg.words;
    while (w.length && (/^[A-Za-z_]\w*=/.test(w[0]) || WRAPPERS.has(w[0]))) w = w.slice(1);
    if (w[0] === "cd" || w[0] === "pushd") {
      const arg = w.slice(1).find((x) => !x.startsWith("-") || x === "-");
      if (arg && arg !== "-") cur = resolve(cur, expand(arg));
    } else if (SHELLS.has(w[0]) && w[1] === "-c" && w[2] !== undefined && depth < 3) {
      const inner = commitTarget(w[2], cur, depth + 1);
      if (inner) return inner;
    } else if (w[0] === "git") {
      let at = cur, i = 1;
      while (i < w.length && w[i].startsWith("-")) {
        if (w[i] === "-C" && w[i + 1] !== undefined) { at = resolve(at, expand(w[i + 1])); i += 2; }
        else if (w[i] === "-c" || w[i] === "--git-dir" || w[i] === "--work-tree") i += 2;
        else i++;
      }
      if (w[i] === "commit") return at;
    }
    for (let k = 0; k < seg.close; k++) if (stack.length) cur = stack.pop();
  }
  return null;
}

const input = readHookInput();
const command = input.tool_input?.command || "";

// Only gate actual `git commit` invocations (--amend/--help included — anything
// that writes a commit, including `git -C <path> commit`, which lanes use
// instead of a `cd` chain).
const sessionCwd = input.cwd || process.cwd();
const cwd = commitTarget(command, sessionCwd);
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
    let vaultRoot = process.env.DISCIPLINE_VAULT_ROOT;
    if (!vaultRoot) vaultRoot = join(homedir(), "JHD", "vault", "main");
    if (!existsSync(vaultRoot)) {
      console.error(
        `Lesson-ledger gate: vault root ${vaultRoot} is absent (cloud runner?) — skipping the ` +
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
        deny(
          `Lesson-ledger gate: release ${bumpedTo} cannot ship while the ledger is unclean — ` +
          `lessons ship or say why not.\n${formatLedgerReport(ledger, vaultRoot)}`,
        );
      }
    }
  }
}

const markerPath = join(cwd, ".claude", ".typecheck-status.json");

// Absent-marker fallback: rather than hard-failing the commit because no
// Write/Edit has fired the async typecheck yet (marker fragility — SECOND
// strike, see the handover defect record), run the SAME command-picking +
// marker-writing logic synchronously right here, then gate on the fresh
// result below exactly as if the marker had existed all along.
let marker;
if (!existsSync(markerPath)) {
  marker = runTypecheckSync(cwd);
} else {
  try { marker = JSON.parse(readFileSync(markerPath, "utf8")); }
  catch { deny("Typecheck gate: marker file is unreadable/corrupt — re-run typecheck."); }
}

if (marker.status === "green" || marker.status === "skipped") allow();

if (marker.status === "timeout") {
  deny(`Typecheck gate: last typecheck (${marker.command || "unknown command"}) TIMED OUT ` +
    `at ${marker.ts} — the check never finished, so there's no result to gate on.\n` +
    `${marker.tail || ""}`);
}

deny(`Typecheck gate: last typecheck (${marker.command || "unknown command"}) was RED ` +
  `at ${marker.ts}. Fix the errors and let a Write/Edit re-trigger the check before committing.\n` +
  `Tail:\n${marker.tail || ""}`);
