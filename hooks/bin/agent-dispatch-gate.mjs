#!/usr/bin/env node
/* PreToolUse (Agent|Task|Bash) — makes five dispatch laws mechanical instead of
   prompt-trusted. `routing` rule 9 has said since 1.74.0 that every dispatch
   `description` leads with its surface, `model-routing` has said the model is
   set explicitly and never inherited, `dispatch-brief` caps the brief, routing
   says a brief naming no skills is malformed, and the 2026-09-22
   lessons-for-1-92 ruling says a Source-contract lock row carries only the
   operator's words — and all five were still checked only by whoever
   remembered to check them. This gate reads the dispatch before it launches
   and denies it with the failing item named.

   A sixth-surface check (1.102.0) covers Bash: an agent launched through Bash
   (`claude -p` / `--print` / `--cloud`, `workflow.mjs`, the Mac-queue runner or
   a Mac-queue job file) must carry the same `description` shape as an Agent
   dispatch, because the background-task list shows that description and the
   operator reads it to see that a local agent is running (operator,
   2026-10-01). Only agent launches are gated — never a dev server or watcher.

   Seven checks, in order, first failure reported:

   1. DESCRIPTION SHAPE — `cloud — persona (model): task` or
      `local — persona (model): task`. The surface prefix is what makes the
      cloud default auditable at a glance; the parenthesised model is what
      makes an inherited model visible in the log rather than silent.
   2. MODEL SET EXPLICITLY — `model` present and non-empty on the tool input.
      A dispatch with no model inherits the parent's, which is the failure
      `model-routing` exists to stop.
   3. PROMPT UNDER 600 WORDS — markdown table rows excluded from the count. A
      locked table is the spec and must be copied whole
      (`review-the-lock-not-the-slice`), so counting its rows against the brief
      would push the parent to slice the lock to fit the cap — exactly the
      malformed-brief shape rule 10 forbids. Prose is what the cap is for.
   4. SKILLS NAMED — every persona dispatch (engineer, ux-designer, reviewer,
      researcher, releaseops, project-manager alike) carries a `Skills:` line
      naming at least one skill (`routing`: "a brief naming none is
      malformed"). Not scoped to build verbs — every row of `routing`'s
      persona dispatch table names mandatory skills, so every dispatch does.
   5. SOURCE-CONTRACT LOCK ROWS — when the prompt carries `## Source
      contract`, its `## Locked decisions` table (if any) uses a `Source`
      column, never `Means technically`, and each row's Source cell is one
      of `export-silent` | `export-vs-ruling` | `operator-round` (Change 1,
      2026-09-22 lessons-for-1-92 ruling). The quote cell carries only the
      operator's words — a backticked mechanism identifier (a
      `--custom-prop`, a `name()` call, an easing/`cubic-bezier`, a file
      path) in that cell can only have been authored by the parent, which is
      the exact malformed-brief shape the ruling forbids.

   6. LINE BRIEFS NEVER ASK FOR A READ-BACK — a `Size: line` brief that also
      instructs a `## Read-back` return or a `next: parent (go?)` stop is
      refused; `spend-levers` rule 1 (2026-09-22 operator ruling on spend:
      "Read-back only above line") makes the read-back stop a component/system
      thing only, and a line brief asking for one anyway is the malformed
      shape the ruling exists to stop.

   7. COMPONENT/SYSTEM BRIEFS NAME A PROGRESS PATH — a `Size: component` or
      `Size: system` brief with no `## Progress` heading naming a path is
      refused; `line` stays exempt (`doer-rules.md` § Size class: "line lanes
      keep no progress file"). A path means an absolute path, a `~/` path, or
      a backticked path, ending in a file name such as `progress.md` — and the
      file name itself must contain "progress" (case-insensitive); a path to
      an unrelated file (e.g. a style guide the brief points at for tone)
      names a real path but is not a progress file, and is refused the same
      as prose that never names a path at all. Prose under the heading that
      merely mentions a filename (e.g. "per doer-rules.md") does not count
      either, and is refused with a message saying a progress-file path is
      required. A portfolio lane left ~295 uncommitted lines across six files
      with no progress file when its session ended — the brief omitted
      `## Progress` and nothing refused it (`lanes-survive-interruption`,
      2026-09-25).

   EXEMPT: `subagent_type` Explore and Plan. Those are the parent's own
   reconnaissance (`routing` rule 5), not a dispatch to a persona — they carry
   no surface, no persona and no brief, so none of the five laws apply.

   The check is exported as a pure function so the tests drive it directly;
   the CLI wrapper only does stdin/stdout. */
import { readFileSync, realpathSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { upsertLane, expandHome, withRegistryLock, loadRegistry } from "./progress-registry.mjs";

export const PROMPT_WORD_CAP = 600;

// Parent reconnaissance, not a persona dispatch — see the EXEMPT note above.
export const EXEMPT_SUBAGENTS = new Set(["Explore", "Plan"]);

// `cloud — persona (model): task`. Em dash, because that is what routing and
// dispatch-brief both write; a hyphen here would pass a description the law
// files do not describe.
const DESCRIPTION_SHAPE = /^(cloud|local) — ([A-Za-z][A-Za-z0-9 -]*?) \(([^()]+)\): *\S/;

/* Does this Bash command launch an agent? `claude` with `-p`/`--print`/`--cloud`,
   `workflow.mjs`, the Mac-queue runner, or a write of a Mac-queue job file — each
   at the start of a shell segment, so a quoted mention or `cat workflow.mjs`
   never counts. */
const SEGMENT_START = String.raw`(?:^|[;&|(\n])\s*(?:[A-Za-z_]\w*=\S*\s+)*`;
const AGENT_LAUNCHES = [
  new RegExp(SEGMENT_START + String.raw`(?:\S*/)?claude\s(?:[^;&|\n]*\s)?(?:-p|--print|--cloud)(?=\s|$)`),
  new RegExp(SEGMENT_START + String.raw`(?:node\s+)?\S*workflow\.mjs(?=\s|$)`),
  new RegExp(SEGMENT_START + String.raw`(?:(?:ba)?sh\s+)?\S*mac-queue/run\.sh(?=\s|$)`),
  /\bgit\s+add\b[^;&|\n]*queue\/mac\/pending\//,
  /(?:>|\btee\s)\s*\S*queue\/mac\/pending\//,
];
export function launchesAgent(command = "") {
  return AGENT_LAUNCHES.some((re) => re.test(String(command)));
}

/* Bash that launches an agent carries `local — persona (model): task` (or
   `cloud —`) in its `description`, the one regex Agent dispatches use. */
export function checkBashAgentLabel(toolInput = {}) {
  const { command = "", description = "" } = toolInput;
  if (!launchesAgent(command) || DESCRIPTION_SHAPE.test(description)) return { ok: true };
  return {
    ok: false,
    item: "bash-description",
    reason:
      `Bash blocked — bash-description: this command launches an agent, so its \`description\` must read ` +
      `\`local — persona (model): task\` (or \`cloud —\`), got ${JSON.stringify(description)}. ` +
      `The background-task list shows this description; it is how the operator sees which local agent is running ` +
      `(\`dispatch-brief\` § Persona + model, operator 2026-10-01).`,
  };
}

// The three legal Source cells for a Source-contract lock row (Change 1).
export const SOURCE_CONTRACT_CELLS = new Set(["export-silent", "export-vs-ruling", "operator-round"]);

// A backticked mechanism identifier — only the parent could have authored
// this inside a quote cell that is supposed to carry the operator's words
// verbatim: a custom property, a function call, an easing curve/token, or a
// file path with a code-file extension.
const MECHANISM_IDENTIFIER = new RegExp(
  "`(" +
    "--[\\w-]+" + // custom property
    "|[\\w-]+\\(\\)" + // function call
    "|cubic-bezier\\([^)]*\\)" + // easing curve literal
    "|ease-(?:in|out|in-out)[\\w-]*" + // easing token
    "|[\\w./-]+\\.(?:mjs|js|ts|tsx|css|md|json)" + // file path
    ")`",
  "i",
);

/* Words in the brief, NOT counting markdown table rows. A row is a line whose
   first non-space character is a pipe — that covers the header, the separator
   and every data row of a locked table. */
export function promptWords(prompt) {
  return String(prompt || "")
    .split(/\r?\n/)
    .filter((line) => !/^\s*\|/.test(line))
    .join("\n")
    .split(/\s+/)
    .filter(Boolean).length;
}

// Split a `## Locked decisions` markdown table into its raw pipe-lines
// (header, separator, then data rows), or [] if there is no lock table.
function lockedDecisionsLines(prompt) {
  const lockIdx = prompt.search(/##\s*Locked decisions/i);
  if (lockIdx === -1) return [];
  const rest = prompt.slice(lockIdx);
  const nextHeading = rest.slice(1).search(/\n##\s/);
  const tableText = nextHeading === -1 ? rest : rest.slice(0, nextHeading + 1);
  return tableText.split("\n").filter((line) => /^\s*\|/.test(line));
}

function tableCells(row) {
  return row
    .split("|")
    .map((cell) => cell.trim())
    .filter((cell, i, arr) => !(i === 0 && cell === "") && !(i === arr.length - 1 && cell === ""));
}

/* Returns null when the check does not apply or passes, or
   { item, reason } on a violation — Change 1 (2026-09-22 lessons-for-1-92). */
export function checkSourceContractLockRows(prompt) {
  if (!/##\s*Source contract/i.test(prompt)) return null;
  const lines = lockedDecisionsLines(prompt);
  if (lines.length < 2) return null; // no lock table this round

  const header = lines[0];
  if (/means technically/i.test(header)) {
    return {
      item: "lock-rows",
      reason:
        `Dispatch blocked — lock-rows: the Locked decisions header uses "Means technically". ` +
        `A Source-contract lock row uses a Source column instead — ` +
        `export-silent | export-vs-ruling | operator-round (dispatch-brief § Locked decisions).`,
    };
  }

  for (const row of lines.slice(2)) {
    const cells = tableCells(row);
    if (cells.length < 3) continue; // not a data row (e.g. malformed/short line)
    const quote = cells[1];
    const source = cells[cells.length - 1].replace(/`/g, "").trim();

    if (MECHANISM_IDENTIFIER.test(quote)) {
      return {
        item: "lock-rows",
        reason:
          `Dispatch blocked — lock-rows: quote cell ${JSON.stringify(quote)} carries a backticked ` +
          `mechanism identifier (token/function/easing/path) — only the parent could have authored ` +
          `that; a Source-contract lock row quotes the operator's words only.`,
      };
    }

    if (!SOURCE_CONTRACT_CELLS.has(source)) {
      return {
        item: "lock-rows",
        reason:
          `Dispatch blocked — lock-rows: source cell ${JSON.stringify(cells[cells.length - 1])} ` +
          `must be one of export-silent | export-vs-ruling | operator-round.`,
      };
    }
  }

  return null;
}

/* Returns null when a `Skills:` line names at least one skill, else
   { item, reason } — Change 1 additions (every persona dispatch names its
   skills, not build verbs only). */
export function checkSkillsNamed(prompt) {
  const match = /skills?:\s*([^\n]+)/i.exec(prompt);
  const names = match
    ? match[1]
        .split(/[,;]/)
        .map((s) => s.trim().replace(/\.$/, ""))
        .filter((s) => /[A-Za-z0-9]/.test(s))
    : [];
  if (names.length > 0) return null;
  return {
    item: "skills",
    reason:
      `Dispatch blocked — skills: no \`Skills:\` line naming at least one skill was found in the ` +
      `prompt. Every persona dispatch names its skills — a brief naming none is malformed ` +
      `(\`routing\` § persona dispatch table).`,
  };
}

// A line brief instructing a read-back stop — `spend-levers` rule 1.
const LINE_SIZE = /Size:\s*line\b/i;
const READBACK_ASK = /##\s*Read-back|next:\s*parent\s*\(go\?\)/i;

/* Returns null when a `Size: line` brief carries no read-back-stop
   instruction, else { item, reason } — `spend-levers` rule 1, 2026-09-22. */
export function checkLineNoReadBack(prompt) {
  if (!LINE_SIZE.test(prompt)) return null;
  if (!READBACK_ASK.test(prompt)) return null;
  return {
    item: "line-readback",
    reason:
      `Dispatch blocked — line-readback: this is a \`Size: line\` brief but it asks for a ` +
      `\`## Read-back\` return or a \`next: parent (go?)\` stop. Read-back stops are for ` +
      `component/system lanes only — a line lane never stops for one (\`doer-rules.md\` ` +
      `§ Size class, operator ruling 2026-09-22, \`spend-levers\` rule 1).`,
  };
}

// `Size: component` / `Size: system` briefs — `line` is exempt.
const ABOVE_LINE_SIZE = /Size:\s*(component|system)\b/i;
// Anchored to the true start of a line (the `m` flag makes `^` match after
// every `\n`, not just the string start) — a brief that quotes the heading
// in backticks mid-sentence (e.g. a Context bullet reading "write to
// `## Progress` every 10 min") never starts a line with `##`, so it is never
// mistaken for the real heading. `.search()` with no anchor found whichever
// mention came first in the prompt, real or quoted.
const PROGRESS_HEADING = /^##\s*Progress\b/im;

/* A real path, not prose that happens to mention a filename: either
   backticked (any leading `~/` or `/`, ending in a `.ext`), or a bare
   absolute (`/…`) or home-relative (`~/…`) path ending in `.ext`. Prose like
   "per doer-rules.md" has no leading `/` or `~/` and does not match — only a
   path is accepted, not a filename dropped mid-sentence. Captures the path
   itself (group 1 for the backticked form, group 2 for the bare form) so the
   caller can check the file name names a progress file, not just any file —
   a path to an unrelated file (e.g. a style guide) matches the shape but
   names the wrong file. */
const PROGRESS_PATH =
  /`((?:~\/|\/)[^\s`]*\.[A-Za-z0-9]+)`|(?:^|\s)((?:~\/|\/)\S*\.[A-Za-z0-9]+)/g;

/* The first path in `section` (per PROGRESS_PATH) whose own file name
   contains "progress" (case-insensitive) — `progress.md`, `agent-progress.md`,
   etc. — or null. A path to any other file, however real the path is, does
   not count. Exported so a doer-side hook can resolve the same lane's
   progress-file path from its own brief, rather than re-deriving the rule. */
export function findProgressPath(section) {
  if (!section) return null;
  const re = new RegExp(PROGRESS_PATH.source, "g");
  let match;
  while ((match = re.exec(section))) {
    const path = match[1] || match[2];
    const fileName = path.split("/").pop();
    if (/progress/i.test(fileName)) return path;
  }
  return null;
}

function hasProgressPath(section) {
  return findProgressPath(section) !== null;
}

// Slice from the `## Progress` heading up to (not including) the next `## `
// heading, or to the end of the prompt — the same walk `lockedDecisionsLines`
// uses for `## Locked decisions`. null when there is no `## Progress` heading.
// Exported for the same reuse reason as findProgressPath above.
export function progressSectionText(prompt) {
  const idx = prompt.search(PROGRESS_HEADING);
  if (idx === -1) return null;
  const rest = prompt.slice(idx);
  const nextHeading = rest.slice(1).search(/\n##\s/);
  return nextHeading === -1 ? rest : rest.slice(0, nextHeading + 1);
}

/* Returns null when a `Size: component`/`Size: system` brief carries a
   `## Progress` heading naming a progress-file path — absolute, `~/`, or
   backticked, on the heading's own line or any line before the next heading,
   with a file name containing "progress" — else { item, reason } —
   `lanes-survive-interruption`, 2026-09-25: a portfolio lane's brief omitted
   `## Progress` though the lane was above line, and nothing refused it. A
   `## Progress` heading followed only by prose (no path), or naming a real
   path to an unrelated file (e.g. a style guide pointed at for tone), is
   refused too — the check exists so a stopped session can find the progress
   file, not so the heading merely exists or names some other path. */
export function checkComponentSystemProgress(prompt) {
  if (!ABOVE_LINE_SIZE.test(prompt)) return null;
  const section = progressSectionText(prompt);
  if (section && hasProgressPath(section)) return null;
  return {
    item: "progress-path",
    reason:
      `Dispatch blocked — progress-path: this is a \`Size: component\`/\`Size: system\` brief but ` +
      `carries no \`## Progress\` heading naming a progress-file path (absolute, \`~/\`, or ` +
      `backticked, ending in a file name that contains "progress", such as \`progress.md\`). ` +
      `Above-line lanes keep a progress file so a stopped session loses no state ` +
      `(\`doer-rules.md\` § You are the doer, \`lanes-survive-interruption\`, 2026-09-25).`,
  };
}

/* Returns { ok: true } or { ok: false, item, reason }. `item` is the failing
   law so the caller can name it without re-deriving it from the prose. */
export function checkAgentDispatch(toolInput = {}) {
  const { description = "", model = "", prompt = "", subagent_type: subagentType = "" } = toolInput;

  if (EXEMPT_SUBAGENTS.has(subagentType)) {
    return { ok: true, exempt: subagentType };
  }

  const shape = DESCRIPTION_SHAPE.exec(description);
  if (!shape) {
    return {
      ok: false,
      item: "description",
      reason:
        `Dispatch blocked — description: expected \`cloud — persona (model): task\` or ` +
        `\`local — persona (model): task\`, got ${JSON.stringify(description)}. ` +
        `The surface prefix is routing rule 9; the parenthesised model is model-routing. ` +
        `Local also needs its one-clause machine-bound justification in the brief.`,
    };
  }

  if (!String(model).trim()) {
    return {
      ok: false,
      item: "model",
      reason:
        `Dispatch blocked — model: set \`model\` explicitly on the Agent call. ` +
        `The description says (${shape[3]}); an unset \`model\` inherits the parent's instead, ` +
        `which is the drift model-routing exists to stop.`,
    };
  }

  const count = promptWords(prompt);
  if (count >= PROMPT_WORD_CAP) {
    return {
      ok: false,
      item: "prompt",
      reason:
        `Dispatch blocked — prompt: ${count} words, cap is ${PROMPT_WORD_CAP} ` +
        `(markdown table rows already excluded). Point at the contract instead of restating it ` +
        `(dispatch-brief). A locked table does not count against this cap — copy it whole.`,
    };
  }

  const skillsVerdict = checkSkillsNamed(prompt);
  if (skillsVerdict) return { ok: false, ...skillsVerdict };

  const lockRowsVerdict = checkSourceContractLockRows(prompt);
  if (lockRowsVerdict) return { ok: false, ...lockRowsVerdict };

  const lineReadBackVerdict = checkLineNoReadBack(prompt);
  if (lineReadBackVerdict) return { ok: false, ...lineReadBackVerdict };

  const progressVerdict = checkComponentSystemProgress(prompt);
  if (progressVerdict) return { ok: false, ...progressVerdict };

  return { ok: true };
}

function readHookInput() {
  try {
    return JSON.parse(readFileSync(0, "utf8") || "{}");
  } catch {
    return {};
  }
}

function allow(additionalContext) {
  if (additionalContext) {
    console.log(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "allow",
          additionalContext,
        },
      }),
    );
  }
  process.exit(0);
}

function deny(reason) {
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: reason,
      },
    }),
  );
  process.exit(0);
}

/* ACTIVE-WORK WARNING (operator-approved scope add, 2026-09-28 —
   `~/JHD/vault/main/projects/jhd-discipline/evidence/2026-09-28-registry-regen/lock.md`:
   operator "yes" to warning, never blocking, before dispatching an agent
   into a repo that may already have work in flight). Two independent
   signals, both best-effort and fail-open — neither ever denies a dispatch,
   and any error anywhere in here (a `git` call, a stat, a malformed brief)
   is swallowed and treated as "nothing to warn about":

     (a) another session's own registry row already names the same repo —
         read straight off the registry this gate itself maintains, no new
         state;
     (b) the target repo has a sibling worktree (`git worktree list`) that
         is dirty (`git status --porcelain`) or has moved in the last 30
         minutes (`git log -1 --format=%ct`), and it is not the worktree
         THIS dispatch itself names — a lane about to be created has no
         worktree yet, so it naturally never self-flags.

   Repo/worktree are read off the SAME `## Context`-style prose every real
   brief already carries (`Repo `<path>`, ... worktree `<path>``, backticked
   or bare, same tolerance as `findProgressPath`) — no new brief grammar to
   learn or enforce. */

// `repo` (case-insensitive) followed, anywhere before the next comma/
// whitespace run, by an absolute or `~/` path — backticked or bare, exactly
// the two shapes `findProgressPath` already accepts for a progress path.
const REPO_PATH_RE = /\brepo\b[^\n`~/]{0,20}`?((?:~\/|\/)[^\s`,]+)`?/i;
const WORKTREE_PATH_RE = /\bworktree\b[^\n`]{0,20}`?([^\s`,]+)`?/i;

/* `{ repoPath, worktreePath } | null` — `worktreePath` is null when the
   brief names no worktree (e.g. a dispatch working directly in `<repo>/main`).
   A relative worktree path (the house `worktrees/<lane-name>` shape) is
   resolved against `repoPath`; absolute/`~/` forms are used as-is. */
export function findRepoContext(prompt) {
  const text = String(prompt || "");
  const repoMatch = REPO_PATH_RE.exec(text);
  if (!repoMatch) return null;
  const repoPath = expandHome(repoMatch[1].replace(/[).,;]+$/, ""));
  const worktreeMatch = WORKTREE_PATH_RE.exec(text);
  let worktreePath = null;
  if (worktreeMatch) {
    const raw = worktreeMatch[1].replace(/[).,;]+$/, "");
    worktreePath = /^(~\/|\/)/.test(raw) ? expandHome(raw) : join(repoPath, raw);
  }
  return { repoPath, worktreePath };
}

const ACTIVE_WORK_STALE_MS = 30 * 60 * 1000;
const ACTIVE_WORK_WORKTREE_CAP = 20; // bounded — never walk an unbounded worktree list

/* Pure: given the already-loaded registry, the `{ repoPath, worktreePath }`
   this dispatch itself names, and the caller's OWN sessionId, decide which
   OTHER registry rows name the same repo. `worktreePath`/`repoPath` null
   (no repo parsed from the brief) always returns []. */
export function otherSessionsOnRepo(entries, repoPath, sessionId) {
  if (!repoPath) return [];
  return entries.filter((e) => e.repo === repoPath && e.sessionId && e.sessionId !== sessionId);
}

/* Pure: given a list of `{ path, dirty, changedAt }` worktree statuses
   (already read — see `realWorktreeStatuses` for the impure git side) and
   the dispatch's OWN worktree path (if named), which of the OTHER worktrees
   look like live work: dirty, or changed within `ACTIVE_WORK_STALE_MS`. */
export function activeSiblingWorktrees(statuses, ownWorktreePath, now = Date.now()) {
  return statuses.filter((s) => {
    if (ownWorktreePath && s.path === ownWorktreePath) return false;
    if (s.dirty) return true;
    return typeof s.changedAt === "number" && now - s.changedAt < ACTIVE_WORK_STALE_MS;
  });
}

/* Pure: composes both signals into the one warning string this gate injects
   via `additionalContext`, or null when there is nothing to say. Never
   throws — callers pass already-computed, already-fail-open inputs. */
export function buildActiveWorkWarning({ otherSessions, activeWorktrees, repoPath }) {
  if (otherSessions.length === 0 && activeWorktrees.length === 0) return null;
  const lines = [`Active-work warning — ${repoPath} may already have work in flight:`];
  for (const s of otherSessions) {
    lines.push(`- another session (${s.sessionId}) has a live lane registered on this repo — its progress file: ${s.path}`);
  }
  for (const w of activeWorktrees) {
    const why = w.dirty ? "has uncommitted changes" : "changed in the last 30 minutes";
    lines.push(`- worktree ${w.path} ${why} and is not this dispatch's own worktree`);
  }
  lines.push("This is a warning, not a block — check before you proceed if this looks like a collision.");
  return lines.join("\n");
}

// Impure, bounded, fail-open: real `git worktree list` + per-worktree
// status/mtime. Any single worktree's git calls failing (removed mid-scan,
// not actually a git dir, etc.) drops just that one entry, never the whole
// scan. Capped at ACTIVE_WORK_WORKTREE_CAP entries so a repo with an
// unusual number of worktrees can't make a dispatch's own gate slow.
export function realWorktreeStatuses(repoPath) {
  let listing;
  try {
    listing = execFileSync("git", ["-C", repoPath, "worktree", "list", "--porcelain"], { encoding: "utf8" });
  } catch {
    return [];
  }
  const paths = listing
    .split("\n\n")
    .map((block) => /^worktree (.+)$/m.exec(block)?.[1])
    .filter(Boolean)
    .slice(0, ACTIVE_WORK_WORKTREE_CAP);
  const statuses = [];
  for (const wtPath of paths) {
    let dirty = false;
    let changedAt = null;
    try {
      dirty = execFileSync("git", ["-C", wtPath, "status", "--porcelain"], { encoding: "utf8" }).trim().length > 0;
    } catch {
      continue; // not a readable worktree — skip, never let one bad entry sink the scan
    }
    try {
      const epochSeconds = execFileSync("git", ["-C", wtPath, "log", "-1", "--format=%ct"], { encoding: "utf8" }).trim();
      if (epochSeconds) changedAt = Number(epochSeconds) * 1000;
    } catch {
      /* no commits yet, or unreadable — dirty flag alone still stands */
    }
    statuses.push({ path: wtPath, dirty, changedAt });
  }
  return statuses;
}

/* The one entry point `main()` calls: repo context off the brief, this
   session's OWN registered rows (read fresh off the registry this same
   dispatch is about to write), and a real worktree scan — folded into the
   warning string, or null. Never throws; every internal step already is,
   this just makes sure a mistake in the composition itself can't either. */
export function activeWorkWarning(prompt, sessionId) {
  try {
    const context = findRepoContext(prompt);
    if (!context?.repoPath) return null;
    const entries = loadRegistry();
    const otherSessions = otherSessionsOnRepo(entries, context.repoPath, sessionId);
    const statuses = realWorktreeStatuses(context.repoPath);
    // `git worktree list` reports its own canonicalised (realpath'd) paths —
    // on macOS that's `/private/var/...`, not the `/var/...` symlink a path
    // parsed straight off the brief's own text carries. Resolve the brief's
    // own worktree path the same way before comparing, so "this dispatch's
    // own worktree" actually matches rather than false-warning about itself.
    // A worktree that doesn't exist yet (the normal case: the gate runs
    // BEFORE the lane creates it) has nothing to resolve — keep the raw
    // path; it simply won't be in `statuses` yet either.
    let ownWorktreePath = context.worktreePath;
    if (ownWorktreePath) {
      try {
        ownWorktreePath = realpathSync(ownWorktreePath);
      } catch {
        /* not created yet — raw path stands, harmlessly matches nothing */
      }
    }
    const activeWorktrees = activeSiblingWorktrees(statuses, ownWorktreePath);
    return buildActiveWorkWarning({ otherSessions, activeWorktrees, repoPath: context.repoPath });
  } catch {
    return null;
  }
}

/* The registry-write half of `progress-hooks` fix round (2026-09-27,
   coordinator: "make it need no memory" — `progress-watch.mjs` only ran if
   the parent remembered to start it). A dispatch this gate is about to
   ALLOW, that named a real above-line `## Progress` path, is registered here
   — the same tool call that starts the lane is the one that starts tracking
   it, so there is no separate step for the parent to forget. Exempt
   dispatches (Explore/Plan) and line lanes (no `## Progress` section)
   register nothing — never throws; a registry write failure is never worse
   than the dispatch it would otherwise have blocked.

   `sessionId` (reviewer round 2 red: cross-session leak) is the PARENT
   session's own `session_id` — a field every hook input carries — stamped
   onto the row so `progress-registry-check.mjs` can later report ONLY to
   the session that owns it. Without this a dispatched DOER's own session
   (a different `session_id`, hit by the same process-level `PostToolUse`/
   `UserPromptSubmit` wiring) could see status lines about lanes that are
   none of its business. */
export function registerLaneFromPrompt(prompt, sessionId, now = Date.now()) {
  const section = progressSectionText(String(prompt || ""));
  const path = section ? findProgressPath(section) : null;
  if (!path) return;
  const repo = findRepoContext(prompt)?.repoPath ?? null;
  try {
    withRegistryLock((entries) =>
      upsertLane(entries, { path: expandHome(path), sessionId: sessionId ?? null, dispatchedAt: now, lastMtime: null, fired: [], repo }),
    );
  } catch {
    /* registry write failed — the dispatch itself must not be blocked over it */
  }
}

function main() {
  const input = readHookInput();
  // Unparseable or non-dispatch input is not this gate's business — a hook that
  // denies on its own confusion is worse than no hook.
  if (!input || typeof input !== "object" || !input.tool_input) allow();
  if (input.tool_name === "Bash") {
    const bash = checkBashAgentLabel(input.tool_input);
    if (!bash.ok) deny(bash.reason);
    allow();
  }
  const verdict = checkAgentDispatch(input.tool_input);
  if (verdict.ok) {
    let warning = null;
    if (!verdict.exempt) {
      registerLaneFromPrompt(input.tool_input.prompt, input.session_id);
      warning = activeWorkWarning(input.tool_input.prompt, input.session_id);
    }
    allow(warning);
  }
  deny(verdict.reason);
}

// Only run when invoked as the hook, never on import from the tests.
if (process.argv[1] && process.argv[1].endsWith("agent-dispatch-gate.mjs")) main();
