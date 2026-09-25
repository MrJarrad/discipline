#!/usr/bin/env node
/* PreToolUse (Agent|Task) — makes five dispatch laws mechanical instead of
   prompt-trusted. `routing` rule 9 has said since 1.74.0 that every dispatch
   `description` leads with its surface, `model-routing` has said the model is
   set explicitly and never inherited, `dispatch-brief` caps the brief, routing
   says a brief naming no skills is malformed, and the 2026-09-22
   lessons-for-1-92 ruling says a Source-contract lock row carries only the
   operator's words — and all five were still checked only by whoever
   remembered to check them. This gate reads the dispatch before it launches
   and denies it with the failing item named.

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
      a backticked path, ending in a file name such as `progress.md` — prose
      under the heading that merely mentions a filename (e.g. "per
      doer-rules.md") does not count, and is refused with a message saying a
      path is required. A portfolio lane left ~295 uncommitted lines across
      six files with no progress file when its session ended — the brief
      omitted `## Progress` and nothing refused it
      (`lanes-survive-interruption`, 2026-09-25).

   EXEMPT: `subagent_type` Explore and Plan. Those are the parent's own
   reconnaissance (`routing` rule 5), not a dispatch to a persona — they carry
   no surface, no persona and no brief, so none of the five laws apply.

   The check is exported as a pure function so the tests drive it directly;
   the CLI wrapper only does stdin/stdout. */
import { readFileSync } from "node:fs";

export const PROMPT_WORD_CAP = 600;

// Parent reconnaissance, not a persona dispatch — see the EXEMPT note above.
export const EXEMPT_SUBAGENTS = new Set(["Explore", "Plan"]);

// `cloud — persona (model): task`. Em dash, because that is what routing and
// dispatch-brief both write; a hyphen here would pass a description the law
// files do not describe.
const DESCRIPTION_SHAPE = /^(cloud|local) — ([A-Za-z][A-Za-z0-9 -]*?) \(([^()]+)\): *\S/;

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
const PROGRESS_HEADING = /##\s*Progress\b/i;

/* A real path, not prose that happens to mention a filename: either
   backticked (any leading `~/` or `/`, ending in a `.ext`), or a bare
   absolute (`/…`) or home-relative (`~/…`) path ending in `.ext`. Prose like
   "per doer-rules.md" has no leading `/` or `~/` and does not match — only a
   path is accepted, not a filename dropped mid-sentence. */
const PROGRESS_PATH =
  /`(?:~\/|\/)[^\s`]*\.[A-Za-z0-9]+`|(?:^|\s)(?:~\/|\/)\S*\.[A-Za-z0-9]+/;

// Slice from the `## Progress` heading up to (not including) the next `## `
// heading, or to the end of the prompt — the same walk `lockedDecisionsLines`
// uses for `## Locked decisions`. null when there is no `## Progress` heading.
function progressSectionText(prompt) {
  const idx = prompt.search(PROGRESS_HEADING);
  if (idx === -1) return null;
  const rest = prompt.slice(idx);
  const nextHeading = rest.slice(1).search(/\n##\s/);
  return nextHeading === -1 ? rest : rest.slice(0, nextHeading + 1);
}

/* Returns null when a `Size: component`/`Size: system` brief carries a
   `## Progress` heading naming a path — absolute, `~/`, or backticked, on the
   heading's own line or any line before the next heading — else
   { item, reason } — `lanes-survive-interruption`, 2026-09-25: a portfolio
   lane's brief omitted `## Progress` though the lane was above line, and
   nothing refused it. A `## Progress` heading followed only by prose (no
   path) is refused too — the check exists so a stopped session can find the
   file, not so the heading merely exists. */
export function checkComponentSystemProgress(prompt) {
  if (!ABOVE_LINE_SIZE.test(prompt)) return null;
  const section = progressSectionText(prompt);
  if (section && PROGRESS_PATH.test(section)) return null;
  return {
    item: "progress-path",
    reason:
      `Dispatch blocked — progress-path: this is a \`Size: component\`/\`Size: system\` brief but ` +
      `carries no \`## Progress\` heading naming a path (absolute, \`~/\`, or backticked, ending in ` +
      `a file name such as \`progress.md\`). Above-line lanes keep a progress file so a stopped ` +
      `session loses no state (\`doer-rules.md\` § You are the doer, \`lanes-survive-interruption\`, ` +
      `2026-09-25).`,
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

function allow() {
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

function main() {
  const input = readHookInput();
  // Unparseable or non-dispatch input is not this gate's business — a hook that
  // denies on its own confusion is worse than no hook.
  if (!input || typeof input !== "object" || !input.tool_input) allow();
  const verdict = checkAgentDispatch(input.tool_input);
  if (verdict.ok) allow();
  deny(verdict.reason);
}

// Only run when invoked as the hook, never on import from the tests.
if (process.argv[1] && process.argv[1].endsWith("agent-dispatch-gate.mjs")) main();
