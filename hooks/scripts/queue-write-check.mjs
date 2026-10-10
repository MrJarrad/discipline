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

     isStruckRow(line) -> boolean — the row's first cell after its number
       starts with `~~`; lane-end's replaceRow refuses to overwrite one.

     duplicateRowNumbers(fileText) -> [{section, number}] — row numbers used
       twice inside one `## ` table, minus the named GRANDFATHERED historic
       double-numbered struck rows (renumbering them would break references).

   Usage (CLI): node queue-write-check.mjs <file> <row text>
                node queue-write-check.mjs --lint <file>
   Exit 0 the row is present / the lint is clean · 1 the row is absent (row
   named on stderr) / a duplicate number (named on stderr) · 2 usage error or
   an unreadable file.                                                     */
import { existsSync, readFileSync } from "node:fs";

const normalise = (text) => String(text).replace(/\s+/g, " ").trim();

/* True when `rowText` appears in `fileText`, whitespace-normalised so a
   reformatted table (different column padding, a trailing space) still
   matches — this checks the row landed, not that it is byte-identical. */
export function rowWritten(fileText, rowText) {
  return normalise(fileText).includes(normalise(rowText));
}

/* True when a queue row line is already struck: the first cell after the row
   number starts with `~~` (table, bullet or "Row N" form). A struck row is
   history; a write must never replace it (session-19 lesson, backlog 162). */
export function isStruckRow(line) {
  return /^\s*(?:\|\s*|-\s*\[?\s*(?:Row\s*)?)\d+[a-z]?\s*(?:\|\s*|[.)\]]\s*)~~/i.test(String(line));
}

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => String(a + i));

/* Historic double-numbered rows — two runs numbered the same rows; all are
   struck. Named per section; any number not listed here fails the lint. */
export const GRANDFATHERED = {
  "Cloud setup": range(302, 334),
  Hoverboard: range(33, 44),
};

/* Row numbers repeated within one `## ` section's table. */
export function duplicateRowNumbers(fileText) {
  const seen = new Set();
  const dups = [];
  let section = "";
  for (const line of String(fileText).split(/\r?\n/)) {
    const h = /^##\s+(.+?)\s*$/.exec(line);
    if (h) { section = h[1]; continue; }
    const m = /^\|\s*(\d+[a-z]?)\s*\|/.exec(line);
    if (!m) continue;
    const key = `${section}\u0000${m[1]}`;
    if (seen.has(key)) {
      if (!(GRANDFATHERED[section] || []).includes(m[1]) && !dups.some((d) => d.section === section && d.number === m[1])) {
        dups.push({ section, number: m[1] });
      }
    }
    seen.add(key);
  }
  return dups;
}

function lint(file) {
  if (!file || !existsSync(file)) {
    console.error(`queue-write-check: cannot read ${file}`);
    process.exit(2);
  }
  const dups = duplicateRowNumbers(readFileSync(file, "utf8"));
  if (!dups.length) process.exit(0);
  for (const d of dups) console.error(`queue-write-check: duplicate row number ${d.number} in "${d.section}"`);
  process.exit(1);
}

function main() {
  if (process.argv[2] === "--lint") lint(process.argv[3]);
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
