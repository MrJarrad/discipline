#!/usr/bin/env node
/* PreToolUse (mcp__github__create_or_update_file, mcp__github__push_files) — a vault update through the
   GitHub MCP sends the whole file (DISC-221, lesson 2026-10-31-s43 #6: a helper
   replaced a vault file with an 8-byte placeholder, then restored it).
   MrJarrad/jhd-vault only. An update (a `sha` is passed) is denied when
   `content` is under MIN_BYTES, or under half the size of the largest
   `get_file_contents` read of the same path in this session's transcript.
   A new file (no `sha`) and every other repo pass. Fails closed: unreadable
   input or a crash denies, naming why. push_files (s44 reviewer follow-up)
   carries no `sha`, so each file is checked against what this session read
   of the same path: denied when under half that size, or under MIN_BYTES
   when the path was read (an existing file). DISC-227 (#128 reviewer note 1):
   an unreadable transcript denies; a path the session never read is checked
   the same way against its size on the local vault clone's origin (the
   hook's cwd, `origin/<branch>` else `origin/main`), so an existing file is
   held to the floor. No vault clone at cwd, or the path on neither ref: a new
   file, which passes.                                                      */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

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

/* Bytes of `path` on the vault clone at `cwd` (origin/<branch>, else origin/main), or 0 when there is
   no vault clone there or the path is on neither ref. */
export function originSize(cwd, branch, path) {
  if (!cwd) return 0;
  const git = (...a) => execFileSync("git", ["-C", cwd, ...a], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  try { if (!/github\.com[/:]mrjarrad\/jhd-vault(\.git)?$/i.test(git("remote", "get-url", "origin"))) return 0; } catch { return 0; }
  const rel = String(path ?? "").replace(/^\/+/, "");
  for (const ref of [branch && `origin/${branch}`, "origin/main"].filter(Boolean)) {
    try { return Number(git("cat-file", "-s", `${ref}:${rel}`)) || 0; } catch {}
  }
  return 0;
}

function checkPushFiles(input, t) {
  let lines;
  try { lines = readFileSync(input.transcript_path, "utf8").split("\n"); }
  catch { deny("vault-mcp-write-guard: push_files to the vault, and this session's transcript could not be read to check it against what was read; denied for safety (DISC-227)."); }
  for (const f of Array.isArray(t.files) ? t.files : []) {
    const seen = largestRead(lines, { owner: t.owner, repo: t.repo, path: f.path });
    const read = seen || originSize(input.cwd, t.branch, f.path);
    if (!read) continue;
    const of = seen ? "this session read of it" : "it holds on the vault clone's origin";
    const bytes = Buffer.byteLength(String(f.content ?? ""));
    const where = `${f.path} on ${t.branch || "the default branch"}`;
    if (bytes < MIN_BYTES || bytes * 2 < read) deny(`vault-mcp-write-guard: push_files writes ${where} with ${bytes} bytes, against the ${read} bytes ${of} — push_files replaces the whole file (DISC-221). Send the full content.`);
  }
}

function check(input) {
  const t = input.tool_input || {};
  if (!/^mrjarrad$/i.test(String(t.owner)) || !/^jhd-vault$/i.test(String(t.repo))) return;
  if (/__push_files$/.test(input.tool_name || "")) return checkPushFiles(input, t);
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
