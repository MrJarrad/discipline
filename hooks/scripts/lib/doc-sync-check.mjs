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
/* DISC-327: the words of each command segment, quote-aware. A word is { t: its text with quotes removed, q: it carried a quote }; && || ; | & and a newline end a
   segment only outside quotes, so a separator or a --dry-run inside a quoted argument is text. */
export function shellSegments(command) {
  const segs = [], c = String(command);
  let words = [], cur = null, quote = null;
  const word = () => (cur ||= { t: "", q: false });
  const endWord = () => { if (cur) words.push(cur); cur = null; };
  const endSeg = () => { endWord(); if (words.length) segs.push(words); words = []; };
  for (let i = 0; i < c.length; i++) {
    const ch = c[i];
    if (quote) {
      if (ch === quote) quote = null;
      else if (ch === "\\" && quote === '"' && i + 1 < c.length) word().t += c[++i];
      else word().t += ch;
    } else if (ch === '"' || ch === "'") { word().q = true; quote = ch; }
    else if (ch === "\\" && i + 1 < c.length) word().t += c[++i];
    else if (ch === "\n" || ch === ";" || ch === "&" || ch === "|") endSeg();
    else if (/\s/.test(ch)) endWord();
    else word().t += ch;
  }
  endSeg();
  return segs;
}
/* what a segment runs: skip a leading ( or {, VAR=value words, and the wrappers timeout (its options and duration), command, exec, env, time, nice, nohup, sudo; then `node`, its flags, the script word */
const WRAPPERS = /^(?:command|exec|env|time|nice|nohup|sudo)$/;
function nodeInvocation(words) {
  let i = 0;
  const t = (k) => words[k]?.t;
  if (words[0] && !words[0].q) words = [{ ...words[0], t: words[0].t.replace(/^[({]+/, "") }, ...words.slice(1)].filter((w) => w.q || w.t);
  while (i < words.length) {
    if (!words[i].q && /^[A-Za-z_]\w*=/.test(t(i))) i++;
    else if (t(i) === "timeout") { i++; while (t(i)?.startsWith("-")) i += /^-[ks]$/.test(t(i)) ? 2 : 1; i++; }
    else if (WRAPPERS.test(t(i))) { i++; while (t(i)?.startsWith("-")) i++; }
    else break;
  }
  if (t(i) !== "node") return null;
  i++;
  while (t(i)?.startsWith("-")) i++;
  const m = /(?:^|\/)(row-add|lane-end|go-live-tick)\.mjs$/.exec(t(i) || "");
  return m ? { script: m[1], args: words.slice(i + 1) } : null;
}
const isFlag = (args, flag) => args.some((a) => !a.q && (a.t === flag || a.t.startsWith(`${flag}=`)));
export function stateChangeOf(name, input = {}) {
  if (name === "Bash") {
    /* only an actual `node … <script>` invocation counts, per command segment; a grep, sed, git diff or --dry-run flag that merely names the script does not */
    for (const seg of shellSegments(input.command)) {
      const run = nodeInvocation(seg);
      if (!run || isFlag(run.args, "--dry-run")) continue;
      if (run.script === "go-live-tick" && !isFlag(run.args, "--apply")) continue;
      return run.script;
    }
    return null;
  }
  if (name === "mcp__github__merge_pull_request") return "merge";
  if (/^(?:Write|Edit|MultiEdit|mcp__github__create_or_update_file)$/.test(name) && LIST_FILE.test(String(input.file_path || input.path || ""))) return "queue-or-backlog-edit";
  return null;
}
