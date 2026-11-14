#!/usr/bin/env node
/* archive-prep — DISC-325 (operator s87: "archiving sessions could happen as they're completed"). The archive guard needs, per
   helper, an open-PR lookup of its session id and of each branch get_session shows. This runs them in one call and prints the
   raw search results as one JSON object, which the guard reads from the transcript as a lookup (archive-guard.mjs, PREP_CMD).
   It archives nothing (archive_session is an MCP call a script cannot make) and exits 1 unless every lookup came back
   readable, untruncated and empty.
     node archive-prep.mjs --session <id> [--branches a,b]      run AFTER get_session <id>; the branches come from it   */
import { execFileSync } from "node:child_process";
import { listed, prName } from "../bin/archive-guard.mjs";

export const queriesFor = (id, branches = []) => [`is:pr is:open ${id}`, ...branches.map((b) => `is:pr is:open head:${b}`)];

/** search(query) -> the parsed search object (it may throw). Returns { ok, open, lookups: [{ query, result }] }. */
export function prep(id, branches, search) {
  const lookups = [], open = new Set();
  let ok = true;
  for (const query of queriesFor(id, branches)) {
    let result = null;
    try { result = search(query); } catch (err) { result = { error: String(err.message || err) }; }
    lookups.push({ query, result });
    const prs = listed(JSON.stringify(result));
    if (!prs) { ok = false; continue; }
    for (const p of prs) if (String(p?.state ?? "open").toLowerCase() === "open") open.add(prName(p));
  }
  return { ok: ok && open.size === 0, session: id, branches, open: [...open], lookups };
}

const gh = (query) => JSON.parse(execFileSync("gh", ["api", "-X", "GET", "search/issues", "-f", `q=${query}`], { encoding: "utf8" }));

function main() {
  const a = process.argv.slice(2), at = (f) => (a.includes(f) ? a[a.indexOf(f) + 1] : undefined);
  const id = at("--session"), branches = (at("--branches") || "").split(",").filter(Boolean);
  if (!id || [id, ...branches].some((x) => /\s/.test(x))) { console.error("usage: archive-prep.mjs --session <id> [--branches a,b]"); process.exit(2); }
  const r = prep(id, branches, gh);
  console.log(JSON.stringify(r));
  if (!r.ok) { console.error(`archive-prep: ${id} is not clear to archive${r.open.length ? ` — open PR(s) ${r.open.join(", ")}` : " — a lookup was unreadable or truncated"}`); process.exit(1); }
}
if (process.argv[1]?.endsWith("archive-prep.mjs")) main();
