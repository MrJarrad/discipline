---
name: ops-inbox
description: Operates Jarrad's ops system — morning sweep, standup drafting, meeting-notes pipeline, Ops Inbox canonical memory. Trigger on "what's on my plate", "refresh the inbox", "draft my standup", "mark X done", "what did we decide about", "what does <person> owe", after any meeting ends, or when reconciling completed work. Chains summarise-meeting for transcript processing.
---

# Ops Inbox — operating the system

The Ops Inbox MCP server is the canonical memory. The Cowork sidebar artifact
`ops-inbox` is a PROJECTION of it — regenerate the artifact from the server, never
treat the artifact as the record.

## The tools (Ops Inbox MCP — load via ToolSearch "ops inbox")

- `ops_resolve_person` — ALWAYS before attributing; maps both merger domains to one
  person. `ops_list_people` for the map.
- `ops_upsert_meeting` — canonical meeting record: tldr, decisions (with rejected
  options + anchoring quote), actions (one owner each), links, tensions, sources.
- `ops_list_meetings` / `ops_get_meeting` — "what did we decide about X and why".
- `ops_add_action` / `ops_list_open_actions` / `ops_complete_action` — completion
  requires EVIDENCE (a link, a quote, "Jarrad confirmed").
- `ops_list_inbox` / `ops_upsert_inbox_item` / `ops_complete_inbox_item` — zones:
  dofirst (exactly one) | standup | then | later.
- `ops_said_vs_done` — reconciliation by owner + stale actions >7 days.

## Workflows

### Refresh ("refresh the inbox", "what's on my plate")
1. `ops_list_inbox` + `ops_list_open_actions`.
2. Sweep Slack (#fussy, #fussy-rotate, DMs, Figma-bot), Gmail, Calendar (today),
   Granola (recent) for changes.
3. Complete items WITH evidence; add new ones; exactly one `dofirst`.
4. In Cowork sessions only — regenerate the `ops-inbox` artifact
   (mcp__remote-devices__update_artifact):
   calm single column — day line, Do-this-first card (with pre-drafted next
   action), Standup (collapses to "posted ✓" once posted), Then (one-line
   collapsed items, relative countdown labels, max ~5 visible, rest behind
   "Later"), ✓ Done buttons (ephemeral — remind that telling Claude makes it
   stick), Done-this-session list. Native-Claude-desktop styling: system sans,
   #faf9f5 bg, white cards, soft shadow, colour ONLY for at-risk.

### Meeting ended (or transcript provided)
1. Gather ALL sources: Granola notes/transcript, Google Drive chat log +
   "Notes by Gemini" doc created that day, Gmail Gemini email fallback. In-Meet
   chat carries links and typed decisions audio capture misses.
2. Write notes per the summarise-meeting skill (truth-gated, quote-anchored where
   a transcript exists). Source hierarchy: transcript beats Granola's AI summary —
   Granola has mis-assigned owners before.
3. `ops_upsert_meeting` (actions included), then Slack DRAFT in #fussy.

### Standup ("draft my standup")
Reconcile first (workflow 1), then draft per references/comms.md, as a Slack draft
in #fussy. `ops_said_vs_done` informs carry-overs; capacity from today's calendar
counts as risk.

### Mark done ("done: X")
`ops_complete_inbox_item` / `ops_complete_action` with "Jarrad confirmed" (or
better evidence if visible), then refresh the artifact.

## Infrastructure (don't rebuild — it exists)

- Server: `https://ops-inbox.jh-229.workers.dev` (Cloudflare Worker + D1
  `rotate-ops`); source in `~/JHD/claude-global-snapshot/_setup-pack/ops-inbox-mcp/`;
  deploy = `npx wrangler deploy` on his Mac.
- Schedules: prefer Claude scheduled tasks (cron / `/schedule`) for recurring sweeps.
- Pending hardening: OPS_TOKEN → wrangler secret (currently in wrangler.toml).
