#!/usr/bin/env node
/* archive-prep — DISC-325 (operator s87: "archiving sessions could happen as they're completed"). The archive guard needs, per
   helper, an open-PR lookup of its session id and of each branch get_session shows. This runs them in one call and prints the
   raw search results as one JSON object, which the guard reads from the transcript as a lookup (archive-guard.mjs, PREP_CMD).
   It archives nothing (archive_session is an MCP call a script cannot make) and exits 1 unless every lookup came back
   readable, untruncated and empty.
     node archive-prep.mjs --session <id> [--branches a,b] [--created YYYY-MM-DD]   run AFTER get_session <id>; the branches and the
     created_at date come from it (--created narrows the all-open listing a default-branch helper needs; DISC-335)   */
import { execFileSync } from "node:child_process";
import { listed, prName, isOurs, specificBranches } from "../bin/archive-guard.mjs";

export const ALL_OPEN = "is:pr is:open user:MrJarrad";
/* DISC-335 (review of #223, RED 1): a helper whose branches are all generic has no head: lookup, and a PR body search cannot see a
   markdown-link body, so it also gets the listing of every open PR of ours; the guard matches that listing against the helper. */
export const queriesFor = (id, branches = [], created = "") => [`is:pr is:open user:MrJarrad ${id}`, ...specificBranches(branches).map((b) => `is:pr is:open user:MrJarrad head:${b}`),
  ...(branches.length && !specificBranches(branches).length ? [created ? `${ALL_OPEN} created:>=${created}` : ALL_OPEN] : [])];

/** search(query) -> the parsed search object (it may throw). Returns { ok, open, lookups: [{ query, result }] }. */
export function prep(id, branches, search, created = "") {
  const lookups = [], open = new Set();
  let ok = true;
  for (const query of queriesFor(id, branches, created)) {
    let result = null;
    try { result = search(query); } catch (err) { result = { error: String(err.message || err) }; }
    lookups.push({ query, result });
    const prs = listed(JSON.stringify(result));
    if (!prs) { ok = false; continue; }
    if (query === ALL_OPEN || /^is:pr is:open user:MrJarrad created:>=\d{4}-\d{2}-\d{2}$/.test(query)) continue; /* read for completeness only; the guard names the PRs that concern this helper */
    for (const p of prs) if (isOurs(p) && String(p?.state ?? "open").toLowerCase() === "open") open.add(prName(p));
  }
  return { ok: ok && open.size === 0, session: id, branches, open: [...open], lookups };
}

const gh = (query) => JSON.parse(execFileSync("gh", ["api", "-X", "GET", "search/issues", "-f", `q=${query}`, "-f", "per_page=100"], { encoding: "utf8" }));

function main() {
  const a = process.argv.slice(2), at = (f) => (a.includes(f) ? a[a.indexOf(f) + 1] : undefined);
  const id = at("--session"), branches = (at("--branches") || "").split(",").filter(Boolean);
  if (!id || [id, ...branches].some((x) => /\s/.test(x))) { console.error("usage: archive-prep.mjs --session <id> [--branches a,b] [--created YYYY-MM-DD]"); process.exit(2); }
  const r = prep(id, branches, gh, at("--created") || "");
  console.log(JSON.stringify(r));
  if (!r.ok) { console.error(`archive-prep: ${id} is not clear to archive${r.open.length ? ` — open PR(s) ${r.open.join(", ")}` : " — a lookup was unreadable or truncated"}`); process.exit(1); }
}
if (process.argv[1]?.endsWith("archive-prep.mjs")) main();
