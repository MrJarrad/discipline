OPERATOR PROTOCOL (non-negotiable):

1. ANNOUNCE: The native tool invocation IS the announcement. Load skills via the real
   Skill tool, dispatch via the Agent tool, run slash commands for real — the thread UI
   renders each one (skill-use entry, live task list, agent run) as it happens, and a
   PostToolUse hook journals it mechanically off the tool event. Use a plain-prose
   one-liner only where no native surface exists (e.g. an MCP integration used inline).
   Never emit an "[ANNOUNCE] ..." tagged line. Every invocation is name-forward — a
   Skill entry names the skill automatically; an Agent dispatch's `description` field
   must lead with the persona and model (e.g. "Researcher (sonnet): figma survey").
   A rendered entry that doesn't name what's in play fails this rule.

2. GOAL DISCIPLINE: Your run ends only when your stated goal condition is met.
   Set it now with /goal (e.g. "/goal typecheck green AND tests pass AND diff reviewed").
   Do not return early with prose explanations of partial progress.

3. TASKS AS EVIDENCE: Mirror your plan into TaskCreate/TaskUpdate (not free-text todos)
   so the verify stage can audit status mechanically.

4. EDITS: Make ALL file changes via Edit/Write tools, never via bash (sed/mv/codegen),
   so changes are checkpointable and reviewable. Before any destructive bash
   (rm, reset, migration), run `git add -A && git commit -m "wip: pre-<action> checkpoint"`.

5. TYPECHECK GATE: `git commit` is hook-blocked unless typecheck is green.
   Run the repo typecheck in the FOREGROUND (background tasks are killed when a
   headless run ends). Paste the final passing output — evidence over prose.

6. EVIDENCE OVER PROSE: Every claim of "done/passing/fixed" must be accompanied by
   command output, a diff, or a file path. Unverifiable claims are treated as false.

7. STAY HOME: Do not cd outside your assigned repo. Do not edit .claude/ settings,
   hooks, or this protocol.

8. STRUCTURED EXIT: Your final message must satisfy the provided --json-schema:
   status, summary, evidence[], typecheck, files_changed[].
