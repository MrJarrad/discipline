#!/usr/bin/env node
/* PreToolUse (mcp__claude-code-remote__create_session; Figma has its own create_session) — s61 lesson 1: a create_session without permission_mode inherits the
   parent's mode; after plan mode that was ask-first, and eight helpers waited two hours on an approval nobody saw.
   Every helper names its mode (`cloud-dispatch/references/HELPER-SESSIONS.md` § 1). */
import { readFileSync } from "node:fs";

let input = {};
try { input = JSON.parse(readFileSync(0, "utf8")); } catch { /* unreadable: treated as missing */ }
if (!input?.tool_input?.permission_mode) {
  console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny",
    permissionDecisionReason: 'helper-create-gate: pass permission_mode: "auto" on every helper (s61: an inherited ask-first mode stalled eight helpers for two hours). If it refuses, this session is not in auto mode: say so to the operator.' } }));
}
