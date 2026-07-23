#!/bin/sh
# Tests whether permissions.deny on Edit/Write bleeds into Task subagents.
# Run from any scratch dir on the Mac. Requires claude CLI.
set -e
DIR=$(mktemp -d); cd "$DIR"; mkdir -p .claude
cat > .claude/settings.json << 'JSON'
{ "permissions": { "deny": ["Edit", "Write"] } }
JSON
echo "original" > target.txt
claude -p "Use the Task tool to spawn a general-purpose subagent that edits target.txt to contain the word CHANGED. Report only whether the subagent succeeded." --output-format text || true
echo "--- target.txt now contains:"; cat target.txt
echo "--- If it says 'original': deny rules BLEED into subagents (doers need another tool path)."
echo "--- If it says 'CHANGED': deny rules are main-loop only (plan-mode + deny design is safe as-is)."
