#!/usr/bin/env node
/* SessionStart / SessionEnd — opens and flushes a journal entry marking
   session boundaries in the same file bin/journal-append.mjs writes to, so
   the journal is a readable timeline of a session's tool activity between
   its open/close markers.

   Usage: node session-journal.mjs open|close   (matcher/event passed via hook JSON) */
import { readFileSync, appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

function readHookInput() {
  try { return JSON.parse(readFileSync(0, "utf8") || "{}"); }
  catch { return {}; }
}

const mode = process.argv[2]; // "open" | "close"
const input = readHookInput();
const cwd = input.cwd || process.cwd();
const dir = join(cwd, ".claude");
mkdirSync(dir, { recursive: true });
const journalPath = join(dir, "flux-journal.jsonl");

const entry = {
  t: new Date().toISOString(),
  type: mode === "close" ? "session_end" : "session_start",
  source: input.source ?? input.reason ?? null,
  session_id: input.session_id ?? null,
};

appendFileSync(journalPath, JSON.stringify(entry) + "\n");

// SessionStart can seed additionalContext; keep it minimal and factual —
// just point at the journal so the run knows it's being tracked.
if (mode !== "close") {
  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: `Flux journal for this session: ${journalPath}`,
    },
  }));
}
process.exit(0);
