#!/usr/bin/env node
/* setup-refresh-line — DISC-299 (s81). A cloud container is restored from an image built when the Default environment's setup
   script last changed (DISC-298), so its plugin is as old as that change. After each discipline release tag the release path
   bumps the script's first line, `# plugin refresh <date> (discipline <version>)`; any edit rebuilds the image on the next fresh
   session. The parent proposes the result to the operator (this script edits nothing).
   Usage: node setup-refresh-line.mjs --date YYYY-MM-DD [--release 1.200.0] [--line] < current-setup-script
   Prints the new script, or with --line only the first line to propose. Exit 0 · 2 bad date.                          */
import { readFileSync } from "node:fs";

const MARK = /^# plugin refresh \d{4}-\d{2}-\d{2}(?: \(discipline [\d.]+\))?$/;

export function bumpRefreshLine(script, date, release) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) throw new Error(`date must be YYYY-MM-DD, got ${date}`);
  const line = `# plugin refresh ${date}${release ? ` (discipline ${release})` : ""}`;
  const lines = String(script).split("\n");
  const rest = MARK.test(lines[0]) ? lines.slice(1) : lines;
  const out = [line, ...rest].join("\n");
  return { script: out, line: line + "\n", changed: out !== script };
}

function main() {
  const a = process.argv.slice(2);
  const get = (k) => { const i = a.indexOf(k); return i !== -1 ? a[i + 1] : undefined; };
  try {
    const r = bumpRefreshLine(readFileSync(0, "utf8"), get("--date"), get("--release"));
    process.stdout.write(a.includes("--line") ? r.line : r.script);
  } catch (e) { console.error(`setup-refresh-line: ${e.message}`); process.exit(2); }
}

if (process.argv[1]?.endsWith("setup-refresh-line.mjs")) main();
