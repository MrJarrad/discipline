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

   Known limitation, stated rather than hidden: `hooks.json` wiring is
   process-level, not session-role-scoped — the SAME PostToolUse `*` entry
   also fires inside a dispatched doer's own session (see
   `progress-floor.mjs`'s header for the same fact). Worst case, a doer's own
   session sees an accurate, harmless status line about OTHER lanes; this
   script never denies or alters any tool call, in either session. */
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

/* Pure: one pass over the registry. Returns { updatedEntries, messages }.
   `statLookup(path)` -> mtimeMs | null, injected so tests never touch real
   files. */
export function checkRegistry(entries, now, statLookup) {
  const messages = [];
  const updatedEntries = entries.map((entry) => {
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
  readHookInput(); // consumed for shape-parity with every other hook; unused otherwise
  const entries = loadRegistry();
  if (entries.length === 0) process.exit(0);

  const { updatedEntries, messages } = checkRegistry(entries, Date.now(), realStatLookup);
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
