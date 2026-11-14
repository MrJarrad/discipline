/* doc-sync-check — DISC-309 + DISC-324 (operator s82 "why is this still apearing?", s87 "i need to you ensure the status doc is always
   up to date and need this to go across sessions"). Pure helpers for the Needed-from-you Stop hook; no I/O. */
const ID_RE = /(?<![A-Za-z0-9-])[A-Z]{2,4}-\d+[a-z]?(?![A-Za-z0-9-])/g;

/* DISC-309: row IDs a reply prints that were not added this turn. A row with no row-add marker this turn existed before it,
   so it already sits on the Status doc. A reply that prints no IDs prints none. */
export function reprintedIds(block, newIds) {
  const fresh = new Set(newIds);
  return [...new Set(String(block).match(ID_RE) || [])].filter((id) => !fresh.has(id));
}

/* DISC-324: the state changes one assistant tool call makes to what the operator sees (queue, backlog, merge state). Returns a label or null.
   Read-only calls, dry runs and unrelated edits are not state changes. */
const LIST_FILE = /(?:^|\/)projects\/[^/]+\/[^/]+-(?:queue|backlog)\.md$/;
export function stateChangeOf(name, input = {}) {
  if (name === "Bash") {
    const c = String(input.command || "");
    if (/row-add\.mjs/.test(c)) return "row-add";
    if (/lane-end\.mjs/.test(c)) return "lane-end";
    if (/go-live-tick\.mjs[^\n]*--apply/.test(c)) return "go-live-tick";
    return null;
  }
  if (name === "mcp__github__merge_pull_request") return "merge";
  if (/^(?:Write|Edit|MultiEdit|mcp__github__create_or_update_file)$/.test(name) && LIST_FILE.test(String(input.file_path || input.path || ""))) return "queue-or-backlog-edit";
  return null;
}
