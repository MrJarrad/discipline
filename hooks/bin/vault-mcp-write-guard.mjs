#!/usr/bin/env node
/* PreToolUse (mcp__github__create_or_update_file) — a vault update through the
   GitHub MCP sends the whole file (DISC-221, lesson 2026-10-31-s43 #6: a helper
   replaced a vault file with an 8-byte placeholder, then restored it).
   MrJarrad/jhd-vault only. An update (a `sha` is passed) is denied when
   `content` is under MIN_BYTES, or under half the size of the largest
   `get_file_contents` read of the same path in this session's transcript.
   A new file (no `sha`) and every other repo pass. Fails closed: unreadable
   input or a crash denies, naming why.                                     */
import { readFileSync } from "node:fs";

export const MIN_BYTES = 256;

function deny(reason) {
  console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } }));
  process.exit(0);
}

/* Largest get_file_contents result (bytes of its text) for owner/repo/path in the transcript, or 0. */
export function largestRead(lines, { owner, repo, path }) {
  const same = (a, b) => String(a ?? "").toLowerCase() === String(b ?? "").toLowerCase();
  const calls = new Set();
  let max = 0;
  for (const line of lines) {
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    const content = Array.isArray(e?.message?.content) ? e.message.content : [];
    for (const part of content) {
      if (part?.type === "tool_use" && /__get_file_contents$/.test(part.name || "")) {
        const i = part.input || {};
        if (same(i.owner, owner) && same(i.repo, repo) && String(i.path ?? "").replace(/^\/+/, "") === String(path ?? "").replace(/^\/+/, "")) calls.add(part.id);
      }
      if (part?.type === "tool_result" && calls.has(part.tool_use_id)) {
        const c = part.content;
        const text = typeof c === "string" ? c : Array.isArray(c) ? c.map((x) => (typeof x?.text === "string" ? x.text : "")).join("") : "";
        max = Math.max(max, Buffer.byteLength(text));
      }
    }
  }
  return max;
}

function check(input) {
  const t = input.tool_input || {};
  if (!/^mrjarrad$/i.test(String(t.owner)) || !/^jhd-vault$/i.test(String(t.repo))) return;
  if (!t.sha) return;
  const where = `${t.path} on ${t.branch || "the default branch"}`;
  const bytes = Buffer.byteLength(String(t.content ?? ""));
  if (bytes < MIN_BYTES) deny(`vault-mcp-write-guard: updating ${where} with ${bytes} bytes — an update sends the whole file, and under ${MIN_BYTES} bytes reads as a placeholder (DISC-221). Send the full content, or write on your own vault branch in a worktree with git.`);
  let lines = [];
  try { lines = readFileSync(input.transcript_path, "utf8").split("\n"); } catch {}
  const read = largestRead(lines, t);
  if (read && bytes * 2 < read) deny(`vault-mcp-write-guard: updating ${where} with ${bytes} bytes, under half the ${read} bytes this session read of it — an update replaces the whole file (DISC-221). Send the full content.`);
}

try {
  check(JSON.parse(readFileSync(0, "utf8")));
} catch (err) {
  deny(`vault-mcp-write-guard: could not check this write (${String(err?.message || err).split("\n")[0]}); denied for safety.`);
}
