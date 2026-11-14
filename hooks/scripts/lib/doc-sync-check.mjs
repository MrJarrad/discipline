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
    /* only an actual `node … <script>` invocation counts, per command segment; a grep, sed, git diff or --dry-run that merely names the script does not */
    for (const seg of String(input.command || "").split(/&&|\|\||[;|\n]/)) {
      const m = /^\s*(?:[A-Za-z_]\w*=\S*\s+)*node\s+(?:-\S+\s+)*\S*?(row-add|lane-end|go-live-tick)\.mjs(?=\s|$)/.exec(seg);
      if (!m || /--dry-run\b/.test(seg)) continue;
      if (m[1] === "go-live-tick" && !/--apply\b/.test(seg)) continue;
      return m[1];
    }
    return null;
  }
  if (name === "mcp__github__merge_pull_request") return "merge";
  if (/^(?:Write|Edit|MultiEdit|mcp__github__create_or_update_file)$/.test(name) && LIST_FILE.test(String(input.file_path || input.path || ""))) return "queue-or-backlog-edit";
  return null;
}
