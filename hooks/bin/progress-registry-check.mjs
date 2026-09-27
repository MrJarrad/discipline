#!/usr/bin/env node
/* The parent-side half of `progress-hooks`, fix round (2026-09-27,
   coordinator: "progress-watch.mjs only runs if the parent remembers to
   start it, which is the exact failure the operator saw. Make it need no
   memory."). Needs no separate "start a watcher" step: every lane a
   dispatch actually starts is already in the registry
   (`agent-dispatch-gate.mjs`'s `registerLaneFromPrompt`, written the same
   tool call that allows the dispatch), and this script is the READ side —
   it runs itself, driven by ordinary hook events the parent session already
   fires, not by anything the parent has to remember.

   Wired twice in hooks.json, same script, a CLI arg naming which event
   invoked it (the `session-journal.mjs open|close` pattern already used in
   this plugin, since hook input carries no field this script can trust to
   self-identify its own event):
     - UserPromptSubmit — every operator message (including "eta?") gets an
       up-to-date lane status folded into context, mechanically, not because
       anyone asked for one.
     - PostToolUse (matcher `*`) — the same tool-call cadence
       `progress-floor.mjs` already rides, so a lane crossing 15 or 30
       minutes silent is caught within one tool call of the threshold, not
       only when the operator happens to type something.

   For each registered lane: read its progress file's mtime (or its
   dispatchedAt when the file was never created), run it through
   `progress-watch.mjs`'s own `tick()`/`nextTier()` — the identical tier
   state machine `progress-watch.mjs` already uses for its own optional
   standalone mode, not re-derived here — and persist the updated
   lastMtime/fired state back to the registry so a tier fires exactly once
   per silence, never once per tool call. Only lanes with something newly
   due produce output; an empty or all-fresh registry is silent, every time.

   Reviewer round 2 red, fixed: `hooks.json` wiring is process-level, not
   session-role-scoped — the SAME `PostToolUse *`/`UserPromptSubmit` entries
   also fire inside a dispatched DOER's own session (see `progress-floor.mjs`
   for the same fact about its own wiring). Before this fix, ANY session
   running this script read the WHOLE registry, leaking status lines about
   the parent's other lanes into a doer's own context. Fixed by keying every
   registry row with the dispatching session's own `session_id`
   (`agent-dispatch-gate.mjs`'s `registerLaneFromPrompt`) and filtering here
   to rows whose `sessionId` matches THIS invocation's own `input.session_id`
   — a doer session's `session_id` is never the parent's, so it matches
   nothing and reports nothing; an entry with no recorded session id
   (`sessionId: null`, or a registry row pre-dating this fix) also never
   matches a real session id, so an unidentifiable row fails closed to
   silence rather than leaking. Non-matching rows are left byte-for-byte
   untouched in the registry — their tier/mtime state advances only when the
   session that actually owns them polls. */
import { existsSync, statSync, readFileSync } from "node:fs";
import { loadRegistry, saveRegistry } from "./progress-registry.mjs";
import { tick, tierMessage } from "../scripts/progress-watch.mjs";

function readHookInput() {
  try {
    return JSON.parse(readFileSync(0, "utf8") || "{}");
  } catch {
    return {};
  }
}

/* Pure: one pass over the registry, scoped to `sessionId`. Returns
   { updatedEntries, messages }. `statLookup(path)` -> mtimeMs | null,
   injected so tests never touch real files. A row whose `sessionId` does not
   strictly equal `sessionId` (including a row with none recorded, or an
   invocation with no `sessionId` of its own) is passed through unchanged and
   never reported — the cross-session leak fix. */
export function checkRegistry(entries, now, statLookup, sessionId) {
  const messages = [];
  const updatedEntries = entries.map((entry) => {
    if (entry.sessionId !== sessionId) return entry;
    const mtime = statLookup(entry.path) ?? entry.dispatchedAt;
    const state = { lastMtime: entry.lastMtime ?? null, fired: new Set(entry.fired || []) };
    const result = tick(state, { mtime, now });
    if (result.tier) messages.push(tierMessage(result.tier, entry.path));
    return { ...entry, lastMtime: result.state.lastMtime, fired: [...result.state.fired] };
  });
  return { updatedEntries, messages };
}

function realStatLookup(path) {
  try {
    return existsSync(path) ? statSync(path).mtimeMs : null;
  } catch {
    return null;
  }
}

function main() {
  const eventArg = process.argv[2] || "PostToolUse";
  const input = readHookInput();
  const entries = loadRegistry();
  if (entries.length === 0) process.exit(0);

  const { updatedEntries, messages } = checkRegistry(entries, Date.now(), realStatLookup, input.session_id ?? null);
  try {
    saveRegistry(updatedEntries);
  } catch {
    /* persistence failure never blocks the parent's turn */
  }
  if (messages.length === 0) process.exit(0);

  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: eventArg,
        additionalContext: messages.join("\n"),
      },
    }),
  );
  process.exit(0);
}

if (process.argv[1] && process.argv[1].endsWith("progress-registry-check.mjs")) main();
