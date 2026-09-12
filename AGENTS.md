# Product workspace — JHD discipline (Cloud-portable)

This repo carries **always-on discipline rules** under `.cursor/rules/` so cloud doers get
invariants / routing / operator voice **without** the Mac home plugin. `.cursor/rules/` is
the always-on layer's path regardless of editor — the directory name is historical, not an
editor dependency.

`doer-rules.md` (repo root) is the standing rules file every dispatched doer reads whole;
`node hooks/scripts/sync-doer-rules.mjs <target-repo-path> [...]` writes
`.cursor/rules/doer-rules.mdc` (frontmatter + verbatim body) into each target — run it
after any `doer-rules.md` edit and after standing up a new product (see
`skills/new-product/SKILL.md`).

## Cloud Environment (jhd-fleet)
The repo-file `.cursor/environment.json` auto-applies when a cloud doer starts from **this**
repo (or any other Phase-1 Fleet remote). **One repo on disk** — install links
discipline (when needed), clones vault, symlinks captures when present; it does
**not** clone sibling products.

On resume: this project's `projects/<name>/<name>-handover.md` (infer from workspace), then
`~/JHD/vault/main/orchestrator/cockpit.md` or `~/JHD/vault/orchestrator/cockpit.md`.
**After transcript summary / continued chat, re-read project handover before dispatch or wrap** — summary ≠ handover.
If vault is **missing** on Cloud → warn and use in-repo docs; do not invent
HANDOVER or pretend in-repo docs are the full brain.

## Orchestrator self-check
Before ending a turn where a product was touched:
```
[ ] Handover current?
[ ] If closing: wrap skill complete (not handover-only)?
[ ] No parent product edits?
[ ] Vault writes went through vault-write?
```

Cross-repo edits are expected (discipline improvements from product work) — PR the
`jhd-discipline` remote for rails and skills.

## Local Mac
Install **jhd-discipline** from Team Marketplace. In-repo rules still apply and keep cloud
and local aligned. Obsidian opens `~/JHD/vault/main`.

## Anti-pattern
Do not implement product work from a discipline-only checkout when the product remote
is the job — move or start the correct-repo session first. Orchestrator sessions may
still open on vault and dispatch outward.
