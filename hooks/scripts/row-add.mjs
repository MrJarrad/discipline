#!/usr/bin/env node
/* row-add — add a row to a project's queue or backlog; the tool picks the
   number (backlog DISC-167). Nobody types a new number.

   Usage: node row-add.mjs --vault <root> --prefix PF --to backlog|queue \
            --text "<item or need>" [--raised YYYY-MM-DD]          (backlog)
            [--status "waiting on operator"]  (backlog; an idea is added so)
            [--where "<w>"] [--why "<y>"] [--recommended "<r>"]    (queue)
            [--offline]      skip the origin/main check (tests, no network)
   Prints the new ID (e.g. PF-682) on stdout. Exit 0 added · 1 refused (the
   reason is on stderr) · 2 usage error. Warnings (origin unreachable) go to
   stderr and do not fail the call.

   The number is one above every number used in the project's queue AND backlog,
   local and origin/main (lib/row-alloc.mjs). After the write the project's two
   files are re-read and the call fails if the new ID is not present exactly
   once across both.                                                         */
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { addRow } from "./list-drift-check.mjs";
import { discoverFiles, tableRows } from "./lib/queue-ids.mjs";
import { highestUsed, remoteTexts, withVaultLock } from "./lib/row-alloc.mjs";
import { RELEASE_REFUSAL, isReleaseOnlyAsk } from "./lib/release-only-ask.mjs";
import { writeMarker } from "./lib/row-marker.mjs";

/* Write via a sibling temp file + rename so a reader never sees a truncated file. */
const writeAtomic = (path, text) => { const tmp = `${path}.${process.pid}.tmp`; writeFileSync(tmp, text); renameSync(tmp, path); };
const clean = (s) => String(s ?? "").replace(/\r?\n/g, " ").trim();

/* Append a queue row to the last line of the file's first table. */
export function addQueueRow(text, prefix, n, cells) {
  const lines = String(text).split("\n");
  const h = lines.findIndex((l) => /^\|\s*#\s*\|/.test(l));
  if (h === -1) return { ok: false, reason: "no `| # | … |` table in the queue to add the row to" };
  let at = h + 1;
  while (at + 1 < lines.length && lines[at + 1].startsWith("|")) at++;
  const width = lines[h].split("|").length - 2;
  const row = [`${prefix}-${n}`, ...cells].slice(0, width);
  while (row.length < width) row.push("");
  lines.splice(at + 1, 0, `| ${row.join(" | ")} |`);
  const nf = lines.findIndex((l) => /^\*\*Next free number: \d+/.test(l));
  if (nf !== -1) lines[nf] = lines[nf].replace(/Next free number: \d+[^*]*/, `Next free number: ${n + 1}`);
  return { ok: true, text: lines.join("\n") };
}

export function rowAdd({ vault, prefix, to, text, raised, where, why, recommended, offline, status }) {
  const warnings = [];
  const fail = (reason) => ({ ok: false, reason, warnings });
  if (!/^[A-Z]{2,4}$/.test(String(prefix || ""))) return fail(`--prefix must be a project prefix like PF, got "${prefix ?? ""}"`);
  if (to !== "queue" && to !== "backlog") return fail("--to must be queue or backlog");
  if (!clean(text)) return fail("--text is required");
  if (status !== undefined && (to !== "backlog" || !["open", "waiting on operator"].includes(status))) return fail("--status applies to a backlog row and is `open` or `waiting on operator` (an idea is `waiting on operator`)");
  // DISC-178: an ask the operator can act on is a row; "release?" is not (ruling 2026-10-15-release-follows-merge).
  if ((to === "queue" || status === "waiting on operator") && isReleaseOnlyAsk(clean(text), [where, why, recommended].map(clean).join(" "))) return fail(`release-only ask refused — ${RELEASE_REFUSAL}`);
  if (/\|/.test(clean(text) + clean(where) + clean(why) + clean(recommended))) return fail("cell text must not contain | (it would split the row)");
  return withVaultLock(vault, () => {
    // Resolved inside the lock: a concurrent writer's file is never read half-written.
    const owner = discoverFiles(vault).byPrefix.get(prefix);
    if (!owner) return fail(`no project queue declares prefix ${prefix} (frontmatter \`prefix:\` in projects/<p>/<p>-queue.md)`);
    const rels = [owner.queue, owner.backlog].filter(Boolean);
    const target = owner[to];
    if (!target) return fail(`${prefix} has no ${to} file`);
    const local = rels.map((r) => readFileSync(join(vault, r), "utf8"));
    const remote = offline ? { texts: [], warnings: ["--offline: origin/main not checked"] } : remoteTexts(vault, rels);
    warnings.push(...remote.warnings);
    const floor = highestUsed([...local, ...remote.texts]);
    const path = join(vault, target);
    const before = readFileSync(path, "utf8");
    let edit;
    if (to === "backlog") {
      edit = addRow(before, clean(text), clean(raised) || new Date().toISOString().slice(0, 10), { floor, status: status || "open" });
    } else {
      edit = addQueueRow(before, prefix, floor + 1, [clean(text), clean(where), clean(why), clean(recommended)]);
      if (edit.ok) edit.id = `${prefix}-${floor + 1}`;
    }
    if (!edit.ok) return fail(edit.reason);
    writeAtomic(path, edit.text);
    // Verify: the new ID is present exactly once across the project's two files.
    const seen = rels.flatMap((r) => tableRows(readFileSync(join(vault, r), "utf8"))).filter((r) => r.id === edit.id).length;
    if (seen !== 1) {
      writeAtomic(path, before);
      return fail(`${edit.id} would appear ${seen} times across ${rels.join(" and ")}; the write was rolled back`);
    }
    return { ok: true, id: edit.id, file: target, warnings };
  });
}

function main() {
  const argv = process.argv.slice(2);
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) { console.error(`row-add: unexpected argument "${argv[i]}"`); process.exit(2); }
    const k = argv[i].slice(2);
    a[k] = k === "offline" ? true : argv[++i];
  }
  if (!a.vault || !a.prefix || !a.to || !a.text) {
    console.error("usage: row-add --vault <root> --prefix PF --to backlog|queue --text \"…\" [--raised d] [--status \"waiting on operator\"] [--where w --why y --recommended r] [--offline]");
    process.exit(2);
  }
  const res = rowAdd({ vault: resolve(a.vault), prefix: a.prefix, to: a.to, text: a.text, raised: a.raised, where: a.where, why: a.why, recommended: a.recommended, status: a.status, offline: Boolean(a.offline) });
  for (const w of res.warnings || []) console.error(`row-add: warning — ${w}`);
  if (!res.ok) { console.error(`row-add: refused — ${res.reason}`); process.exit(1); }
  // DISC-179(1): tell the Stop hook a new ask was raised this turn.
  try { writeMarker(resolve(a.vault), { prefix: a.prefix, id: res.id, to: a.to }); } catch { /* the marker is a nudge, never a failure */ }
  console.log(res.id);
}

if (process.argv[1] && process.argv[1].endsWith("row-add.mjs")) main();
