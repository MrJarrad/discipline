#!/usr/bin/env node
/* PreToolUse (mcp__claude-code-remote__create_session; Figma has its own create_session) — s61 lesson 1: a create_session without permission_mode inherits the
   parent's mode; after plan mode that was ask-first, and eight helpers waited two hours on an approval nobody saw.
   Every helper names its mode (`cloud-dispatch/references/HELPER-SESSIONS.md` § 1).
   s71 lesson 4: a brief went out with the token HOUSE_RULES where the block belongs. A prompt carrying that bare token is
   always refused; a prompt declaring `Size: component` or `Size: system` must carry the `## House rules` block
   (line-size and reviewer briefs do not carry it: a `Persona: reviewer` brief is skipped, since it may quote a lane's size).
   s83 lesson 5: reviewers copied the parent's id from ~/.claude/helper-session into their `reviewer:` line; a `Persona: reviewer` brief must name get_session. */
import { readFileSync } from "node:fs";

let input = {};
try { input = JSON.parse(readFileSync(0, "utf8")); } catch { /* unreadable: treated as missing */ }
const deny = (permissionDecisionReason) => console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason } }));
const prompt = typeof input?.tool_input?.prompt === "string" ? input.tool_input.prompt : "";
if (/\bHOUSE_RULES\b/.test(prompt)) {
  deny("helper-create-gate: the brief contains the bare token HOUSE_RULES, not the block (s71 lesson 4). Paste the house-rules block from skills/dispatch-brief/references/HOUSE-RULES.md verbatim, then create the session.");
} else if (/^\s*-?\s*\**Persona\**:\s*\**reviewer\b/im.test(prompt) && !/\bget_session\b/.test(prompt)) {
  deny("helper-create-gate: a reviewer brief names the reviewer's own session id source: `reviewer: session_<id>` with the id from the reviewer's own get_session, never the parent's id in ~/.claude/helper-session (s83 lesson 5).");
} else if (!/^\s*-?\s*\**Persona\**:\s*\**reviewer\b/im.test(prompt) && /^\s*-?\s*\**Size\**:\s*(component|system)\b/im.test(prompt) && !/^## House rules\s*$/m.test(prompt)) {
  deny("helper-create-gate: a component- or system-size brief must carry the `## House rules` block verbatim (skills/dispatch-brief/references/HOUSE-RULES.md); this one has none (s71 lesson 4).");
} else if (!input?.tool_input?.permission_mode) {
  console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny",
    permissionDecisionReason: 'helper-create-gate: pass permission_mode: "auto" on every helper (s61: an inherited ask-first mode stalled eight helpers for two hours). If it refuses, this session is not in auto mode: say so to the operator.' } }));
}
