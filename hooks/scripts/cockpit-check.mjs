#!/usr/bin/env node
/* cockpit-check — the cockpit stays a short start read (DISC-224; operator 2026-10-31:
   "is there anything we should disconnect or do to make session start less heavy on context?").
   On vault main the cockpit had grown to 19.5k chars: two wrap blocks, each reprinting
   every open queue row (14.7k of it). The queue files are the source of the rows and
   needed-from-you.mjs prints them; the cockpit carries paths and counts.

     node cockpit-check.mjs --vault <vault root>

   Fails (exit 1, one line per problem) when orchestrator/cockpit.md has more than one
   `## Wrapped` block (older wraps go to the cockpit archive), any queue row (a table
   row keyed `<PREFIX>-<n>`), a wrap block with no `Helpers:` line (the next start
   sweeps only those ids, routing HARD-RULES 19), or more than MAX_CHARS characters.
   Reads only; run at wrap (wrap CLOSING-CHECKS).                                     */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const MAX_CHARS = 6000;

export function checkCockpit(text) {
  const problems = [];
  const wraps = text.split("\n").filter((l) => /^## Wrapped\b/.test(l));
  if (wraps.length > 1) problems.push(`${wraps.length} \`## Wrapped\` blocks; keep the newest, move the rest to the cockpit archive`);
  for (const m of text.matchAll(/^\|\s*~*([A-Z]+-\d+)~*\s*\|/gm)) problems.push(`queue row ${m[1]}; the cockpit carries each project's queue path and open count, never rows`);
  if (wraps.length) {
    const block = text.slice(text.indexOf(wraps[0])).split(/\n## /)[0];
    if (!/^- Helpers:/m.test(block)) problems.push("the wrap block has no `- Helpers: <id>, …` line (routing HARD-RULES 19)");
  }
  if (text.length > MAX_CHARS) problems.push(`${text.length} chars; the cap is ${MAX_CHARS}`);
  return problems;
}

function main(argv) {
  const i = argv.indexOf("--vault");
  if (i < 0 || !argv[i + 1]) { console.error("usage: cockpit-check.mjs --vault <vault root>"); return 2; }
  const problems = checkCockpit(readFileSync(join(argv[i + 1], "orchestrator", "cockpit.md"), "utf8"));
  for (const p of problems) console.log(`cockpit-check: ${p}`);
  return problems.length ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exitCode = main(process.argv.slice(2));
