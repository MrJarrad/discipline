# Product workspace — JHD discipline (Cloud-portable)

This repo carries **always-on discipline rules** under `.cursor/rules/` so Cloud Agents
get invariants / routing / operator voice **without** the Mac home plugin.

## Required for full discipline on Cloud
1. Cursor Environment includes **this product repo** AND `MrJarrad/jhd-cursor-discipline`
   (skills, agents, commands live in the discipline repo / plugin).
2. Start the Cloud Agent **from this product repo** (not from discipline alone).
3. If `~/JHD/vault` is missing, say so and use in-repo docs only — do not invent HANDOVER.

## Local Mac
Prefer the `jhd-discipline` plugin (`~/JHD/cursor-discipline` → `~/.cursor/plugins/local/`).
In-repo rules still apply and keep Cloud + local aligned.

## Anti-pattern
Do not implement product work from a discipline-only Cloud session, and do not ship
hand-apply patch kits. Wrong repo → move or start the correct-repo session first.
