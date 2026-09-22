#!/usr/bin/env node
/* queue-write-check — verifies a queue-row edit actually landed on disk before
   the parent reports it "banked" (Change 6, 2026-09-22 lessons-for-1-92 ruling:
   rows 81-86 were reported banked after a concurrent session had already
   rewritten the queue file out from under them). Fails loud: non-zero exit,
   the row it could not find named — never a silent pass.

   Interface (deep module — small surface):
     rowWritten(fileText, rowText) -> boolean — exact-substring containment,
       whitespace-normalised so trailing-space/line-ending drift never
       produces a false negative.

   Usage (CLI): node queue-write-check.mjs <file> <row text>
   Exit 0 the row is present · 1 the row is absent (row named on stderr) ·
   2 usage error or an unreadable file.                                    */
import { existsSync, readFileSync } from "node:fs";

const normalise = (text) => String(text).replace(/\s+/g, " ").trim();

/* True when `rowText` appears in `fileText`, whitespace-normalised so a
   reformatted table (different column padding, a trailing space) still
   matches — this checks the row landed, not that it is byte-identical. */
export function rowWritten(fileText, rowText) {
  return normalise(fileText).includes(normalise(rowText));
}

function main() {
  const [, , file, ...rest] = process.argv;
  const rowText = rest.join(" ");

  if (!file || !rowText) {
    console.error("Usage: node queue-write-check.mjs <file> <row text>");
    process.exit(2);
  }
  if (!existsSync(file)) {
    console.error(`queue-write-check: cannot read ${file}`);
    process.exit(2);
  }

  const fileText = readFileSync(file, "utf8");
  if (rowWritten(fileText, rowText)) {
    process.exit(0);
  }
  console.error(`queue-write-check: row not found in ${file}:\n  ${rowText}`);
  process.exit(1);
}

// Only run when invoked as the CLI, never on import from the tests.
if (process.argv[1] && process.argv[1].endsWith("queue-write-check.mjs")) main();
