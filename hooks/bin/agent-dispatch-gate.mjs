#!/usr/bin/env node
/* PreToolUse (Agent|Task) — makes three dispatch laws mechanical instead of
   prompt-trusted. `routing` rule 9 has said since 1.74.0 that every dispatch
   `description` leads with its surface, `model-routing` has said the model is
   set explicitly and never inherited, and `dispatch-brief` caps the brief —
   and all three were still checked only by whoever remembered to check them.
   This gate reads the dispatch before it launches and denies it with the
   failing item named.

   Three checks, in order, first failure reported:

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

   EXEMPT: `subagent_type` Explore and Plan. Those are the parent's own
   reconnaissance (`routing` rule 5), not a dispatch to a persona — they carry
   no surface, no persona and no brief, so the three laws do not apply.

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
