#!/usr/bin/env node
/* SubagentStop — the primary half of "lanes are removed from the registry
   on completion or lane-sweep" (`progress-hooks` fix round, 2026-09-27).
   Fires in the PARENT session the moment a dispatched doer's own session
   ends — the exact moment its lane stops needing to be watched. Resolves
   the just-finished session's own progress path the same way
   `progress-floor.mjs` does (its own transcript, via the same
   `firstUserMessageText`/`resolveProgressPath` pair — reused here, not
   re-derived) and removes that one entry from the registry.

   Reviewer round 2 red finding, fixed: a `SubagentStop` hook's input carries
   TWO distinct transcript fields — `transcript_path` (the PARENT session's
   own transcript, the one that just received the completion event) and
   `agent_transcript_path` (the subagent's own transcript — the one that
   actually carries the finished lane's brief, `## Progress` path and all).
   Reading `transcript_path` here would read the wrong file — the parent's
   transcript never contains the doer's own first-user-message brief in the
   shape `firstUserMessageText`/`resolveProgressPath` expect. Must be
   `agent_transcript_path`.

   A lane the dispatch gate never registered (a `line` lane, or a dispatch
   this hook cannot resolve a path for) removes nothing — a no-op, not an
   error. `lane-sweep.mjs` is the backstop for a lane whose SubagentStop
   never fired at all (a crashed or force-stopped session) — see its own
   `--purge-stale-registry` mode. */
import { readFileSync, existsSync } from "node:fs";
import { loadRegistry, saveRegistry, removeLane } from "./progress-registry.mjs";
import { firstUserMessageText, resolveProgressPath, expandHome } from "./progress-floor.mjs";

function readHookInput() {
  try {
    return JSON.parse(readFileSync(0, "utf8") || "{}");
  } catch {
    return {};
  }
}

function main() {
  const input = readHookInput();
  const transcriptPath = input.agent_transcript_path;
  if (!transcriptPath || !existsSync(transcriptPath)) process.exit(0);

  let brief = "";
  try {
    brief = firstUserMessageText(readFileSync(transcriptPath, "utf8"));
  } catch {
    process.exit(0);
  }

  const rawPath = resolveProgressPath(brief);
  if (!rawPath) process.exit(0);

  try {
    const entries = loadRegistry();
    saveRegistry(removeLane(entries, expandHome(rawPath)));
  } catch {
    /* cleanup failure is never worse than a stale-but-harmless registry row */
  }
  process.exit(0);
}

if (process.argv[1] && process.argv[1].endsWith("progress-registry-cleanup.mjs")) main();
