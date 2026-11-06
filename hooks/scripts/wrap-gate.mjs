#!/usr/bin/env node
/* wrap-gate — a session does not wrap while its own projects' lists are stale (DISC-255, operator s58:
   "is the backlog list up to date? It seems to continuously not be"). Runs the list-drift check, keeps
   only the findings of the projects named by --projects (row-ID prefixes, like needed-from-you.mjs), and
   fails on (a) every failing finding and (b) every `named-by` line: an open row a merged PR names that
   nothing has closed or explained. Run it after `list-drift-check --fix`, which clears what needs no
   judgement; what is left needs a person: flip the row, or say why the PR did not finish it.

   Usage: node wrap-gate.mjs --vault <root> --projects PF,HB (--repo <path>[,<path>]... | --vault-only)
   Exit 0 clean · 1 lines to resolve (printed) · 2 usage error or unknown prefix.                  */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { checkVault, formatFinding, FAILING, repoHasPrHistory } from "./list-drift-check.mjs";
import { discoverFiles } from "./lib/queue-ids.mjs";
import { resolveVaultRoot } from "./lib/vault-root.mjs";

/* `git rev-parse --is-shallow-repository` is "true" for a depth-limited clone (the cloud default). */
function isShallow(path) {
  try { return execFileSync("git", ["-C", path, "rev-parse", "--is-shallow-repository"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() === "true"; } catch { return false; }
}

export function wrapGate(vault, prefixes, repos = [], { vaultOnly = false } = {}) {
  const want = [...new Set(prefixes.map((p) => String(p).trim()).filter(Boolean))];
  if (!want.length) return { ok: false, reason: "name at least one project prefix (--projects PF,HB)" };
  // named-by reads the product repos' merged history. With no usable --repo it cannot run, and "clean" would be a
  // false clear (#146 review): every --repo must exist, be a git repo with merged-PR history, and not be the vault
  // itself unless the session's projects are vault-only (--vault-only, which then reads the vault's own history).
  if (vaultOnly && !repos.length) repos = [vault];
  if (!repos.length) return { ok: false, reason: "pass --repo <path> for each product repo this session touched, or --vault-only when its projects live only in the vault: without merged-PR history the named-by check cannot run, so the gate will not report clean" };
  for (const r of repos) {
    if (!existsSync(r)) return { ok: false, reason: `--repo ${r} does not exist` };
    if (resolve(r) === resolve(vault) && !vaultOnly) return { ok: false, reason: `--repo ${r} is the vault itself, which cannot stand in for a product repo (use --vault-only if this session's projects live only in the vault)` };
    if (isShallow(r)) return { ok: false, reason: `--repo ${r} is a shallow clone: it holds only the newest commits, so named-by would miss older merged PRs and report clean wrongly. Fetch history first, e.g. git fetch --depth=1000 (run inside ${r})` };
    if (!repoHasPrHistory(r)) return { ok: false, reason: `--repo ${r} is not a git repo, or has no merged-PR history to read (named-by would never fire)` };
  }
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
  if (!vault || !projects) { console.error("usage: wrap-gate --vault <root> --projects PF,HB (--repo <path>[,<path>]... | --vault-only)"); return 2; }
  const repos = argv.flatMap((a, i) => (a === "--repo" ? String(argv[i + 1] || "").split(",").filter(Boolean).map((p) => resolve(p)) : []));
  const g = wrapGate(resolveVaultRoot(vault), projects.split(","), repos, { vaultOnly: argv.includes("--vault-only") });
  if (g.reason) { console.error(`wrap-gate: ${g.reason}`); return 2; }
  if (g.ok) { console.log(`wrap-gate: clean for ${projects}`); return 0; }
  for (const l of g.lines) console.log(l);
  console.log(`wrap-gate: ${g.lines.length} line(s) for ${projects}. Do not wrap: flip each row (lane-end), or say why its PR did not finish it, then run again.`);
  return 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));
