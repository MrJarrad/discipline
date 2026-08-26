#!/usr/bin/env node
/* PreToolUse (Bash) — makes "no commit without green typecheck" mechanical
   instead of prompt-trusted. Only acts on `git commit` invocations; every
   other Bash command passes through untouched. Reads the marker file written
   by bin/run-typecheck.mjs (fired async by bin/typecheck-marker.mjs on every
   Write|Edit) and denies the commit unless it says "green".

   Marker resolution: the marker lives at <repo>/.claude/.typecheck-status.json,
   where <repo> is the repo the commit actually targets — NOT necessarily
   input.cwd (the session's cwd). A dispatched command frequently `cd`s into a
   different repo before committing, e.g. `cd ~/JHD/portfolio-v2 && git commit
   -m "..."` while the session itself stays rooted in the vault. If we resolved
   the marker from input.cwd in that case we'd read (or fail to find) the
   *session's* marker, not the target repo's — silently gating the wrong repo's
   typecheck state, or denying a commit that has nothing to do with a missing
   marker. Rule: parse a leading `cd <path>` off the front of the command (only
   the first, chained with && or ;) and resolve the marker there; fall back to
   input.cwd when the command has no leading `cd`.                          */
/* Second, independent gate on the same hook: FRONTMATTER GATE. Any commit
   whose staged changes touch skills/ gets every skills/<dir>/SKILL.md in
   the target repo re-parsed by hooks/scripts/frontmatter-check.mjs. An invalid
   frontmatter block (most notably an unquoted ": " inside a plain scalar —
   the class of bug that left shape-stress and stress-plan untriggerable
   for their whole lives, proposals/INTEGRATION-REPORT.md:87-95) denies the
   commit with the file and defect named, before it ever lands. */
import { readFileSync, existsSync } from "node:fs";
import { join, isAbsolute, resolve } from "node:path";
import { homedir } from "node:os";
import { spawnSync } from "node:child_process";
import { checkSkillsDir } from "../scripts/frontmatter-check.mjs";
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

// Parses a leading `cd <path>` off `command` (the shell metacharacters that
// can chain after it — && or ;) — returns the resolved absolute path, or
// null if the command doesn't open with a cd. Handles a quoted path (single
// or double quotes) since repo paths can contain spaces.
function leadingCdTarget(command, baseCwd) {
  const m = command.match(/^\s*cd\s+(?:"([^"]+)"|'([^']+)'|(\S+))\s*(?:&&|;|$)/);
  if (!m) return null;
  let raw = m[1] ?? m[2] ?? m[3];
  if (raw === "~" || raw.startsWith("~/")) raw = join(homedir(), raw.slice(1));
  return isAbsolute(raw) ? raw : resolve(baseCwd, raw);
}

const input = readHookInput();
const command = input.tool_input?.command || "";

// Only gate actual `git commit` invocations (allow git commit --amend/--help
// etc. through the same check — anything that writes a commit).
if (!/\bgit\s+commit\b/.test(command)) allow();

const sessionCwd = input.cwd || process.cwd();
const cwd = leadingCdTarget(command, sessionCwd) ?? sessionCwd;

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

deny(`Typecheck gate: last typecheck (${marker.command || "unknown command"}) was RED ` +
  `at ${marker.ts}. Fix the errors and let a Write/Edit re-trigger the check before committing.\n` +
  `Tail:\n${marker.tail || ""}`);
