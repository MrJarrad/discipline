#!/usr/bin/env node
/* wrap-gate — a session does not wrap while its own projects' lists are stale (DISC-255, operator s58:
   "is the backlog list up to date? It seems to continuously not be"). Runs the list-drift check, keeps
   only the findings of the projects named by --projects (row-ID prefixes, like needed-from-you.mjs), and
   fails on (a) every failing finding and (b) every `named-by` line: an open row a merged PR names that
   nothing has closed or explained. Run it after `list-drift-check --fix`, which clears what needs no
   judgement; what is left needs a person: flip the row, or say why the PR did not finish it.

   Usage: node wrap-gate.mjs --vault <root> --projects PF,HB --repo <path>[,<path>]... (required)
   Exit 0 clean · 1 lines to resolve (printed) · 2 usage error or unknown prefix.                  */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkVault, formatFinding, FAILING } from "./list-drift-check.mjs";
import { discoverFiles } from "./lib/queue-ids.mjs";
import { resolveVaultRoot } from "./lib/vault-root.mjs";

export function wrapGate(vault, prefixes, repos = []) {
  const want = [...new Set(prefixes.map((p) => String(p).trim()).filter(Boolean))];
  if (!want.length) return { ok: false, reason: "name at least one project prefix (--projects PF,HB)" };
  // named-by reads the product repos' merged history; with no --repo it cannot run, and "clean" would be a false clear.
  if (!repos.length) return { ok: false, reason: "pass --repo <path> for each product repo this session touched (the vault itself if none): without their history the named-by check cannot run, so the gate will not report clean" };
  const reg = discoverFiles(vault);
  const unknown = want.filter((p) => !reg.byPrefix.has(p));
  if (unknown.length) return { ok: false, reason: `unknown project prefix: ${unknown.join(", ")} (known: ${[...reg.byPrefix.keys()].sort().join(", ")})` };
  const dirs = want.map((p) => `projects/${(reg.byPrefix.get(p).backlog || reg.byPrefix.get(p).queue).split("/")[1]}/`);
  const mine = (f) => dirs.some((d) => String(f.file || "").startsWith(d)) || want.some((p) => String(f.row || "").startsWith(`${p}-`));
  const lines = checkVault(vault, repos).filter((f) => mine(f) && (FAILING.has(f.kind) || f.kind === "named-by")).map(formatFinding);
  return { ok: lines.length === 0, lines };
}

function main(argv) {
  const get = (k) => { const i = argv.indexOf(k); return i === -1 ? undefined : argv[i + 1]; };
  const vault = get("--vault"), projects = get("--projects");
  if (!vault || !projects) { console.error("usage: wrap-gate --vault <root> --projects PF,HB --repo <path>[,<path>]... (--repo is required)"); return 2; }
  const repos = argv.flatMap((a, i) => (a === "--repo" ? String(argv[i + 1] || "").split(",").filter(Boolean).map((p) => resolve(p)) : []));
  const g = wrapGate(resolveVaultRoot(vault), projects.split(","), repos);
  if (g.reason) { console.error(`wrap-gate: ${g.reason}`); return 2; }
  if (g.ok) { console.log(`wrap-gate: clean for ${projects}`); return 0; }
  for (const l of g.lines) console.log(l);
  console.log(`wrap-gate: ${g.lines.length} line(s) for ${projects}. Do not wrap: flip each row (lane-end), or say why its PR did not finish it, then run again.`);
  return 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));
