#!/usr/bin/env node
/* PostToolUse (all tools) — the doer-side half of the progress-hooks ruling
   (`progress-hooks`, 2026-09-27, operator: "yes, steps plus the 10-minute
   floor"). doer-rules.md § You are the doer already asks every above-line
   doer to append a timestamped `step N of M — <name> — done | in progress:
   <what>` line to its progress file at each fixed milestone; nothing made
   that mechanical during the run itself — only `agent-dispatch-gate.mjs`
   checked, at dispatch, that the brief NAMED a progress path. A doer that
   goes silent mid-lane had nothing reminding it to write.

   This hook fires after every tool call inside the doer's own session (the
   same PreToolUse/PostToolUse events `commit-gate.mjs` and
   `typecheck-marker.mjs` already fire on for a dispatched doer's own Bash/
   Write/Edit calls — hooks are process-level, not scoped to "the main
   session only"). It resolves the lane's progress-file path from the
   session's own transcript (the first user message is the brief;
   `agent-dispatch-gate.mjs`'s `findProgressPath` already knows how to read
   one out of a `## Progress` section) and checks that file's mtime. Once the
   file is more than 10 minutes stale — or was never created at all, past 10
   minutes from dispatch — it injects a reminder via
   `hookSpecificOutput.additionalContext` (the same field SessionStart uses
   in `session-journal.mjs` to seed context; PostToolUse supports it too) —
   never a deny, since blocking the doer's actual work over a missing
   progress line would be worse than the silence it is meant to fix.

   No progress path resolved at all (a `Size: line` lane, the parent's own
   orchestrator session, or a brief this hook cannot parse) → allow silently,
   every time. Mechanical, no agent judgement (the lock's own words).

   Also fires the commit half of the same floor (`2026-09-29-wip-floor`
   lock, "extend the 10-min progress-floor hook"): once the brief's own
   `Repo`/`worktree` lines resolve to a lane worktree, `wip-floor.mjs`'s
   `wipReminderForWorktree` checks that worktree's own staleness the same
   way — folded into THIS hook's one spawn per tool call rather than a
   second process, and joined into the same `additionalContext` when both
   fire together.

   Usage: fires from hooks.json; also callable directly for a dry-run —
     node progress-floor.mjs < hook-input.json                              */
import { readFileSync, statSync, existsSync } from "node:fs";
import { findProgressPath, progressSectionText } from "./agent-dispatch-gate.mjs";
import { expandHome } from "./progress-registry.mjs";
import { resolveWorktreePath, wipReminderForWorktree } from "./wip-floor.mjs";

export const STALE_MS = 10 * 60 * 1000;

export { expandHome };

/* Read the transcript JSONL at `transcriptPath` and return the text of the
   FIRST user message that carries content — the brief. Stops as soon as it
   finds one; a doer's transcript can run long, and the brief is always near
   the top. Returns "" on anything unreadable (missing file, bad JSON, no
   user message yet) rather than throwing — this hook must never crash a
   doer's turn over a transcript it can't parse. */
export function firstUserMessageText(transcriptText) {
  for (const line of String(transcriptText).split("\n")) {
    if (!line.trim()) continue;
    let rec;
    try {
      rec = JSON.parse(line);
    } catch {
      continue;
    }
    if (rec?.type !== "user") continue;
    const content = rec?.message?.content;
    if (typeof content === "string" && content.trim()) return content;
    if (Array.isArray(content)) {
      const text = content
        .filter((b) => b?.type === "text" && typeof b.text === "string")
        .map((b) => b.text)
        .join("\n");
      if (text.trim()) return text;
    }
  }
  return "";
}

/* Resolve the lane's progress-file path from a brief's text, or null when
   the brief carries none (a `Size: line` lane, or no `## Progress` section
   at all). Reuses `agent-dispatch-gate.mjs`'s own path grammar rather than
   re-deriving it, so a brief the dispatch gate accepted is read the same way
   here. */
export function resolveProgressPath(briefText) {
  const section = progressSectionText(briefText);
  if (!section) return null;
  return findProgressPath(section);
}

/* The reminder text injected once the progress file is stale. `ageMinutes`
   is null when the file has never been written at all. */
export function reminderText(path, ageMinutes) {
  if (ageMinutes === null) {
    return (
      `Progress reminder: no progress file yet at ${path}. Write its first line now, ` +
      `stamping the dispatch time, then a line per step as you reach it — ` +
      `\`step N of M — <name> — done\` or \`step N of M — <name> — in progress: <what>\` ` +
      `(doer-rules.md § You are the doer).`
    );
  }
  return (
    `Progress reminder: ${path} has had no new line for over 10 minutes (last write ` +
    `${ageMinutes} min ago). Write \`still on step N of M — doing X\` before continuing ` +
    `(doer-rules.md § You are the doer, operator ruling 2026-09-27 "progress-hooks").`
  );
}

/* Pure decision: given whether the file exists and its age in ms (or null
   when it doesn't exist), return the reminder text to inject, or null when
   nothing is stale yet. `dispatchAgeMs` is the age of the SESSION (used as
   the clock when the file has never been created) — falls back to Infinity
   (always past the floor) when not provided, since a hook with no dispatch
   time to anchor to should still remind rather than stay silent forever. */
export function staleReminder(path, { fileExists, fileAgeMs, dispatchAgeMs = Infinity }) {
  if (fileExists) {
    if (fileAgeMs < STALE_MS) return null;
    return reminderText(path, Math.floor(fileAgeMs / 60000));
  }
  if (dispatchAgeMs < STALE_MS) return null;
  return reminderText(path, null);
}

function readHookInput() {
  try {
    return JSON.parse(readFileSync(0, "utf8") || "{}");
  } catch {
    return {};
  }
}

function main() {
  const input = readHookInput();
  const transcriptPath = input.transcript_path;
  if (!transcriptPath || !existsSync(transcriptPath)) process.exit(0);

  let brief = "";
  try {
    brief = firstUserMessageText(readFileSync(transcriptPath, "utf8"));
  } catch {
    process.exit(0);
  }

  const messages = [];

  const rawPath = resolveProgressPath(brief);
  if (rawPath) {
    const path = expandHome(rawPath);
    let fileExists = false;
    let fileAgeMs = 0;
    try {
      const st = statSync(path);
      fileExists = true;
      fileAgeMs = Date.now() - st.mtimeMs;
    } catch {
      fileExists = false;
    }

    // Falls back to the transcript file's own birth as a dispatch-time proxy
    // when the progress file has never been written — the transcript exists
    // from the session's first turn, so its mtime approximates dispatch time
    // closely enough for a 10-minute floor.
    let dispatchAgeMs = Infinity;
    try {
      const transcriptStat = statSync(transcriptPath);
      dispatchAgeMs = Date.now() - transcriptStat.birthtimeMs;
    } catch {
      /* leave at Infinity — remind rather than stay silent */
    }

    const progressMessage = staleReminder(path, { fileExists, fileAgeMs, dispatchAgeMs });
    if (progressMessage) messages.push(progressMessage);
  }

  const worktreePath = resolveWorktreePath(brief);
  if (worktreePath) {
    const wipMessage = wipReminderForWorktree(worktreePath);
    if (wipMessage) messages.push(wipMessage);
  }

  if (messages.length === 0) process.exit(0);

  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext: messages.join("\n\n"),
      },
    }),
  );
  process.exit(0);
}

if (process.argv[1] && process.argv[1].endsWith("progress-floor.mjs")) main();
