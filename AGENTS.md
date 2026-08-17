# Product workspace — JHD discipline (Cloud-portable)

This repo carries **always-on discipline rules** under `.cursor/rules/` so Cloud Agents
get invariants / routing / operator voice **without** the Mac home plugin.

## Cloud Environment (jhd-fleet)
Repo-file `.cursor/environment.json` auto-applies when you start Cloud from **this**
repo (or any other Phase-1 Fleet remote). Install places vault + discipline +
portfolio + orbit-tools + capture under `~/JHD/` (containers when the helper exists;
flat `/workspace` for the primary). No Environment picker required.

On resume: this project's `projects/<name>/<name>-handover.md` (infer from workspace), then
`~/JHD/vault/main/orchestrator/cockpit.md` or `~/JHD/vault/orchestrator/cockpit.md`.
If vault is **missing** on Cloud → **Environment misconfigured** — do not invent
HANDOVER or pretend in-repo docs are the full brain.

Cross-repo edits are expected (discipline improvements from product work) — PR the
correct GitHub remote (`jhd-cursor-discipline` for rails/skills).

## Local Mac
Prefer **jhd-discipline** from Team Marketplace. Dev-only symlink:
`~/JHD/cursor-discipline/main` → `~/.cursor/plugins/local/jhd-discipline`.
In-repo rules still apply and keep Cloud + local aligned.
Obsidian opens `~/JHD/vault/main`.

## Anti-pattern
Do not implement product work from a discipline-only checkout when the product remote
is the job — move or start the correct-repo session first. Orchestrator sessions may
still open on vault and dispatch outward.
