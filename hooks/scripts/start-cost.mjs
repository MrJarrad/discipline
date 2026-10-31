#!/usr/bin/env node
/* start-cost — what a session start put in context, read from its transcript (DISC-224).
   Operator 2026-10-31: "maybe 17-22%ish out the gate on a fresh session start is ok, i'm not
   sure what good looks like here". s44 measured ~176.7k chars of tool results before its
   first status reply; this makes that number repeatable after each change.

     node start-cost.mjs <transcript.jsonl> [--max <chars>] [--json]

   Counts every tool result up to the first assistant text carrying `## Needed from you`
   (the first status reply), grouped by tool (`pull_request_read` split by method),
   largest first, plus user and assistant text in the same span. `--max` exits 1 when
   tool results in that span exceed it. Reads only.                                     */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const STATUS = /^## Needed from you\b/m;
const textOf = (c) => (Array.isArray(c) ? c.map((p) => (typeof p === "string" ? p : p?.text || "")).join("") : String(c ?? ""));

export function startCost(lines) {
  const calls = new Map(), groups = new Map();
  const out = { reachedStatus: false, toolResultChars: 0, userTextChars: 0, assistantTextChars: 0, byTool: [] };
  for (const line of lines) {
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    const content = e?.message?.content;
    if (typeof content === "string") { if (e.type === "user") out.userTextChars += content.length; continue; }
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (part?.type === "tool_use") {
        const short = String(part.name || "").replace(/^mcp__[^_]+(?:_[^_]+)*?__/, "").replace(/^.*__/, "");
        calls.set(part.id, part.input?.method ? `${short} ${part.input.method}` : short);
      } else if (part?.type === "tool_result") {
        const tool = calls.get(part.tool_use_id) || "unknown", chars = textOf(part.content).length;
        out.toolResultChars += chars;
        groups.set(tool, (groups.get(tool) || 0) + chars);
      } else if (part?.type === "text") {
        if (e.type === "assistant") out.assistantTextChars += part.text.length; else out.userTextChars += part.text.length;
        if (e.type === "assistant" && STATUS.test(part.text)) out.reachedStatus = true;
      }
    }
    if (out.reachedStatus) break;
  }
  out.byTool = [...groups].map(([tool, chars]) => ({ tool, chars })).sort((a, b) => b.chars - a.chars);
  return out;
}

function main(argv) {
  const path = argv.find((a) => !a.startsWith("--") && argv[argv.indexOf(a) - 1] !== "--max");
  const mi = argv.indexOf("--max"), max = mi >= 0 ? Number(argv[mi + 1]) : null;
  if (!path || (mi >= 0 && !Number.isFinite(max))) { console.error("usage: start-cost.mjs <transcript.jsonl> [--max <chars>] [--json]"); return 2; }
  const r = startCost(readFileSync(path, "utf8").split("\n"));
  if (argv.includes("--json")) console.log(JSON.stringify(r));
  else {
    console.log(`${r.reachedStatus ? "through the first status reply" : "no status reply found; whole transcript"}: ${r.toolResultChars} chars of tool results, ${r.userTextChars} user text, ${r.assistantTextChars} assistant text`);
    for (const x of r.byTool) console.log(`  ${String(x.chars).padStart(8)}  ${x.tool}`);
  }
  if (max !== null && r.toolResultChars > max) {
    console.log(`start-cost: ${r.toolResultChars} chars of tool results before the first status reply; the budget is ${max}`);
    return 1;
  }
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exitCode = main(process.argv.slice(2));
